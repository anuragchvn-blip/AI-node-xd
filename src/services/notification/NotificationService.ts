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
  creditsUsed?: number;
  creditsRemaining?: number;
  similarPatterns?: number;
  vectorDimensions?: number;
}

export class NotificationService {
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private formatAnalysisForSlack(text: string): string {
    // Convert markdown to Slack formatting
    let formatted = text
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')  // **bold** to *bold*
      .replace(/^### (.+)$/gm, '\n*$1*')    // ### Header to *Header*
      .replace(/^## (.+)$/gm, '\n*$1*')     // ## Header to *Header*
      .replace(/^# (.+)$/gm, '\n*$1*')      // # Header to *Header*
      .replace(/^\* (.+)$/gm, '• $1')       // * item to • item
      .replace(/^- (.+)$/gm, '• $1')        // - item to • item
      .replace(/`([^`]+)`/g, '`$1`');       // keep code blocks
    
    // Strict truncation to prevent Slack API errors
    if (formatted.length > 1500) {
      formatted = formatted.substring(0, 1500) + '\n\n_[Truncated for length - see logs]_';
    }
    
    return formatted;
  }

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
              { type: 'mrkdwn', text: `*Author:*\n${payload.author.split('@')[0]}` },
            ],
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*❌ Error:*\n\`\`\`${payload.failureMessage.substring(0, 150)}...\`\`\``,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🤖 AI Analysis:*\n${this.formatAnalysisForSlack(payload.aiAnalysis)}`,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📋 Recommendations:*\n${payload.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n') || '• This is a new failure pattern'}`,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🔍 *Similar Patterns:* ${payload.similarPatterns || 0} | 💰 *Credits Used:* ${payload.creditsUsed || 0} | 💳 *Credits Remaining:* ${payload.creditsRemaining || 0} | 🧬 *Vector Dims:* ${payload.vectorDimensions || 1536}`,
              },
            ],
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
   * Send email notification using SendGrid
   */
  async sendEmailNotification(
    to: string,
    apiKey: string,
    payload: NotificationPayload
  ): Promise<void> {
    try {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">🚨 CI Failure Detected</h2>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Project:</strong> ${payload.projectName}</p>
            <p><strong>Commit:</strong> <code>${payload.commitHash}</code></p>
            <p><strong>Branch:</strong> ${payload.branch}</p>
            <p><strong>Author:</strong> ${payload.author}</p>
          </div>
          
          <h3 style="color: #e74c3c;">❌ Error</h3>
          <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto;">${payload.failureMessage}</pre>
          
          <h3 style="color: #3498db;">🤖 AI Analysis</h3>
          <div style="background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 15px 0;">
            ${payload.aiAnalysis.split('\n').map(line => `<p>${line}</p>`).join('')}
          </div>
          
          <h3 style="color: #27ae60;">📋 Recommendations</h3>
          <ul style="background: #e8f8f5; padding: 15px; border-radius: 5px;">
            ${payload.recommendations.map(r => `<li>${r}</li>`).join('')}
          </ul>
          
          ${payload.dashboardUrl ? `
            <div style="text-align: center; margin: 20px 0;">
              <a href="${payload.dashboardUrl}" style="background: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                View Dashboard
              </a>
            </div>
          ` : ''}
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
            Powered by CI Snapshot AI
          </p>
        </div>
      `;

      // SendGrid API call
      await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        {
          personalizations: [{ to: [{ email: to }] }],
          from: { email: process.env.NOTIFICATION_FROM_EMAIL || 'noreply@ci-system.com', name: 'CI Snapshot System' },
          subject: `🚨 CI Failure: ${payload.projectName} - ${payload.branch}`,
          content: [{ type: 'text/html', value: emailBody }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Email notification sent', { to, commit: payload.commitHash });
    } catch (error: any) {
      logger.error('Email notification failed', { error: error.message, response: error.response?.data });
    }
  }
}

export default new NotificationService();
