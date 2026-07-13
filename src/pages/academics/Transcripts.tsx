import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import { useExams } from "@/lib/examStore";
import { cn } from "@/lib/utils";
import { FileText, Search, Printer, Download, User, GraduationCap, Award, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

const LS_MARKS_KEY = "sd_exam_marks";
function loadMarks() {
  try { return JSON.parse(localStorage.getItem(LS_MARKS_KEY) || "{}"); } catch { return {}; }
}
const LETTER_GRADE = (pct: number) =>
  pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B"
    : pct >= 50 ? "C" : pct >= 40 ? "D" : "F";

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-emerald-700", "A": "text-emerald-600",
  "B+": "text-blue-700", "B": "text-purple-600",
  "C": "text-amber-700", "D": "text-orange-700", "F": "text-rose-700",
};

export default function Transcripts() {
  const { t } = useTranslation();
  const exams = useExams();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  useEffect(() => {
    smartDb.getAll("Student", "").then((all: any[]) => setStudents(all || [])).catch(() => {});
  }, []);

  const allMarks = loadMarks();
  const filteredStudents = students.filter(s =>
    (s.name || s.displayName || "").toLowerCase().includes(search.toLowerCase())
  );
  const selectedStudent = students.find(s => (s.id || s.uid) === selectedUid);

  const transcriptExams = exams.filter(e =>
    (e.status === "Published" || e.status === "Completed") &&
    selectedStudent &&
    (e.grade || "").toLowerCase().replace("grade ", "") ===
      (selectedStudent.grade || selectedStudent.gradeLevel || "").toLowerCase().replace("grade ", "")
  );

  // ── Download: standalone HTML transcript built from the same data the page renders ──
  const downloadTranscript = () => {
    if (!selectedStudent) return;
    const uid = selectedStudent.id || selectedStudent.uid;
    const name = selectedStudent.name || selectedStudent.displayName || "Student";
    const gradeLabel = selectedStudent.grade || selectedStudent.gradeLevel || "–";

    const examBlocks = transcriptExams.map(exam => {
      const examMarks = allMarks[exam.id] || {};
      const subjectRows = exam.slots.map(slot => {
        const m = examMarks[slot.subject]?.[uid] ?? null;
        const lg = m !== null ? LETTER_GRADE(m) : "–";
        return `<tr><td>${slot.subject}</td><td>${m !== null ? `${m}/100` : "–"}</td><td>${m !== null ? `${m}%` : "–"}</td><td>${lg}</td></tr>`;
      }).join("");
      const scored = exam.slots
        .map(slot => examMarks[slot.subject]?.[uid])
        .filter((v: unknown): v is number => typeof v === "number");
      const total = scored.reduce((a, b) => a + b, 0);
      const maxTotal = scored.length * 100;
      const overallPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
      const totalRow = overallPct !== null
        ? `<tr class="total"><td>${t('admin.academics.transcripts.total')}</td><td>${total}/${maxTotal}</td><td>${overallPct}%</td><td>${LETTER_GRADE(overallPct)}</td></tr>`
        : "";
      return `<h3>${exam.name} <span class="meta">${exam.type} · ${exam.startDate} – ${exam.endDate}</span></h3>
<table><thead><tr><th>${t('admin.academics.transcripts.subject')}</th><th>${t('admin.academics.transcripts.marks')}</th><th>%</th><th>${t('admin.academics.transcripts.grade')}</th></tr></thead><tbody>${subjectRows}${totalRow}</tbody></table>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Transcript-${name}</title>
<style>body{font-family:sans-serif;padding:32px;max-width:720px;margin:0 auto;color:#0f172a}h1{color:#7C3AED;margin-bottom:4px}
.sub{color:#64748b;font-size:14px;margin-bottom:24px}h3{margin:28px 0 8px}.meta{font-weight:400;font-size:12px;color:#94a3b8}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:9px 12px;text-align:left;font-size:13px}
th{background:#F9FAFB;font-weight:700;font-size:11px;color:#6B7280;text-transform:uppercase}tr.total td{background:#F5F3FF;font-weight:700}
.empty{padding:24px;background:#F9FAFB;border-radius:10px;color:#94a3b8;font-size:13px;text-align:center}
.footer{margin-top:36px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;text-align:center}
</style></head><body><h1>${t('admin.academics.transcripts.academicTranscript')}</h1>
<p class="sub">${name} · ${gradeLabel} · ${t('admin.academics.transcripts.section')} ${selectedStudent.section || "–"}${selectedStudent.studentId ? ` · ${t('admin.academics.transcripts.idLabel', { id: selectedStudent.studentId })}` : ""} · ${t('admin.academics.transcripts.academicYear')} 2025 – 2026</p>
${examBlocks || `<div class="empty">${t('admin.academics.transcripts.noPublishedResults')}</div>`}
<div class="footer">${t('admin.academics.transcripts.officialFooter')}</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Transcript-${name.replace(/\s+/g, "-")}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F7FF]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-[#7C3AED]" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.transcripts.pageTitle')}</h1>
            </div>
            {selectedStudent && (
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold">
                  <Printer className="h-3.5 w-3.5" /> {t('admin.academics.transcripts.print')}
                </button>
                <button onClick={downloadTranscript}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="h-3.5 w-3.5" /> {t('admin.academics.transcripts.download')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex h-[calc(100vh-120px)]">
          {/* Left: Student picker */}
          <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t('admin.academics.transcripts.searchStudents')}
                  className="w-full ps-8 pe-3 h-9 rounded-lg border border-slate-200 text-[13px] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredStudents.length === 0 && (
                <p className="text-center text-sm text-slate-400 mt-8">{t('admin.academics.transcripts.noStudentsFound')}</p>
              )}
              {filteredStudents.map(s => {
                const uid = s.id || s.uid;
                const isSelected = uid === selectedUid;
                return (
                  <button key={uid} onClick={() => setSelectedUid(uid)}
                    className={cn("w-full text-start rounded-xl p-3 transition-all border",
                      isSelected ? "border-[#7C3AED]/30 bg-violet-50" : "border-transparent hover:bg-slate-50")}>
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                        isSelected ? "bg-[#7C3AED] text-white" : "bg-slate-100 text-slate-600")}>
                        {(s.name || s.displayName || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-[13px] font-semibold truncate", isSelected ? "text-[#7C3AED]" : "text-slate-800")}>
                          {s.name || s.displayName}
                        </p>
                        <p className="text-[11px] text-slate-400">{s.grade || s.gradeLevel} · {s.section || "–"}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Transcript */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedStudent ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-[#7C3AED]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{t('admin.academics.transcripts.selectStudent')}</h3>
                <p className="text-sm text-slate-500">{t('admin.academics.transcripts.selectStudentDesc')}</p>
              </div>
            ) : (
              <div className="space-y-5 print:p-0">
                {/* Student Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#A855F7] flex items-center justify-center text-white font-black text-xl shrink-0">
                      {(selectedStudent.name || selectedStudent.displayName || "?")[0]}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-900">
                        {selectedStudent.name || selectedStudent.displayName}
                      </h2>
                      <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                        <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{selectedStudent.grade || selectedStudent.gradeLevel}</span>
                        <span>{t('admin.academics.transcripts.section')} {selectedStudent.section || "–"}</span>
                        {selectedStudent.studentId && <span>{t('admin.academics.transcripts.idLabel', { id: selectedStudent.studentId })}</span>}
                      </div>
                    </div>
                    <div className="ms-auto text-end">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{t('admin.academics.transcripts.academicYear')}</p>
                      <p className="text-sm font-bold text-slate-700">2025 – 2026</p>
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: t('admin.academics.transcripts.examsAppeared'), value: transcriptExams.length, icon: FileText, color: "text-[#7C3AED]", bg: "bg-violet-50" },
                    { label: t('admin.academics.transcripts.overallGrade'), value: transcriptExams.length > 0 ? "B+" : "–", icon: Award, color: "text-purple-600", bg: "bg-blue-50" },
                    { label: t('admin.academics.transcripts.academicStanding'), value: t('admin.academics.transcripts.good'), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                  ].map(card => (
                    <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", card.bg)}>
                        <card.icon className={cn("h-4.5 w-4.5", card.color)} />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">{card.label}</p>
                        <p className="text-lg font-black text-slate-900">{card.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Exam Records */}
                {transcriptExams.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm font-medium">{t('admin.academics.transcripts.noPublishedResults')}</p>
                    <p className="text-slate-300 text-xs mt-1">{t('admin.academics.transcripts.resultsAppearHere')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transcriptExams.map(exam => {
                      const examMarks = allMarks[exam.id] || {};
                      const uid = selectedStudent.id || selectedStudent.uid;
                      const subjectRows = exam.slots.map(slot => {
                        const m = examMarks[slot.subject]?.[uid] ?? null;
                        const pct = m !== null ? m : null;
                        const lg = pct !== null ? LETTER_GRADE(pct) : "–";
                        return { subject: slot.subject, marks: m, pct, lg };
                      });
                      const scored = subjectRows.filter(r => r.marks !== null);
                      const total = scored.reduce((a, r) => a + (r.marks || 0), 0);
                      const maxTotal = scored.length * 100;
                      const overallPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
                      const overallGrade = overallPct !== null ? LETTER_GRADE(overallPct) : "–";

                      return (
                        <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="bg-slate-50 border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-900 text-[13px]">{exam.name}</h3>
                              <p className="text-[11px] text-slate-400">{exam.type} · {exam.startDate} – {exam.endDate}</p>
                            </div>
                            {overallPct !== null && (
                              <div className="text-end">
                                <p className={cn("text-2xl font-black", GRADE_COLOR[overallGrade] || "text-slate-900")}>{overallGrade}</p>
                                <p className="text-[11px] text-slate-400">{overallPct}%</p>
                              </div>
                            )}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-50">
                                <th className="text-start px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.transcripts.subject')}</th>
                                <th className="text-center px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.transcripts.marks')}</th>
                                <th className="text-center px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">%</th>
                                <th className="text-center px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.transcripts.grade')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subjectRows.map(row => (
                                <tr key={row.subject} className="border-b border-slate-50 last:border-0">
                                  <td className="px-5 py-2.5 font-medium text-slate-700">{row.subject}</td>
                                  <td className="px-4 py-2.5 text-center text-slate-700">
                                    {row.marks !== null ? `${row.marks}/100` : <span className="text-slate-300">–</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-slate-700">
                                    {row.pct !== null ? `${row.pct}%` : <span className="text-slate-300">–</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={cn("font-bold text-[13px]", GRADE_COLOR[row.lg] || "text-slate-400")}>{row.lg}</span>
                                  </td>
                                </tr>
                              ))}
                              {scored.length > 0 && (
                                <tr className="bg-slate-50 border-t-2 border-slate-200">
                                  <td className="px-5 py-2.5 font-black text-slate-900 text-[12px] uppercase tracking-wider">{t('admin.academics.transcripts.total')}</td>
                                  <td className="px-4 py-2.5 text-center font-black text-slate-900">{total}/{maxTotal}</td>
                                  <td className="px-4 py-2.5 text-center font-black text-[#7C3AED]">{overallPct}%</td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={cn("font-black text-[14px]", GRADE_COLOR[overallGrade] || "")}>{overallGrade}</span>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Signature block */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <div className="w-32 border-b-2 border-slate-300 mb-1.5" />
                      <p className="text-[11px] text-slate-400">{t('admin.academics.transcripts.classTeacher')}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-32 border-b-2 border-slate-300 mb-1.5" />
                      <p className="text-[11px] text-slate-400">{t('admin.academics.transcripts.academicCoordinator')}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-32 border-b-2 border-slate-300 mb-1.5" />
                      <p className="text-[11px] text-slate-400">{t('admin.academics.transcripts.principal')}</p>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-slate-300 mt-4">
                    {t('admin.academics.transcripts.officialFooter')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
