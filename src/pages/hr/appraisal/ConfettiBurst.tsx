import { useEffect, useState } from "react";
import { motion } from "motion/react";

const COLORS = ["#9810fa", "#d12386", "#4f46e5", "#10b981", "#f59e0b"];

// Subtle, dependency-free success-moment confetti — ~28 pieces falling and
// fading over ~1.1s, then this component unmounts itself. No new package;
// motion/react is already a dependency used across the dashboard.
// Respects prefers-reduced-motion by simply not rendering any pieces.
export function ConfettiBurst() {
  const [pieces, setPieces] = useState<{ id: number; x: number; color: string; rotate: number; delay: number }[] | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    setPieces(
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
        delay: Math.random() * 0.25,
      }))
    );
    const timer = setTimeout(() => setPieces(null), 1400);
    return () => clearTimeout(timer);
  }, []);

  if (!pieces) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ top: "-5%", left: `${p.x}%`, opacity: 1, rotate: 0 }}
          animate={{ top: "100%", opacity: 0, rotate: p.rotate }}
          transition={{ duration: 1.1, delay: p.delay, ease: "easeIn" }}
          className="absolute block h-2.5 w-1.5 rounded-sm"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}
