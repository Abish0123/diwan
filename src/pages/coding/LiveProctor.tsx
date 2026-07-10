import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Monitor, ShieldAlert, ShieldCheck, Clock, CircleDot, Users,
  Camera, AlertTriangle, Wifi,
} from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { getTests, CODING_ATTEMPTS } from "@/lib/codingData";
import {
  CodingTest, CodingAttempt, VIOLATION_LABELS, integrityStatus,
} from "@/types/coding";
import { IntegrityBadge, integrityColor } from "@/components/coding/shared";
import { cn } from "@/lib/utils";

export default function LiveProctor() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<CodingTest | null>(null);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);

  useEffect(() => {
    (async () => {
      const tests = await getTests();
      setTest((tests || []).find((t) => t.id === testId) || null);
    })();
    // live updates: smartDb.watch polls local DB every 5s (or Firestore realtime)
    const unsub = smartDb.watch(CODING_ATTEMPTS, undefined, (data) => {
      setAttempts((data as CodingAttempt[]).filter((a) => a.testId === testId));
    });
    return () => unsub?.();
  }, [testId]);

  const live = useMemo(() => attempts.filter((a) => a.status === "in-progress"), [attempts]);
  const submitted = useMemo(() => attempts.filter((a) => a.status === "submitted"), [attempts]);
  const flagged = live.filter((a) => a.integrityScore < 65);

  const elapsed = (a: CodingAttempt) => {
    const startMs = new Date(a.startedAt).getTime();
    const total = a.durationMins * 60 * 1000;
    const remaining = Math.max(0, startMs + total - Date.now());
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <DashboardLayout>
      <Button variant="ghost" className="w-fit -ml-2 text-slate-500" onClick={() => navigate("/coding/instructor")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to tests
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Monitor className="h-6 w-6 text-[#9810fa]" /> Live Proctoring</h1>
          <p className="text-slate-500 mt-1">{test?.title || "Test"} · real-time candidate monitoring</p>
        </div>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5"><Wifi className="h-3.5 w-3.5" /> Live · auto-refresh</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<CircleDot className="h-5 w-5" />} label="In Progress" value={live.length} tone="emerald" />
        <Stat icon={<ShieldAlert className="h-5 w-5" />} label="Flagged" value={flagged.length} tone="rose" />
        <Stat icon={<Users className="h-5 w-5" />} label="Submitted" value={submitted.length} tone="violet" />
        <Stat icon={<ShieldCheck className="h-5 w-5" />} label="Avg Integrity" value={live.length ? Math.round(live.reduce((s, a) => s + a.integrityScore, 0) / live.length) : "—"} tone="slate" />
      </div>

      {live.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <Monitor className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No candidates are currently taking this test.
            <p className="text-xs mt-2 text-slate-400">Open the test in another window/profile as a student to see live monitoring here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {live.map((a) => {
            const recent = a.violations?.slice(0, 3) || [];
            const answered = Object.keys(a.submissions || {}).length;
            return (
              <Card key={a.id} className={cn("border-slate-200 overflow-hidden", a.integrityScore < 65 && "ring-2 ring-rose-200")}>
                <div className="bg-slate-900 aspect-video grid place-items-center relative">
                  {/* Live camera streaming between browsers needs the WebRTC/Socket.io
                      signalling server; here we show a placeholder tile. */}
                  <Camera className="h-8 w-8 text-slate-600" />
                  <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" /> LIVE
                  </span>
                  <span className="absolute bottom-2 left-2 text-xs text-white font-medium">{a.studentName}</span>
                  <span className="absolute bottom-2 right-2 text-[11px] text-white/80 flex items-center gap-1"><Clock className="h-3 w-3" />{elapsed(a)}</span>
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{a.studentName}</span>
                    <IntegrityBadge score={a.integrityScore} status={integrityStatus(a.integrityScore)} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Progress</span><span>{answered}/{test?.questionIds.length || "?"} answered</span></div>
                    <Progress value={test?.questionIds.length ? (answered / test.questionIds.length) * 100 : 0} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    {recent.length === 0 ? (
                      <div className="text-xs text-emerald-600 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> No recent violations</div>
                    ) : recent.map((v) => (
                      <div key={v.id} className="text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3 w-3" />{VIOLATION_LABELS[v.type]}{v.simulated && <span className="text-slate-400">(AI)</span>}</span>
                        <span className="text-slate-400">+{v.weight}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {submitted.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Submitted ({submitted.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {submitted.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700">{a.studentName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{a.totalScore}/{a.totalMarks}</span>
                  <IntegrityBadge score={a.integrityScore} status={integrityStatus(a.integrityScore)} />
                  <Button size="sm" variant="ghost" className="text-[#9810fa]" onClick={() => navigate(`/coding/attempt/${a.id}/result`)}>Report</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: "emerald" | "rose" | "violet" | "slate" }) {
  const map = {
    emerald: "bg-emerald-50 text-emerald-600", rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-[#9810fa]", slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("h-10 w-10 rounded-lg grid place-items-center", map[tone])}>{icon}</div>
        <div><div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>
      </CardContent>
    </Card>
  );
}
