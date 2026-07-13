// Who has responded and who hasn't, for the active appraisal cycle — across
// Teacher (self-assessment), Student, and Parent 360°-feedback. Unlike
// FeedbackResultsTab (anonymous scores only), this view legitimately needs
// identity — HR has to know WHICH person to remind, not just how many are
// pending. That's a different, compliance-tracking concern from "what did
// they say," not a contradiction of the anonymity guarantee: nothing here
// ever shows a rating or comment, only submitted/pending status.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, GraduationCap, UserCheck, CheckCircle2, CircleDashed, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { rateableTeachersFrom } from "@/lib/feedbackEligibility";
import { subjectAssignmentRepository } from "@/repositories/SubjectAssignmentRepository";
import { FeedbackSubmission } from "./feedbackSubmissionTypes";

type RoleFilter = "teacher" | "student" | "parent";
type Status = "Submitted" | "Partial" | "Pending" | "N/A";

interface TrackRow {
  id: string;
  name: string;
  meta: string;
  status: Status;
  detail: string;
}

const STATUS_LABEL_KEYS: Record<Status, string> = {
  Submitted: "admin.hr.appraisal.submissionTrackingTab.statusSubmitted",
  Partial: "admin.hr.appraisal.submissionTrackingTab.statusPartial",
  Pending: "admin.hr.appraisal.submissionTrackingTab.statusPending",
  "N/A": "admin.hr.appraisal.submissionTrackingTab.statusNA",
};

function statusBadge(status: Status, t: (key: string) => string) {
  switch (status) {
    case "Submitted": return <Badge className="bg-green-100 text-green-700 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" /> {t(STATUS_LABEL_KEYS.Submitted)}</Badge>;
    case "Partial": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><CircleDashed className="h-3 w-3" /> {t(STATUS_LABEL_KEYS.Partial)}</Badge>;
    case "Pending": return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><CircleDashed className="h-3 w-3" /> {t(STATUS_LABEL_KEYS.Pending)}</Badge>;
    default: return <Badge variant="outline" className="gap-1"><MinusCircle className="h-3 w-3" /> {t(STATUS_LABEL_KEYS["N/A"])}</Badge>;
  }
}

const ROLE_TABS: { id: RoleFilter; labelKey: string; icon: typeof Users }[] = [
  { id: "teacher", labelKey: "admin.hr.appraisal.submissionTrackingTab.roleTeacher", icon: UserCheck },
  { id: "student", labelKey: "admin.hr.appraisal.submissionTrackingTab.roleStudent", icon: GraduationCap },
  { id: "parent", labelKey: "admin.hr.appraisal.submissionTrackingTab.roleParent", icon: Users },
];

interface Props {
  cycle: { id: string; title?: string } | null;
  cycleScorecards: { id: string; name: string; role: string; overall: number; status: string }[];
}

export function SubmissionTrackingTab({ cycle, cycleScorecards }: Props) {
  const { t } = useTranslation();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("teacher");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [loading, setLoading] = useState(true);
  const [studentRows, setStudentRows] = useState<TrackRow[]>([]);
  const [parentRows, setParentRows] = useState<TrackRow[]>([]);

  useEffect(() => {
    if (!cycle) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [students, classes, assignments, submissions] = await Promise.all([
          smartDb.getAll("Student", undefined) as Promise<any[]>,
          smartDb.getAll("Class", undefined) as Promise<any[]>,
          subjectAssignmentRepository.getAll(),
          smartDb.getAll("FeedbackSubmission", undefined) as Promise<FeedbackSubmission[]>,
        ]);
        if (!active) return;

        const cycleSubs = submissions.filter((s) => s.cycleId === cycle.id);
        const studentSubCounts = new Map<string, Set<string>>(); // studentId -> distinct teacherName submitted
        const parentSubCounts = new Map<string, Set<string>>();
        cycleSubs.forEach((s) => {
          const map = s.submitterRole === "parent" ? parentSubCounts : studentSubCounts;
          const set = map.get(s.studentId) || new Set<string>();
          set.add(s.teacherName);
          map.set(s.studentId, set);
        });

        const sRows: TrackRow[] = [];
        const pRows: TrackRow[] = [];
        students.filter((s) => s.grade).forEach((s) => {
          const eligible = rateableTeachersFrom(s.grade, s.section, "student", classes, assignments);
          const done = studentSubCounts.get(s.id)?.size || 0;
          const status: Status = eligible.length === 0 ? "N/A" : done >= eligible.length ? "Submitted" : done > 0 ? "Partial" : "Pending";
          sRows.push({ id: s.id, name: s.name || "—", meta: `${s.grade}${s.section ? ` · ${s.section}` : ""}`, status, detail: t("admin.hr.appraisal.submissionTrackingTab.detailTeachersFraction", { done, total: eligible.length }) });

          const parentEmail = s.fatherEmail || s.motherEmail || s.guardianEmail;
          const eligibleParent = rateableTeachersFrom(s.grade, s.section, "parent", classes, assignments);
          const doneParent = parentSubCounts.get(s.id)?.size || 0;
          const pStatus: Status = !parentEmail || eligibleParent.length === 0 ? "N/A" : doneParent >= eligibleParent.length ? "Submitted" : doneParent > 0 ? "Partial" : "Pending";
          pRows.push({ id: s.id, name: s.fatherName || s.motherName || s.guardianName || t("admin.hr.appraisal.submissionTrackingTab.parentOfStudent", { name: s.name }), meta: `${s.name} · ${s.grade}${s.section ? ` · ${s.section}` : ""}`, status: pStatus, detail: t("admin.hr.appraisal.submissionTrackingTab.detailTeachersFraction", { done: doneParent, total: eligibleParent.length }) });
        });
        setStudentRows(sRows);
        setParentRows(pRows);
      } catch {
        if (active) { setStudentRows([]); setParentRows([]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [cycle]);

  const teacherRows: TrackRow[] = useMemo(() => cycleScorecards.map((c) => {
    const submitted = c.status === "Self Review Submitted" || (Number(c.overall) || 0) > 0;
    return { id: c.id, name: c.name, meta: c.role, status: submitted ? "Submitted" : "Pending", detail: c.status || t("admin.hr.appraisal.submissionTrackingTab.notStarted") };
  }), [cycleScorecards, t]);

  const rows = roleFilter === "teacher" ? teacherRows : roleFilter === "student" ? studentRows : parentRows;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.meta.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => {
    const submitted = rows.filter((r) => r.status === "Submitted").length;
    const pending = rows.filter((r) => r.status === "Pending" || r.status === "Partial").length;
    return { total: rows.length, submitted, pending };
  }, [rows]);

  if (!cycle) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("admin.hr.appraisal.submissionTrackingTab.noActiveCycle")}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {ROLE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setRoleFilter(tab.id); setStatusFilter("all"); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                roleFilter === tab.id ? "bg-[#9810fa] text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" /> {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{t("admin.hr.appraisal.submissionTrackingTab.loadingStatus")}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-slate-900">{counts.total}</p>
              <p className="text-xs text-slate-400">{t("admin.hr.appraisal.submissionTrackingTab.statLabelTotal")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-green-600">{counts.submitted}</p>
              <p className="text-xs text-slate-400">{t("admin.hr.appraisal.submissionTrackingTab.statusSubmitted")}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-red-600">{counts.pending}</p>
              <p className="text-xs text-slate-400">{t("admin.hr.appraisal.submissionTrackingTab.statLabelPendingPartial")}</p>
            </CardContent></Card>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("admin.hr.appraisal.submissionTrackingTab.searchPlaceholder")} className="ps-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t("admin.hr.appraisal.submissionTrackingTab.allStatusOption")}</option>
              <option value="Submitted">{t(STATUS_LABEL_KEYS.Submitted)}</option>
              <option value="Partial">{t(STATUS_LABEL_KEYS.Partial)}</option>
              <option value="Pending">{t(STATUS_LABEL_KEYS.Pending)}</option>
              <option value="N/A">{t(STATUS_LABEL_KEYS["N/A"])}</option>
            </select>
          </div>

          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.hr.appraisal.submissionTrackingTab.colName")}</TableHead>
                    <TableHead>{roleFilter === "teacher" ? t("admin.hr.appraisal.submissionTrackingTab.colRole") : roleFilter === "parent" ? t("admin.hr.appraisal.submissionTrackingTab.colChildClass") : t("admin.hr.appraisal.submissionTrackingTab.colGradeSection")}</TableHead>
                    <TableHead>{t("admin.hr.appraisal.submissionTrackingTab.colStatus")}</TableHead>
                    <TableHead>{t("admin.hr.appraisal.submissionTrackingTab.colDetail")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="h-28 text-center text-sm text-gray-400">{t("admin.hr.appraisal.submissionTrackingTab.noMatch")}</TableCell></TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{r.meta}</TableCell>
                      <TableCell>{statusBadge(r.status, t)}</TableCell>
                      <TableCell className="text-xs text-gray-400">{r.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
