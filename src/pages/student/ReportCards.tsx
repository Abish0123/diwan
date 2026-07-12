import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeStudentGradebook,
  type GradebookSources, type StudentGradebook,
} from "@/lib/gradebookEngine";
import { usePublishedReportCard, getPrincipalName } from "@/lib/reportCardStore";
import { downloadReportCardPdf } from "@/lib/reportCardPdf";
import { getSchoolName, getSchoolAddress } from "@/lib/transportSettings";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileCheck, Download, TrendingUp, BookOpen, UserCheck, Award, Info } from "lucide-react";

function gradeFromPct(p: number) {
  if (p >= 90) return { g: "A+", c: "bg-emerald-100 text-emerald-700" };
  if (p >= 80) return { g: "A",  c: "bg-emerald-100 text-emerald-700" };
  if (p >= 70) return { g: "B+", c: "bg-sky-100 text-sky-700" };
  if (p >= 60) return { g: "B",  c: "bg-sky-100 text-sky-700" };
  if (p >= 50) return { g: "C",  c: "bg-amber-100 text-amber-700" };
  return { g: "F", c: "bg-rose-100 text-rose-700" };
}

export default function StudentReportCards() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { students } = useStudents();
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  // The report card is generated FROM the finalized gradebook — same engine as
  // the gradebook page, so report-card grades always match the gradebook.
  useEffect(() => {
    loadGradebookSources().then(setSources).catch(() => setSources(null));
  }, []);

  useEffect(() => {
    const s = student as any;
    if (!s) return;
    smartDb.getAll("TeacherAttendance", undefined).then((att) => {
      setAttendance((att || []).filter((a: any) => canonGrade(a.grade) === canonGrade(s.grade) && canonSection(a.section) === canonSection(s.section)));
    }).catch(() => {});
  }, [student]);

  const s = student as any;

  // A PUBLISHED report card (teacher-generated, approved) takes precedence; until
  // one is published the student sees the live provisional gradebook computation.
  const published = usePublishedReportCard(s ? String(s.id) : undefined);

  const gb: StudentGradebook | null = useMemo(() => {
    if (!s || !sources) return null;
    const band = getBandForGrade(curriculum, s.grade);
    return computeStudentGradebook({ id: String(s.id), name: s.name, grade: s.grade, section: s.section }, band, sources);
  }, [s, sources, curriculum]);

  const subjectResults = useMemo(() => {
    if (published) {
      return published.subjects.map(r => ({ subject: r.subject, obtained: r.obtained, max: r.max, pct: r.pct, letter: r.letter }));
    }
    if (!gb) return [];
    return gb.subjects.filter(sg => sg.hasData).map(sg => ({
      subject: sg.subject,
      obtained: Math.round(sg.obtainedWeighted * 10) / 10,
      max: sg.presentWeight,
      pct: Math.round(sg.percentage),
      letter: sg.letter,
    }));
  }, [published, gb]);

  const overall = published ? published.overallPct : (gb && subjectResults.length ? Math.round(gb.overallPercentage) : null);

  const attendancePct = useMemo(() => {
    if (!s) return null;
    let present = 0, total = 0;
    attendance.forEach(rec => {
      const v = rec.marks?.[s.id];
      if (v === "P" || v === "A" || v === "L") {
        total++;
        if (v === "P" || v === "L") present++;
      }
    });
    return total > 0 ? Math.round((present / total) * 100) : null;
  }, [attendance, s]);

  const overallGrade = overall !== null ? gradeFromPct(overall) : null;
  const overallLetter = published ? published.overallGrade : (gb?.overallLetter ?? "—");

  // Real PDF, built from the same rows already rendered on screen — replaces
  // window.print() with the same jsPDF generator the parent portal's
  // ReportCards page already uses for this exact published-record shape.
  const handleDownload = async () => {
    if (!s || subjectResults.length === 0) return;
    const principalName = published?.principalName || await getPrincipalName().catch(() => "");
    downloadReportCardPdf(getSchoolName(), getSchoolAddress(), {
      studentName: s.name, grade: String(s.grade || ""), section: String(s.section || ""),
      term: published?.term || "Current Term", year: published?.year || String(new Date().getFullYear()),
      subjects: subjectResults, overallPct: overall ?? 0, overallGrade: overallLetter,
      attendancePct: published?.attendancePct ?? attendancePct,
      classTeacherRemark: published?.classTeacherRemark, principalRemark: published?.principalRemark,
      teacherName: published?.teacherName, principalName,
      published: !!published,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-purple-600" /> {t('student.reportCards.pageTitle')}
              {published ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t('student.reportCards.publishedBadge', { term: published.term })}</span>
              ) : subjectResults.length > 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{t('student.reportCards.provisionalBadge')}</span>
              ) : null}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{published ? t('student.reportCards.issuedBy', { year: published.year, teacher: published.teacherName }) : t('student.reportCards.academicYearDefault')}</p>
          </div>
          <Button variant="outline" onClick={handleDownload} disabled={subjectResults.length === 0} className="h-9 text-xs font-semibold">
            <Download className="h-4 w-4 me-1.5" /> {t('student.reportCards.downloadPdf')}
          </Button>
        </div>

        {/* Student info banner */}
        {s && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center text-xl font-black text-violet-700 flex-shrink-0">
              {s.name?.charAt(0)?.toUpperCase() || "S"}
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-900">{s.name}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-[11px] text-slate-500">{t('student.reportCards.gradeSection', { grade: s.grade, section: s.section })}</span>
                {s.rollNumber && <span className="text-[11px] text-slate-500">{t('student.reportCards.rollNumber', { roll: s.rollNumber })}</span>}
              </div>
            </div>
            {overallGrade && (
              <div className="text-center flex-shrink-0">
                <Badge className={cn("text-lg font-black px-4 py-1.5 border-none", overallGrade.c)}>{overallGrade.g}</Badge>
                <p className="text-[11px] text-slate-400 mt-1">{t('student.reportCards.overallLabel')}</p>
              </div>
            )}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{overall !== null ? `${overall}%` : "—"}</p>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />{t('student.reportCards.academicStat')}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className={cn("text-2xl font-black", attendancePct !== null && attendancePct < 75 ? "text-rose-600" : "text-slate-900")}>
              {attendancePct !== null ? `${attendancePct}%` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1"><UserCheck className="h-3 w-3" />{t('student.reportCards.attendanceStat')}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{subjectResults.length}</p>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1"><BookOpen className="h-3 w-3" />{t('student.reportCards.subjectsStat')}</p>
          </div>
        </div>

        {/* Subject marks table */}
        {subjectResults.length > 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />
              <h3 className="font-bold text-sm text-slate-800">{t('student.reportCards.subjectPerformance')}</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-start px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('student.reportCards.colSubject')}</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('student.reportCards.colMarks')}</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('student.reportCards.colPercent')}</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('student.reportCards.colGrade')}</th>
                </tr>
              </thead>
              <tbody>
                {subjectResults.map(r => {
                  const gr = gradeFromPct(r.pct);
                  return (
                    <tr key={r.subject} className="border-b border-slate-50">
                      <td className="px-5 py-3.5 font-semibold text-slate-800">{r.subject}</td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">{r.obtained}/{r.max}</td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div className={cn("h-full rounded-full", r.pct >= 60 ? "bg-emerald-500" : "bg-rose-400")} style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="font-bold">{r.pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge className={cn("text-[11px] border-none", gr.c)}>{gr.g}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl text-slate-400">
            <FileCheck className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-semibold text-sm">{t('student.reportCards.noDataYet')}</p>
          </div>
        )}

        {/* Class teacher remark (only on a published report card) */}
        {published && published.classTeacherRemark && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h4 className="font-bold text-slate-900 mb-2 text-sm flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-purple-600" /> {t('student.reportCards.classTeacherRemarkTitle')}</h4>
            <p className="text-sm text-slate-600 italic">{t('student.reportCards.quotedRemark', { remark: published.classTeacherRemark })}</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          {published
            ? t('student.reportCards.footerPublished', { teacher: published.teacherName, curriculum: curriculum.shortName })
            : t('student.reportCards.footerProvisional', { curriculum: curriculum.shortName })}
        </div>
      </div>
    </DashboardLayout>
  );
}
