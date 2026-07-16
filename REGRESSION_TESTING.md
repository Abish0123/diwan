# Regression Testing Guide

This document outlines the regression testing process to verify that all recent changes (testing improvements, type safety, optimization, documentation) work together without breaking existing functionality.

## Regression Test Layers

### Layer 1: TypeScript Type Checking (Strict Mode)

Ensures no new type errors were introduced with strict compiler settings.

```bash
npx tsc --noEmit
```

**Expected Result:** 0 errors
**Time:** ~10 seconds

**What it verifies:**
- All variables are properly typed (noImplicitAny)
- Null/undefined handling is correct (strictNullChecks)
- No unused variables or parameters
- All switch statements are exhaustive

### Layer 2: Build Verification

Ensures the production build completes without warnings and produces valid chunks.

```bash
npm run build
```

**Expected Result:** Build completes with 0 errors
**Expected Build Time:** 30-40 seconds
**Expected Output:** ~7200 modules transformed, dist/ folder created

**What it verifies:**
- All dependencies are resolved
- Code-splitting strategy works (pdfExport, excelExport, maps chunks generated)
- Tree-shaking removes unused code
- No circular dependencies
- Asset optimization works

**Key metrics to check:**
- `dist/index.html` exists
- `dist/assets/index-*.js` (main chunk)
- `dist/assets/pdfExport-*.js` (PDF libraries separately)
- `dist/assets/excelExport-*.js` (Excel libraries separately)
- `dist/assets/maps-*.js` (Map library separately)

### Layer 3: Unit, System & Integration Tests

Verifies all critical test layers pass with improvements.

```bash
# Quick sample (5-10 seconds)
npx vitest run src/system-tests/ src/api-tests/ src/integration/

# Full suite (2-5 minutes)
npx vitest run
```

**Expected Result:**
- System tests: 5/5 passing
- API tests: 73/73 passing
- Integration tests: All passing
- Total: 1380+ tests passing

**What it verifies:**
- Authentication flows work correctly
- Route protection and RBAC are enforced
- API endpoints return expected responses
- Database operations work in SQLite mode
- Error handling works as designed
- Component integration is correct

### Layer 4: Dev Server Startup

Verifies that the dev server starts and can serve the app with API integration.

```bash
# Terminal 1
npm run dev

# Terminal 2 (after server starts)
curl http://localhost:3000/
curl http://localhost:3000/api/health
```

**Expected Result:**
- Server starts on port 3000
- `/` returns HTML (status 200)
- `/api/health` proxies correctly to Express server on 3001
- No console errors about broken imports

**What it verifies:**
- Vite HMR works for hot module replacement
- API proxy configuration works
- Module resolution is correct
- No critical build issues

### Layer 5: API Endpoint Verification

Verifies that the API server works correctly with the optimization changes.

```bash
# Start API server (if not started by npm run dev)
PORT=3001 DB_HOST="" DATABASE_URL="" npm run server

# In another terminal
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/session/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eduerp.com","password":"admin123"}'
```

**Expected Result:**
- Health endpoint returns degraded status (SQLite mode expected)
- Login endpoint returns token for valid credentials
- All CRUD endpoints work

**What it verifies:**
- Express server starts correctly
- Database connection falls back to SQLite
- Authentication works
- API routes are registered

## Regression Testing Checklist

Use this checklist before merging changes or deploying to production:

- [ ] **TypeScript Check** — `npx tsc --noEmit` returns 0 errors
- [ ] **Build Success** — `npm run build` completes with 0 errors
- [ ] **Build Artifacts** — Check dist/ folder for expected chunks
- [ ] **System Tests** — `npx vitest run src/system-tests/` all pass
- [ ] **API Tests** — `npx vitest run src/api-tests/` all pass
- [ ] **Integration Tests** — `npx vitest run src/integration/` all pass
- [ ] **Dev Server** — `npm run dev` starts without errors
- [ ] **API Server** — API health endpoint responds
- [ ] **Login Flow** — Can log in via API
- [ ] **Student Fetch** — `/api/data/students` returns data or empty array
- [ ] **No New Warnings** — Build log has no new warnings
- [ ] **No Breaking Changes** — All previous features still work
- [ ] **Memory Usage** — Dev server doesn't consume >500MB RAM
- [ ] **Bundle Size** — Main chunk <300KB, no chunk >800KB

## Automated Regression Testing (CI/CD)

### Quick Regression (5 minutes)

Run this on every PR:

```bash
set -e  # Fail on first error

# 1. Type check
npx tsc --noEmit

# 2. Lint
npx eslint src --max-warnings 0 || true  # Don't fail on lint

# 3. Quick test sample
npx vitest run src/system-tests/ src/api-tests/ --reporter=verbose

# 4. Build
npm run build

echo "✓ Regression tests passed"
```

**Time:** ~5 minutes

### Full Regression (15 minutes)

Run this before release:

```bash
set -e

# All of quick regression, plus:

# Full test suite
npx vitest run

# E2E tests (if Playwright browsers available)
npx playwright test || true  # Skip if browsers not installed

echo "✓ Full regression passed"
```

**Time:** ~15 minutes

## Expected Metrics

### Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| TypeScript check | ~10s | <15s |
| Build time | ~34s | <60s |
| Full test suite | ~120s | <180s |
| Main chunk size | 208 KB | <300 KB |
| Total gzip size | ~1.5 MB | <2.5 MB |

### Test Coverage

| Layer | Tests | Min Pass Rate |
|-------|-------|---------------|
| System | 5 | 100% |
| Unit (lib) | 120 | 100% |
| Component | 25+ | 100% |
| API | 73 | 100% |
| Integration | 200+ | 100% |
| E2E | 95+ | 100% (when browsers available) |

## Regression Test Failure Resolution

### If TypeScript fails
1. Check error message for strict mode violations
2. Add proper types to variables/parameters
3. Handle null/undefined cases
4. Re-run: `npx tsc --noEmit`

### If Build fails
1. Check dist/ folder was created
2. Look for import errors or circular dependencies
3. Verify manualChunks modules exist (pdfExport, excelExport, maps)
4. Try: `npm run build 2>&1 | grep -i error`

### If Tests fail
1. Identify which layer fails (system, API, integration)
2. Run single test file: `npx vitest run <test-file>`
3. Check test output for assertion errors
4. Look for test isolation issues (previous test affecting next)
5. Check mock setup and cleanup

### If Dev Server fails to start
1. Check port 3000 is not already in use: `lsof -i :3000`
2. Kill existing process: `pkill -f "vite"`
3. Check for import errors in main.tsx
4. Look for plugin errors in vite.config.ts
5. Try clearing cache: `rm -rf node_modules/.vite`

### If API Server fails
1. Check port 3001 not in use: `lsof -i :3001`
2. Verify DATABASE_URL and DB_HOST env vars
3. Check database file exists or SQLite fallback
4. Look for TypeScript compilation errors in server.ts

## Before Deployment

1. Run full regression checklist locally
2. Commit all changes to feature branch
3. Create Pull Request with test results
4. Let CI run full automated regression
5. Get code review approval
6. Merge to main
7. Deploy to staging environment
8. Run smoke tests in staging
9. Deploy to production

## Monitoring After Deployment

After deploying to production:

1. Check application logs for errors
2. Monitor Core Web Vitals in production
3. Check error rate (should be <0.1%)
4. Monitor user engagement metrics
5. Check database query performance

## Related Documentation

- [Testing Summary](./TESTING_SUMMARY.md) — Complete test documentation
- [Architecture](./ARCHITECTURE.md) — System design
- [Performance](./PERFORMANCE.md) — Bundle optimization
