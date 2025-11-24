-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Test Runs table
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commit_hash VARCHAR(40) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed')),
    git_diff TEXT,
    pr_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_test_runs_commit ON test_runs(commit_hash);
CREATE INDEX idx_test_runs_timestamp ON test_runs(timestamp DESC);
CREATE INDEX idx_test_runs_status ON test_runs(status);

-- Failed Tests table
CREATE TABLE failed_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    test_name VARCHAR(500) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_failed_tests_run ON failed_tests(test_run_id);

-- Snapshots table
CREATE TABLE snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    screenshot_url TEXT,
    html_dump_url TEXT,
    har_url TEXT,
    console_logs_url TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_snapshots_test_run ON snapshots(test_run_id);

-- Failure Patterns table with vector embeddings
CREATE TABLE failure_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    summary TEXT NOT NULL,
    stack_trace TEXT,
    error_message TEXT NOT NULL,
    affected_files TEXT[],
    test_name VARCHAR(500),
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_failure_patterns_embedding ON failure_patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_failure_patterns_last_seen ON failure_patterns(last_seen DESC);

-- Pattern Matches table (links test runs to similar patterns)
CREATE TABLE pattern_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    pattern_id UUID NOT NULL REFERENCES failure_patterns(id) ON DELETE CASCADE,
    similarity_score FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pattern_matches_test_run ON pattern_matches(test_run_id);
CREATE INDEX idx_pattern_matches_similarity ON pattern_matches(similarity_score DESC);

-- Recommended Tests table
CREATE TABLE recommended_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    test_name VARCHAR(500) NOT NULL,
    reason TEXT,
    confidence_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recommended_tests_run ON recommended_tests(test_run_id);

-- Notifications table (audit log)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('slack', 'email', 'github')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    payload JSONB,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_test_run ON notifications(test_run_id);
CREATE INDEX idx_notifications_status ON notifications(status);
