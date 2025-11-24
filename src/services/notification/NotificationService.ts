import axios from 'axios';
import { logger } from '../../utils/logger';

export interface NotificationPayload {
  projectName: string;
  commitHash: string;
  branch: string;
  author: string;
  failureMessage: string;
  aiAnalysis: string;
  recommendations: string[];
  dashboardUrl?: string;
}

export class NotificationService {
  /**
   * Send Slack notification
   */
  async sendSlackNotification(webhookUrl: string, payload: NotificationPayload): Promise<void> {
    try {
      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 CI Failure Detected',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Project:*\n${payload.projectName}` },
              { type: 'mrkdwn', text: `*Branch:*\n${payload.branch}` },
              { type: 'mrkdwn', text: `*Commit:*\n\`${payload.commitHash.substring(0, 8)}\`` },
              { type: 'mrkdwn', text: `*Author:*\n${payload.author}` },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Error:*\n\`\`\`${payload.failureMessage.substring(0, 200)}\`\`\``,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🤖 AI Analysis:*\n${payload.aiAnalysis.substring(0, 500)}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📋 Recommended Tests:*\n${payload.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
            },
          },
        ],
      };

      if (payload.dashboardUrl) {
        message.blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Dashboard' },
              url: payload.dashboardUrl,
              style: 'primary',
            },
          ],
        } as any);
      }

      await axios.post(webhookUrl, message);
      logger.info('Slack notification sent', { commit: payload.commitHash });
    } catch (error: any) {
      logger.error('Slack notification failed', { error: error.message });
    }
  }

  /**
   * Post GitHub PR comment
   */
  async postGitHubComment(
    repoOwner: string,
    repoName: string,
    prNumber: number,
    githubToken: string,
    payload: NotificationPayload
  ): Promise<void> {
    try {
      const comment = `## 🚨 CI Failure Analysis

**Commit:** \`${payload.commitHash}\`
**Branch:** \`${payload.branch}\`
**Author:** @${payload.author.split('@')[0]}

### ❌ Error
\`\`\`
${payload.failureMessage.substring(0, 300)}
\`\`\`

### 🤖 AI Analysis
${payload.aiAnalysis}

### 📋 Recommended Tests
${payload.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
*Powered by CI Snapshot AI*`;

      await axios.post(
        `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${prNumber}/comments`,
        { body: comment },
        {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      logger.info('GitHub comment posted', { pr: prNumber, commit: payload.commitHash });
    } catch (error: any) {
      logger.error('GitHub comment failed', { error: error.message });
    }
  }

  /**
   * Send email notification (using a service like SendGrid, Mailgun, etc.)
   */
  async sendEmailNotification(
    to: string,
    apiKey: string,
    payload: NotificationPayload
  ): Promise<void> {
    try {
      // Example using SendGrid
      const emailBody = `
        <h2>🚨 CI Failure Detected</h2>
        <p><strong>Project:</strong> ${payload.projectName}</p>
        <p><strong>Commit:</strong> ${payload.commitHash}</p>
        <p><strong>Branch:</strong> ${payload.branch}</p>
        <p><strong>Author:</strong> ${payload.author}</p>
        
        <h3>Error</h3>
        <pre>${payload.failureMessage}</pre>
        
        <h3>🤖 AI Analysis</h3>
        <p>${payload.aiAnalysis}</p>
        
        <h3>📋 Recommended Tests</h3>
        <ul>
          ${payload.recommendations.map(r => `<li>${r}</li>`).join('')}
        </ul>
      `;

      // This is a placeholder - you'd integrate with your email service
      logger.info('Email notification would be sent', { to, commit: payload.commitHash });
    } catch (error: any) {
      logger.error('Email notification failed', { error: error.message });
    }
  }
}

export default new NotificationService();
