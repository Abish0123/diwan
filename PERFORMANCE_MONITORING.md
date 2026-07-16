# Performance Monitoring Setup Guide

This guide explains how to set up continuous performance monitoring for the Student Diwan platform.

## Overview

Performance monitoring consists of three layers:
1. **Build-time metrics** — Bundle size, chunk count, build time
2. **Runtime metrics** — Core Web Vitals (FCP, LCP, CLS, INP, TTFB)
3. **Production monitoring** — Error tracking, user experience metrics

## Layer 1: Build-Time Metrics

### 1.1 Bundle Size Monitoring

**Setup:** Script in `package.json`

```json
{
  "scripts": {
    "build": "vite build && npm run build:analyze",
    "build:analyze": "node scripts/analyze-bundle.js"
  }
}
```

**Script:** `scripts/analyze-bundle.js`

```javascript
const fs = require('fs');
const path = require('path');

function analyzeBundles() {
  const distDir = path.join(__dirname, '../dist/assets');
  const files = fs.readdirSync(distDir);
  
  const jsFiles = files.filter(f => f.endsWith('.js'));
  const metrics = {};
  
  jsFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const stat = fs.statSync(filePath);
    metrics[file] = {
      minified: stat.size,
      // gzip size would require gzip module
    };
  });
  
  // Write to file for CI to read
  fs.writeFileSync(
    path.join(__dirname, '../dist/bundle-metrics.json'),
    JSON.stringify(metrics, null, 2)
  );
  
  // Compare with baseline
  const baselinePath = path.join(__dirname, '../bundle-baseline.json');
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    
    console.log('\n=== Bundle Size Changes ===');
    jsFiles.forEach(file => {
      const current = metrics[file].minified;
      const previous = baseline[file]?.minified || 0;
      const delta = current - previous;
      const pct = ((delta / previous) * 100).toFixed(1);
      
      if (delta > 0) {
        console.log(`${file}: +${(delta / 1024).toFixed(1)} KB (+${pct}%)`);
      } else if (delta < 0) {
        console.log(`${file}: ${(delta / 1024).toFixed(1)} KB (${pct}%)`);
      }
    });
  }
}

analyzeBundles();
```

**Alerts:** Set thresholds in CI/CD:
- Alert if main chunk > 250 KB
- Alert if any chunk > 800 KB  
- Alert if total > 2 MB
- Alert if build time > 45s

### 1.2 Build Time Tracking

**Setup:** Log build time after each build

```bash
# In CI configuration
time npm run build > build-output.log 2>&1
# Extract build time and store in metrics database
grep "real" build-output.log
```

**Dashboard:** Graph build time over time
- X-axis: Build date
- Y-axis: Build time (seconds)
- Target line: 45s (alert threshold)

## Layer 2: Runtime Metrics (Client-Side)

### 2.1 Core Web Vitals Collection

**Setup:** Add Web Vitals library to `main.tsx`

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'

// Collect Core Web Vitals in production
if (import.meta.env.PROD && typeof window !== 'undefined') {
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    const sendMetric = (metric) => {
      // Send to analytics endpoint
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/metrics', JSON.stringify(metric));
      }
    };
    
    getCLS(sendMetric);
    getFID(sendMetric);
    getFCP(sendMetric);
    getLCP(sendMetric);
    getTTFB(sendMetric);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 2.2 Custom Performance Metrics

```typescript
// src/lib/performanceMonitoring.ts
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  timestamp: number;
}

export function measureComponentRender(
  componentName: string,
  component: () => void
) {
  const start = performance.now();
  component();
  const end = performance.now();
  
  return {
    name: `render-${componentName}`,
    value: end - start,
    unit: 'ms' as const,
    timestamp: Date.now(),
  };
}

export function sendMetric(metric: PerformanceMetric) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/metrics', JSON.stringify(metric));
  }
}

// Usage in components
import { measureComponentRender } from '@/lib/performanceMonitoring';

const Dashboard = () => {
  const startTime = performance.now();
  
  return (
    <div>
      {/* Dashboard content */}
    </div>
  );
};
```

### 2.3 Network Performance Monitoring

```typescript
// src/lib/apiMonitoring.ts
export function monitorApiCall(url: string, duration: number) {
  sendMetric({
    name: `api-${new URL(url).pathname}`,
    value: duration,
    unit: 'ms',
    timestamp: Date.now(),
  });
}

// In API client
async function fetchData(url: string) {
  const start = performance.now();
  const response = await fetch(url);
  const end = performance.now();
  
  monitorApiCall(url, end - start);
  return response;
}
```

## Layer 3: Production Monitoring

### 3.1 Analytics Endpoint (Backend)

**Setup:** Create endpoint in `server.ts`

```typescript
// server.ts
app.post('/api/analytics/metrics', express.json(), (req, res) => {
  const metric = req.body;
  
  // Store in database or log
  console.log(`Metric: ${metric.name} = ${metric.value}${metric.unit}`);
  
  // Example: Store in TimescaleDB for time-series analysis
  // db.query('INSERT INTO metrics (name, value, timestamp) VALUES ($1, $2, $3)',
  //   [metric.name, metric.value, new Date(metric.timestamp)]
  // );
  
  res.json({ success: true });
});
```

### 3.2 Dashboard Views

**Metrics Dashboard (for team):**
- Real-time build status and bundle size
- Core Web Vitals trends (24h, 7d, 30d)
- Error rate and top errors
- API response time distribution
- Browser and device breakdown

**Executive Dashboard:**
- User experience score (UX score = 100 - (errors + slow metrics))
- Conversion metrics
- Error budget remaining

**Example using Grafana/DataDog:**

```
Panel 1: Core Web Vitals
- FCP (First Contentful Paint) — target <3s
- LCP (Largest Contentful Paint) — target <4s
- CLS (Cumulative Layout Shift) — target <0.1
- INP (Interaction to Next Paint) — target <200ms

Panel 2: Bundle Size
- Main chunk size over time
- Total bundle size over time
- Chunk count

Panel 3: API Performance
- Login endpoint (p50, p95, p99)
- Data fetch (students, attendance, etc.)
- Slow queries alert

Panel 4: Error Rate
- JavaScript errors
- API errors
- Network errors
```

## Monitoring Tools

### Recommended Stack

1. **Build Metrics:** Custom script + Vercel Analytics (if deployed)
2. **Client Metrics:** Web Vitals + custom instrumentation
3. **Dashboard:** 
   - Local: Custom HTML dashboard
   - Production: Vercel Analytics, Datadog, or New Relic

### Free/Open-Source Options

| Tool | Purpose | Free Tier |
|------|---------|-----------|
| Lighthouse CI | Build-time perf testing | Yes (self-hosted) |
| Web Vitals API | Runtime metrics | Yes |
| Grafana | Dashboard | Yes (self-hosted) |
| Prometheus | Time-series DB | Yes (self-hosted) |
| Sentry | Error tracking | 5k errors/month |

### Managed Services

| Tool | Cost | Features |
|------|------|----------|
| Vercel Analytics | Included | Build metrics, Web Vitals |
| Datadog | $15+/month | Full APM + RUM |
| New Relic | $100+/month | Full APM + RUM |
| Sentry | Free - $1000+/month | Error tracking + performance |

## Implementation Priority

### Week 1: Essential (Quick Wins)
- Setup Web Vitals collection (30 min)
- Create bundle analysis script (1 hour)
- Add basic metrics endpoint (1 hour)

### Week 2: Core Monitoring
- Dashboard visualization (2-3 hours)
- Alert configuration (1 hour)
- Documentation (1 hour)

### Week 3: Advanced
- Error tracking integration (2-3 hours)
- API performance breakdown (2 hours)
- User experience scoring (2 hours)

## Testing Monitoring Setup

```bash
# Test Web Vitals collection
npm run dev
# Open DevTools Network tab, slow to "Slow 4G"
# Refresh page and check /api/analytics/metrics calls

# Test bundle analysis
npm run build
# Check bundle-metrics.json is created

# Test Lighthouse
npx lighthouse http://localhost:3000
```

## Alerting Rules

### Critical Alerts (Page on-call)

```
ALERT HighErrorRate
  if error_count > 100 in 5min
  then page oncall

ALERT BuildFailure
  if npm run build fails
  then notify #deployments

ALERT LargeBundleIncrease
  if main_chunk_size > 250KB
  then notify #frontend-team
```

### Warning Alerts (Slack notification)

```
WARN SlowBuild
  if build_time > 45 seconds
  then notify #frontend-team

WARN CoreWebVitalsRegression
  if LCP > 4 seconds (p95)
  then notify #frontend-team

WARN HighApiLatency
  if api_response_time (p95) > 2 seconds
  then notify #backend-team
```

## Dashboard SQL Examples

### Query: Core Web Vitals Trends

```sql
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99
FROM metrics
WHERE name = 'LCP'
  AND timestamp > now() - interval '30 days'
GROUP BY hour
ORDER BY hour DESC;
```

### Query: Bundle Size Over Time

```sql
SELECT
  DATE(created_at) as date,
  MAX(CASE WHEN chunk = 'main' THEN size END) as main_chunk,
  SUM(size) as total_size,
  COUNT(*) as chunk_count
FROM bundle_metrics
GROUP BY date
ORDER BY date DESC;
```

## Related Documentation

- [PERFORMANCE_TESTING.md](./PERFORMANCE_TESTING.md) — Performance test results
- [PERFORMANCE_OPTIMIZATION_ROADMAP.md](./PERFORMANCE_OPTIMIZATION_ROADMAP.md) — Optimization plan
- [PERFORMANCE.md](./PERFORMANCE.md) — Current optimization strategy

## Next Steps

1. Implement Web Vitals collection this week
2. Set up bundle analysis script
3. Create basic metrics dashboard
4. Configure alerts for critical metrics
5. Review metrics weekly in team meeting
