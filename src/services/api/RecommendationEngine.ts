import pool from '../../db';
import vectorStore from './VectorStoreService';
import { TestRun, FailedTest, PatternMatch, RecommendedTest } from '../../types';

export class RecommendationEngine {
  /**
   * Analyze git diff to extract changed files
   */
  private extractChangedFiles(gitDiff: string): string[] {
    const files: string[] = [];
    const lines = gitDiff.split('\n');

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          files.push(match[1]);
        }
      }
      else if (line.startsWith('+++')) {
        const match = line.match(/\+\+\+ b\/(.+)$/);
        if (match && match[1] !== '/dev/null') {
          files.push(match[1]);
        }
      }
    }

    return [...new Set(files)];
  }

  /**
   * Generate failure summary for embedding
   */
  private generateFailureSummary(failedTests: FailedTest[], gitDiff?: string): string {
    const changedFiles = gitDiff ? this.extractChangedFiles(gitDiff) : [];

    const summary = [
      `Failed ${failedTests.length} test(s).`,
      `Changed files: ${changedFiles.join(', ') || 'none'}`,
      '',
      'Errors:',
      ...failedTests.map((test) => `- ${test.testName}: ${test.errorMessage}`),
    ].join('\n');

    return summary;
  }

  /**
   * Find similar failure patterns using vector similarity
   */
  async findSimilarPatterns(params: {
    projectId: string;
    failedTests: FailedTest[];
    gitDiff?: string;
    topK?: number;
  }): Promise<PatternMatch[]> {
    const { projectId, failedTests, gitDiff, topK } = params;

    const summary = this.generateFailureSummary(failedTests, gitDiff);
    const embedding = await vectorStore.generateEmbedding(summary);

    const results = await vectorStore.searchSimilarPatterns({
      projectId,
      embedding,
      topK,
    });

    return results.map((result) => ({
      patternId: result.id,
      similarity: result.similarity,
      pattern: result.pattern,
    }));
  }

  /**
   * Recommend tests based on similar patterns and git diff
   */
  async recommendTests(params: {
    testRunId: string;
    failedTests: FailedTest[];
    gitDiff?: string;
    similarPatterns: PatternMatch[];
  }): Promise<RecommendedTest[]> {
    const { failedTests, gitDiff, similarPatterns } = params;

    const recommendations: Map<string, RecommendedTest> = new Map();
    const changedFiles = gitDiff ? this.extractChangedFiles(gitDiff) : [];

    // 1. Extract tests from similar patterns
    for (const match of similarPatterns) {
      const { pattern, similarity } = match;

      if (pattern.testName) {
        const existing = recommendations.get(pattern.testName);
        const confidenceScore = similarity * 0.8;

        if (!existing || existing.confidenceScore < confidenceScore) {
          recommendations.set(pattern.testName, {
            testName: pattern.testName,
            reason: `Similar failure pattern (${(similarity * 100).toFixed(1)}% match) occurred ${pattern.occurrenceCount} time(s)`,
            confidenceScore,
          });
        }
      }
    }

    // 2. Recommend tests related to changed files
    for (const file of changedFiles) {
      const testPatterns = [
        file.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
        file.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1'),
        file.replace(/^src\//, 'tests/').replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
        file.replace(/^src\//, '__tests__/'),
      ];

      for (const testPattern of testPatterns) {
        const testName = `Test: ${testPattern}`;
        if (!recommendations.has(testName)) {
          recommendations.set(testName, {
            testName,
            reason: `Related to changed file: ${file}`,
            confidenceScore: 0.6,
          });
        }
      }
    }

    // 3. Recommend re-running failed tests
    for (const test of failedTests) {
      if (!recommendations.has(test.testName)) {
        recommendations.set(test.testName, {
          testName: test.testName,
          reason: 'Re-run previously failed test',
          confidenceScore: 0.9,
        });
      }
    }

    return Array.from(recommendations.values())
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 10);
  }

  /**
   * Store pattern match results in database
   */
  async storePatternMatches(
    testRunId: string,
    matches: PatternMatch[]
  ): Promise<void> {
    const query = `
      INSERT INTO pattern_matches (test_run_id, pattern_id, similarity_score)
      VALUES ($1, $2, $3)
    `;

    for (const match of matches) {
      await pool.query(query, [testRunId, match.patternId, match.similarity]);
    }
  }

  /**
   * Store recommended tests in database
   */
  async storeRecommendedTests(
    testRunId: string,
    recommendations: RecommendedTest[]
  ): Promise<void> {
    const query = `
      INSERT INTO recommended_tests (test_run_id, test_name, reason, confidence_score)
      VALUES ($1, $2, $3, $4)
    `;

    for (const rec of recommendations) {
      await pool.query(query, [
        testRunId,
        rec.testName,
        rec.reason,
        rec.confidenceScore,
      ]);
    }
  }
}

export default new RecommendationEngine();
