/**
 * Jest Reporter to save backend test failures for final report
 */
const fs = require('fs');

class BackendFailureReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunComplete(contexts, results) {
    const failures = [];

    // Collect all failures
    for (const testResult of results.testResults) {
      if (testResult.numFailingTests > 0) {
        for (const test of testResult.testResults) {
          if (test.status === 'failed') {
            failures.push({
              test: test.fullName,
              error: test.failureMessages.join('\n'),
            });
          }
        }
      }
    }

    if (failures.length > 0) {
      console.log(`\n⚠️  Detected ${failures.length} Backend Integration failure(s)`);
      console.log('   (Will be included in final AI analysis)\n');
      
      // Save to file for final-report.js to pick up
      fs.writeFileSync('backend-test-failures.json', JSON.stringify(failures, null, 2));
    } else {
      console.log('\n✅ All Backend Integration tests passed\n');
    }
  }
}

module.exports = BackendFailureReporter;
