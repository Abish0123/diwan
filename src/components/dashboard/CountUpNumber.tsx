import { useEffect, useRef, useState } from "react";

interface CountUpNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Play the count-up tween (from 0) on first mount too, instead of the
   *  default behavior of showing the real value immediately on first
   *  render and only animating on later updates. Off by default — most
   *  callers render this once per page load, where a from-0 mount
   *  animation is exactly the effect they want; leave it opt-in so
   *  existing callers that rely on the "no flash on load" guarantee are
   *  unaffected. */
  animateOnMount?: boolean;
}

// Animates from 0 (or the previous value) to the real value whenever it
// changes — purely presentational, the number itself is always real data
// passed in by the caller, never fabricated here.
//
// Deliberately uses setTimeout stepping rather than requestAnimationFrame:
// rAF is fully PAUSED (not just throttled) by browsers while a tab is
// backgrounded/not visible, which left this stuck at its initial 0 forever
// on a dashboard left open in an inactive tab — exactly the kind of tab an
// admin dashboard commonly sits in. setTimeout still fires (just less
// often) when backgrounded, so the real value always converges even
// without a smooth animation in that case.
export function CountUpNumber({ value, duration = 700, prefix = "", suffix = "", decimals = 0, animateOnMount = false }: CountUpNumberProps) {
  const target = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(animateOnMount ? 0 : target);
  const fromRef = useRef(animateOnMount ? 0 : target);
  const didMountRef = useRef(false);

  useEffect(() => {
    // Skip the animation on first mount — show the real value immediately
    // rather than always starting from 0, so a slow/backgrounded tab never
    // shows a wrong number even transiently. animateOnMount opts out of
    // this guarantee for callers that specifically want a from-0 tween on
    // page load.
    if (!didMountRef.current && !animateOnMount) {
      didMountRef.current = true;
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    didMountRef.current = true;

    const from = fromRef.current;
    const to = target;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        timer = setTimeout(tick, 16);
      } else {
        fromRef.current = to;
      }
    };
    timer = setTimeout(tick, 16);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return (
    <>
      {prefix}
      {display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  );
}
