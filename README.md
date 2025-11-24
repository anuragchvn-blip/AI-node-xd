# CI/CD Snapshot & Pattern Matching System

**Primary Stack:** Node.js (TypeScript) + Playwright + pgvector (PostgreSQL) + AWS S3 + GitHub Actions

## One-Line Summary

Monitor repos, run CI on frontend changes, snapshot backend failures, store in vector DB, match patterns, notify with recommendations.

---

## Overview

This system monitors frontend and backend repositories, runs CI builds and tests on frontend changes, and **triggers headless snapshots only when backend tests fail** due to frontend changes. It stores failure snapshots and metadata in a Supermemory-style vector store, matches failures to past patterns, returns similarity scores, recommends tests, and notifies authors/testers with snapshots, diffs, and recommended actions.

## Architecture

```
Frontend Push → GitHub Actions → Backend Tests → (on failure) → Snapshot Service
                                                                        ↓
                                                                   S3 Artifacts
                                                                        ↓
                                                                  System API
                                                                        ↓
                                                            Vector Store (pgvector)
                                                                        ↓
                                                            Recommendation Engine
                                                                        ↓
                                                            Notification Service
                                                            (Slack, GitHub, Email)
```

## Components

- **GitHub Actions CI**: Builds frontend, runs backend tests, triggers snapshot on failure
- **Snapshot Service**: Playwright-based headless capture (screenshot, HTML, HAR, logs)
- **System API**: Receives test results, stores metadata, orchestrates pattern matching
- **Vector Store (pgvector)**: Stores failure embeddings for similarity search
- **Supermemory Integration**: Generates embeddings, inserts/searches patterns
- **Recommendation Engine**: Analyzes git diff + similar failures, suggests tests
- **Notification Service**: Sends Slack messages with GitHub Gists for full reports, emails, GitHub PR comments
- **Artifact Storage (S3/MinIO)**: Stores snapshots with retention policy

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ with pgvector extension
- AWS S3 or MinIO
- OpenAI API key
- Slack Bot Token (optional)
- GitHub Token (optional)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd ci-snapshot-system

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Setup database
psql -U postgres -c "CREATE DATABASE ci_snapshot_db;"
psql -U postgres -d ci_snapshot_db -f db/schema.sql

# Build TypeScript
npm run build
```

### Running Services

```bash
# Run all services (development)
npm run snapshot:dev  # Terminal 1 - Port 3001
npm run api:dev       # Terminal 2 - Port 3000
npm run notification:dev  # Terminal 3 - Port 3002

# Or run in production
npm start
```

---

## Configuration

### Environment Variables

See `.env.example` for all configuration options. Key variables:

- `DATABASE_URL`: PostgreSQL connection string
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`: S3 configuration
- `OPENAI_API_KEY`: For generating embeddings
- `GROQ_API_KEY`: For AI analysis using Groq (llama-3.3-70b)
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications
- `GITHUB_TOKEN`: For PR comments and creating Gists with full reports
- `API_SECRET_KEY`: Authentication for API calls
- `SIMILARITY_THRESHOLD`: Minimum similarity score (default: 0.85)
- `ARTIFACT_RETENTION_DAYS`: How long to keep snapshots (default: 30)

### GitHub Actions Secrets

Add these secrets to your GitHub repository:

- `SNAPSHOT_SERVICE_URL`: URL of deployed Snapshot Service
- `API_SERVICE_URL`: URL of deployed System API
- `API_SECRET_KEY`: Same as in .env
- `BACKEND_REPO`: Backend repository (e.g., `owner/backend-repo`)
- `GH_PAT`: GitHub Personal Access Token with repo access

---

## API Documentation

### Snapshot Service

#### POST /snapshot/create

Trigger snapshot capture (called only on backend test failure).

**Request:**

```json
{
  "testRunId": "550e8400-e29b-41d4-a716-446655440000",
  "url": "http://localhost:3000",
  "viewport": { "width": 1920, "height": 1080 },
  "waitForSelector": "#app-loaded"
}
```

**Response:**

```json
{
  "id": "snapshot-uuid",
  "testRunId": "test-run-uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "screenshotUrl": "https://s3.../screenshot.png",
  "htmlDumpUrl": "https://s3.../page.html",
  "harUrl": "https://s3.../network.har",
  "consoleLogsUrl": "https://s3.../console.log",
  "metadata": {
    "viewport": { "width": 1920, "height": 1080 },
    "userAgent": "Mozilla/5.0...",
    "url": "http://localhost:3000"
  }
}
```

### System API

#### POST /test-runs

Submit test run results (called by CI after tests complete).

**Request:**

```json
{
  "commitHash": "abc123def456",
  "branch": "feature/new-ui",
  "author": "john@example.com",
  "status": "failed",
  "failedTests": [
    {
      "testName": "test_api_integration",
      "errorMessage": "Connection refused",
      "stackTrace": "Traceback..."
    }
  ],
  "gitDiff": "diff --git a/src/api.ts...",
  "prNumber": 123,
  "snapshotUrls": {
    "screenshot": "https://...",
    "htmlDump": "https://...",
    "har": "https://...",
    "consoleLogs": "https://..."
  }
}
```

**Response:**

```json
{
  "testRunId": "uuid",
  "status": "processed",
  "similarPatterns": [
    {
      "patternId": "pattern-uuid",
      "similarity": 0.92,
      "summary": "API connection failure in auth module"
    }
  ],
  "recommendedTests": [
    {
      "testName": "test_api_auth",
      "reason": "Similar failure pattern (92% match)",
      "confidenceScore": 0.85
    }
  ]
}
```

#### GET /test-runs/:id

Retrieve test run details.

#### GET /patterns/search?q=query&topK=5&threshold=0.85

Search for similar failure patterns.

---

## Supermemory Integration

### Storing Patterns

```typescript
import vectorStore from "./services/api/VectorStoreService";

// Insert failure pattern
const patternId = await vectorStore.insertPattern({
  summary: "API authentication failure after frontend login change",
  errorMessage: "Connection refused on /api/auth",
  stackTrace: "Traceback...",
  affectedFiles: ["src/auth/login.ts", "src/api/client.ts"],
  testName: "test_auth_integration",
});

// Or use Supermemory-style entry
const entryId = await vectorStore.createSupermemoryEntry({
  text: "Frontend login button change broke backend auth endpoint",
  metadata: {
    testRunId: "uuid",
    commitHash: "abc123",
    errorType: "ConnectionError",
    affectedFiles: ["src/auth/login.ts"],
    timestamp: new Date(),
  },
});
```

### Searching Patterns

```typescript
// Search by text query
const results = await vectorStore.searchSupermemory({
  query: "authentication failure",
  topK: 5,
  threshold: 0.85,
});

// Search by embedding vector
const embedding = await vectorStore.generateEmbedding("auth error");
const results = await vectorStore.searchSimilarPatterns({
  embedding,
  topK: 5,
  threshold: 0.85,
});

// Results format
results.forEach((result) => {
  console.log(`Similarity: ${result.similarity}`);
  console.log(`Pattern: ${result.pattern.summary}`);
  console.log(`Occurred: ${result.pattern.occurrenceCount} times`);
});
```

---

## Notification Examples

### Slack Notification

The system sends rich Slack notifications with:
- **Brief Summary**: Key failure details and AI analysis (up to 500 chars)
- **View Full Report Button**: Links to GitHub Gist with complete markdown report
- **Quick Actions**: View screenshots, HAR files, similar patterns

When AI analysis is longer than 500 characters, a private GitHub Gist is automatically created containing:
- Complete failure logs
- Full AI analysis with root cause
- Detailed recommendations
- Similar pattern history
- Credits and metrics

The Gist link is embedded as a clickable button in the Slack message for easy access.

### GitHub PR Comment

```markdown
## 🚨 Backend Tests Failed

**Commit:** `abc123def456`

### Failed Tests (2)

- **test_api_integration**
```

Connection refused

```

### 📸 Snapshots

- [Screenshot](https://s3.../screenshot.png)
- [HTML Dump](https://s3.../page.html)
- [Network HAR](https://s3.../network.har)

### 🔍 Similar Past Failures

- **92.3% match** - API connection failure in auth module (occurred 5 times)

### 💡 Recommended Tests to Run

- `test_api_auth` - Similar failure pattern (92% match)
- `test_auth_integration` - Related to changed file: src/auth/login.ts
```

---

## Operational Concerns

### Security

- **API Authentication**: All services use API key authentication (`x-api-key` header)
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Secrets Management**: Use environment variables, never commit secrets
- **S3 Signed URLs**: Artifacts accessible via time-limited signed URLs (7 days)
- **Database**: Use connection pooling, parameterized queries to prevent SQL injection

### Retention Policy

- **Artifacts**: Deleted after 30 days (configurable via `ARTIFACT_RETENTION_DAYS`)
- **Database**: Implement periodic cleanup job:

```sql
DELETE FROM test_runs WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM failure_patterns WHERE last_seen < NOW() - INTERVAL '90 days' AND occurrence_count = 1;
```

### Retries & Idempotency

- **Snapshot Service**: Retries network requests up to 3 times
- **Notification Service**: Uses `Promise.allSettled` to continue on partial failures
- **Test Run Submission**: Use UUIDs to prevent duplicate entries

### Scaling

- **Horizontal Scaling**: Run multiple instances of each service behind load balancer
- **Database**: Use read replicas for pattern searches
- **Vector Search**: Tune pgvector `ivfflat` index lists parameter based on data size
- **S3**: Use CloudFront CDN for faster artifact access
- **Async Processing**: Move notification sending to message queue (Redis/RabbitMQ)

---

## Acceptance Tests

### Verification Checklist

- [ ] Frontend push triggers GitHub Actions workflow
- [ ] Workflow builds frontend successfully
- [ ] Backend tests run against new frontend build
- [ ] **Snapshot is NOT captured when tests pass**
- [ ] **Snapshot IS captured when tests fail**
- [ ] Snapshot includes screenshot, HTML, HAR, console logs
- [ ] Artifacts uploaded to S3 with signed URLs
- [ ] Test results submitted to System API
- [ ] Failure pattern inserted into vector store
- [ ] Similar patterns found with similarity > 0.85
- [ ] Recommended tests generated based on git diff
- [ ] Slack notification sent with all details
- [ ] GitHub PR comment posted with snapshot links
- [ ] Database contains test run, failed tests, snapshot, patterns
- [ ] Notifications logged in database
- [ ] API endpoints require authentication
- [ ] Rate limiting prevents abuse
- [ ] Services handle errors gracefully

---

## For Non-Technical Managers

This system automatically detects when frontend code changes break backend functionality. When a developer pushes new frontend code, our automated tests run the backend against it. If something breaks, the system instantly captures screenshots and detailed logs of what went wrong, compares it to past similar failures using AI, and sends the developer a notification with exactly what broke, why it might have broken based on history, and which specific tests they should run to fix it. This dramatically reduces debugging time from hours to minutes and prevents the same issues from recurring.

---

## Deliverables Checklist

### MVP (Minimum Viable Product)

- [x] Database schema with pgvector
- [x] Snapshot Service with Playwright
- [x] System API with test run ingestion
- [x] Vector Store Service with OpenAI embeddings
- [x] GitHub Actions workflow with conditional snapshot
- [x] Basic Slack notifications

### V1 (Full Feature Set)

- [x] Recommendation Engine with git diff analysis
- [x] GitHub PR comments
- [x] Email notifications
- [x] Pattern matching with similarity threshold
- [x] Comprehensive API documentation
- [x] Security (authentication, rate limiting)
- [x] Error handling and retries
- [x] Operational documentation

### Future Enhancements

- [ ] Web dashboard for viewing test history
- [ ] Automated test suggestion based on code changes
- [ ] Integration with Jira/Linear for ticket creation
- [ ] Custom embedding models for domain-specific patterns
- [ ] A/B testing for recommendation algorithms
- [ ] Real-time WebSocket notifications
- [ ] Multi-repository support
- [ ] Cost optimization for S3 storage

---

## Example Flow

### Sample Run

1. **Developer pushes code:**

   ```
   Commit: abc123def456
   Author: john@example.com
   Branch: feature/new-login-ui
   Files changed: src/components/Login.tsx
   ```

2. **GitHub Actions triggers:**

   - Builds frontend ✓
   - Starts frontend server ✓
   - Runs backend tests ✗ (2 tests failed)

3. **Snapshot captured:**

   ```json
   {
     "id": "snapshot-789",
     "screenshotUrl": "https://s3.../screenshot.png",
     "errorMessage": "API /auth/login returned 500"
   }
   ```

4. **System API processes:**

   - Generates embedding from error
   - Finds 2 similar patterns (92% and 87% similarity)
   - Recommends 3 tests to run

5. **Notifications sent:**

   - Slack: Posted to #ci-failures channel
   - GitHub: Comment on PR #123
   - Email: Sent to john@example.com

6. **Developer receives:**

   - Screenshot showing broken login button
   - HAR file revealing missing CORS header
   - Recommendation: "Run test_cors_headers (similar failure 92% match)"

7. **Result:**
   - Developer fixes CORS issue in 10 minutes
   - Re-runs suggested test ✓
   - Pushes fix, tests pass ✓

---

## License

MIT
