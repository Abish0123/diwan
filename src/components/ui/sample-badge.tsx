import { cn } from "@/lib/utils";

/**
 * Small inline badge used to honestly label UI values that are illustrative /
 * demo data and not derived from real collections. Keeps the surrounding
 * markup intact while signalling that a number is not live.
 */
export function SampleBadge({
  label = "Sample",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600",
        className
      )}
    >
      {label}
    </span>
  );
}
