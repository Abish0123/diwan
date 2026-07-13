import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Pencil, Trash2, Plus, RotateCcw, ChevronUp, ChevronDown,
  X, MessageSquare, Star, Type,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { smartDb } from "@/lib/localDb";
import {
  FeedbackTemplate, FeedbackQuestion, DEFAULT_FEEDBACK_TEMPLATES, STANDARD_RATING_SCALE,
} from "./feedbackTemplateTypes";

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function newQuestion(text = "New question"): FeedbackQuestion {
  return { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, type: "rating", required: true };
}

export function FeedbackTemplatesManager() {
  const { t: tr } = useTranslation();
  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeedbackTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAudience, setNewAudience] = useState("");
  const [newTargetRole, setNewTargetRole] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = (await smartDb.getAll("FeedbackTemplate", undefined)) as FeedbackTemplate[];
      if (rows.length === 0) {
        // First visit ever — seed the standard 15-template library once.
        // Real, HR-editable rows from here on; this is a one-time bootstrap,
        // not something re-run on every load.
        const now = new Date().toISOString();
        const seeded = DEFAULT_FEEDBACK_TEMPLATES.map((t) => ({ ...t, id: `fbtpl-${t.key}`, createdAt: now, updatedAt: now }));
        await Promise.all(seeded.map((t) => smartDb.create("FeedbackTemplate", t, t.id)));
        setTemplates(seeded as FeedbackTemplate[]);
      } else {
        setTemplates(rows);
      }
    } catch {
      toast.error(tr("admin.hr.appraisal.templatesManager.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, FeedbackTemplate[]>();
    templates.forEach((t) => {
      const g = groups.get(t.audience) || [];
      g.push(t);
      groups.set(t.audience, g);
    });
    return Array.from(groups.entries());
  }, [templates]);

  async function saveTemplate(t: FeedbackTemplate) {
    const patch = { ...t, updatedAt: new Date().toISOString() };
    await smartDb.update("FeedbackTemplate", t.id, patch);
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? patch : x)));
  }

  async function handleDelete(t: FeedbackTemplate) {
    if (!confirm(tr("admin.hr.appraisal.templatesManager.confirmDelete", { name: t.name }))) return;
    await smartDb.delete("FeedbackTemplate", t.id);
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    toast.success(tr("admin.hr.appraisal.templatesManager.toastDeleted", { name: t.name }));
  }

  async function handleRestoreDefault(t: FeedbackTemplate) {
    const original = DEFAULT_FEEDBACK_TEMPLATES.find((d) => d.key === t.key);
    if (!original) return;
    const restored: FeedbackTemplate = { ...original, id: t.id, createdAt: t.createdAt, updatedAt: new Date().toISOString() };
    await smartDb.update("FeedbackTemplate", t.id, restored);
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? restored : x)));
    toast.success(tr("admin.hr.appraisal.templatesManager.toastRestored", { name: t.name }));
  }

  async function handleCreate() {
    if (!newName.trim() || !newAudience.trim() || !newTargetRole.trim()) {
      toast.error(tr("admin.hr.appraisal.templatesManager.toastCreateRequired"));
      return;
    }
    const id = `fbtpl-custom-${slugify(newName)}-${Date.now()}`;
    const now = new Date().toISOString();
    const t: FeedbackTemplate = {
      id, key: id, name: newName.trim(), audience: newAudience.trim(), targetRole: newTargetRole.trim(),
      questions: [newQuestion(tr("admin.hr.appraisal.templatesManager.defaultQuestionText"))], allowComments: true, ratingScale: STANDARD_RATING_SCALE,
      isDefault: false, createdAt: now, updatedAt: now,
    };
    await smartDb.create("FeedbackTemplate", t, id);
    setTemplates((prev) => [...prev, t]);
    setCreateOpen(false);
    setNewName(""); setNewAudience(""); setNewTargetRole("");
    setEditing(t);
    toast.success(tr("admin.hr.appraisal.templatesManager.toastCreated", { name: t.name }));
  }

  if (loading) {
    return <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{tr("admin.hr.appraisal.templatesManager.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">{tr("admin.hr.appraisal.templatesManager.pageTitle")}</h3>
          <p className="text-xs text-slate-400">{tr("admin.hr.appraisal.templatesManager.pageDescription")}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {tr("admin.hr.appraisal.templatesManager.newTemplateButton")}
        </Button>
      </div>

      {grouped.map(([audience, group]) => (
        <div key={audience}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">{audience}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.map((t) => (
              <Card key={t.id} className="hover:border-purple-200 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-bold text-slate-800 leading-tight">{t.name}</p>
                    {t.isDefault && <Badge variant="outline" className="text-[9px] shrink-0">{tr("admin.hr.appraisal.templatesManager.standardBadge")}</Badge>}
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">{tr("admin.hr.appraisal.templatesManager.ratesLabel", { role: t.targetRole })}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-3">
                    <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {t.questions.length === 1 ? tr("admin.hr.appraisal.templatesManager.questionCountSingular", { count: t.questions.length }) : tr("admin.hr.appraisal.templatesManager.questionCountPlural", { count: t.questions.length })}</span>
                    {t.allowComments && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {tr("admin.hr.appraisal.templatesManager.commentsLabel")}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setEditing(t)}>
                      <Pencil className="h-3 w-3" /> {tr("admin.hr.appraisal.templatesManager.editButton")}
                    </Button>
                    {t.isDefault && (
                      <Button size="sm" variant="outline" title={tr("admin.hr.appraisal.templatesManager.restoreStandardTitle")} onClick={() => handleRestoreDefault(t)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-rose-500 hover:text-rose-600" onClick={() => handleDelete(t)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>{tr("admin.hr.appraisal.templatesManager.newTemplateDialogTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{tr("admin.hr.appraisal.templatesManager.templateNameLabel")}</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tr("admin.hr.appraisal.templatesManager.templateNamePlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label>{tr("admin.hr.appraisal.templatesManager.audienceLabel")}</Label>
              <Input value={newAudience} onChange={(e) => setNewAudience(e.target.value)} placeholder={tr("admin.hr.appraisal.templatesManager.audiencePlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label>{tr("admin.hr.appraisal.templatesManager.targetRoleLabel")}</Label>
              <Input value={newTargetRole} onChange={(e) => setNewTargetRole(e.target.value)} placeholder={tr("admin.hr.appraisal.templatesManager.targetRolePlaceholder")} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{tr("admin.hr.appraisal.templatesManager.cancelButton")}</Button>
            <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">{tr("admin.hr.appraisal.templatesManager.createButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <TemplateEditDialog template={editing} onClose={() => setEditing(null)} onSave={saveTemplate} />
    </div>
  );
}

function TemplateEditDialog({ template, onClose, onSave }: { template: FeedbackTemplate | null; onClose: () => void; onSave: (t: FeedbackTemplate) => Promise<void> }) {
  const { t: tr } = useTranslation();
  const [draft, setDraft] = useState<FeedbackTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(template ? { ...template, questions: [...template.questions] } : null); }, [template]);

  if (!draft) return null;

  function updateQuestion(id: string, patch: Partial<FeedbackQuestion>) {
    setDraft((d) => d && { ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  }
  function moveQuestion(id: string, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const idx = d.questions.findIndex((q) => q.id === id);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= d.questions.length) return d;
      const qs = [...d.questions];
      [qs[idx], qs[swapIdx]] = [qs[swapIdx], qs[idx]];
      return { ...d, questions: qs };
    });
  }
  function removeQuestion(id: string) {
    setDraft((d) => d && { ...d, questions: d.questions.filter((q) => q.id !== id) });
  }
  function addQuestion() {
    setDraft((d) => d && { ...d, questions: [...d.questions, newQuestion()] });
  }

  async function handleSave() {
    if (!draft) return;
    if (draft.questions.length === 0) {
      toast.error(tr("admin.hr.appraisal.templatesManager.toastNeedsQuestion"));
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      toast.success(tr("admin.hr.appraisal.templatesManager.toastSaved", { name: draft.name }));
      onClose();
    } catch {
      toast.error(tr("admin.hr.appraisal.templatesManager.toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.name}</DialogTitle>
          <p className="text-xs text-slate-400">{tr("admin.hr.appraisal.templatesManager.audienceToTargetRole", { audience: draft.audience, targetRole: draft.targetRole })}</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2">
              {q.type === "rating" ? <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <Type className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
              <Input value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} className="flex-1 text-sm" />
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => moveQuestion(q.id, -1)} disabled={i === 0} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label={tr("admin.hr.appraisal.templatesManager.moveQuestionUp")}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveQuestion(q.id, 1)} disabled={i === draft.questions.length - 1} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label={tr("admin.hr.appraisal.templatesManager.moveQuestionDown")}><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => removeQuestion(q.id)} className="p-1 text-rose-300 hover:text-rose-600" aria-label={tr("admin.hr.appraisal.templatesManager.removeQuestion")}><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addQuestion} className="text-xs font-semibold text-purple-600 hover:underline flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> {tr("admin.hr.appraisal.templatesManager.addQuestionButton")}
          </button>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 mt-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{tr("admin.hr.appraisal.templatesManager.allowCommentsLabel")}</span>
            </div>
            <Switch checked={draft.allowComments} onCheckedChange={(v) => setDraft((d) => d && { ...d, allowComments: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr("admin.hr.appraisal.templatesManager.cancelButton")}</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? tr("admin.hr.appraisal.templatesManager.savingButton") : tr("admin.hr.appraisal.templatesManager.saveTemplateButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
