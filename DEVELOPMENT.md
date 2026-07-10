# Student Diwan — Development & Deployment Guide

## Git Workflow

### Branch Strategy

```
main              — Production-ready, stable releases only
  ↓ (via PR review)
develop           — Integration branch, tested features
  ↓ (feature branches)
feature/*         — Individual feature/fix work
release/*         — Pre-production validation
hotfix/*          — Emergency production fixes
```

### Branch Naming Conventions

- **Feature**: `feature/multi-tenancy-branch-isolation`
- **Bugfix**: `bugfix/wrong-report-card-grade`
- **Release**: `release/v1.0.0`
- **Hotfix**: `hotfix/critical-fee-calculation`

### Workflow

1. **Start work**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Commit frequently** (granular, logical commits)
   ```bash
   git add <specific-files>
   git commit -m "scope: brief description of change

   Optional detailed explanation.

   - Bullet points for multiple changes
   - Related to issue #123"
   ```

3. **Push to remote**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request** on GitHub
   - Automated checks run (lint, typecheck, test, build)
   - Code review required before merge
   - Merge to `develop` (not directly to `main`)

5. **Release to Production**
   - Create `release/v1.x.x` branch from `develop`
   - Run final QA tests
   - Tag and merge to `main` as release commit
   - Merge back to `develop`

## Commit Message Format

```
<type>: <subject>

<body (optional, wrap at 72 chars)>

<footer (optional, e.g., "Closes #123")>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code restructuring without behavior change
- `test`: Tests added/updated
- `chore`: Build, deps, tooling
- `perf`: Performance improvement
- `ci`: CI/CD configuration

**Example:**
```
feat: add branch isolation to 105 entities

- Add branchId column to all entity tables via migration script
- Update TypeScript types with branchId field
- Auto-assign branchId='main' on record creation
- Query filtering via ?branchId parameter

Enables multi-tenancy for single→multi-school scale-up.
Closes #45
```

## Local Development

### Prerequisites
- Node.js 18+
- MySQL 8.0+ (or MySQL 5.7 with compatibility mode)
- npm or yarn

### Setup
```bash
npm install
npm run dev              # Start dev server on port 3000
npm run dev:alt          # Alternate port 3100 for parallel instance
npm run build            # Production build (Vite + esbuild)
npm run test             # Run unit tests
npm run test:watch       # Watch mode
npm run lint             # ESLint check
npm run preview          # Preview built app locally
```

### Environment

Copy `.env.example` → `.env` and fill in:
```
DB_HOST=217.21.85.14
DB_USER=root
DB_PASSWORD=<from-cpanel>
DB_NAME=student_diwan
DB_STRICT=true

OPENROUTER_API_KEY=<key>
SENTRY_DSN=<key>
GOOGLE_MAPS_API_KEY=<key>
FIREBASE_PROJECT_ID=<id>
# ... etc
```

**Never commit `.env`** — use `.env.example` for template only.

## Database Migrations

### Backups Before Schema Changes
```bash
npm run backup     # Creates timestamped backup in backups/
```

### Creating a Migration

**Pattern:**
```js
// scripts/migrate-<feature>.mjs
import mysql from 'mysql2/promise.js';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const conn = await pool.getConnection();

// Your migration logic here
// Use `ALTER TABLE`, `UPDATE`, etc.

conn.release();
await pool.end();
```

**Run:** `node scripts/migrate-<feature>.mjs`

## Testing

### Unit Tests
```bash
npm run test         # Run once
npm run test:watch   # Watch mode
```

Tests live in `src/**/*.test.ts` and use **Vitest** + React Testing Library.

**Run specific test file:**
```bash
npm run test -- src/lib/aiTimetableGenerator.test.ts
```

### E2E Tests (Playwright)
```bash
npm run test:e2e     # Headless run (requires PLAYWRIGHT_BROWSERS installed)
npx playwright test --headed  # Headed (visual)
```

Tests live in `tests/**/*.spec.ts`.

## CI/CD

### GitHub Actions Workflow
`.github/workflows/ci.yml` has two jobs, running on every push/PR:

**`typecheck-test-build`:**
1. **Typecheck** (`tsc --noEmit`) — catches type errors
2. **Lint** (`eslint .`) — code style (continue-on-error)
3. **Test** (`npm run test`) — unit tests
4. **Build** (`npm run build`) — verifies production build

**`docker-build`:**
1. Builds the actual image from `Dockerfile` (`docker build`)
2. Starts a real container from it (`DB_STRICT=false`, no MySQL configured — falls back to
   SQLite so the smoke test doesn't need production credentials as a CI secret)
3. Polls the image's own `HEALTHCHECK` until Docker reports the container `healthy`, or fails
   the job and dumps container logs if it never does

This job exists because the local dev environment this Dockerfile was authored in has no
Docker installed — GitHub-hosted runners do, so this is the actual, non-simulated proof the
image builds and the container serves real traffic, not just a manual read-through of the
Dockerfile. Everything below this job's introduction (native-module build tools in both
stages, `.dockerignore` correctness, `npm ci` lockfile consistency) was verified by hand
first; this job is what confirms it end-to-end.

**Status:** View on GitHub Actions tab or `gh run view`

### Deployment

**Manual Docker Deploy** (requires Docker installed locally — this dev machine does not have it,
so use the CI job above, or a machine with Docker Desktop / Docker Engine, to actually run this):
```bash
docker build -t studentdiwan:latest .
docker run -p 3000:3000 \
  -e DB_HOST=<host> \
  -e DB_USER=root \
  -e DB_PASSWORD=<pass> \
  -e DB_NAME=student_diwan \
  studentdiwan:latest
```

**Health Check:**
```bash
curl http://localhost:3000/api/health
# {"status":"ok","dbMode":"mysql","dbHost":"217.21.85.14"}
```

## Monitoring & Logging

### Structured Logging
All server-side logs use structured JSON format (via `logger.ts`):
```json
{"ts":"2026-07-11T10:30:00Z","level":"info","msg":"Auth successful","userId":"u123"}
```

**View logs:** Check `stdout` from the running server.

### Sentry
Set `SENTRY_DSN` in `.env` to enable crash reporting + performance monitoring.

### Server Health
- `/api/health` — Database connectivity + server status
- Check live DB connection in response

## Rollback Strategy

### If Something Breaks in Production

**Option 1: Git Revert**
```bash
# Find the bad commit
git log --oneline | head -20

# Revert it (creates new commit that undoes changes)
git revert <commit-hash>
git push origin main
```

**Option 2: Database Restore**
```bash
npm run restore    # Prompts for backup timestamp
```

**Option 3: Git Reset** (only if not yet pushed to remote)
```bash
git reset --hard HEAD~1
```

## Performance & Scaling

### Current Limits
- Single-school pilot: ~500 students, ~50 staff
- Single MySQL instance on cPanel
- No Redis, no microservices
- Suitable for: small→medium schools

### Next Steps for Scale
1. **Multi-tenancy** (Phase 2) — isolate data by school/branch
2. **Caching** — Redis for frequently-accessed data
3. **Async Jobs** — RabbitMQ for background tasks
4. **Microservices** — Split by domain (Academics, Finance, HR, etc.)
5. **Read Replicas** — MySQL replication for analytics queries
6. **CDN** — Cloudflare for static assets + API caching
7. **Load Balancing** — Kubernetes or reverse proxy for multi-instance

## Support & Debugging

### Common Issues

**Port 3000 already in use:**
```bash
# Find process
lsof -i :3000
# Kill it
kill -9 <PID>
```

**MySQL connection refused:**
- Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD` in `.env`
- Check cPanel MySQL is running
- Try: `mysql -h 217.21.85.14 -u root -p`

**Tests failing:**
```bash
npm run test -- --reporter=verbose
```

**Build errors:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Debug Mode
Enable verbose logging:
```bash
DEBUG=studentdiwan:* npm run dev
```

---

**Last Updated:** 2026-07-11  
**Maintainers:** Student Diwan Team
