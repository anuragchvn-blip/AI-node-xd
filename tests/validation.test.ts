import { ReportPayloadSchema, CreateOrderSchema } from '../src/utils/validation';

describe('Validation Schemas', () => {
  describe('ReportPayloadSchema', () => {
    it('should validate a correct payload', () => {
      const validPayload = {
        commitHash: 'abc1234',
        branch: 'main',
        author: 'dev@example.com',
        status: 'failed',
        failedTests: [{ testName: 'Auth Test', errorMessage: '401' }],
        gitDiff: 'diff --git ...',
      };
      const result = ReportPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const invalidPayload = {
        branch: 'main',
        // Missing commitHash
      };
      const result = ReportPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const invalidPayload = {
        commitHash: 'abc',
        branch: 'main',
        author: 'not-an-email',
        status: 'failed',
      };
      const result = ReportPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateOrderSchema', () => {
    it('should validate correct order', () => {
      const valid = { amount: 1000, credits: 10 };
      expect(CreateOrderSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject negative amounts', () => {
      const invalid = { amount: -100, credits: 10 };
      expect(CreateOrderSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
