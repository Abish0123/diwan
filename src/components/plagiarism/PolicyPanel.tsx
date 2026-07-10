import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Lock, CheckCircle2, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getPolicy, savePolicy } from "@/lib/plagiarismData";
import { logAudit } from "@/lib/codingAudit";
import { PlagiarismPolicy } from "@/types/plagiarism";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin } from "@/lib/codingRbac";

export function PolicyPanel() {
  const { user, role } = useAuth();
  const editable = isAdmin(role);
  const [policy, setPolicy] = useState<PlagiarismPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { getPolicy().then(setPolicy); }, []);

  if (!policy) return <div className="flex items-center gap-2 text-slate-500 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const update = (patch: Partial<PlagiarismPolicy>) => { setPolicy({ ...policy, ...patch }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    await savePolicy(policy);
    await logAudit("Plagiarism policy changed", "plagiarism_policy", { user: user?.email, role },
      `auto<${policy.autoApproveBelow}%, review<${policy.manualReviewBelow}%, AI review>${policy.aiReviewBelow}%`);
    setSaving(false); setDirty(false);
    toast.success("Policy saved — applies to new submissions");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {editable ? (
          <Button className="bg-[#9810fa] hover:bg-[#5d1899]" disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Policy
          </Button>
        ) : (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Similarity Approval Rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Auto-approve below (%)" value={policy.autoApproveBelow} disabled={!editable} onChange={(v) => update({ autoApproveBelow: v })} />
            <Field label="Manual review below (%)" value={policy.manualReviewBelow} disabled={!editable} onChange={(v) => update({ manualReviewBelow: v })} />
            <div className="space-y-2 pt-1">
              <RuleRow icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} text={`Below ${policy.autoApproveBelow}% → Auto Approve`} />
              <RuleRow icon={<Eye className="h-4 w-4 text-amber-500" />} text={`${policy.autoApproveBelow}%–${policy.manualReviewBelow}% → Manual Review`} />
              <RuleRow icon={<AlertTriangle className="h-4 w-4 text-rose-500" />} text={`Above ${policy.manualReviewBelow}% → Flag for Investigation`} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">AI Detection Rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="AI low-risk below (%)" value={policy.aiLowBelow} disabled={!editable} onChange={(v) => update({ aiLowBelow: v })} />
            <Field label="AI review-required below (%)" value={policy.aiReviewBelow} disabled={!editable} onChange={(v) => update({ aiReviewBelow: v })} />
            <div className="space-y-2 pt-1">
              <RuleRow icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} text={`Below ${policy.aiLowBelow}% AI → Low Risk`} />
              <RuleRow icon={<Eye className="h-4 w-4 text-amber-500" />} text={`${policy.aiLowBelow}%–${policy.aiReviewBelow}% AI → Review Required`} />
              <RuleRow icon={<AlertTriangle className="h-4 w-4 text-rose-500" />} text={`Above ${policy.aiReviewBelow}% AI → High Risk`} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Upload Limits</CardTitle></CardHeader>
          <CardContent>
            <Field label="Maximum file size (MB)" value={policy.maxFileSizeMb} disabled={!editable} onChange={(v) => update({ maxFileSizeMb: v })} />
            <p className="text-xs text-slate-400 mt-2">Allowed types: PDF, DOCX, DOC, TXT, RTF.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" min={0} max={100} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-32 mt-1" />
    </div>
  );
}
function RuleRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center gap-2 text-sm text-slate-600">{icon}{text}</div>;
}
