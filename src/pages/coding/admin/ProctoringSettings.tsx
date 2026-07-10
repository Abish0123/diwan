import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Camera, ScanFace, Users, Smartphone, Mic, ArrowLeftRight,
  Maximize, Save, Loader2, RotateCcw, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { AdminNav } from "@/components/coding/AdminNav";
import {
  getProctoringSettings, saveProctoringSettings, DEFAULT_PROCTORING,
} from "@/lib/codingSettings";
import { logAudit } from "@/lib/codingAudit";
import {
  ProctoringSettings as Settings, ViolationType, VIOLATION_LABELS,
} from "@/types/coding";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";

const MONITORS: { key: keyof Settings; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "cameraMonitoring", label: "Camera Monitoring", desc: "Require webcam throughout the test", icon: Camera },
  { key: "faceVerification", label: "Face Verification & Gaze", desc: "Identity check + look-away detection", icon: ScanFace },
  { key: "multipleFaceDetection", label: "Multiple Face Detection", desc: "Flag additional people in frame", icon: Users },
  { key: "mobileDetection", label: "Mobile / Device Detection", desc: "Detect phones, tablets, notes", icon: Smartphone },
  { key: "audioMonitoring", label: "Audio Monitoring", desc: "Detect background voices", icon: Mic },
  { key: "tabSwitchingDetection", label: "Tab Switching Detection", desc: "Flag tab/window switches", icon: ArrowLeftRight },
  { key: "fullScreenMonitoring", label: "Full Screen Monitoring", desc: "Flag exiting full-screen", icon: Maximize },
];

const WEIGHT_ROWS: ViolationType[] = [
  "tab-switch", "window-blur", "fullscreen-exit", "face-missing",
  "looking-away", "multiple-faces", "mobile-phone", "audio-voice", "copy-paste",
];

export default function ProctoringSettingsPage() {
  const { user, role } = useAuth();
  const editable = can(role, "proctoring.configure");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { getProctoringSettings().then(setSettings); }, []);

  if (!settings) {
    return <DashboardLayout><div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></DashboardLayout>;
  }

  const update = (patch: Partial<Settings>) => { setSettings({ ...settings, ...patch }); setDirty(true); };
  const setWeight = (t: ViolationType, v: number) => { setSettings({ ...settings, weights: { ...settings.weights, [t]: v } }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await saveProctoringSettings(settings);
    await logAudit("Proctoring settings changed", "proctoring_settings", { user: user?.email, role }, "Updated monitors / violation weights");
    setSaving(false); setDirty(false);
    toast.success("Proctoring settings saved — applies to new attempts");
  };

  const reset = () => { setSettings({ ...DEFAULT_PROCTORING, weights: { ...DEFAULT_PROCTORING.weights } }); setDirty(true); };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AI Proctoring Controls</h1>
            <p className="text-sm text-slate-400">Enable monitors and tune violation scoring. Integrity = 100 − total violation weight.</p>
          </div>
        </div>
        {editable ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1.5" /> Reset defaults</Button>
            <Button className="bg-[#9810fa] hover:bg-[#5d1899]" disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
            </Button>
          </div>
        ) : (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only (Instructor)</Badge>
        )}
      </div>

      <AdminNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Monitors</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {MONITORS.map((m) => (
              <div key={String(m.key)} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center"><m.icon className="h-4.5 w-4.5" /></div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.label}</div>
                    <div className="text-xs text-slate-500">{m.desc}</div>
                  </div>
                </div>
                <Switch
                  checked={settings[m.key] as boolean}
                  disabled={!editable}
                  onCheckedChange={(v) => update({ [m.key]: v } as Partial<Settings>)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Violation Scoring Rules</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {WEIGHT_ROWS.map((t) => (
                <div key={t} className="flex items-center justify-between gap-3">
                  <Label className="text-sm text-slate-700 mb-0">{VIOLATION_LABELS[t]}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">−</span>
                    <Input
                      type="number" min={0} max={100} disabled={!editable}
                      value={settings.weights[t]}
                      onChange={(e) => setWeight(t, Number(e.target.value))}
                      className="w-20 h-8 text-center"
                    />
                    <span className="text-xs text-slate-400 w-8">pts</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-violet-50 border border-violet-200 p-3 text-xs text-violet-700">
              Higher weight = larger integrity penalty per event. Multiple Faces is weighted highest by default (50).
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
