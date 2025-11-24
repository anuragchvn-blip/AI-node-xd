import axios from 'axios';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_API_KEY = 'sk_test_demo_key_12345';

describe('Backend API Integration Tests', () => {
  let apiServer: any;

  beforeAll(async () => {
    // Wait for API to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await axios.get(`${API_BASE_URL}/health`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
    });
  });

  describe('Report API', () => {
    it('should reject request without API key', async () => {
      try {
        await axios.post(`${API_BASE_URL}/api/v1/report`, {
          commitHash: 'abc123',
          branch: 'main',
          author: 'test@example.com',
          status: 'failed',
          failureLogs: 'Test error'
        });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should process valid report', async () => {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/report`,
        {
          commitHash: 'abc123',
          branch: 'test',
          author: 'test@example.com',
          status: 'failed',
          failureLogs: 'Test: Sample Test\nError: Sample error for testing'
        },
        {
          headers: { 'x-api-key': TEST_API_KEY }
        }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('processed');
      expect(response.data.analysis).toBeDefined();
      expect(response.data.creditsUsed).toBe(1);
      expect(response.data.vectorEmbeddingDimensions).toBe(1536);
    });

    it('should validate required fields', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/api/v1/report`,
          {
            branch: 'main'
          },
          {
            headers: { 'x-api-key': TEST_API_KEY }
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });

  describe('Payment API', () => {
    it('should create order with valid data', async () => {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/payments/create-order`,
        {
          amount: 1000,
          credits: 100
        },
        {
          headers: { 'x-api-key': TEST_API_KEY }
        }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.orderId).toBeDefined();
    });

    it('should reject invalid amount', async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/api/v1/payments/create-order`,
          {
            amount: -100,
            credits: 10
          },
          {
            headers: { 'x-api-key': TEST_API_KEY }
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });

  describe('Database Connectivity', () => {
    it('should connect to database', async () => {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/report`,
        {
          commitHash: 'db-test',
          branch: 'test',
          author: 'test@example.com',
          status: 'failed',
          failureLogs: 'Database connection test'
        },
        {
          headers: { 'x-api-key': TEST_API_KEY }
        }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.creditsRemaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe('External Service Integration', () => {
    it('should connect to Groq API for AI analysis', async () => {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/report`,
        {
          commitHash: 'groq-test',
          branch: 'test',
          author: 'test@example.com',
          status: 'failed',
          failureLogs: 'Test: AI Analysis Test\nError: Testing Groq integration'
        },
        {
          headers: { 'x-api-key': TEST_API_KEY }
        }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.analysis).toBeDefined();
      expect(response.data.analysis.length).toBeGreaterThan(0);
    });
  });
});
