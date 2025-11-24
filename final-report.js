/**
 * Final Report - Collects ALL test failures and sends ONE analysis to API
 */
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');

async function sendFinalReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL CI REPORT - Collecting ALL Failures');
  console.log('='.repeat(80) + '\n');

  const allFailures = [];

  // 1. Check Playwright failures
  if (fs.existsSync('playwright-failures.json')) {
    const playwrightFailures = JSON.parse(fs.readFileSync('playwright-failures.json', 'utf8'));
    console.log(`✓ Found ${playwrightFailures.length} Playwright E2E failure(s)`);
    playwrightFailures.forEach(f => {
      allFailures.push(`[E2E Test] ${f.test}\nError: ${f.error}`);
    });
  } else {
    console.log('✓ No Playwright failures found');
  }

  // 2. Check Backend Integration test failures
  if (fs.existsSync('backend-test-failures.json')) {
    const backendFailures = JSON.parse(fs.readFileSync('backend-test-failures.json', 'utf8'));
    console.log(`✓ Found ${backendFailures.length} Backend Integration failure(s)`);
    backendFailures.forEach(f => {
      allFailures.push(`[Backend Integration] ${f.test}\nError: ${f.error}`);
    });
  } else {
    console.log('✓ No Backend Integration failures found');
  }

  console.log('');

  if (allFailures.length === 0) {
    console.log('✅ All tests passed! No failures to analyze.\n');
    console.log('='.repeat(80) + '\n');
    return;
  }

  console.log(`📋 Total failures to analyze: ${allFailures.length}\n`);

  // 3. Get Git context
  let commitHash, branch, author, gitDiff;
  try {
    commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    author = execSync('git log -1 --pretty=format:"%ae"', { encoding: 'utf8' }).trim();
    gitDiff = execSync('git diff HEAD~1 HEAD', { encoding: 'utf8' });
  } catch (e) {
    commitHash = process.env.GITHUB_SHA || 'unknown';
    branch = process.env.GITHUB_REF_NAME || 'unknown';
    author = process.env.GITHUB_ACTOR || 'unknown';
    gitDiff = 'No diff available';
  }

  const failureLogs = allFailures.join('\n\n' + '-'.repeat(80) + '\n\n');

  const payload = {
    commitHash,
    branch,
    author,
    status: 'failed',
    gitDiff,
    failureLogs
  };

  // 4. Send to API for AI analysis
  try {
    console.log('🤖 Sending to AI Analysis API...');
    console.log(`   Commit: ${commitHash.substring(0, 8)}`);
    console.log(`   Branch: ${branch}`);
    console.log(`   Author: ${author}\n`);

    const response = await axios.post(
      'http://localhost:3000/api/v1/report',
      payload,
      {
        headers: { 
          'x-api-key': 'sk_test_demo_key_12345',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    console.log('✅ AI ANALYSIS COMPLETE!');
    console.log('='.repeat(80));
    console.log('\n📊 RESPONSE:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.analysis) {
      console.log('\n🤖 AI ANALYSIS:');
      console.log('-'.repeat(80));
      console.log(response.data.analysis);
      console.log('-'.repeat(80));
    }

    console.log(`\n💰 Credits Used: ${response.data.creditsUsed || 0}`);
    console.log(`💳 Credits Remaining: ${response.data.creditsRemaining || 0}`);
    console.log(`🔍 Similar Patterns: ${response.data.similarPatterns || 0}`);
    console.log(`🧬 Vector Dimensions: ${response.data.vectorEmbeddingDimensions || 1536}`);
    console.log(`\n📬 Slack notification sent!`);
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Failed to send final report:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

sendFinalReport().catch(error => {
  console.error('Fatal error:', error);
});
