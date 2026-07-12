import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trophy, Calendar, ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ACCOMPLISHMENT_CATEGORIES = ["All", "Academic", "Sports", "Arts", "Extra-curricular"];

export default function StudentAchievements() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedAccolade, setSelectedAccolade] = useState<any | null>(null);

  // StudentContext already resolves the "student" role's own record via a
  // server-side email lookup — no need to (mis)match again client-side.
  const student = useMemo(() => students?.[0] ?? null, [students]);

  useEffect(() => {
    smartDb.getAll("Achievement", undefined).then((rows: any[]) => {
      const s = student as any;
      if (!s) return;
      // The real writer (academics/Achievements.tsx) stores `students` as a
      // plain array of name strings, never objects with id/name — the old
      // `list.some(x => x.id === ... || x.name === ...)` check evaluated
      // those properties on a string primitive, always undefined, so this
      // page could never match a single real achievement. Also gate on
      // status === "Published" so a student can't see one still awaiting
      // approval.
      const filtered = (rows || []).filter(a => {
        if (a.status !== "Published") return false;
        const list: any[] = a.recipients || a.students || [];
        return list.some((x: any) => typeof x === "string" ? x === s.name : (x.id === s.id || x.name === s.name));
      });
      setAchievements(filtered);
    }).catch(() => {});
  }, [student]);

  const listToRender = achievements.map((a: any) => ({
    id: a.id,
    title: a.title,
    event: a.event || a.type || "School Event",
    type: a.type || "Academic",
    position: a.position || a.award || "1st",
    date: a.date ? new Date(a.date).toLocaleDateString("en-GB") : "Recently",
    desc: a.description || "Awarded for exceptional performance and active school participation."
  }));

  const filtered = listToRender.filter(a => activeCategory === "All" || a.type === activeCategory);

  // A position is a numeric rank if it's a bare number or an ordinal like
  // "1st"/"2nd"/"3rd". Only those get a "Place"/"Position" suffix; named
  // awards (Gold, Champion, Honor Roll) are shown on their own.
  const isNumericRank = (pos: string) => /^\d+(st|nd|rd|th)?$/i.test(String(pos).trim());

  const positionLabel = (pos: string, suffix: "Place" | "Position") =>
    isNumericRank(pos) ? `${pos} ${suffix}` : pos;

  const getTrophyColor = (pos: string) => {
    const p = pos.toLowerCase();
    if (p.includes("1st") || p.includes("gold") || p.includes("champion")) {
      return {
        fill: "text-amber-500 fill-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/20",
        border: "border-amber-200 hover:shadow-amber-100 dark:hover:shadow-transparent",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
      };
    }
    if (p.includes("2nd") || p.includes("silver")) {
      return {
        fill: "text-slate-400 fill-slate-300",
        bg: "bg-slate-50 dark:bg-slate-800/10",
        border: "border-slate-200 hover:shadow-slate-100 dark:hover:shadow-transparent",
        badge: "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
      };
    }
    return {
      fill: "text-orange-500 fill-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/20",
      border: "border-orange-200 hover:shadow-orange-100 dark:hover:shadow-transparent",
      badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
    };
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <Trophy className="h-5.5 w-5.5 text-amber-500" /> Honors & Achievements
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Your personal digital trophy case. Check medals and certificates issued by instructors.
              </p>
            </div>

            {/* Category Filter Chips */}
            <div className="flex gap-1 bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-xl p-1 shadow-sm shrink-0 overflow-x-auto scrollbar-none">
              {ACCOMPLISHMENT_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
                    activeCategory === cat 
                      ? "bg-[#9810fa] text-white shadow-sm" 
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Trophy Cabinet Virtual Shelves Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] text-slate-400 transition-colors shadow-sm">
              <Trophy className="h-12 w-12 mb-3 opacity-25" />
              <p className="font-extrabold text-sm text-slate-800 dark:text-white">Cabinet Empty</p>
              <p className="text-xs text-slate-400 mt-1">There are no medals listed under this filter.</p>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Wooden/Glass Shelf 1 */}
              <div className="relative">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 relative z-10">
                  {filtered.map((item, idx) => {
                    const style = getTrophyColor(item.position);
                    return (
                      <motion.div
                        whileHover={{ y: -8, scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 300 }}
                        onClick={() => setSelectedAccolade(item)}
                        key={item.id}
                        className={cn(
                          "bg-white dark:bg-[#16162A] border rounded-[24px] p-6 flex flex-col items-center text-center cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300",
                          style.border
                        )}
                      >
                        {/* Trophy Icon Area with Glow */}
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-inner relative", style.bg)}>
                          <Trophy className={cn("h-7 w-7", style.fill)} />
                          {/* Pulsing light behind Gold Trophies */}
                          {item.position.toLowerCase().includes("gold") && (
                            <div className="absolute inset-0 bg-amber-400/20 blur-md rounded-2xl -z-10 animate-pulse" />
                          )}
                        </div>

                        <Badge className={cn("text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border-none tracking-wider mb-2", style.badge)}>
                          {positionLabel(item.position, "Place")}
                        </Badge>

                        <h4 className="font-black text-slate-900 dark:text-white text-sm line-clamp-2 leading-snug">
                          {item.title}
                        </h4>
                        
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold mt-3 uppercase tracking-wider">
                          {item.event}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Decorative horizontal Shelf shelf board line */}
                <div className="absolute -bottom-4 left-0 right-0 h-2 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-full shadow-md pointer-events-none" />
              </div>
            </div>
          )}

          {/* Detailed view Modal overlay */}
          <AnimatePresence>
            {selectedAccolade && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedAccolade(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                
                <motion.div 
                  initial={{ scale: 0.95, y: 10, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 10, opacity: 0 }}
                  className="bg-white dark:bg-[#16162A] rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden relative z-10 border border-slate-100 dark:border-slate-800/40 p-6 flex flex-col items-center text-center space-y-4"
                >
                  <button 
                    onClick={() => setSelectedAccolade(null)} 
                    className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <X className="h-4.5 w-4.5 text-slate-400" />
                  </button>

                  <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner", getTrophyColor(selectedAccolade.position).bg)}>
                    <Trophy className={cn("h-8 w-8", getTrophyColor(selectedAccolade.position).fill)} />
                  </div>

                  <div>
                    <Badge className={cn("text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-md border-none tracking-widest", getTrophyColor(selectedAccolade.position).badge)}>
                      {positionLabel(selectedAccolade.position, "Position")}
                    </Badge>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mt-2 leading-snug">{selectedAccolade.title}</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-1 uppercase tracking-wider">{selectedAccolade.event}</p>
                  </div>

                  <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-2xl p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed w-full">
                    {selectedAccolade.desc}
                  </div>

                  <div className="w-full pt-4 border-t border-slate-50 dark:border-slate-800/20 flex items-center justify-between text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Date: {selectedAccolade.date}</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Officially Attested</span>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </DashboardLayout>
  );
}
