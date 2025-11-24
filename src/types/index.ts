export interface Snapshot {
  id: string;
  testRunId: string;
  timestamp: Date;
  screenshotUrl?: string;
  htmlDumpUrl?: string;
  harUrl?: string;
  consoleLogsUrl?: string;
  metadata?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
    url?: string;
  };
}

export interface FailurePattern {
  id: string;
  embedding: number[];
  summary: string;
  stackTrace?: string;
  errorMessage: string;
  affectedFiles?: string[];
  testName?: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface TestRun {
  id: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: Date;
  status: 'passed' | 'failed';
  failedTests?: FailedTest[];
  snapshotId?: string;
  gitDiff?: string;
  prNumber?: number;
}

export interface FailedTest {
  testName: string;
  errorMessage: string;
  stackTrace?: string;
}

export interface SupermemoryEntry {
  id: string;
  vector: number[];
  text: string;
  metadata: {
    testRunId: string;
    commitHash: string;
    errorType: string;
    affectedFiles: string[];
    timestamp: Date;
  };
}

export interface PatternMatch {
  patternId: string;
  similarity: number;
  pattern: FailurePattern;
}

export interface RecommendedTest {
  testName: string;
  reason: string;
  confidenceScore: number;
}

export interface NotificationPayload {
  testRunId: string;
  commitHash: string;
  author: string;
  branch: string;
  prNumber?: number;
  failedTests: FailedTest[];
  snapshotUrls?: {
    screenshot?: string;
    htmlDump?: string;
    har?: string;
    consoleLogs?: string;
  };
  similarPatterns: PatternMatch[];
  recommendedTests: RecommendedTest[];
}
