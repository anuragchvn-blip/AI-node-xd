import { chromium, Browser, Page } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// S3 Client configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_ENDPOINT?.includes('localhost'), // For MinIO
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'ci-snapshots';
const SNAPSHOT_TIMEOUT = parseInt(process.env.SNAPSHOT_TIMEOUT_MS || '30000');

export interface SnapshotRequest {
  testRunId: string;
  url: string;
  viewport?: { width: number; height: number };
  waitForSelector?: string;
  waitForTimeout?: number;
}

export interface SnapshotResult {
  id: string;
  testRunId: string;
  timestamp: Date;
  screenshotUrl: string;
  htmlDumpUrl: string;
  harUrl: string;
  consoleLogsUrl: string;
  metadata: {
    viewport: { width: number; height: number };
    userAgent: string;
    url: string;
  };
}

class SnapshotService {
  private browser: Browser | null = null;
  private consoleLogs: string[] = [];

  async initialize(): Promise<void> {
    console.log('Initializing Playwright browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log('Browser initialized');
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('Browser closed');
    }
  }

  /**
   * Capture snapshot only when backend tests fail
   * This is the main entry point called by CI on test failure
   */
  async captureSnapshot(request: SnapshotRequest): Promise<SnapshotResult> {
    if (!this.browser) {
      await this.initialize();
    }

    const snapshotId = uuidv4();
    const timestamp = new Date();
    this.consoleLogs = [];

    console.log(`Starting snapshot capture for test run: ${request.testRunId}`);

    const context = await this.browser!.newContext({
      viewport: request.viewport || { width: 1920, height: 1080 },
      recordHar: { path: `/tmp/${snapshotId}.har` },
    });

    const page = await context.newPage();

    // Capture console logs
    page.on('console', (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(logEntry);
    });

    // Capture errors
    page.on('pageerror', (error) => {
      this.consoleLogs.push(`[ERROR] ${error.message}\n${error.stack}`);
    });

    try {
      // Navigate to URL with timeout
      await page.goto(request.url, {
        waitUntil: 'networkidle',
        timeout: SNAPSHOT_TIMEOUT,
      });

      // Optional: wait for specific selector
      if (request.waitForSelector) {
        await page.waitForSelector(request.waitForSelector, {
          timeout: request.waitForTimeout || 5000,
        });
      }

      // Capture artifacts
      const screenshotPath = `/tmp/${snapshotId}-screenshot.png`;
      const htmlPath = `/tmp/${snapshotId}-page.html`;
      const consoleLogsPath = `/tmp/${snapshotId}-console.log`;

      // Screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      // HTML dump
      const htmlContent = await page.content();
      await fs.writeFile(htmlPath, htmlContent, 'utf-8');

      // Console logs
      await fs.writeFile(consoleLogsPath, this.consoleLogs.join('\n'), 'utf-8');

      // Get user agent before closing context
      const userAgent = await page.evaluate('navigator.userAgent') as string;

      // Close context to finalize HAR
      await context.close();

      const harPath = `/tmp/${snapshotId}.har`;

      // Upload all artifacts to S3
      const [screenshotUrl, htmlDumpUrl, harUrl, consoleLogsUrl] = await Promise.all([
        this.uploadToS3(screenshotPath, `${snapshotId}/screenshot.png`, 'image/png'),
        this.uploadToS3(htmlPath, `${snapshotId}/page.html`, 'text/html'),
        this.uploadToS3(harPath, `${snapshotId}/network.har`, 'application/json'),
        this.uploadToS3(consoleLogsPath, `${snapshotId}/console.log`, 'text/plain'),
      ]);

      // Cleanup temp files
      await Promise.all([
        fs.unlink(screenshotPath).catch(() => {}),
        fs.unlink(htmlPath).catch(() => {}),
        fs.unlink(harPath).catch(() => {}),
        fs.unlink(consoleLogsPath).catch(() => {}),
      ]);

      const result: SnapshotResult = {
        id: snapshotId,
        testRunId: request.testRunId,
        timestamp,
        screenshotUrl,
        htmlDumpUrl,
        harUrl,
        consoleLogsUrl,
        metadata: {
          viewport: request.viewport || { width: 1920, height: 1080 },
          userAgent,
          url: request.url,
        },
      };

      console.log(`Snapshot captured successfully: ${snapshotId}`);
      return result;
    } catch (error) {
      console.error('Snapshot capture failed:', error);
      await context.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Upload file to S3 and return signed URL
   */
  private async uploadToS3(
    filePath: string,
    key: string,
    contentType: string
  ): Promise<string> {
    const fileContent = await fs.readFile(filePath);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
    });

    await s3Client.send(command);

    // Generate signed URL valid for 7 days
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
    return signedUrl;
  }
}

export default SnapshotService;
