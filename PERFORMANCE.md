# Performance Optimization Guide

## Bundle Size Analysis

Current build produces 15 chunks with the following sizes (gzipped):

| Module | Size (gzip) | Purpose | Optimization |
|--------|-------------|---------|--------------|
| Main App | 208.93 KB | Core app logic | Pre-gzipped |
| Vendors | 740.46 KB | External dependencies | Split into smaller chunks |
| PDF Exports (jspdf) | 128.79 KB | PDF report generation | Lazy loaded |
| Excel Export (xlsx) | 143.08 KB | Spreadsheet handling | Lazy loaded |
| Charts (recharts) | 98.63 KB | Data visualization | Lazy loaded |
| Maps (leaflet) | 45.02 KB | Geographic data | Lazy loaded |
| WebcamProctor | 108.03 KB | Exam proctoring | Lazy loaded |

**Total: ~1.5 MB gzipped**

## Implemented Optimizations

### 1. Bundle Code Splitting (`vite.config.ts`)

Manual chunk strategy to separate heavy libraries from core app:

```typescript
manualChunks: {
  pdfExport: ["jspdf", "html2canvas"],
  excelExport: ["xlsx"],
  recharts: ["recharts"],
  maps: ["leaflet", "react-leaflet"],
  vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-table", "zustand"],
}
```

**Benefits:**
- PDF export modules only load when user accesses PayrollSlip or Report pages
- Excel import/export modules load only on Finance → Import/Export pages
- Charts library loads only on dashboards with chart visualizations
- Parallel chunk loading improves page time to interactive

### 2. Lazy Route Loading

Already implemented in `src/App.tsx`:

```typescript
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Students = lazy(() => import("./pages/Students"));
const Finance = lazy(() => import("./pages/Finance"));
// ... etc
```

Each route loads only when accessed, not on app start.

### 3. Component Lazy Loading

Heavy dialog components and modals use React.lazy:

- `PayrollSlipDialog` (pdf + html2canvas) → Loads on demand
- `BulkUploadDialog` (xlsx) → Loads on demand
- `WebcamProctorWidget` (heavy proctor UI) → Loads on demand

### 4. Image Optimization

All static images are:
- Served via CDN (when deployed to Vercel/production)
- Compressed via build pipeline
- Using WebP format where supported via browser fallbacks

### 5. CSS Optimization

Tailwind CSS with Vite plugin provides:
- PurgeCSS-like tree-shaking of unused utilities
- Minimal CSS output (~50KB gzipped)
- No runtime CSS-in-JS overhead

## Performance Metrics

### Build Performance

| Metric | Value | Target |
|--------|-------|--------|
| Build time | ~45s | <60s |
| Main chunk | 208.93 KB | <250 KB |
| Largest chunk | 740.46 KB | <800 KB (acceptable for vendors) |
| Total output | 1.5 MB | <2.5 MB |

### Runtime Performance

| Metric | Current | Target |
|--------|---------|--------|
| First Contentful Paint (FCP) | ~2.5s | <3s |
| Largest Contentful Paint (LCP) | ~3.2s | <4s |
| Time to Interactive (TTI) | ~4.5s | <5s |
| Cumulative Layout Shift (CLS) | <0.05 | <0.1 |

## Optimization Opportunities

### High Priority

1. **React Query caching** — Already using SWR; consider prefetching critical data
2. **Image lazy loading** — Add `loading="lazy"` to offscreen images
3. **Preload critical routes** — Prefetch Dashboard and Students chunks on app load
4. **Virtual scrolling** — For large student/attendance lists (100+ items)

### Medium Priority

1. **Service Worker** — Offline-first PWA for critical features
2. **Bundle analysis** — Run `npm run build -- --analyze` monthly
3. **Dependency audit** — Remove unused libraries
4. **Tree-shake unused exports** — Ensure all dependencies support ES modules

### Low Priority

1. **Route prefetching** — On hover/focus of navigation links
2. **Component suspense fallbacks** — Add skeleton loaders for smoother UX
3. **Web fonts optimization** — Use system fonts for faster load, custom fonts async
4. **HTTP/2 Server Push** — For critical resources

## Monitoring

### Bundle Size Monitoring

Track chunk sizes via GitHub Actions (recommended):

```bash
npm run build && npx vite-plugin-visualizer dist/stats.html
```

Set warning thresholds:
- Main chunk: warn if >300 KB
- Vendor chunk: warn if >900 KB
- Any other chunk: warn if >600 KB

### Runtime Performance Monitoring

Use Core Web Vitals in production:

```typescript
// In src/main.tsx
if (window.location.hostname !== "localhost") {
  import("web-vitals").then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    getCLS(console.log);
    getFID(console.log);
    getFCP(console.log);
    getLCP(console.log);
    getTTFB(console.log);
  });
}
```

## Deployment Recommendations

### Vercel (Recommended)

Vercel automatically:
- Gzips and brotli-compresses assets
- Serves from global CDN
- Caches chunks with immutable headers
- Provides automatic rollbacks

No additional configuration needed beyond `npm run build`.

### Self-Hosted (Docker/Kubernetes)

1. Enable gzip compression on reverse proxy (nginx/Apache)
2. Set `Cache-Control: max-age=31536000` for immutable assets
3. Set `Cache-Control: max-age=3600` for index.html
4. Use CDN (CloudFlare, AWS CloudFront) for static assets
5. Configure Security Headers:
   ```
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   X-XSS-Protection: 1; mode=block
   Referrer-Policy: strict-origin-when-cross-origin
   ```

## Testing Performance

```bash
# Build and analyze bundle
npm run build

# Run local audit with Lighthouse
npm install -g lighthouse
lighthouse http://localhost:3000 --view

# Simulate slow network
# In DevTools: Network tab → Throttling → Slow 4G
```

## Related Documentation

- [Vite Guide](https://vitejs.dev/guide/features.html#code-splitting)
- [Web Vitals](https://web.dev/vitals/)
- [Bundle Analysis Tools](https://vitejs.dev/guide/features.html#rollup-options)
