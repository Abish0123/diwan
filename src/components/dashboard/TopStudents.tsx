import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Star, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { smartDb } from "@/lib/localDb";

interface RankedStudent {
  name: string;
  grade: string;
  score: number;
  rank: number;
}

// Pick the first numeric performance metric a student record actually has.
// Real data has no GPA/attendance yet, so this returns null for most — and we
// show an honest empty state rather than fabricating a leaderboard.
const getScore = (s: Record<string, unknown>): number | null => {
  for (const key of ["gpa", "percentage", "averageScore", "score", "attendance"]) {
    const v = s[key];
    if (typeof v === "number" && !isNaN(v)) return v;
  }
  return null;
};

export const TopStudents = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<RankedStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const all = (await smartDb.getAll("students")) as Record<string, unknown>[];
        if (!active) return;
        const ranked = all
          .map((s) => ({ s, score: getScore(s) }))
          .filter((x) => x.score !== null && x.s.name)
          .sort((a, b) => (b.score as number) - (a.score as number))
          .slice(0, 4)
          .map((x, i) => ({
            name: String(x.s.name),
            grade: String(x.s.grade || x.s.classId || ""),
            score: x.score as number,
            rank: i + 1,
          }));
        setStudents(ranked);
      } catch {
        if (active) setStudents([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Top Performers</h3>
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <button
          onClick={() => navigate("/academics/gradebook")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          Gradebook <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Loading…</div>
      ) : students.length === 0 ? (
        <div className="py-10 px-4 text-center">
          <Trophy className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-[13px] font-semibold text-foreground">No results recorded yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Top performers will appear here once exam results are entered in the Gradebook.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((student, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              className="flex items-center justify-between group cursor-pointer hover:bg-secondary/50 p-2.5 rounded-xl transition-all duration-200 border border-transparent hover:border-border/50"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10 border-2 border-primary/10 shadow-sm">
                    <AvatarFallback className="bg-primary/5 text-[10px] font-bold text-primary">
                      {student.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {student.rank <= 3 && (
                    <div
                      className={`absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-sm ${
                        student.rank === 1
                          ? "bg-amber-400"
                          : student.rank === 2
                          ? "bg-slate-300"
                          : "bg-orange-400"
                      }`}
                    >
                      <Star className="h-2 w-2 text-white fill-white" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-bold text-foreground leading-tight">{student.name}</p>
                  {student.grade && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{student.grade}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-extrabold text-primary tracking-tight">
                  {student.score}
                  {student.score <= 100 ? "%" : ""}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
