// Example: Using the Snapshot Service API

const axios = require('axios');

const SNAPSHOT_SERVICE_URL = 'http://localhost:3001';
const API_KEY = 'your-api-secret-key';

async function captureSnapshot() {
  try {
    const response = await axios.post(
      `${SNAPSHOT_SERVICE_URL}/snapshot/create`,
      {
        testRunId: '550e8400-e29b-41d4-a716-446655440000',
        url: 'http://localhost:3000',
        viewport: { width: 1920, height: 1080 },
        waitForSelector: '#app-loaded',
        waitForTimeout: 5000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      }
    );

    console.log('Snapshot captured successfully:');
    console.log('Screenshot:', response.data.screenshotUrl);
    console.log('HTML Dump:', response.data.htmlDumpUrl);
    console.log('HAR:', response.data.harUrl);
    console.log('Console Logs:', response.data.consoleLogsUrl);

    return response.data;
  } catch (error) {
    console.error('Snapshot capture failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example: Submitting test results to System API

const API_SERVICE_URL = 'http://localhost:3000';

async function submitTestResults(snapshotData) {
  try {
    const response = await axios.post(
      `${API_SERVICE_URL}/test-runs`,
      {
        commitHash: 'abc123def456',
        branch: 'feature/new-ui',
        author: 'john@example.com',
        status: 'failed',
        failedTests: [
          {
            testName: 'test_api_integration',
            errorMessage: 'Connection refused on /api/auth',
            stackTrace: 'Traceback (most recent call last):\n  File "test.py", line 42...'
          },
          {
            testName: 'test_user_login',
            errorMessage: 'Element not found: #login-button',
            stackTrace: 'Traceback...'
          }
        ],
        gitDiff: `diff --git a/src/components/Login.tsx b/src/components/Login.tsx
index 1234567..abcdefg 100644
--- a/src/components/Login.tsx
+++ b/src/components/Login.tsx
@@ -10,7 +10,7 @@ export const Login = () => {
   return (
     <div>
-      <button id="login-btn">Login</button>
+      <button id="login-button">Sign In</button>
     </div>
   );
 };`,
        prNumber: 123,
        snapshotUrls: {
          screenshot: snapshotData.screenshotUrl,
          htmlDump: snapshotData.htmlDumpUrl,
          har: snapshotData.harUrl,
          consoleLogs: snapshotData.consoleLogsUrl
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      }
    );

    console.log('\nTest results submitted successfully:');
    console.log('Test Run ID:', response.data.testRunId);
    console.log('\nSimilar Patterns Found:');
    response.data.similarPatterns.forEach(pattern => {
      console.log(`- ${(pattern.similarity * 100).toFixed(1)}% match: ${pattern.summary}`);
    });
    console.log('\nRecommended Tests:');
    response.data.recommendedTests.forEach(test => {
      console.log(`- ${test.testName}: ${test.reason}`);
    });

    return response.data;
  } catch (error) {
    console.error('Test result submission failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example: Searching for similar patterns

async function searchPatterns(query) {
  try {
    const response = await axios.get(
      `${API_SERVICE_URL}/patterns/search`,
      {
        params: {
          q: query,
          topK: 5,
          threshold: 0.85
        },
        headers: {
          'x-api-key': API_KEY
        }
      }
    );

    console.log(`\nSearch results for "${query}":`);
    response.data.results.forEach(result => {
      console.log(`\nSimilarity: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`Pattern: ${result.pattern.summary}`);
      console.log(`Occurred: ${result.pattern.occurrenceCount} times`);
      console.log(`Last seen: ${result.pattern.lastSeen}`);
    });

    return response.data.results;
  } catch (error) {
    console.error('Pattern search failed:', error.response?.data || error.message);
    throw error;
  }
}

// Run example flow
async function main() {
  console.log('=== CI Snapshot System Example ===\n');

  // Step 1: Capture snapshot (only on test failure)
  console.log('Step 1: Capturing snapshot...');
  const snapshot = await captureSnapshot();

  // Step 2: Submit test results
  console.log('\nStep 2: Submitting test results...');
  const testResults = await submitTestResults(snapshot);

  // Step 3: Search for similar patterns
  console.log('\nStep 3: Searching for similar patterns...');
  await searchPatterns('authentication failure');

  console.log('\n=== Example completed successfully ===');
}

// Uncomment to run
// main().catch(console.error);

module.exports = {
  captureSnapshot,
  submitTestResults,
  searchPatterns
};
