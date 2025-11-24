/**
 * Consolidate ALL test failures (E2E + Integration) and send ONE analysis
 */
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function consolidateAndAnalyze() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 CONSOLIDATING ALL TEST FAILURES');
  console.log('='.repeat(80));

  const failures = [];

  // 1. Check for Playwright failures
  try {
    const playwrightResults = fs.readFileSync(
      path.join(process.cwd(), 'test-results', '.last-run.json'),
      'utf8'
    );
    const results = JSON.parse(playwrightResults);
    
    if (results.failedTests && results.failedTests.length > 0) {
      console.log(`\n📱 Found ${results.failedTests.length} Playwright E2E failure(s)`);
      results.failedTests.forEach(test => {
        failures.push({
          type: 'E2E',
          test: test.title || 'Unknown test',
          error: test.error || 'Unknown error',
          file: test.file || 'Unknown file'
        });
      });
    }
  } catch (e) {
    console.log('ℹ️  No Playwright failures found');
  }

  // 2. Check for Backend Integration test failures
  try {
    if (fs.existsSync('backend-test-results.log')) {
      const backendLog = fs.readFileSync('backend-test-results.log', 'utf8');
      
      // Parse Jest failures
      const failureMatches = backendLog.match(/● (.+?)(?=●|Test Suites:|$)/gs);
      if (failureMatches) {
        console.log(`\n🔧 Found ${failureMatches.length} Backend Integration failure(s)`);
        failureMatches.forEach(match => {
          const testNameMatch = match.match(/● (.+)/);
          const testName = testNameMatch ? testNameMatch[1].split('\n')[0] : 'Unknown test';
          
          failures.push({
            type: 'Backend Integration',
            test: testName,
            error: match.substring(0, 500),
            file: 'tests/backend-integration.test.ts'
          });
        });
      }
    }
  } catch (e) {
    console.log('ℹ️  No Backend Integration failures found');
  }

  // 3. If no failures, exit
  if (failures.length === 0) {
    console.log('\n✅ All tests passed! No analysis needed.\n');
    console.log('='.repeat(80) + '\n');
    return;
  }

  console.log(`\n📊 Total failures detected: ${failures.length}`);
  console.log('   E2E failures: ' + failures.filter(f => f.type === 'E2E').length);
  console.log('   Backend failures: ' + failures.filter(f => f.type === 'Backend Integration').length);

  // 4. Get Git context
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

  // 5. Prepare consolidated failure report
  const failureLogs = failures.map(f => 
    `[${f.type}] ${f.test}\nError: ${f.error}\nFile: ${f.file}`
  ).join('\n\n' + '-'.repeat(80) + '\n\n');

  // Add summary header to failure logs
  const summaryHeader = `CONSOLIDATED TEST FAILURE REPORT
Total Failures: ${failures.length}
- E2E Failures: ${failures.filter(f => f.type === 'E2E').length}
- Backend Integration Failures: ${failures.filter(f => f.type === 'Backend Integration').length}

${'='.repeat(80)}

`;

  const payload = {
    commitHash,
    branch,
    author,
    status: 'failed',
    gitDiff,
    failureLogs: summaryHeader + failureLogs
  };

  // 6. Send to API for AI analysis
  try {
    console.log('\n📤 Sending consolidated report to CI Analysis API...');
    console.log(`   Commit: ${commitHash.substring(0, 8)}`);
    console.log(`   Branch: ${branch}`);
    console.log(`   Total Failures: ${failures.length}`);

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

    console.log('\n✅ AI ANALYSIS COMPLETE!');
    console.log('='.repeat(80));
    console.log('\n📊 RESPONSE:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.analysis) {
      console.log('\n🤖 AI ANALYSIS:');
      console.log('-'.repeat(80));
      console.log(response.data.analysis);
      console.log('-'.repeat(80));
    }

    console.log(`\n💰 Credits: ${response.data.creditsUsed || 0} used, ${response.data.creditsRemaining || 0} remaining`);
    console.log(`🔍 Similar Patterns: ${response.data.similarPatterns || 0}`);
    console.log(`🧬 Vector Dimensions: ${response.data.vectorEmbeddingDimensions || 1536}`);
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Failed to send consolidated report:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    console.log('\n' + '='.repeat(80) + '\n');
    process.exit(1);
  }
}

consolidateAndAnalyze().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
