# Deployment Guide

## Prerequisites

- Ubuntu 20.04+ server
- Docker & Docker Compose (recommended) OR Node.js 20+
- PostgreSQL 14+ with pgvector
- Domain name with SSL certificate
- AWS S3 bucket or MinIO instance

## Option 1: Docker Deployment (Recommended)

### 1. Create docker-compose.yml

```yaml
version: "3.8"

services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_DB: ci_snapshot_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"

  snapshot-service:
    build: .
    command: npm run snapshot:dev
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/ci_snapshot_db
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
      - API_SECRET_KEY=${API_SECRET_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - postgres

  api-service:
    build: .
    command: npm run api:dev
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/ci_snapshot_db
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - API_SECRET_KEY=${API_SECRET_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  notification-service:
    build: .
    command: npm run notification:dev
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/ci_snapshot_db
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - SLACK_CHANNEL_ID=${SLACK_CHANNEL_ID}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - API_SECRET_KEY=${API_SECRET_KEY}
    ports:
      - "3002:3002"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### 2. Create Dockerfile

```dockerfile
FROM node:20-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium

EXPOSE 3000 3001 3002

CMD ["npm", "start"]
```

### 3. Deploy

```bash
# Set environment variables
export DB_PASSWORD=your_secure_password
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export S3_BUCKET_NAME=ci-snapshots
export API_SECRET_KEY=your_api_key
export OPENAI_API_KEY=sk-your-key
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_CHANNEL_ID=C01234567
export GITHUB_TOKEN=ghp_your_token

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Option 2: Manual Deployment

### 1. Setup PostgreSQL

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Create database
sudo -u postgres psql -c "CREATE DATABASE ci_snapshot_db;"
sudo -u postgres psql -d ci_snapshot_db -c "CREATE EXTENSION vector;"
sudo -u postgres psql -d ci_snapshot_db -f /path/to/db/schema.sql
```

### 2. Setup Application

```bash
# Clone repository
git clone <repo-url>
cd ci-snapshot-system

# Install dependencies
npm install
npx playwright install chromium

# Configure environment
cp .env.example .env
nano .env  # Edit with your values

# Build
npm run build

# Run with PM2
npm install -g pm2

pm2 start dist/services/snapshot/index.js --name snapshot-service
pm2 start dist/services/api/index.js --name api-service
pm2 start dist/services/notification/index.js --name notification-service

pm2 save
pm2 startup
```

### 3. Setup Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/ci-snapshot

server {
    listen 80;
    server_name snapshot.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ci-snapshot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Setup SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d snapshot.yourdomain.com -d api.yourdomain.com
```

## GitHub Actions Configuration

Add secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `SNAPSHOT_SERVICE_URL`: https://snapshot.yourdomain.com
   - `API_SERVICE_URL`: https://api.yourdomain.com
   - `API_SECRET_KEY`: (same as in .env)
   - `BACKEND_REPO`: owner/backend-repo
   - `GH_PAT`: GitHub Personal Access Token

## Monitoring & Maintenance

### Health Checks

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3000/health
curl http://localhost:3002/health
```

### Database Cleanup Cron Job

```bash
# Add to crontab
crontab -e

# Run cleanup daily at 2 AM
0 2 * * * psql $DATABASE_URL -c "DELETE FROM test_runs WHERE created_at < NOW() - INTERVAL '30 days';"
```

### Logs

```bash
# PM2 logs
pm2 logs

# Docker logs
docker-compose logs -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Playwright Issues

```bash
# Install missing dependencies
npx playwright install-deps chromium
```

### Database Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### S3 Upload Issues

```bash
# Test AWS credentials
aws s3 ls s3://$S3_BUCKET_NAME --profile default
```

## Scaling

### Horizontal Scaling

1. Deploy multiple instances behind load balancer
2. Use shared PostgreSQL instance
3. Use Redis for session management (future enhancement)

### Database Optimization

```sql
-- Tune pgvector index
DROP INDEX idx_failure_patterns_embedding;
CREATE INDEX idx_failure_patterns_embedding
  ON failure_patterns
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 200);  -- Increase for larger datasets

-- Add read replica for searches
```

### Cost Optimization

- Use S3 Lifecycle policies to move old artifacts to Glacier
- Implement artifact deduplication
- Use CloudFront CDN for artifact delivery
