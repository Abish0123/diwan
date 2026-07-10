import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Scale, Save, Loader2, Lock, Percent, Minus, Cpu, UserCheck, Sparkles, SplitSquareHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { AdminNav } from "@/components/coding/AdminNav";
import { getGradingRules, saveGradingRules } from "@/lib/codingSettings";
import { logAudit } from "@/lib/codingAudit";
import { GradingRules } from "@/types/coding";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";

export default function GradingRulesPage() {
  const { user, role } = useAuth();
  const editable = can(role, "grading.configure");
  const [rules, setRules] = useState<GradingRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { getGradingRules().then(setRules); }, []);

  if (!rules) {
    return <DashboardLayout><div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></DashboardLayout>;
  }

  const update = (patch: Partial<GradingRules>) => { setRules({ ...rules, ...patch }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await saveGradingRules(rules);
    await logAudit("Grading rules changed", "grading_rules", { user: user?.email, role }, `Pass ${rules.passingPercentage}%, negative ${rules.negativeMarking ? rules.negativeMarkPerWrong : "off"}`);
    setSaving(false); setDirty(false);
    toast.success("Grading rules saved");
  };

  const toggles: { key: keyof GradingRules; label: string; desc: string; icon: React.ElementType }[] = [
    { key: "autoGrading", label: "Auto Grading", desc: "Score automatically from hidden test cases", icon: Cpu },
    { key: "partialScoring", label: "Partial Scoring", desc: "Award marks per passed test case", icon: SplitSquareHorizontal },
    { key: "aiEvaluation", label: "AI Code Evaluation", desc: "Quality, optimization & maintainability scores", icon: Sparkles },
    { key: "manualReview", label: "Manual Review", desc: "Require instructor review before finalizing", icon: UserCheck },
  ];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Scale className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Grading Engine Configuration</h1>
            <p className="text-sm text-slate-400">Control how submissions are scored across all assessments.</p>
          </div>
        </div>
        {editable ? (
          <Button className="bg-[#9810fa] hover:bg-[#5d1899]" disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
        ) : (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only (Instructor)</Badge>
        )}
      </div>

      <AdminNav />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Scoring</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4 text-slate-400" /> Passing Percentage</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input type="number" min={0} max={100} disabled={!editable} value={rules.passingPercentage}
                  onChange={(e) => update({ passingPercentage: Number(e.target.value) })} className="w-28" />
                <span className="text-sm text-slate-500">% of maximum marks</span>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center"><Minus className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-medium text-slate-800">Negative Marking</div>
                  <div className="text-xs text-slate-500">Deduct marks for wrong MCQ/aptitude answers</div>
                </div>
              </div>
              <Switch checked={rules.negativeMarking} disabled={!editable} onCheckedChange={(v) => update({ negativeMarking: v })} />
            </div>

            {rules.negativeMarking && (
              <div className="pl-12">
                <Label>Penalty per wrong answer</Label>
                <Input type="number" min={0} step={0.25} disabled={!editable} value={rules.negativeMarkPerWrong}
                  onChange={(e) => update({ negativeMarkPerWrong: Number(e.target.value) })} className="w-28 mt-1.5" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Evaluation Mode</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {toggles.map((t) => (
              <div key={String(t.key)} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 grid place-items-center"><t.icon className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.label}</div>
                    <div className="text-xs text-slate-500">{t.desc}</div>
                  </div>
                </div>
                <Switch checked={rules[t.key] as boolean} disabled={!editable} onCheckedChange={(v) => update({ [t.key]: v } as Partial<GradingRules>)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
