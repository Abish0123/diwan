// Student/parent-facing 360°-feedback widget — shows real pending feedback
// requests (see useMyFeedbackRequests) and lets the user fill out and submit
// the real HR-authored question set (see FeedbackTemplatesManager.tsx) right
// here. Renders nothing when there's nothing pending, same convention as
// MyAppraisalWidget.tsx.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareHeart, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useMyFeedbackRequests, FeedbackTarget } from "@/hooks/useMyFeedbackRequests";
import { StarRatingInput } from "@/pages/hr/appraisal/StarRatingInput";
import { FeedbackTemplate, FeedbackQuestion } from "@/pages/hr/appraisal/feedbackTemplateTypes";

interface Props {
  role: "student" | "parent";
  uid: string | undefined;
  studentId: string | undefined;
  grade?: string;
  section?: string;
}

export function FeedbackRequestWidget({ role, uid, studentId, grade, section }: Props) {
  const { t } = useTranslation();
  const { targets, loading, refresh } = useMyFeedbackRequests({ role, uid, studentId, grade, section });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<FeedbackTarget | null>(null);
  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    smartDb.getAll("FeedbackTemplate", undefined).then((rows) => setTemplates(rows as FeedbackTemplate[])).catch(() => setTemplates([]));
  }, [open]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === active?.templateKey),
    [templates, active]
  );

  function startTarget(t: FeedbackTarget) {
    setActive(t);
    setRatings({});
    setTexts({});
    setComments("");
  }

  async function handleSubmit() {
    if (!active || !activeTemplate || !uid || !studentId) return;
    const missing = activeTemplate.questions.some((q: FeedbackQuestion) => q.required && q.type === "rating" && !ratings[q.id]);
    if (missing) { toast.error(t("shared.feedbackWidget.toastMissingRequired")); return; }
    setSubmitting(true);
    try {
      const answers = activeTemplate.questions.map((q: FeedbackQuestion) => ({
        questionId: q.id,
        rating: q.type === "rating" ? ratings[q.id] : undefined,
        text: q.type === "text" ? texts[q.id] : undefined,
      }));
      await smartDb.create(
        "FeedbackSubmission",
        {
          uid,
          templateKey: active.templateKey,
          cycleId: active.cycleId,
          teacherName: active.teacherName,
          subject: active.subject,
          submitterRole: role,
          studentId,
          answers,
          comments: comments.trim() || undefined,
          submittedAt: new Date().toISOString(),
        },
        active.submissionId
      );
      toast.success(t("shared.feedbackWidget.toastSubmitted", { teacherName: active.teacherName }));
      setActive(null);
      refresh();
    } catch {
      toast.error(t("shared.feedbackWidget.toastSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || targets.length === 0) return null;

  return (
    <>
      <Card className="border-none shadow-sm bg-gradient-to-r from-fuchsia-500/10 to-transparent">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-fuchsia-500/10 shrink-0">
              <MessageSquareHeart className="h-5 w-5 text-fuchsia-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("shared.feedbackWidget.pendingTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {targets.length === 1
                  ? t("shared.feedbackWidget.pendingDescriptionOne")
                  : t("shared.feedbackWidget.pendingDescriptionMany", { count: targets.length })}
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white shrink-0" onClick={() => setOpen(true)}>
            {t("shared.feedbackWidget.giveFeedbackButton")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          {!active ? (
            <>
              <DialogHeader><DialogTitle>{t("shared.feedbackWidget.dialogTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-2 py-2">
                {targets.map((target) => (
                  <button
                    key={target.submissionId}
                    onClick={() => startTarget(target)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-start hover:border-fuchsia-300 hover:bg-fuchsia-50/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{target.teacherName}</p>
                      <p className="text-xs text-slate-400">
                        {target.templateKey === "student_class_teacher"
                          ? t("shared.feedbackWidget.classTeacherLabel")
                          : target.subject
                          ? t("shared.feedbackWidget.subjectTeacherWithSubject", { subject: target.subject })
                          : t("shared.feedbackWidget.subjectTeacherLabel")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 rtl:rotate-180" />
                  </button>
                ))}
              </div>
            </>
          ) : !activeTemplate ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("shared.feedbackWidget.loadingForm")}</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{active.teacherName}</DialogTitle>
                <p className="text-xs text-slate-400">{activeTemplate.name} · {t("shared.feedbackWidget.anonymousNote")}</p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {activeTemplate.questions.map((q: FeedbackQuestion) => (
                  <div key={q.id} className="space-y-1.5">
                    <p className="text-sm font-medium text-slate-700">{q.text}{q.required && <span className="text-rose-500"> *</span>}</p>
                    {q.type === "rating" ? (
                      <StarRatingInput value={ratings[q.id] || 0} onChange={(v) => setRatings((r) => ({ ...r, [q.id]: v }))} label={q.text} />
                    ) : (
                      <Textarea value={texts[q.id] || ""} onChange={(e) => setTexts((prev) => ({ ...prev, [q.id]: e.target.value }))} rows={2} />
                    )}
                  </div>
                ))}
                {activeTemplate.allowComments && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-slate-700">{t("shared.feedbackWidget.additionalCommentsLabel")}</p>
                    <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder={t("shared.feedbackWidget.commentsPlaceholder")} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)}>{t("shared.feedbackWidget.backButton")}</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white gap-1.5">
                  {submitting ? t("shared.feedbackWidget.submittingLabel") : <><CheckCircle2 className="h-4 w-4" /> {t("shared.feedbackWidget.submitButton")}</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
