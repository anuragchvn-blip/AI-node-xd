#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';

const program = new Command();

program
  .name('ci-snapshot')
  .description('CI Snapshot Analysis Tool')
  .version('1.0.0');

program
  .command('report')
  .description('Report CI failure to the service')
  .requiredOption('--token <token>', 'Project API Token')
  .option('--diff <diff>', 'Git diff content or file path')
  .option('--logs <logs>', 'Failure logs or file path')
  .option('--url <url>', 'API URL', 'http://localhost:3000')
  .action(async (options) => {
    try {
      console.log('Analyzing failure...');

      let gitDiff = '';
      if (options.diff) {
        if (fs.existsSync(options.diff)) {
          gitDiff = fs.readFileSync(options.diff, 'utf-8');
        } else {
          gitDiff = options.diff;
        }
      } else {
        // Try to get diff automatically
        try {
          gitDiff = execSync('git diff HEAD~1 HEAD').toString();
        } catch (e) {
          console.warn('Could not auto-detect git diff');
        }
      }

      let failureLogs = '';
      if (options.logs) {
        if (fs.existsSync(options.logs)) {
          failureLogs = fs.readFileSync(options.logs, 'utf-8');
        } else {
          failureLogs = options.logs;
        }
      }

      // Get Git Info
      const commitHash = execSync('git rev-parse HEAD').toString().trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      const author = execSync('git log -1 --pretty=format:"%ae"').toString().trim();

      const payload = {
        commitHash,
        branch,
        author,
        status: 'failed', // Assumed failed if running this
        gitDiff,
        failureLogs,
      };

      const response = await axios.post(`${options.url}/api/v1/report`, payload, {
        headers: {
          'x-api-key': options.token,
        },
      });

      console.log('Report submitted successfully!');
      console.log(`Job ID: ${response.data.jobId}`);
      console.log(`Test Run ID: ${response.data.testRunId}`);

    } catch (error: any) {
      console.error('Failed to submit report:', error.response?.data || error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
