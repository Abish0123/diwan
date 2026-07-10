import { useParentChildren } from "@/hooks/useParentChildren";
import { cn } from "@/lib/utils";
import { ChevronDown, Users } from "lucide-react";
import { useState } from "react";

const AVATAR_COLORS = [
  "bg-violet-500","bg-emerald-500","bg-amber-500","bg-blue-500","bg-rose-500",
];

export function ChildSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { children, selected, selectChild } = useParentChildren();
  const [open, setOpen] = useState(false);

  if (children.length === 0) return null;

  const color = AVATAR_COLORS[children.findIndex(c => c.id === selected.id) % AVATAR_COLORS.length];

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 rounded-xl bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition w-full text-left",
          compact ? "px-2 py-1.5" : "px-3 py-2.5"
        )}
      >
        <div className={cn("rounded-full flex items-center justify-center text-white font-bold flex-shrink-0", color, compact ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-xs")}>
          {selected.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-bold text-slate-900 truncate", compact ? "text-xs" : "text-sm")}>{selected.name}</p>
          {!compact && <p className="text-xs text-slate-400 truncate">{selected.grade} · Section {selected.section}</p>}
        </div>
        {children.length > 1 && (
          <ChevronDown className={cn("text-slate-400 flex-shrink-0 transition-transform", open && "rotate-180", compact ? "w-3 h-3" : "w-4 h-4")} />
        )}
      </button>

      {open && children.length > 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Switch Child
            </p>
          </div>
          {children.map((c, i) => {
            const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <button
                key={c.id}
                onClick={() => { selectChild(c.id); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition text-left",
                  c.id === selected.id && "bg-violet-50"
                )}
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", col)}>
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.grade} · Sec {c.section} · Roll {c.rollNo}</p>
                </div>
                {c.id === selected.id && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
