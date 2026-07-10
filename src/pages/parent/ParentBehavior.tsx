import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { Shield, ThumbsUp, ThumbsDown, Users2 } from "lucide-react";

// Real BehaviorIncident record shape (see src/pages/Behavior.tsx):
// { id, studentName, studentId, type: "Merit"|"Demerit", category, description, severity, date, uid, createdAt }
function typeStyle(t: string) {
  switch (t) {
    case "Merit":   return { bg:"bg-emerald-50 border-emerald-100", badge:"bg-emerald-100 text-emerald-700", icon: ThumbsUp, iconColor:"text-emerald-500" };
    case "Demerit": return { bg:"bg-rose-50 border-rose-100",       badge:"bg-rose-100 text-rose-700",       icon: ThumbsDown, iconColor:"text-rose-500" };
    default:        return { bg:"bg-slate-50 border-slate-100",     badge:"bg-slate-100 text-slate-600",     icon: Shield, iconColor:"text-slate-400" };
  }
}

export default function ParentBehavior() {
  const { selected, loading } = useParentChildren();
  const [records, setRecords] = useState<any[]>([]);

  // Fetch real BehaviorIncident rows — same table admin/teacher Behavior page writes to
  useEffect(() => {
    setRecords([]);
    if (!selected?.id) return;

    smartDb.getAll("BehaviorIncident").then((rows: any[]) => {
      const mine = (rows || []).filter((r: any) =>
        r.studentId === selected.id || r.studentName === selected.name || r.student === selected.name
      );
      setRecords(mine.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
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

  const positive = records.filter(r => r.type === "Merit").length;
  const warnings = records.filter(r => r.type === "Demerit").length;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Behaviour</h1>
              <p className="text-sm text-slate-400">{selected.name} — Conduct & discipline records</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label:"Merits",    value: positive, icon: ThumbsUp,    color:"text-emerald-600 bg-emerald-50" },
            { label:"Demerits",  value: warnings, icon: ThumbsDown,   color: warnings>0?"text-rose-600 bg-rose-50":"text-emerald-600 bg-emerald-50" },
            { label:"Total",     value: records.length, icon: Shield, color:"text-purple-600 bg-violet-50" },
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

        {records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No behaviour incidents recorded — great job!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(r => {
              const s = typeStyle(r.type);
              return (
                <div key={r.id} className={cn("rounded-2xl border p-4 flex items-start gap-4", s.bg)}>
                  <div className="flex-shrink-0 mt-0.5">
                    <s.icon className={cn("w-5 h-5", s.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", s.badge)}>{r.type}</span>
                      <span className="text-xs font-semibold text-slate-600">{r.category}</span>
                      <span className="text-xs text-slate-400">{r.date}</span>
                      {r.severity && <span className="text-xs text-slate-400">· {r.severity} severity</span>}
                    </div>
                    <p className="text-sm text-slate-800">{r.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
