import { useEffect, useState } from "react";

// Drives a 0->1 progress value for chart "draw-in" animations (ring sweeps,
// progress bars, gauges) via setTimeout stepping rather than
// requestAnimationFrame. Charting libraries' own built-in animations
// (Recharts' animationBegin/animationDuration, react-smooth) are rAF-driven,
// and browsers fully PAUSE rAF (not just throttle it) whenever the tab isn't
// the visible/active one — confirmed directly on this dashboard's KPI
// sparkline, which froze at 0% indefinitely under that condition. setTimeout
// still fires (just less often) on a backgrounded tab, so animations driven
// by this hook always reach 1 eventually instead of getting stuck.
export function useSweepProgress(durationMs: number, ready: boolean): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setProgress(0);
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setProgress(eased);
      if (p < 1) timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => clearTimeout(timer);
  }, [durationMs, ready]);

  return progress;
}
