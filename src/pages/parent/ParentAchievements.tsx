import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Award, Star, Trophy, Download, Medal, Users2 } from "lucide-react";

interface Achievement {
  id: string; title: string; category: string; date: string;
  level: "School" | "Zone" | "National" | "International";
  description: string; award: string;
}

function levelColor(l: string) {
  switch (l) {
    case "International": return "bg-violet-100 text-violet-700";
    case "National":      return "bg-rose-100 text-rose-700";
    case "Zone":          return "bg-blue-100 text-blue-700";
    default:              return "bg-emerald-100 text-emerald-700";
  }
}

function mapAchievement(a: any): Achievement {
  return {
    id: a.id,
    title: a.title || "Achievement",
    category: a.category || a.type || "Academic",
    date: a.date ? new Date(a.date).toLocaleDateString("en-GB") : "—",
    level: a.level || "School",
    description: a.description || "Awarded for exceptional performance.",
    award: a.award || a.position || "Certificate",
  };
}

export default function ParentAchievements() {
  const { selected, loading } = useParentChildren();
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  // Fetch real Achievement rows — filter by recipients/students list matching this child
  useEffect(() => {
    setAchievements([]);
    if (!selected?.id) return;

    smartDb.getAll("Achievement", undefined).then((rows: any[]) => {
      const filtered = (rows || []).filter((a: any) => {
        const list = a.recipients || a.students || [];
        return list.some((x: any) => x.id === selected.id || x.name === selected.name);
      });
      setAchievements(filtered.map(mapAchievement));
    }).catch(() => {});
  }, [selected?.id, selected?.name]);

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Trophy className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Achievements</h1>
              <p className="text-sm text-slate-400">{selected.name} — Awards, certificates &amp; recognitions</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Total Awards",   value: achievements.length,                                  icon: Trophy,  color:"text-amber-600 bg-amber-50" },
            { label:"School Level",   value: achievements.filter(a=>a.level==="School").length,    icon: Star,    color:"text-emerald-600 bg-emerald-50" },
            { label:"Zone/National",  value: achievements.filter(a=>a.level==="Zone"||a.level==="National").length, icon: Medal, color:"text-purple-600 bg-blue-50" },
            { label:"International",  value: achievements.filter(a=>a.level==="International").length, icon: Award, color:"text-purple-600 bg-violet-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {achievements.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No achievements recorded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4 hover:shadow-md transition">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", levelColor(a.level))}>{a.level}</span>
                    <span className="text-xs text-slate-400">{a.date}</span>
                  </div>
                  <h3 className="font-black text-slate-900">{a.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
                  <p className="text-xs text-amber-600 font-semibold mt-1">{a.award}</p>
                </div>
                <button onClick={() => toast.success("Downloading certificate…")}
                  className="flex-shrink-0 p-2 rounded-lg hover:bg-slate-50 transition">
                  <Download className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
