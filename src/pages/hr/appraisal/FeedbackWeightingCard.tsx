import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import {
  FeedbackWeighting, DEFAULT_FEEDBACK_WEIGHTING, FEEDBACK_WEIGHTING_LABELS,
} from "./feedbackTemplateTypes";

const WEIGHTING_ID = "current";

export function FeedbackWeightingCard() {
  const { t } = useTranslation();
  const [weighting, setWeighting] = useState<FeedbackWeighting>(DEFAULT_FEEDBACK_WEIGHTING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    smartDb.getOne("FeedbackWeighting", WEIGHTING_ID).then((row) => {
      if (row) setWeighting(row as FeedbackWeighting);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const total = Object.values(weighting).reduce((s, v) => s + (Number(v) || 0), 0);

  async function handleSave() {
    if (total !== 100) {
      toast.error(t("admin.hr.appraisal.weightingCard.totalMustBe100", { total }));
      return;
    }
    setSaving(true);
    try {
      const existing = await smartDb.getOne("FeedbackWeighting", WEIGHTING_ID);
      if (existing) await smartDb.update("FeedbackWeighting", WEIGHTING_ID, weighting);
      else await smartDb.create("FeedbackWeighting", weighting, WEIGHTING_ID);
      toast.success(t("admin.hr.appraisal.weightingCard.saveSuccess"));
    } catch {
      toast.error(t("admin.hr.appraisal.weightingCard.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function normalize() {
    const t = total || 1;
    const next = { ...weighting };
    (Object.keys(next) as (keyof FeedbackWeighting)[]).forEach((k) => {
      next[k] = Math.round((next[k] / t) * 100);
    });
    setWeighting(next);
  }

  if (loading) return <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">{t("admin.hr.appraisal.weightingCard.loading")}</div>;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Scale className="h-4 w-4 text-purple-600" /> {t("admin.hr.appraisal.weightingCard.title")}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t("admin.hr.appraisal.weightingCard.description")}</p>
          </div>
        </div>

        <div className="space-y-3">
          {FEEDBACK_WEIGHTING_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-44 text-sm font-medium text-slate-700 shrink-0">{label}</span>
              <Slider value={[weighting[key]]} min={0} max={100} step={1} onValueChange={([v]) => setWeighting((w) => ({ ...w, [key]: v }))} className="flex-1" />
              <span className="w-10 text-end text-sm font-bold text-slate-800">{weighting[key]}%</span>
            </div>
          ))}
        </div>

        <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 font-bold text-sm ${total === 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          <span>{t("admin.hr.appraisal.weightingCard.totalLabel")}</span>
          <div className="flex items-center gap-2">
            <span>{total}%</span>
            {total !== 100 && <Button size="sm" variant="outline" onClick={normalize}>{t("admin.hr.appraisal.weightingCard.normalizeButton")}</Button>}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving || total !== 100} className="w-full bg-purple-600 hover:bg-purple-700">
          {saving ? t("admin.hr.appraisal.weightingCard.savingButton") : t("admin.hr.appraisal.weightingCard.saveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
