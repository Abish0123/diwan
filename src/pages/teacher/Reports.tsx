import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getBandForGrade } from "@/lib/curriculumConfig";
import { loadGradebookSources, computeStudentGradebook } from "@/lib/gradebookEngine";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import {
  BarChart3, UserCheck, FileText, TrendingUp, Shield,
  Download, Printer, FileSpreadsheet, ArrowRight,
} from "lucide-react";

function normGradeSection(s: string) { return (s || "").toLowerCase().replace(/^grade\s*/, "").trim(); }

// No "Parent Communication Report" tile — no parent-communication log entity
// exists anywhere in this app, so that report could never contain real data.
const REPORTS = [
  { key: "attendance", title: "Attendance Report", desc: "Daily & monthly attendance summary for the class", icon: UserCheck, tone: "bg-emerald-50 text-emerald-600" },
  { key: "assignment", title: "Assignment Report", desc: "Submission rates across assigned work", icon: FileText, tone: "bg-violet-50 text-purple-600" },
  { key: "progress", title: "Student Progress Report", desc: "Academic performance across assessments", icon: TrendingUp, tone: "bg-sky-50 text-sky-600" },
  { key: "behavior", title: "Behavior Report", desc: "Achievements, incidents and warnings log", icon: Shield, tone: "bg-amber-50 text-amber-600" },
];

export default function Reports() {
  const { assignment, classStudents } = useTeacherClass();
  const { curriculum } = useCurriculum();
  const [preview, setPreview] = useState<string | null>(null);

  // Real per-student metrics — previously attendance defaulted to a
  // hardcoded 92%, "progress" was an arbitrary index-based formula
  // unrelated to any real mark, and Behavior always showed a static "OK"
  // for every student regardless of real records.
  const [attendancePct, setAttendancePct] = useState<Record<string, number | null>>({});
  const [progressPct, setProgressPct] = useState<Record<string, number | null>>({});
  const [assignmentPct, setAssignmentPct] = useState<Record<string, number | null>>({});
  const [incidentCount, setIncidentCount] = useState<Record<string, number>>({});
  useEffect(() => {
    if (classStudents.length === 0) return;
    const ids = new Set(classStudents.map(s => s.id));

    smartDb.getAll("attendance", undefined).then((rows) => {
      const byStudent = new Map<string, { present: number; late: number; total: number }>();
      (rows as { studentId?: string; status?: string }[]).forEach(r => {
        if (!r.studentId || !ids.has(r.studentId)) return;
        const cur = byStudent.get(r.studentId) || { present: 0, late: 0, total: 0 };
        cur.total++;
        if (r.status === "Present") cur.present++;
        if (r.status === "Late") cur.late++;
        byStudent.set(r.studentId, cur);
      });
      const pct: Record<string, number | null> = {};
      ids.forEach(id => {
        const s = byStudent.get(id);
        pct[id] = s && s.total > 0 ? Math.round(((s.present + s.late * 0.5) / s.total) * 100) : null;
      });
      setAttendancePct(pct);
    }).catch(() => {});

    // Real weighted subject percentage from the same shared engine the
    // Gradebook/Report Cards use (assignments+assessments+exams, weighted
    // by the curriculum band, with approved MarkOverride corrections
    // applied) — previously this was a hand-rolled flat average over raw
    // ExamMark rows that could (and did) disagree with the real Gradebook.
    loadGradebookSources().then((src) => {
      const band = getBandForGrade(curriculum, assignment.grade || "");
      const pct: Record<string, number | null> = {};
      classStudents.forEach(s => {
        const gb = computeStudentGradebook(
          { id: s.id, name: s.name, grade: assignment.grade || "", section: assignment.section || "" },
          band, src
        );
        const graded = gb.subjects.filter(sub => sub.hasData);
        pct[s.id] = graded.length ? Math.round(gb.overallPercentage) : null;
      });
      setProgressPct(pct);
    }).catch(() => {});

    // Real submission rate: of every assignment actually given to this
    // class/section, how many has each student submitted (or had graded)?
    Promise.all([
      smartDb.getAll("TeacherAssignment", undefined),
      smartDb.getAll("AssignmentSubmission", undefined),
    ]).then(([assignments, submissions]) => {
      const myAssignments = (assignments as { id: string; grade?: string; section?: string }[])
        .filter(a => normGradeSection(a.grade || "") === normGradeSection(assignment.grade || "") &&
          (!a.section || normGradeSection(a.section) === normGradeSection(assignment.section || "")));
      const assignmentIds = new Set(myAssignments.map(a => a.id));
      const total = myAssignments.length;
      const submittedByStudent = new Map<string, Set<string>>();
      (submissions as { assignmentId?: string; studentId?: string; status?: string }[]).forEach(s => {
        if (!s.assignmentId || !s.studentId || !assignmentIds.has(s.assignmentId)) return;
        if (!ids.has(s.studentId)) return;
        if (!submittedByStudent.has(s.studentId)) submittedByStudent.set(s.studentId, new Set());
        submittedByStudent.get(s.studentId)!.add(s.assignmentId);
      });
      const pct: Record<string, number | null> = {};
      ids.forEach(id => {
        pct[id] = total > 0 ? Math.round(((submittedByStudent.get(id)?.size || 0) / total) * 100) : null;
      });
      setAssignmentPct(pct);
    }).catch(() => {});

    smartDb.getAll("BehaviorIncident", undefined).then((rows) => {
      const counts: Record<string, number> = {};
      (rows as { studentId?: string }[]).forEach(r => {
        if (!r.studentId || !ids.has(r.studentId)) return;
        counts[r.studentId] = (counts[r.studentId] || 0) + 1;
      });
      setIncidentCount(counts);
    }).catch(() => {});
  }, [classStudents.map(s => s.id).join(","), curriculum.id, assignment.grade, assignment.section]);

  const generate = (key: string, action: "preview" | "download" | "print") => {
    const report = REPORTS.find(r => r.key === key)!;
    if (action === "preview") { setPreview(key); return; }
    if (action === "print") {
      toast.success(`Printing ${report.title}…`);
      setTimeout(() => window.print(), 300);
      return;
    }
    // download: produce a CSV summary, with the same real per-student
    // metric shown in the preview table (not a fabricated value).
    const metricLabel = key === "attendance" ? "Attendance %" : key === "assignment" ? "Submission Rate %" : key === "progress" ? "Avg Score %" : "Incidents";
    const metricFor = (id: string) => {
      if (key === "attendance") return attendancePct[id] != null ? String(attendancePct[id]) : "No records";
      if (key === "assignment") return assignmentPct[id] != null ? String(assignmentPct[id]) : "No assignments given";
      if (key === "progress") return progressPct[id] != null ? String(progressPct[id]) : "No marks yet";
      return String(incidentCount[id] || 0);
    };
    const rows = [
      ["Report", report.title],
      ["Class", assignment.className],
      ["Teacher", assignment.teacherName],
      ["Generated", new Date().toLocaleString()],
      ["Total Students", String(classStudents.length)],
      [],
      ["Roll", "Student ID", "Student Name", metricLabel],
      ...classStudents.map((s, i) => [String(i + 1), s.id, s.name || "", metricFor(s.id)]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${report.title.replace(/\s+/g, "_")}_${assignment.className.replace(/\s+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${report.title} downloaded`);
  };

  const previewReport = preview ? REPORTS.find(r => r.key === preview)! : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-purple-600" /> Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Generate reports for {assignment.className} · {classStudents.length} students</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {REPORTS.map(r => (
            <div key={r.key} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${r.tone}`}><r.icon className="w-6 h-6" /></div>
              <h3 className="font-bold text-slate-900">{r.title}</h3>
              <p className="text-sm text-slate-500 mt-1 flex-1">{r.desc}</p>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <button onClick={() => generate(r.key, "preview")} className="flex-1 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center justify-center gap-1">
                  Generate <ArrowRight className="w-3 h-3" />
                </button>
                <button onClick={() => generate(r.key, "download")} title="Download CSV" className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-600 hover:border-violet-200 flex items-center justify-center"><Download className="w-4 h-4" /></button>
                <button onClick={() => generate(r.key, "print")} title="Print" className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-600 hover:border-violet-200 flex items-center justify-center"><Printer className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {previewReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${previewReport.tone}`}><previewReport.icon className="w-5 h-5" /></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{previewReport.title}</h2>
                  <p className="text-xs text-slate-400">{assignment.className} · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => generate(previewReport.key, "download")} className="h-9 px-3 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-200"><FileSpreadsheet className="w-3.5 h-3.5" /> CSV</button>
                <button onClick={() => generate(previewReport.key, "print")} className="h-9 px-3 rounded-lg bg-purple-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700"><Printer className="w-3.5 h-3.5" /> Print</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-400 uppercase border-b border-slate-100">
                    <th className="py-2 pr-4">#</th><th className="py-2 pr-4">Student</th><th className="py-2 pr-4">ID</th>
                    <th className="py-2 text-right">{previewReport.key === "attendance" ? "Attendance" : previewReport.key === "assignment" ? "Submission Rate" : previewReport.key === "progress" ? "Avg Score" : "Incidents"}</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map((s, i) => {
                    const att = attendancePct[s.id];
                    const asg = assignmentPct[s.id];
                    const prog = progressPct[s.id];
                    const incidents = incidentCount[s.id] || 0;
                    return (
                      <tr key={s.id} className="border-b border-slate-50">
                        <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium text-slate-700">{s.name}</td>
                        <td className="py-2 pr-4 text-slate-400 text-xs">{s.id}</td>
                        <td className="py-2 text-right font-semibold text-slate-700">
                          {previewReport.key === "attendance" ? (att != null ? `${att}%` : <span className="text-slate-300 font-normal">No records</span>)
                            : previewReport.key === "assignment" ? (asg != null ? `${asg}%` : <span className="text-slate-300 font-normal">No assignments given</span>)
                            : previewReport.key === "progress" ? (prog != null ? `${prog}%` : <span className="text-slate-300 font-normal">No marks yet</span>)
                            : (incidents > 0 ? <span className="text-amber-600">{incidents} incident{incidents === 1 ? "" : "s"}</span> : <span className="text-emerald-600">Clean</span>)}
                        </td>
                      </tr>
                    );
                  })}
                  {classStudents.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No students in this class</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
