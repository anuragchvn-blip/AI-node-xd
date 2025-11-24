# Project Structure

```
ci-snapshot-system/
├── .github/
│   └── workflows/
│       └── ci-snapshot.yml          # GitHub Actions workflow
├── db/
│   └── schema.sql                   # PostgreSQL schema with pgvector
├── docs/
│   ├── API.md                       # API reference documentation
│   └── DEPLOYMENT.md                # Deployment guide
├── examples/
│   └── usage-example.js             # Example API usage
├── src/
│   ├── db/
│   │   ├── index.ts                 # Database connection pool
│   │   └── migrate.ts               # Migration script
│   ├── services/
│   │   ├── snapshot/
│   │   │   ├── SnapshotService.ts   # Playwright snapshot capture
│   │   │   └── index.ts             # Snapshot API server
│   │   ├── api/
│   │   │   ├── VectorStoreService.ts    # OpenAI embeddings + pgvector
│   │   │   ├── RecommendationEngine.ts  # Pattern matching & test suggestions
│   │   │   └── index.ts                 # System API server
│   │   └── notification/
│   │       ├── NotificationService.ts   # Slack, GitHub, Email
│   │       └── index.ts                 # Notification API server
│   └── types/
│       └── index.ts                 # TypeScript type definitions
├── .env.example                     # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md                        # Main documentation
```

## Key Files

### Configuration

- `.env.example`: Template for environment variables
- `tsconfig.json`: TypeScript compiler configuration
- `package.json`: Dependencies and scripts

### Database

- `db/schema.sql`: Complete database schema with pgvector extension
- `src/db/index.ts`: Connection pool configuration
- `src/db/migrate.ts`: Migration script

### Services

- `src/services/snapshot/`: Playwright-based snapshot capture service
- `src/services/api/`: Main API with vector store and recommendations
- `src/services/notification/`: Multi-channel notification service

### CI/CD

- `.github/workflows/ci-snapshot.yml`: GitHub Actions workflow with conditional snapshot trigger

### Documentation

- `README.md`: Complete system overview and quick start
- `docs/API.md`: Detailed API reference
- `docs/DEPLOYMENT.md`: Deployment instructions
- `examples/usage-example.js`: Working code examples

## Data Flow

1. **Frontend Push** → GitHub Actions triggered
2. **Build & Test** → Frontend built, backend tests run
3. **On Failure** → Snapshot Service captures artifacts
4. **Upload** → Artifacts uploaded to S3
5. **Submit** → Test results sent to System API
6. **Analyze** → Vector store finds similar patterns
7. **Recommend** → Engine suggests tests based on patterns + git diff
8. **Notify** → Slack, GitHub, Email notifications sent

## Service Ports

- **Snapshot Service**: 3001
- **System API**: 3000
- **Notification Service**: 3002

## External Dependencies

- **PostgreSQL** with pgvector extension
- **AWS S3** or MinIO for artifact storage
- **OpenAI API** for embeddings
- **Slack API** (optional)
- **GitHub API** (optional)
- **SMTP Server** (optional for email)
