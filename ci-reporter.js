const axios = require('axios');
const { execSync } = require('child_process');

class CIReporter {
  constructor() {
    this.failures = new Map(); // Use Map to deduplicate by test title
  }

  onTestEnd(test, result) {
    if (result.status === 'failed') {
      // Only store the first failure for each unique test (ignoring retries)
      const testKey = test.titlePath().join(' > ');
      if (!this.failures.has(testKey)) {
        this.failures.set(testKey, {
          test: test.title,
          error: result.error?.message || result.error?.stack || 'Unknown error',
        });
      }
    }
  }

  async onEnd(result) {
    const uniqueFailures = Array.from(this.failures.values());
    
    if (result.status === 'passed' || uniqueFailures.length === 0) {
      console.log('✅ All Playwright tests passed.');
      return;
    }

    // Skip immediate reporting if SKIP_CI_REPORT is set (consolidation mode)
    if (process.env.SKIP_CI_REPORT === 'true') {
      console.log(`\n⏭️  Skipping immediate CI report - will consolidate with backend tests`);
      console.log(`   Detected ${uniqueFailures.length} E2E failure(s) for consolidation\n`);
      
      // Save failures for consolidation
      const fs = require('fs');
      const path = require('path');
      const resultsDir = path.join(process.cwd(), 'test-results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(resultsDir, '.last-run.json'),
        JSON.stringify({
          status: result.status,
          failedTests: uniqueFailures.map(f => ({
            title: f.test,
            error: f.error,
            file: 'e2e/example.spec.ts'
          }))
        })
      );
      return;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('🚨 TRIGGERING CI ANALYSIS SYSTEM');
    console.log(`${'='.repeat(80)}`);
    console.log(`Detected ${uniqueFailures.length} unique test failure(s) (retries deduplicated)\n`);

    try {
      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      let author = execSync('git log -1 --pretty=format:"%ae"', { encoding: 'utf8' }).trim();
      
      if (!author.includes('@')) author = 'developer@example.com';

      let gitDiff = '';
      try {
        gitDiff = execSync('git diff HEAD~1 HEAD', { encoding: 'utf8' });
      } catch (e) {
        gitDiff = 'No git diff available';
      }

      const failureLogs = uniqueFailures.map(f => `Test: ${f.test}\nError: ${f.error}`).join('\n\n');

      const payload = {
        commitHash,
        branch,
        author,
        status: 'failed',
        gitDiff,
        failureLogs,
      };

      console.log('📡 Sending to API at http://localhost:3000/api/v1/report...');
      console.log(`   Commit: ${commitHash.substring(0, 8)}`);
      console.log(`   Branch: ${branch}`);
      console.log(`   Author: ${author}`);
      console.log(`   Failures: ${uniqueFailures.length}\n`);

      const response = await axios.post('http://localhost:3000/api/v1/report', payload, {
        headers: { 'x-api-key': 'sk_test_demo_key_12345' },
        timeout: 60000,
      });

      console.log('✅ CI ANALYSIS COMPLETE!');
      console.log(`${'='.repeat(80)}`);
      
      console.log('\n📊 FULL RESPONSE:');
      console.log(JSON.stringify(response.data, null, 2));
      
      if (response.data.analysis) {
        console.log('\n🤖 AI ANALYSIS:');
        console.log('-'.repeat(80));
        console.log(response.data.analysis);
        console.log('-'.repeat(80));
      }
      
      if (response.data.similarPatterns !== undefined) {
        console.log(`\n🔍 Similar Patterns Found: ${response.data.similarPatterns}`);
      }
      
      if (response.data.creditsUsed !== undefined) {
        console.log(`\n💰 Credits Used: ${response.data.creditsUsed}`);
      }
      
      if (response.data.creditsRemaining !== undefined) {
        console.log(`💳 Credits Remaining: ${response.data.creditsRemaining}`);
      }
      
      console.log(`\n📈 Status: ${response.data.status}`);
      console.log(`📊 Test Run ID: ${response.data.testRunId}`);
      console.log(`${'='.repeat(80)}\n`);

    } catch (error) {
      console.error('\n❌ CI ANALYSIS FAILED:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      console.error(`${'='.repeat(80)}\n`);
    }
  }
}

module.exports = CIReporter;
