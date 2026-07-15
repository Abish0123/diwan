# Performance Optimization Roadmap

**Current Status:** Production-Ready with 1.5 MB gzipped bundle  
**Target Status:** < 1.2 MB gzipped by Q1 2025  

## Overview

This roadmap prioritizes performance improvements based on impact, effort, and dependencies. Each phase builds on previous work to incrementally improve the platform's speed and user experience.

## Phase 1: Quick Wins (Sprint 1, 2-3 days)

**Goal:** Save 50-100 KB, minimal code changes

### 1.1 Optimize Icon Library
**Effort:** 4 hours  
**Impact:** 30-50 KB saved  
**Process:**
1. Audit all lucide-react icon usage in codebase
   ```bash
   grep -r "lucide-react" src --include="*.tsx" | wc -l
   grep -r "from 'lucide-react'" src --include="*.tsx" | grep "import" | head -20
   ```
2. Document which icons are actually used
3. Consider SVG alternatives for common icons (e.g., Menu, X, Plus)
4. Tree-shake unused icon variants

**Expected Result:** lucide-react chunk reduced from 120 KB to 60-80 KB

### 1.2 Enable Image Lazy Loading
**Effort:** 2 hours  
**Impact:** 20-30 KB saved + faster initial render  
**Changes:**
```typescript
// Before
<img src="/assets/student.jpg" alt="Student" />

// After
<img src="/assets/student.jpg" alt="Student" loading="lazy" />
```
1. Add `loading="lazy"` to all offscreen images
2. Prioritize above-the-fold images with `loading="eager"`
3. Test with slow network simulation

**Expected Result:** First Contentful Paint improved by 10-15%

### 1.3 Remove Unused CSS
**Effort:** 3 hours  
**Impact:** 10-20 KB saved  
**Process:**
1. Run PurgeCSS analysis on built CSS
2. Identify unused Tailwind utilities
3. Remove deprecated or dead code paths

**Expected Result:** CSS bundle reduced 10-20%

**Phase 1 Total:** 60-100 KB saved, ~9 hours of work

---

## Phase 2: Component Optimization (Sprint 2, 3-5 days)

**Goal:** Save 100-200 KB through better code-splitting and memoization

### 2.1 Break Down Large Components
**Effort:** 2 days  
**Impact:** 50-100 KB through better tree-shaking  

**Components to Split:**

| Component | Lines | Strategy |
|-----------|-------|----------|
| Library.tsx | 2,474 | Split into LibraryHeader, LibraryList, LibrarySearch |
| Timetable.tsx | 2,190 | Split into TimetableHeader, TimetableGrid, TimetableLegend |
| StudentDetailsDialog.tsx | 2,008 | Split into StudentInfo, StudentAcademics, StudentAttendance |
| LeadProfile.tsx | 855 | Split into LeadBasicInfo, LeadHistory, LeadNotes |

**Process:**
1. Identify logical component boundaries
2. Extract into separate files
3. Use React.lazy for expensive sub-components
4. Export selectively to reduce module overhead

**Expected Result:** Better tree-shaking, 50-100 KB saved

### 2.2 Implement React.memo for Tables
**Effort:** 1 day  
**Impact:** 10-20% faster re-renders  

**Target Components:**
- StudentTable rows
- AttendanceTable cells
- GradebookTable cells
- FinanceTable rows

**Implementation:**
```typescript
const StudentRow = React.memo(({ student, onSelect }) => (
  <tr onClick={() => onSelect(student)}>
    {/* row content */}
  </tr>
));
```

**Expected Result:** Tables with 100+ rows render 20-30% faster

### 2.3 Lazy-Load Heavy Dialogs
**Effort:** 1 day  
**Impact:** 30-50 KB  

**Dialogs to Lazy-Load:**
- PayrollSlipDialog (uses PDF, html2canvas)
- BulkUploadDialog (uses xlsx)
- WebcamProctorWidget (uses video APIs)
- PresentationBuilder (uses recharts, large data processing)

**Implementation:**
```typescript
const PayrollSlipDialog = React.lazy(() => import('./PayrollSlipDialog'));

// In component:
<Suspense fallback={<LoadingSpinner />}>
  <PayrollSlipDialog {...props} />
</Suspense>
```

**Expected Result:** Dialogs only load when opened, ~30-50 KB saved on initial load

**Phase 2 Total:** 100-200 KB saved, 4-5 days of work

---

## Phase 3: Advanced Optimization (Sprint 3, 1-2 weeks)

**Goal:** Save 200-500 KB through architectural improvements

### 3.1 Virtual Scrolling for Large Lists
**Effort:** 2-3 days  
**Impact:** 30-50% faster rendering for 100+ items  

**Libraries:** react-window or react-virtual

**Target Components:**
- StudentList (1000+ students)
- AttendanceList (500+ records per class)
- FinanceTransactionList (10,000+ records)

**Implementation:**
```typescript
import { FixedSizeList } from 'react-window';

const StudentList = ({ students }) => (
  <FixedSizeList
    height={600}
    itemCount={students.length}
    itemSize={50}
  >
    {({ index, style }) => (
      <div style={style}>{/* StudentRow */}</div>
    )}
  </FixedSizeList>
);
```

**Expected Result:** Lists render 50-100x faster, memory usage reduced

### 3.2 Image Optimization Pipeline
**Effort:** 2-3 days  
**Impact:** 200-300 KB saved  

**Process:**
1. Convert JPEG/PNG to WebP with fallback
2. Implement responsive images (srcset)
3. Compress with ImageOptim/TinyPNG
4. Serve from CDN with proper caching headers

**Tools:**
- ImageOptim (local compression)
- Vercel Image Optimization (if deployed)
- sharp (Node.js image processing)

**Expected Result:** 50-70% reduction in image payload

### 3.3 Service Worker for Offline
**Effort:** 3-4 days  
**Impact:** 3-5s faster for repeat visitors  

**Capabilities:**
- Cache static assets
- Cache API responses
- Offline error page
- Background sync for pending requests

**Tools:** Workbox, vite-plugin-pwa

**Expected Result:** 50-80% faster repeat visits, works offline

### 3.4 Dependency Audit & Removal
**Effort:** 2-3 days  
**Impact:** 100-200 KB  

**Process:**
1. Identify unused packages
   ```bash
   npm ls --depth=0 | grep extraneous
   npx depcheck
   ```
2. Find duplicate dependencies
3. Remove or consolidate
4. Test thoroughly

**Common Candidates:**
- Duplicate React versions
- Unused UI libraries
- Redundant utilities

**Expected Result:** 100-200 KB saved

**Phase 3 Total:** 300-500 KB saved, 1-2 weeks of work

---

## Phase 4: Long-Term Improvements (Q2 2025+)

### 4.1 Consider Lightweight Alternatives
- Replace recharts with Nivo or Visx for smaller bundle
- Use lightweight Markdown processor
- Switch to lightweight date library

### 4.2 Build-Time Optimization
- Tree-shake module side effects
- Optimize CSS extraction
- Minimize number of entry points

### 4.3 Runtime Optimization
- Implement request debouncing/throttling
- Add request caching strategies
- Optimize API payload sizes

---

## Success Metrics

### Bundle Size Milestones

| Phase | Target | Current | Delta | Status |
|-------|--------|---------|-------|--------|
| Phase 1 | 1.4 MB | 1.5 MB | -100 KB | In progress |
| Phase 2 | 1.25 MB | 1.4 MB | -150 KB | Planned |
| Phase 3 | 1.0 MB | 1.25 MB | -250 KB | Planned |
| Goal | <1.2 MB | 1.0 MB | ✓ Achieved | Q1 2025 |

### Performance Milestones

| Metric | Current | Q1 2025 | Q2 2025 |
|--------|---------|---------|---------|
| FCP | 2.5s | 2.0s | 1.8s |
| LCP | 3.2s | 2.5s | 2.0s |
| TTI | 4.5s | 3.5s | 2.8s |
| Build Time | 32s | 28s | 25s |

---

## Implementation Schedule

```
Week 1: Phase 1 (Icon optimization, image lazy loading, CSS cleanup)
Week 2: Phase 2 (Component splitting, React.memo, lazy dialogs)
Week 3-4: Phase 3 (Virtual scrolling, images, service worker)
Week 5+: Phase 4 (Long-term improvements, monitoring)
```

---

## Risk Mitigation

### Testing Required
- Unit tests for lazy-loaded components
- E2E tests for dialog interactions
- Performance tests for large lists
- Service Worker cache tests

### Rollback Plan
1. Revert specific commits if regression detected
2. Gradual rollout (5% → 25% → 50% → 100%)
3. Monitor error rates after each phase

### Performance Regression Alerts
- Alert if main chunk > 250 KB
- Alert if build time > 45s
- Alert if LCP > 4s in production

---

## Ownership & Timeline

| Phase | Owner | Timeline | Dependencies |
|-------|-------|----------|--------------|
| Phase 1 | Frontend team | Week 1 | None |
| Phase 2 | Frontend team | Week 2 | Phase 1 complete |
| Phase 3 | Frontend + DevOps | Week 3-4 | Phase 2 complete |
| Phase 4 | Frontend team | Q2 2025+ | Phase 3 complete |

---

## Related Documentation

- [PERFORMANCE_TESTING.md](./PERFORMANCE_TESTING.md) — Detailed test results
- [PERFORMANCE.md](./PERFORMANCE.md) — Current optimization strategy
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design

---

## Quick Reference Commands

```bash
# Analyze bundle size
npm run build 2>&1 | grep "kB\|mb"

# Find unused packages
npx depcheck

# Find large components
find src -name "*.tsx" -exec wc -l {} + | sort -rn | head -20

# Tree-shake test (in dist/)
grep -r "lucide-react" dist/assets/

# Performance audit
npx lighthouse http://localhost:3000 --view
```
