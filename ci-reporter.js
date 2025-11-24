const axios = require('axios');
const { execSync } = require('child_process');

class CIReporter {
  constructor() {
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (result.status === 'failed') {
      this.failures.push({
        test: test.title,
        error: result.error?.message || result.error?.stack || 'Unknown error',
      });
    }
  }

  async onEnd(result) {
    if (result.status === 'passed' || this.failures.length === 0) {
      console.log('✅ All tests passed. No CI analysis needed.');
      return;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('🚨 TRIGGERING CI ANALYSIS SYSTEM');
    console.log(`${'='.repeat(80)}`);
    console.log(`Detected ${this.failures.length} test failure(s)\n`);

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

      const failureLogs = this.failures.map(f => `Test: ${f.test}\nError: ${f.error}`).join('\n\n');

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
      console.log(`   Failures: ${this.failures.length}\n`);

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
