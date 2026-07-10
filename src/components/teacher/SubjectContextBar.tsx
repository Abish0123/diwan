import { useState, useRef, useEffect } from "react";
import { BookOpen, ChevronDown, GraduationCap, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubjectAssignment } from "@/hooks/useMySubjects";

const SECTION_COLOR: Record<string, string> = {
  A: "bg-purple-100 text-purple-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-green-100 text-green-700",
};

interface Props {
  assignments: SubjectAssignment[];
  selected: SubjectAssignment | null;
  onChange: (a: SubjectAssignment) => void;
  className?: string;
}

export function SubjectContextBar({ assignments, selected, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!assignments.length) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 px-4 py-2.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors w-full sm:w-auto"
      >
        <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-left min-w-0">
          <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider leading-none mb-0.5">
            Teaching
          </p>
          {selected ? (
            <p className="text-sm font-bold text-violet-800 truncate">
              {selected.grade} · Sec {selected.section} · {selected.subject}
            </p>
          ) : (
            <p className="text-sm font-semibold text-purple-600">Select subject class</p>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-violet-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[280px] max-h-72 overflow-y-auto py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5">
            My Subject Classes ({assignments.length})
          </p>
          {assignments.map(a => {
            const isActive = selected?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => { onChange(a); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left",
                  isActive && "bg-violet-50"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{a.subject}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-semibold text-slate-500">{a.grade}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", SECTION_COLOR[a.section] || "bg-slate-100 text-slate-600")}>
                      Sec {a.section}
                    </span>
                  </div>
                </div>
                {isActive && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
