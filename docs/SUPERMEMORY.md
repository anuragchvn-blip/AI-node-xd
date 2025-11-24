# Supermemory Integration Guide

## What is Supermemory in This System?

**Supermemory** is not a separate service - it's a **pattern-matching approach** implemented using:

- **OpenAI Embeddings** (text-embedding-3-small, 1536 dimensions)
- **pgvector** (PostgreSQL extension for vector similarity search)
- **Cosine Similarity** (threshold: 0.85 = 85% match)

## Where is Supermemory Implemented?

### Core Implementation: `VectorStoreService.ts`

Located at: `src/services/api/VectorStoreService.ts`

This service provides Supermemory-style functionality:

```typescript
// 1. Create Supermemory Entry
await vectorStore.createSupermemoryEntry({
  text: "Frontend login button change broke backend auth",
  metadata: {
    testRunId: "uuid",
    commitHash: "abc123",
    errorType: "ConnectionError",
    affectedFiles: ["src/auth/login.ts"],
    timestamp: new Date(),
  },
});

// 2. Search Supermemory (text-based)
const results = await vectorStore.searchSupermemory({
  query: "authentication failure",
  topK: 5,
  threshold: 0.85,
});

// 3. Insert Pattern Directly
await vectorStore.insertPattern({
  summary: "API auth failure",
  errorMessage: "Connection refused",
  affectedFiles: ["src/api/auth.ts"],
  testName: "test_auth",
});

// 4. Search by Embedding Vector
const embedding = await vectorStore.generateEmbedding("login error");
const matches = await vectorStore.searchSimilarPatterns({
  embedding,
  topK: 5,
  threshold: 0.85,
});
```

## How It Works

### 1. **Embedding Generation**

```typescript
// Text → 1536-dimensional vector
const embedding = await vectorStore.generateEmbedding(
  "Frontend login button change broke backend auth"
);
// Returns: [0.0234, -0.0156, 0.0891, ..., 0.0234] (1536 numbers)
```

### 2. **Pattern Storage**

```sql
-- Stored in PostgreSQL with pgvector
INSERT INTO failure_patterns (
  embedding,      -- vector(1536)
  summary,        -- text description
  error_message,  -- error details
  affected_files, -- array of file paths
  test_name       -- test that failed
) VALUES (...);
```

### 3. **Similarity Search**

```sql
-- Cosine similarity using pgvector
SELECT
  id,
  summary,
  1 - (embedding <=> $query_embedding) AS similarity
FROM failure_patterns
WHERE 1 - (embedding <=> $query_embedding) > 0.85
ORDER BY similarity DESC
LIMIT 5;
```

### 4. **Pattern Matching**

- New failure occurs → Generate embedding
- Search for similar past failures (cosine similarity > 0.85)
- Return top 5 matches with similarity scores
- Track occurrence count for each pattern

## Supermemory API Methods

### `createSupermemoryEntry(params)`

**Purpose**: Create a new memory entry with metadata

**Parameters**:

```typescript
{
  text: string;                    // Failure description
  metadata: {
    testRunId: string;
    commitHash: string;
    errorType: string;
    affectedFiles: string[];
    timestamp: Date;
  }
}
```

**Returns**: `Promise<string>` (entry ID)

---

### `searchSupermemory(params)`

**Purpose**: Search for similar patterns by text query

**Parameters**:

```typescript
{
  query: string;           // Search text
  topK?: number;          // Max results (default: 5)
  threshold?: number;     // Min similarity (default: 0.85)
}
```

**Returns**: Array of matches with similarity scores

---

### `insertPattern(params)`

**Purpose**: Insert a failure pattern directly

**Parameters**:

```typescript
{
  summary: string;
  errorMessage: string;
  stackTrace?: string;
  affectedFiles?: string[];
  testName?: string;
}
```

**Returns**: `Promise<string>` (pattern ID)

---

### `searchSimilarPatterns(params)`

**Purpose**: Search by pre-computed embedding vector

**Parameters**:

```typescript
{
  embedding: number[];    // 1536-dimensional vector
  topK?: number;
  threshold?: number;
}
```

**Returns**: Array of similar patterns

---

### `generateEmbedding(text)`

**Purpose**: Convert text to vector embedding

**Parameters**: `text: string`

**Returns**: `Promise<number[]>` (1536-dimensional vector)

## Usage in System API

The System API automatically uses Supermemory when processing test failures:

```typescript
// In src/services/api/index.ts

// 1. Generate summary from failure
const summary = generateFailureSummary(failedTests, gitDiff);

// 2. Find similar patterns (Supermemory search)
const similarPatterns = await recommendationEngine.findSimilarPatterns({
  failedTests,
  gitDiff,
});

// 3. Insert new pattern into Supermemory
await vectorStore.insertPattern({
  summary,
  errorMessage: failedTests[0].errorMessage,
  stackTrace: failedTests[0].stackTrace,
  affectedFiles: changedFiles,
  testName: failedTests[0].testName,
});
```

## Database Schema

```sql
CREATE TABLE failure_patterns (
    id UUID PRIMARY KEY,
    embedding vector(1536),           -- pgvector type
    summary TEXT NOT NULL,
    error_message TEXT NOT NULL,
    affected_files TEXT[],
    test_name VARCHAR(500),
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP
);

-- Vector similarity index (IVFFlat)
CREATE INDEX idx_failure_patterns_embedding
  ON failure_patterns
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

## Example: Complete Flow

```typescript
// 1. Test fails in CI
const failure = {
  testName: "test_api_auth",
  errorMessage: "Connection refused",
  stackTrace: "...",
};

// 2. Generate embedding
const embedding = await vectorStore.generateEmbedding(
  `${failure.testName}: ${failure.errorMessage}`
);

// 3. Search for similar past failures
const similar = await vectorStore.searchSimilarPatterns({
  embedding,
  topK: 5,
  threshold: 0.85,
});

// 4. Results
similar.forEach((match) => {
  console.log(`${(match.similarity * 100).toFixed(1)}% match`);
  console.log(`Pattern: ${match.pattern.summary}`);
  console.log(`Occurred ${match.pattern.occurrenceCount} times`);
});

// 5. Store new pattern
await vectorStore.insertPattern({
  summary: "Auth endpoint failure after login UI change",
  errorMessage: failure.errorMessage,
  stackTrace: failure.stackTrace,
  testName: failure.testName,
});
```

## Running the Demo

```bash
# Prerequisites
# 1. PostgreSQL with pgvector installed
# 2. Database schema initialized
# 3. OPENAI_API_KEY in .env

# Run the Supermemory demo
npx ts-node examples/supermemory-demo.ts
```

## Key Features

✅ **Vector Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)  
✅ **Fast Search**: pgvector with IVFFlat index for cosine similarity  
✅ **Similarity Threshold**: 85% match required (configurable)  
✅ **Pattern Tracking**: Automatic occurrence counting  
✅ **Metadata Storage**: Files, tests, timestamps, stack traces  
✅ **Scalable**: Handles millions of patterns with proper indexing

## Configuration

Environment variables:

```bash
OPENAI_API_KEY=sk-your-key              # Required for embeddings
EMBEDDING_MODEL=text-embedding-3-small  # Default model
SIMILARITY_THRESHOLD=0.85               # Min similarity (0-1)
MAX_SIMILAR_PATTERNS=5                  # Max results returned
```

## Summary

**Supermemory is already integrated** into the system via `VectorStoreService`. It's not a separate service but a pattern-matching approach using:

1. **OpenAI** for text → vector conversion
2. **pgvector** for fast similarity search
3. **PostgreSQL** for storage and indexing

The system automatically uses Supermemory to:

- Store failure patterns with embeddings
- Find similar past failures (85%+ match)
- Track pattern occurrences
- Recommend tests based on similar failures
