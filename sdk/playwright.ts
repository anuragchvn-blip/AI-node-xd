import { Reporter, TestCase, TestResult, FullResult, FullConfig, Suite } from '@playwright/test/reporter';
import axios from 'axios';
import { execSync } from 'child_process';

class CISnapshotReporter implements Reporter {
  private apiKey: string;
  private apiUrl: string;
  private failures: Array<{ test: string; error: string }> = [];

  constructor(options: { apiKey?: string; apiUrl?: string } = {}) {
    this.apiKey = options.apiKey || process.env.CI_SNAPSHOT_API_KEY || '';
    this.apiUrl = options.apiUrl || process.env.CI_SNAPSHOT_API_URL || 'http://localhost:3000';
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'failed') {
      this.failures.push({
        test: test.title,
        error: result.error?.message || result.error?.stack || 'Unknown error',
      });
    }
  }

  async onEnd(result: FullResult) {
    if (result.status === 'passed') {
      console.log('✅ CI Snapshot: All tests passed. No report needed.');
      return;
    }

    if (this.failures.length === 0) return;

    console.log(`🚨 CI Snapshot: Detected ${this.failures.length} failures. Analyzing...`);

    try {
      // Gather Git Info
      const commitHash = execSync('git rev-parse HEAD').toString().trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      const author = execSync('git log -1 --pretty=format:"%ae"').toString().trim();
      
      // Get Git Diff
      let gitDiff = '';
      try {
        gitDiff = execSync('git diff HEAD~1 HEAD').toString();
      } catch (e) {
        console.warn('Could not get git diff');
      }

      // Prepare Payload
      const payload = {
        commitHash,
        branch,
        author,
        status: 'failed',
        gitDiff,
        failureLogs: this.failures.map(f => `Test: ${f.test}\nError: ${f.error}`).join('\n\n'),
      };

      // Send to API
      if (!this.apiKey) {
        console.warn('⚠️ CI Snapshot: No API key provided. Skipping report.');
        return;
      }

      const response = await axios.post(`${this.apiUrl}/api/v1/report`, payload, {
        headers: { 'x-api-key': this.apiKey },
      });

      console.log('✅ CI Snapshot: Report submitted successfully!');
      console.log(`   Job ID: ${response.data.jobId}`);
      
    } catch (error: any) {
      console.error('❌ CI Snapshot: Failed to submit report', error.message);
    }
  }
}

export default CISnapshotReporter;
