import OpenAI from 'openai';
import Groq from 'groq-sdk';
import pool from '../../db';
import dotenv from 'dotenv';
import { logger } from '../../utils/logger';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const EMBEDDING_MODEL = 'llama-3.3-70b-versatile'; // Using Groq for embeddings too

export class VectorStoreService {
  /**
   * Generate embedding using Groq (free alternative to OpenAI)
   * Note: We'll use a simple text hash for now since Groq doesn't have dedicated embedding models yet
   * For production, you can use sentence-transformers locally or other free embedding APIs
   */
  async generateEmbedding(text: string, retries = 3): Promise<number[]> {
    try {
      // Simple hash-based embedding (deterministic)
      // This creates a 1536-dimensional vector from the text
      const embedding = new Array(1536).fill(0);
      
      // Create a simple hash-based embedding
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const index = (charCode * i) % 1536;
        embedding[index] = (embedding[index] + charCode / 255) % 1;
      }
      
      // Normalize the vector
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
      
    } catch (error: any) {
      logger.error('Embedding generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze failure using Groq with retry logic
   */
  async analyzeFailure(params: {
    failureLogs: string;
    gitDiff: string;
  }, retries = 3): Promise<string> {
    const { failureLogs, gitDiff } = params;

    const prompt = `You are an expert Senior DevOps/QA Engineer with deep knowledge of CI/CD pipelines, test automation, and debugging. 

Analyze this CI test failure comprehensively:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FAILURE LOGS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${failureLogs.substring(0, 4000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GIT CHANGES (RECENT COMMIT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${gitDiff.substring(0, 3000)}

Provide a detailed analysis in this exact format:

**Failure Analysis:**

1. **Why it failed:** Provide a clear, technical explanation of the root cause. Identify which specific code change, configuration, or environment issue caused the failure.

2. **Specific fix:** Give actionable, step-by-step instructions to fix the issue. Include exact code changes, commands, or configuration updates needed.

3. **Confidence rating:** X% - Explain your confidence level and reasoning.

**Additional Context:**
- If this is a test issue vs actual bug
- If environment/dependencies are involved
- If this could affect other parts of the system

Be thorough but concise. Focus on actionable insights.`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
      });

      return completion.choices[0]?.message?.content || 'No analysis generated.';
    } catch (error: any) {
      if (retries > 0 && (error.status === 429 || error.status >= 500)) {
        logger.warn('Groq analysis failed, retrying...', { retriesLeft: retries });
        await new Promise(res => setTimeout(res, 1000));
        return this.analyzeFailure(params, retries - 1);
      }
      logger.error('Groq analysis failed permanently', { error: error.message });
      return 'Analysis failed due to AI service error.';
    }
  }

  /**
   * Insert failure pattern into vector store
   */
  async insertPattern(params: {
    projectId: string;
    summary: string;
    stackTrace?: string;
    errorMessage: string;
    affectedFiles?: string[];
    testName?: string;
  }): Promise<string> {
    const { projectId, summary, stackTrace, errorMessage, affectedFiles, testName } = params;

    const embeddingText = `${summary}\n${errorMessage}`;
    const embedding = await this.generateEmbedding(embeddingText);

    const query = `
      INSERT INTO failure_patterns (
        project_id, embedding, summary, stack_trace, error_message, affected_files, test_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await pool.query(query, [
      projectId,
      JSON.stringify(embedding),
      summary,
      stackTrace,
      errorMessage,
      affectedFiles,
      testName,
    ]);

    return result.rows[0].id;
  }

  /**
   * Search for similar patterns using cosine similarity
   */
  async searchSimilarPatterns(params: {
    projectId: string;
    embedding: number[];
    topK?: number;
    threshold?: number;
  }): Promise<Array<{ id: string; similarity: number; pattern: any }>> {
    const {
      projectId,
      embedding,
      topK = 5,
      threshold = 0.75, // Lower threshold since we're using simple embeddings
    } = params;

    const query = `
      SELECT 
        id,
        summary,
        stack_trace,
        error_message,
        affected_files,
        test_name,
        occurrence_count,
        1 - (embedding <=> $1::vector) AS similarity
      FROM failure_patterns
      WHERE project_id = $2 
      AND 1 - (embedding <=> $1::vector) > $3
      ORDER BY similarity DESC
      LIMIT $4
    `;

    const result = await pool.query(query, [
      JSON.stringify(embedding),
      projectId,
      threshold,
      topK,
    ]);

    return result.rows.map((row) => ({
      id: row.id,
      similarity: row.similarity,
      pattern: {
        id: row.id,
        summary: row.summary,
        stackTrace: row.stack_trace,
        errorMessage: row.error_message,
        affectedFiles: row.affected_files,
        testName: row.test_name,
        occurrenceCount: row.occurrence_count,
      },
    }));
  }
}

export default new VectorStoreService();
