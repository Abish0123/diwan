import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number; // 0-5
  onChange: (v: number) => void;
  label?: string;
}

export function StarRatingInput({ value, onChange, label }: Props) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label || "Rating"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
        >
          <Star className={cn("h-6 w-6 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-300")} />
        </button>
      ))}
    </div>
  );
}
