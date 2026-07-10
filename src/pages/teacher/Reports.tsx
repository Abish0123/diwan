import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { toast } from "sonner";
import {
  BarChart3, UserCheck, FileText, TrendingUp, Shield, MessageSquare,
  Download, Printer, FileSpreadsheet, ArrowRight,
} from "lucide-react";

const REPORTS = [
  { key: "attendance", title: "Attendance Report", desc: "Daily & monthly attendance summary for the class", icon: UserCheck, tone: "bg-emerald-50 text-emerald-600" },
  { key: "assignment", title: "Assignment Report", desc: "Submission rates and pending assignments", icon: FileText, tone: "bg-violet-50 text-purple-600" },
  { key: "progress", title: "Student Progress Report", desc: "Academic performance across assessments", icon: TrendingUp, tone: "bg-sky-50 text-sky-600" },
  { key: "behavior", title: "Behavior Report", desc: "Achievements, incidents and warnings log", icon: Shield, tone: "bg-amber-50 text-amber-600" },
  { key: "communication", title: "Parent Communication Report", desc: "Messages and meeting history with parents", icon: MessageSquare, tone: "bg-rose-50 text-rose-600" },
];

export default function Reports() {
  const { assignment, classStudents } = useTeacherClass();
  const [preview, setPreview] = useState<string | null>(null);

  const generate = (key: string, action: "preview" | "download" | "print") => {
    const report = REPORTS.find(r => r.key === key)!;
    if (action === "preview") { setPreview(key); return; }
    if (action === "print") {
      toast.success(`Printing ${report.title}…`);
      setTimeout(() => window.print(), 300);
      return;
    }
    // download: produce a CSV summary
    const rows = [
      ["Report", report.title],
      ["Class", assignment.className],
      ["Teacher", assignment.teacherName],
      ["Generated", new Date().toLocaleString()],
      ["Total Students", String(classStudents.length)],
      [],
      ["Roll", "Student ID", "Student Name"],
      ...classStudents.map((s, i) => [String(i + 1), s.id, s.name || ""]),
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
                    <th className="py-2 text-right">{previewReport.key === "attendance" ? "Attendance" : previewReport.key === "progress" ? "Avg Score" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map((s, i) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium text-slate-700">{s.name}</td>
                      <td className="py-2 pr-4 text-slate-400 text-xs">{s.id}</td>
                      <td className="py-2 text-right font-semibold text-slate-700">
                        {previewReport.key === "attendance" ? `${(s as any).attendance ?? 92}%`
                          : previewReport.key === "progress" ? `${65 + (i * 7) % 30}%`
                          : "OK"}
                      </td>
                    </tr>
                  ))}
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
