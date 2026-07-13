// HOD/Principal/HR-facing results view — the piece that was still missing
// after students/parents started actually submitting feedback (see
// NotifyFeedbackButton.tsx / FeedbackRequestWidget.tsx). Reads ONLY from
// /api/feedback-aggregate, which computes averages server-side and never
// returns a raw submission row — this view has no way to know which student
// or parent said what, which is what keeps "anonymous" a real guarantee
// rather than a UI convention.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquareQuote, Users, ChevronDown, ChevronUp } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { FeedbackTemplate } from "./feedbackTemplateTypes";

interface Aggregate {
  teacherName: string;
  templateKey: string;
  submissionCount: number;
  averageRating: number | null;
  perQuestionAverage: Record<string, number>;
  comments: string[];
}

const TEMPLATE_LABEL: Record<string, string> = {
  student_class_teacher: "Class Teacher (Students)",
  student_subject_teacher: "Subject Teacher (Students)",
  parent_teacher: "Parent Feedback",
};

const TEMPLATE_LABEL_KEYS: Record<string, string> = {
  student_class_teacher: "admin.hr.appraisal.resultsTab.templateClassTeacher",
  student_subject_teacher: "admin.hr.appraisal.resultsTab.templateSubjectTeacher",
  parent_teacher: "admin.hr.appraisal.resultsTab.templateParentFeedback",
};

function ratingColor(v: number | null) {
  if (v === null) return "text-slate-400";
  if (v >= 4) return "text-emerald-600";
  if (v >= 3) return "text-amber-600";
  return "text-rose-600";
}

export function FeedbackResultsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<{ id: string; title?: string } | null>(null);
  const [aggregates, setAggregates] = useState<Aggregate[]>([]);
  const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [appraisalRows, templateRows] = await Promise.all([
          smartDb.getAll("Appraisal", undefined) as Promise<any[]>,
          smartDb.getAll("FeedbackTemplate", undefined) as Promise<FeedbackTemplate[]>,
        ]);
        if (!active) return;
        setTemplates(templateRows);
        const cycles = appraisalRows.filter((r) => r.type === "cycle");
        const activeCycle = [...cycles].sort(
          (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
        )[0];
        if (!activeCycle) { setCycle(null); setAggregates([]); setLoading(false); return; }
        setCycle(activeCycle);
        // Not under /api/data/*, so the global fetch patch in main.tsx that
        // auto-attaches the session token doesn't apply here — set it
        // explicitly, same value it would have injected.
        const token = sessionStorage.getItem("sd_token");
        const res = await fetch(`/api/feedback-aggregate?cycleId=${encodeURIComponent(activeCycle.id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = res.ok ? await res.json() : [];
        if (active) setAggregates(Array.isArray(data) ? data : []);
      } catch {
        if (active) setAggregates([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const questionTextFor = useMemo(() => {
    const map = new Map<string, string>();
    templates.forEach((t) => t.questions.forEach((q) => map.set(q.id, q.text)));
    return map;
  }, [templates]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Aggregate[]>();
    aggregates.forEach((a) => {
      const g = groups.get(a.templateKey) || [];
      g.push(a);
      groups.set(a.templateKey, g);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [aggregates]);

  if (loading) {
    return <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{t('admin.hr.appraisal.resultsTab.loadingResults')}</div>;
  }

  if (!cycle) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        {t('admin.hr.appraisal.resultsTab.noActiveCycle')}
      </CardContent></Card>
    );
  }

  if (aggregates.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center">
        <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">{t('admin.hr.appraisal.resultsTab.noFeedbackYet', { cycleTitle: cycle.title || cycle.id })}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('admin.hr.appraisal.resultsTab.resultsAppearHere')}</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(([templateKey, rows]) => (
        <div key={templateKey}>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            {TEMPLATE_LABEL_KEYS[templateKey] ? t(TEMPLATE_LABEL_KEYS[templateKey]) : (TEMPLATE_LABEL[templateKey] || templateKey)}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows
              .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))
              .map((row) => {
                const key = `${row.templateKey}-${row.teacherName}`;
                const isOpen = expanded === key;
                return (
                  <Card key={key} className="hover:border-purple-200 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-bold text-slate-800">{row.teacherName}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {row.submissionCount === 1
                            ? t('admin.hr.appraisal.resultsTab.responseCountSingular', { count: row.submissionCount })
                            : t('admin.hr.appraisal.resultsTab.responseCountPlural', { count: row.submissionCount })}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <Star className={`h-4 w-4 fill-current ${ratingColor(row.averageRating)}`} />
                        <span className={`text-lg font-bold ${ratingColor(row.averageRating)}`}>
                          {row.averageRating !== null ? row.averageRating.toFixed(2) : "—"}
                        </span>
                        <span className="text-xs text-slate-400">{t('admin.hr.appraisal.resultsTab.outOfFiveAverage')}</span>
                      </div>
                      <button
                        className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline"
                        onClick={() => setExpanded(isOpen ? null : key)}
                      >
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isOpen ? t('admin.hr.appraisal.resultsTab.hideDetails') : t('admin.hr.appraisal.resultsTab.viewBreakdown')}
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-3 pt-3 border-t border-slate-100">
                          <div className="space-y-1.5">
                            {Object.entries(row.perQuestionAverage).map(([qid, avg]) => (
                              <div key={qid} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-slate-600 flex-1">{questionTextFor.get(qid) || qid}</span>
                                <span className={`font-semibold shrink-0 ${ratingColor(avg)}`}>{avg.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          {row.comments.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                <MessageSquareQuote className="h-3 w-3" /> {t('admin.hr.appraisal.resultsTab.commentsAnonymous', { count: row.comments.length })}
                              </p>
                              <div className="max-h-40 overflow-y-auto space-y-1.5">
                                {row.comments.map((c, i) => (
                                  <p key={i} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">"{c}"</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
