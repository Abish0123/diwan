import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import {
  loadGradebookSources, computeStudentGradebook,
  type GradebookSources, type StudentGradebook,
} from "@/lib/gradebookEngine";
import { usePublishedReportCard, useAllPublishedReportCards, getPrincipalName } from "@/lib/reportCardStore";
import { downloadReportCardPdf } from "@/lib/reportCardPdf";
import { getSchoolName, getSchoolAddress } from "@/lib/transportSettings";
import { cn } from "@/lib/utils";
import { FileCheck, Download, Info, UserCheck, Users2, GraduationCap } from "lucide-react";

function gradeColor(g: string) {
  if (g.startsWith("A")) return "bg-emerald-50 text-emerald-700";
  if (g.startsWith("B")) return "bg-blue-50 text-blue-700";
  if (g === "—") return "bg-slate-100 text-slate-400";
  return "bg-amber-50 text-amber-700";
}

export default function ParentReportCards() {
  const { selected, loading: childrenLoading } = useParentChildren();
  const { curriculum } = useCurriculum();
  const [sources, setSources] = useState<GradebookSources | null>(null);

  useEffect(() => {
    loadGradebookSources().then(setSources).catch(() => setSources(null));
  }, []);

  // Report card is generated FROM the finalized gradebook — identical engine to
  // the student portal, so parent and student always see the same grades.
  const childId = selected ? String((selected as any).studentId ?? selected.id) : "";
  const latestPublished = usePublishedReportCard(childId);
  // Every published term for this child, so a parent can look at a prior
  // term's official report card — previously this page only ever showed the
  // single latest published record with no way to pick an older one, even
  // though the Gradebook page (fixed earlier this session) already lets a
  // parent view a specific term.
  const allPublished = useAllPublishedReportCards(childId);
  const [termOverride, setTermOverride] = useState<string | null>(null);
  useEffect(() => { setTermOverride(null); }, [childId]);
  const published = termOverride
    ? allPublished.find(r => r.term === termOverride) ?? latestPublished
    : latestPublished;

  const gb: StudentGradebook | null = useMemo(() => {
    if (!sources || !selected) return null;
    const band = getBandForGrade(curriculum, selected.grade || "");
    return computeStudentGradebook(
      { id: childId, name: selected.name, grade: selected.grade || "", section: selected.section || "" },
      band, sources
    );
  }, [sources, selected, curriculum, childId]);

  // Published report card wins; otherwise show the live provisional gradebook.
  const rows = published
    ? published.subjects.map(r => ({ subject: r.subject, pct: r.pct, letter: r.letter, obtained: r.obtained, max: r.max }))
    : (gb?.subjects.filter(s => s.hasData) ?? []).map(s => ({
        subject: s.subject, pct: Math.round(s.percentage), letter: s.letter,
        obtained: Math.round(s.obtainedWeighted * 10) / 10, max: s.presentWeight,
      }));
  const overallPct = published ? published.overallPct : (gb ? Math.round(gb.overallPercentage) : 0);
  const overallLetter = published ? published.overallGrade : (gb?.overallLetter ?? "—");

  // Real PDF, built from the same rows/overallPct/overallLetter already
  // rendered on screen — replaces a toast.success() stub that claimed
  // success but never generated a file.
  const handleDownload = async () => {
    if (!selected || rows.length === 0) return;
    const principalName = published?.principalName || await getPrincipalName().catch(() => "");
    downloadReportCardPdf(getSchoolName(), getSchoolAddress(), {
      studentName: selected.name, grade: selected.grade || "", section: selected.section || "",
      term: published?.term || "Current Term", year: published?.year || String(new Date().getFullYear()),
      subjects: rows, overallPct, overallGrade: overallLetter,
      attendancePct: published?.attendancePct ?? null,
      classTeacherRemark: published?.classTeacherRemark, principalRemark: published?.principalRemark,
      teacherName: published?.teacherName, principalName,
      published: !!published,
    });
  };

  if (childrenLoading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                Report Card
                {published ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Published · {published.term}</span>
                ) : rows.length > 0 ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Provisional</span>
                ) : null}
              </h1>
              <p className="text-sm text-slate-400">{selected.name} — {published ? `published by ${published.teacherName}` : "auto-generated from the gradebook"} · {curriculum.shortName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allPublished.length > 1 && (
              <select value={published?.term || ""} onChange={e => setTermOverride(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200">
                {allPublished.map(r => <option key={r.id} value={r.term}>{r.term}</option>)}
              </select>
            )}
            <ChildSwitcher className="w-56" />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-slate-700">No report card available yet</p>
            <p className="text-sm mt-1">It will appear automatically once {selected.name}'s assignments, assessments or exams are graded.</p>
          </div>
        ) : (
          <>
            {/* Summary banner */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-600 rounded-2xl p-6 text-white flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-white/60 text-xs mb-0.5">Overall Grade</p>
                <p className="text-5xl font-black">{overallLetter}</p>
              </div>
              <div className="flex-1 space-y-1 min-w-[160px]">
                <div className="h-2.5 rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white/70" style={{ width: `${overallPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>{overallPct}% overall</span><span>{rows.length} subjects graded</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-xs">Grade {selected.grade} · Section {selected.section}</p>
                <button onClick={handleDownload}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition">
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </div>

            {/* Subject grades */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-black text-slate-900 mb-4">Subject Grades</h3>
              <div className="space-y-2">
                {rows.map(s => (
                  <div key={s.subject} className="flex items-center gap-3">
                    <div className="w-32 text-xs font-medium text-slate-700 flex-shrink-0">{s.subject}</div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 min-w-[40px]">
                      <div className={cn("h-full rounded-full", s.pct >= 80 ? "bg-emerald-500" : s.pct >= 60 ? "bg-amber-500" : "bg-rose-400")} style={{ width: `${s.pct}%` }} />
                    </div>
                    <div className="text-xs text-slate-500 w-20 text-right">{s.obtained}/{s.max}</div>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-black w-10 text-center flex-shrink-0", gradeColor(s.letter))}>{s.letter}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Class teacher remark on a published report card */}
            {published && published.classTeacherRemark && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h4 className="font-bold text-slate-900 mb-2 text-sm flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-purple-600" /> Class Teacher's Remark</h4>
                <p className="text-sm text-slate-600 italic">"{published.classTeacherRemark}"</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              {published
                ? `Official report card published by ${published.teacherName} after approval — the same data ${selected.name} sees in their portal.`
                : `Provisional — generated live from the gradebook (Assignments + Assessments + Exams, weighted per ${curriculum.shortName}). Final grades appear once the school publishes the report card.`}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
