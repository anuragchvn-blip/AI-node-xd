-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    credits_balance INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects (Repositories)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    repo_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Failure Patterns (Vector Store)
CREATE TABLE IF NOT EXISTS failure_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    embedding vector(1536), -- OpenAI/Groq embedding dimension
    summary TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    affected_files TEXT[],
    test_name VARCHAR(500),
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector Similarity Index
CREATE INDEX IF NOT EXISTS idx_failure_patterns_embedding 
ON failure_patterns 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Transactions (Payments)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    amount INTEGER NOT NULL, -- In smallest currency unit (paise)
    credits_added INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Logs
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    action_type VARCHAR(50) NOT NULL, -- 'analysis', 'search'
    cost INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
