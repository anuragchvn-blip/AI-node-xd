#!/usr/bin/env node

/**
 * Backend Health Monitor
 * Continuously monitors backend health and sends alerts on failures
 */

import axios from 'axios';
import { logger } from '../utils/logger';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const CHECK_INTERVAL = 30000; // 30 seconds

interface HealthCheckResult {
  endpoint: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}

class BackendMonitor {
  private failureCount: { [key: string]: number } = {};

  async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 && response.data.status === 'ok') {
        return { endpoint: '/health', status: 'healthy', responseTime };
      }
      
      return { 
        endpoint: '/health', 
        status: 'unhealthy', 
        error: `Unexpected status: ${response.data.status}` 
      };
    } catch (error: any) {
      return { 
        endpoint: '/health', 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  async checkDatabase(): Promise<HealthCheckResult> {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
      return { endpoint: 'database', status: 'healthy' };
    } catch (error: any) {
      return { 
        endpoint: 'database', 
        status: 'unhealthy', 
        error: 'Database connection failed' 
      };
    }
  }

  async sendAlert(result: HealthCheckResult): Promise<void> {
    if (!SLACK_WEBHOOK) return;

    const message = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Backend Health Alert',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Endpoint:*\n${result.endpoint}` },
            { type: 'mrkdwn', text: `*Status:*\n❌ Unhealthy` },
            { type: 'mrkdwn', text: `*Error:*\n${result.error || 'Unknown'}` },
            { type: 'mrkdwn', text: `*Time:*\n${new Date().toISOString()}` }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔍 Action Required:*\n• Check server logs\n• Verify database connection\n• Check external services (Groq, Supabase)\n• Review recent deployments`
          }
        }
      ]
    };

    try {
      await axios.post(SLACK_WEBHOOK, message);
      logger.info('Backend health alert sent to Slack');
    } catch (error: any) {
      logger.error('Failed to send health alert', { error: error.message });
    }
  }

  async runCheck(): Promise<void> {
    logger.info('Running backend health check...');
    
    const healthResult = await this.checkHealth();
    
    if (healthResult.status === 'unhealthy') {
      const key = healthResult.endpoint;
      this.failureCount[key] = (this.failureCount[key] || 0) + 1;
      
      logger.error('Backend unhealthy', { 
        endpoint: healthResult.endpoint,
        error: healthResult.error,
        failureCount: this.failureCount[key]
      });
      
      // Alert after 2 consecutive failures
      if (this.failureCount[key] >= 2) {
        await this.sendAlert(healthResult);
        this.failureCount[key] = 0; // Reset after alerting
      }
    } else {
      this.failureCount[healthResult.endpoint] = 0;
      logger.info('Backend healthy', { 
        endpoint: healthResult.endpoint,
        responseTime: healthResult.responseTime 
      });
    }
  }

  start(): void {
    logger.info('Starting backend monitor', { interval: CHECK_INTERVAL });
    this.runCheck(); // Run immediately
    setInterval(() => this.runCheck(), CHECK_INTERVAL);
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new BackendMonitor();
  monitor.start();
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Backend monitor shutting down');
    process.exit(0);
  });
}

export default BackendMonitor;
