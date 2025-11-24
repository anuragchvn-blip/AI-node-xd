# API Reference

## Base URLs

- Snapshot Service: `http://localhost:3001`
- System API: `http://localhost:3000`
- Notification Service: `http://localhost:3002`

## Authentication

All endpoints require API key authentication via header:

```
x-api-key: your-secret-key
```

---

## Snapshot Service API

### POST /snapshot/create

Capture headless browser snapshot (called only on backend test failure).

**Headers:**

```
Content-Type: application/json
x-api-key: your-secret-key
```

**Request Body:**

```json
{
  "testRunId": "string (uuid, required)",
  "url": "string (required)",
  "viewport": {
    "width": "number (optional, default: 1920)",
    "height": "number (optional, default: 1080)"
  },
  "waitForSelector": "string (optional)",
  "waitForTimeout": "number (optional, milliseconds)"
}
```

**Response (200 OK):**

```json
{
  "id": "string (uuid)",
  "testRunId": "string (uuid)",
  "timestamp": "string (ISO 8601)",
  "screenshotUrl": "string (S3 signed URL)",
  "htmlDumpUrl": "string (S3 signed URL)",
  "harUrl": "string (S3 signed URL)",
  "consoleLogsUrl": "string (S3 signed URL)",
  "metadata": {
    "viewport": { "width": 1920, "height": 1080 },
    "userAgent": "string",
    "url": "string"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid API key
- `500 Internal Server Error`: Snapshot capture failed

---

## System API

### POST /test-runs

Submit test run results (called by CI after tests complete).

**Headers:**

```
Content-Type: application/json
x-api-key: your-secret-key
```

**Request Body:**

```json
{
  "commitHash": "string (required)",
  "branch": "string (required)",
  "author": "string (required)",
  "status": "string (required, enum: 'passed' | 'failed')",
  "failedTests": [
    {
      "testName": "string",
      "errorMessage": "string",
      "stackTrace": "string (optional)"
    }
  ],
  "gitDiff": "string (optional)",
  "prNumber": "number (optional)",
  "snapshotUrls": {
    "screenshot": "string (optional)",
    "htmlDump": "string (optional)",
    "har": "string (optional)",
    "consoleLogs": "string (optional)"
  }
}
```

**Response (200 OK):**

```json
{
  "testRunId": "string (uuid)",
  "status": "string ('processed')",
  "similarPatterns": [
    {
      "patternId": "string (uuid)",
      "similarity": "number (0-1)",
      "summary": "string"
    }
  ],
  "recommendedTests": [
    {
      "testName": "string",
      "reason": "string",
      "confidenceScore": "number (0-1)"
    }
  ]
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid API key
- `500 Internal Server Error`: Processing failed

---

### GET /test-runs/:id

Retrieve test run details by ID.

**Headers:**

```
x-api-key: your-secret-key
```

**Path Parameters:**

- `id`: Test run UUID

**Response (200 OK):**

```json
{
  "id": "string (uuid)",
  "commit_hash": "string",
  "branch": "string",
  "author": "string",
  "timestamp": "string (ISO 8601)",
  "status": "string",
  "git_diff": "string",
  "pr_number": "number",
  "failed_tests": [
    {
      "id": "string (uuid)",
      "test_name": "string",
      "error_message": "string",
      "stack_trace": "string"
    }
  ],
  "snapshots": [
    {
      "id": "string (uuid)",
      "screenshot_url": "string",
      "html_dump_url": "string",
      "har_url": "string",
      "console_logs_url": "string"
    }
  ],
  "recommended_tests": [
    {
      "test_name": "string",
      "reason": "string",
      "confidence_score": "number"
    }
  ]
}
```

**Error Responses:**

- `404 Not Found`: Test run not found
- `401 Unauthorized`: Invalid API key

---

### GET /patterns/search

Search for similar failure patterns using text query.

**Headers:**

```
x-api-key: your-secret-key
```

**Query Parameters:**

- `q`: Search query (required)
- `topK`: Number of results (optional, default: 5)
- `threshold`: Minimum similarity score (optional, default: 0.85)

**Example:**

```
GET /patterns/search?q=authentication%20failure&topK=5&threshold=0.85
```

**Response (200 OK):**

```json
{
  "results": [
    {
      "id": "string (uuid)",
      "similarity": "number (0-1)",
      "pattern": {
        "id": "string (uuid)",
        "summary": "string",
        "stackTrace": "string",
        "errorMessage": "string",
        "affectedFiles": ["string"],
        "testName": "string",
        "occurrenceCount": "number",
        "firstSeen": "string (ISO 8601)",
        "lastSeen": "string (ISO 8601)"
      }
    }
  ]
}
```

**Error Responses:**

- `400 Bad Request`: Missing query parameter
- `401 Unauthorized`: Invalid API key
- `500 Internal Server Error`: Search failed

---

## Notification Service API

### POST /notify

Send notifications to all configured channels (Slack, GitHub, Email).

**Headers:**

```
Content-Type: application/json
x-api-key: your-secret-key
```

**Request Body:**

```json
{
  "testRunId": "string (uuid)",
  "commitHash": "string",
  "author": "string",
  "branch": "string",
  "prNumber": "number (optional)",
  "failedTests": [
    {
      "testName": "string",
      "errorMessage": "string",
      "stackTrace": "string"
    }
  ],
  "snapshotUrls": {
    "screenshot": "string",
    "htmlDump": "string",
    "har": "string",
    "consoleLogs": "string"
  },
  "similarPatterns": [
    {
      "patternId": "string",
      "similarity": "number",
      "pattern": {
        "summary": "string",
        "occurrenceCount": "number"
      }
    }
  ],
  "recommendedTests": [
    {
      "testName": "string",
      "reason": "string",
      "confidenceScore": "number"
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "status": "sent"
}
```

**Error Responses:**

- `401 Unauthorized`: Invalid API key
- `500 Internal Server Error`: Notification failed

---

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

- **Window**: 15 minutes (900,000 ms)
- **Max Requests**: 100 per IP

**Rate Limit Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705320000
```

**Rate Limit Exceeded (429):**

```json
{
  "error": "Too many requests from this IP"
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "string (error type)",
  "message": "string (detailed message, optional)"
}
```

---

## Health Check Endpoints

All services expose health check endpoints:

```
GET /health
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "service": "string (snapshot | api | notification)"
}
```
