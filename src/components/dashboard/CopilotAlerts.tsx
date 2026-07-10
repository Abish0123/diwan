// ── Phase 4: Proactive Copilot Alerts ───────────────────────────────────────
// Surfaces the same real thresholds the assistant already answers on request
// (attendance-below-90%, low performers, late staff, pending leave) WITHOUT
// being asked — read-only, deterministic (no LLM call), and only for Admin/
// Principal personas. Clicking an alert opens the assistant with that exact
// question pre-filled so the human decides what to do next. Deliberately no
// finance/fee alert — the Copilot never touches finance data (see aiPlaybook.ts).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { personaForRole } from "@/lib/aiPlaybook";
import { useLeave } from "@/contexts/LeaveContext";
import {
  fetchLowAttendanceClasses, fetchLowPerformers, fetchLateStaffToday,
} from "@/lib/aiCopilot";

interface Alert {
  key: string;
  headline: string;
  detail: string;
  query: string;
  severity: "high" | "medium";
}

export function CopilotAlerts() {
  const { role } = useAuth();
  const persona = personaForRole(role);
  const navigate = useNavigate();
  const { leaves } = useLeave();
  // Read via ref, not a direct dependency — `leaves` gets a brand-new array
  // reference on every LeaveContext fetch/snapshot, which previously
  // retriggered this effect every time and could cascade into a render
  // loop. The alert list only needs whatever `leaves` holds at the moment
  // this effect actually runs (gated by persona), not a live subscription.
  const leavesRef = useRef(leaves);
  leavesRef.current = leaves;
  const [alerts, setAlerts] = useState<Alert[] | null>(null);

  useEffect(() => {
    if (!persona.canSeeDailyBrief) return;
    let active = true;
    Promise.all([
      fetchLowAttendanceClasses(90),
      fetchLowPerformers(60),
      fetchLateStaffToday(),
    ]).then(([lowAttendance, lowPerformers, lateStaff]) => {
      if (!active) return;
      const pendingLeaves = leavesRef.current.filter(l => (l.status || "").toLowerCase() === "pending").length;
      const found: Alert[] = [];
      if (lowAttendance.length > 0) {
        const worst = lowAttendance[0];
        found.push({
          key: "attendance",
          headline: `${lowAttendance.length} class(es) below 90% attendance today`,
          detail: `Worst: ${worst.className} at ${worst.pct}% (${worst.presentCount}/${worst.totalCount} present).`,
          query: "Which classes have attendance below 90% this week?",
          severity: "high",
        });
      }
      if (lowPerformers.length > 0) {
        found.push({
          key: "performers",
          headline: `${lowPerformers.length} student(s) below 60% overall`,
          detail: `Includes ${lowPerformers.slice(0, 3).map(p => p.name).join(", ")}${lowPerformers.length > 3 ? "…" : ""}.`,
          query: "Show students with low performance",
          severity: "medium",
        });
      }
      if (lateStaff.length > 0) {
        found.push({
          key: "late-staff",
          headline: `${lateStaff.length} staff member(s) arrived late`,
          detail: `Most recent marked day. Includes ${lateStaff.slice(0, 3).map(s => s.name).join(", ")}${lateStaff.length > 3 ? "…" : ""}.`,
          query: "Who arrived late today?",
          severity: "medium",
        });
      }
      if (pendingLeaves > 0) {
        found.push({
          key: "leave",
          headline: `${pendingLeaves} leave request(s) awaiting your approval`,
          detail: "Open the assistant to review and approve or reject.",
          query: "Show pending leave requests",
          severity: "medium",
        });
      }
      setAlerts(found);
    }).catch(() => { if (active) setAlerts([]); });
    return () => { active = false; };
  }, [persona.canSeeDailyBrief]);

  if (!persona.canSeeDailyBrief) return null;
  if (alerts === null) return null; // loading — avoid a flash of "all clear"

  return (
    <Card className="border border-slate-100 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" /> Copilot Alerts
        </CardTitle>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live · read-only</span>
      </CardHeader>
      <CardContent className="pt-0">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nothing needs your attention right now — all thresholds are clear.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <button
                key={a.key}
                onClick={() => navigate(`/ai-center?module=ask&q=${encodeURIComponent(a.query)}`)}
                className="w-full flex items-start gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <AlertTriangle className={a.severity === "high" ? "h-4 w-4 text-rose-500 mt-0.5 shrink-0" : "h-4 w-4 text-amber-500 mt-0.5 shrink-0"} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{a.headline}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
