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
  // Enhanced fields for detailed reporting
  failureLogs?: string;
  gitDiff?: string;
  allFailedTests?: any[];
  similarPatternsDetails?: Array<{
    similarity: string;
    summary: string;
    timestamp: Date;
  }>;
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
   * Create GitHub Gist with full report
   */
  private async createGist(
    description: string,
    content: string,
    filename: string
  ): Promise<string | null> {
    try {
      const githubToken = process.env.GIST_TOKEN;
      if (!githubToken) {
        logger.warn('GIST_TOKEN not found, cannot create Gist');
        return null;
      }

      const response = await axios.post(
        'https://api.github.com/gists',
        {
          description,
          public: false, // Private gist
          files: {
            [filename]: { content }
          }
        },
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('GitHub Gist created successfully', { 
        url: response.data.html_url,
        gistId: response.data.id 
      });
      return response.data.html_url;
    } catch (error: any) {
      logger.error('Failed to create GitHub Gist', { 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      return null;
    }
  }

  /**
   * Generate detailed markdown report
   */
  private generateMarkdownReport(payload: NotificationPayload): string {
    const timestamp = new Date().toISOString();
    const shortCommit = payload.commitHash.substring(0, 8);
    
    return `# 🚨 CI Failure Analysis Report

> **Automated failure analysis powered by AI**

---

## 📋 Summary

| Field | Value |
|-------|-------|
| **Project** | ${payload.projectName} |
| **Branch** | \`${payload.branch}\` |
| **Commit** | \`${shortCommit}\` |
| **Author** | ${payload.author} |
| **Timestamp** | ${timestamp} |
| **Status** | ❌ Failed |

---

## 🤖 AI Analysis

${payload.aiAnalysis}

---

## 📋 Recommended Actions

${payload.recommendations && payload.recommendations.length > 0 
  ? payload.recommendations.map((r, i) => `### ${i + 1}. ${r}\n\nTake action on this recommendation to resolve the failure.`).join('\n\n')
  : '### ⚠️ No specific recommendations available\n\nReview the failure logs and AI analysis above for debugging guidance.'}

---

## ❌ Failure Details

${payload.failureLogs ? `\`\`\`\n${payload.failureLogs}\n\`\`\`` : `\`\`\`\n${payload.failureMessage}\n\`\`\``}

---

## 🔍 Similar Patterns Found

${(payload.similarPatterns || 0) > 0 
  ? `Found **${payload.similarPatterns}** similar failure pattern(s) in history.\n\n${payload.similarPatternsDetails?.map((p: any, i: number) => 
      `### Pattern ${i + 1}\n- **Similarity:** ${p.similarity}%\n- **Summary:** ${p.summary}\n- **Date:** ${new Date(p.timestamp).toLocaleString()}`
    ).join('\n\n') || ''}`
  : '**No similar patterns found.** This appears to be a new type of failure.'}

---

## 🔄 Recent Changes (Git Diff)

${payload.gitDiff ? `\`\`\`diff\n${payload.gitDiff.substring(0, 3000)}${payload.gitDiff.length > 3000 ? '\n... (diff truncated)' : ''}\n\`\`\`` : '_No git diff available_'}

---

## 📊 Analysis Metrics

| Metric | Value |
|--------|-------|
| Credits Used | ${payload.creditsUsed || 0} |
| Credits Remaining | **${payload.creditsRemaining || 0}** |
| Similar Patterns | ${payload.similarPatterns || 0} |
| Vector Dimensions | ${payload.vectorDimensions || 1536} |

---

## 🛠️ Next Steps

1. **Review the AI Analysis** section above for root cause identification
2. **Apply the Recommended Actions** in order of priority
3. **Check Similar Patterns** to see if this issue has occurred before
4. **Review the Git Diff** to understand what code changes triggered this failure
5. **Fix the issue** and push to trigger a new CI run

---

<sub>Generated by **CI Snapshot AI System** • Powered by Groq AI & pgvector</sub>
`;
  }

  /**
   * Send Slack notification with file attachment if content is long
   */
  async sendSlackNotification(webhookUrl: string, payload: NotificationPayload): Promise<void> {
    try {
      // Create brief summary for Slack message (full analysis in Gist)
      const briefAnalysis = payload.aiAnalysis.length > 400 
        ? payload.aiAnalysis.substring(0, 400) + '...\n\n📄 *See full report button below*'
        : payload.aiAnalysis;

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
              text: `*🤖 AI Analysis:*\n${this.formatAnalysisForSlack(briefAnalysis)}`,
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

      // Always create GitHub Gist with full report for CI failures
      const markdownReport = this.generateMarkdownReport(payload);
      
      // Save report to file for GitHub artifacts
      const fs = require('fs');
      const path = require('path');
      const reportsDir = path.join(process.cwd(), 'ci-reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      const fileName = `failure-${payload.commitHash.substring(0, 8)}-${Date.now()}.md`;
      const filePath = path.join(reportsDir, fileName);
      fs.writeFileSync(filePath, markdownReport);
      
      logger.info('Detailed report saved', { filePath });
      
      // Create GitHub Gist with full report
      const gistUrl = await this.createGist(
        `CI Failure Report - ${payload.commitHash.substring(0, 8)}`,
        markdownReport,
        fileName
      );
      
      if (gistUrl) {
        // Add divider
        message.blocks.push({
          type: 'divider'
        } as any);
        
        // Add button with actions block to view full report
        message.blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📄 View Full Report', emoji: true },
              url: gistUrl,
              style: 'primary'
            }
          ]
        } as any);
        
        logger.info('Gist link added to Slack message', { gistUrl });
      } else {
        logger.warn('Gist creation failed, link not added to Slack message');
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
