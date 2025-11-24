import { z } from 'zod';

export const ReportPayloadSchema = z.object({
  commitHash: z.string().min(1, 'Commit hash is required'),
  branch: z.string().min(1, 'Branch is required'),
  author: z.string().email('Invalid author email'),
  status: z.enum(['passed', 'failed', 'running']),
  failedTests: z.array(z.object({
    testName: z.string(),
    errorMessage: z.string(),
    stackTrace: z.string().optional(),
  })).optional(),
  gitDiff: z.string().optional(),
  prNumber: z.number().optional(),
  snapshotUrls: z.object({
    screenshot: z.string().url().optional(),
    htmlDump: z.string().url().optional(),
    har: z.string().url().optional(),
    consoleLogs: z.string().url().optional(),
  }).optional(),
  failureLogs: z.string().optional(),
});

export const CreateOrderSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  credits: z.number().int().positive('Credits must be a positive integer'),
});

export const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export type ReportPayload = z.infer<typeof ReportPayloadSchema>;
