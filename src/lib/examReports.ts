// ─────────────────────────────────────────────────────────────────────────────
// Real, data-backed exam report generators — Result Summary, Subject Analysis,
// Pass/Fail, Teacher Performance, Topper List, Bulk Report Cards. Every number
// here is computed from actual `sd_exam_marks` / ExamMark data for the exam
// the caller selects; nothing is fabricated. If an exam has no marks entered,
// callers should detect that BEFORE calling these (see `hasAnyMarks` in
// Exams.tsx) and show an honest empty state instead of an empty report.
//
// Follows the same jsPDF manual-table style as seatingReports.ts (drawTable)
// and the same dedicated-print-window style as Exams.tsx's printExamTimetable
// (never window.print() on the whole app — that prints the sidebar/header too).
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import { drawTable } from "@/lib/seatingReports";
import { letterFromPct } from "@/lib/gradebookEngine";
import {
  type ExamRecord, type ExamSlot, getGradePlans, examGrades, matchesSection,
} from "@/lib/examStore";
import type { SubjectAssignment } from "@/lib/timetableRules";

// examId → subject → studentId → mark
export type ExamMarksMap = Record<string, Record<string, Record<string, number>>>;

export interface ExamStudentMini {
  id: string;
  name: string;
  grade: string;
  section: string;
  rollNo: string;
}

const normGrade = (g: string) => (g || "").toLowerCase().replace(/^grade\s*/, "").trim();

// A raw student record's `grade` field ("6", "grade 6", "Grade 6") doesn't
// necessarily match an exam's grade-plan key ("Grade 6") verbatim — resolve
// to the exam's own grade string first so matchesSection() gets an exact match.
function resolveExamGrade(studentGrade: string, exam: ExamRecord): string | null {
  const target = normGrade(studentGrade);
  return examGrades(exam).find(g => normGrade(g) === target) || null;
}

function isStudentInExam(student: ExamStudentMini, exam: ExamRecord): boolean {
  const matched = resolveExamGrade(student.grade, exam);
  if (!matched) return false;
  return matchesSection(exam, matched, student.section || "");
}

// The subject-wise slots that actually apply to this student (their own
// grade's plan under a possibly multi-grade exam — different grades can sit
// different subjects on different dates under the same exam name).
function studentSlots(student: ExamStudentMini, exam: ExamRecord): ExamSlot[] {
  const matched = resolveExamGrade(student.grade, exam);
  if (!matched) return [];
  return getGradePlans(exam).find(p => p.grade === matched)?.slots || [];
}

// Real enrolled students who actually sit this exam (grade+section matched
// against the exam's own grade plans) — never a fabricated roster.
export function loadExamStudents(exam: ExamRecord, allStudents: any[]): ExamStudentMini[] {
  return (allStudents || [])
    .map((s: any): ExamStudentMini => ({
      id: String(s.id ?? s.uid ?? s.studentId ?? ""),
      name: s.name ?? s.studentName ?? s.displayName ?? "Student",
      grade: s.grade ?? s.gradeLevel ?? "",
      section: (s.section || "").toUpperCase(),
      rollNo: String(s.rollNo ?? s.roll ?? s.admissionNumber ?? ""),
    }))
    .filter(s => s.id && isStudentInExam(s, exam));
}

export function hasAnyMarks(examMarks: ExamMarksMap, examId: string): boolean {
  const forExam = examMarks[examId];
  if (!forExam) return false;
  return Object.values(forExam).some(bySubject => Object.keys(bySubject || {}).length > 0);
}

// ── 1. Result Summary ───────────────────────────────────────────────────────
export interface ResultSubjectCell { subject: string; mark: number | null; maxMarks: number; pct: number | null }
export interface ResultSummaryRow {
  studentId: string; name: string; grade: string; section: string; rollNo: string;
  subjects: ResultSubjectCell[];
  obtainedTotal: number; maxTotal: number; percentage: number; letter: string;
  result: "Pass" | "Fail" | "Incomplete";
}

export function computeResultSummary(exam: ExamRecord, students: ExamStudentMini[], examMarks: ExamMarksMap): ResultSummaryRow[] {
  const maxMarks = exam.maxMarks || 100;
  const passPct = maxMarks > 0 ? ((exam.passingMarks || 0) / maxMarks) * 100 : 0;

  return students.map(student => {
    const slots = studentSlots(student, exam);
    const subjects: ResultSubjectCell[] = slots.map(sl => {
      const raw = examMarks[exam.id]?.[sl.subject]?.[student.id];
      const mark = typeof raw === "number" ? raw : null;
      return { subject: sl.subject, mark, maxMarks, pct: mark === null ? null : (mark / maxMarks) * 100 };
    });
    const graded = subjects.filter(s => s.mark !== null);
    const obtainedTotal = graded.reduce((a, s) => a + (s.mark || 0), 0);
    const maxTotal = graded.length * maxMarks;
    const percentage = maxTotal > 0 ? (obtainedTotal / maxTotal) * 100 : 0;
    const result: ResultSummaryRow["result"] =
      graded.length === 0 || graded.length < subjects.length ? "Incomplete"
        : percentage >= passPct ? "Pass" : "Fail";
    return {
      studentId: student.id, name: student.name, grade: student.grade, section: student.section, rollNo: student.rollNo,
      subjects, obtainedTotal, maxTotal, percentage,
      letter: graded.length ? letterFromPct(percentage) : "—",
      result,
    };
  }).sort((a, b) => a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section) || b.percentage - a.percentage);
}

export function downloadResultSummaryPDF(examName: string, rows: ResultSummaryRow[], subjectList: string[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Roll No", width: 20 }, { label: "Name", width: 42 },
    { label: "Grade", width: 20 }, { label: "Sec", width: 14 },
    ...subjectList.map(s => ({ label: s.length > 12 ? `${s.slice(0, 11)}…` : s, width: 22 })),
    { label: "Total %", width: 22 }, { label: "Letter", width: 16 }, { label: "Result", width: 22 },
  ];
  const body = rows.map(r => [
    r.rollNo, r.name, r.grade, r.section,
    ...subjectList.map(s => { const c = r.subjects.find(x => x.subject === s); return c?.mark != null ? String(c.mark) : "—"; }),
    r.maxTotal ? `${r.percentage.toFixed(1)}%` : "—", r.letter, r.result,
  ]);
  drawTable(doc, cols, body, 30, examName, `Result Summary Report · ${rows.length} students`);
  doc.save(fname(examName, "result-summary"));
}

export function downloadResultSummaryCSV(examName: string, rows: ResultSummaryRow[], subjectList: string[]) {
  const headers = ["Roll No", "Name", "Grade", "Section", ...subjectList, "Total %", "Letter Grade", "Result"];
  const body = rows.map(r => [
    r.rollNo, r.name, r.grade, r.section,
    ...subjectList.map(s => { const c = r.subjects.find(x => x.subject === s); return c?.mark != null ? String(c.mark) : ""; }),
    r.maxTotal ? r.percentage.toFixed(1) : "", r.letter, r.result,
  ]);
  downloadCSV(headers, body, `${examName.replace(/\s+/g, "-")}-result-summary.csv`);
}

// ── 2. Subject Analysis ─────────────────────────────────────────────────────
export interface SubjectAnalysisRow {
  subject: string; entries: number; highest: number; lowest: number; average: number;
  passCount: number; failCount: number; passRate: number;
}

export function computeSubjectAnalysis(exam: ExamRecord, students: ExamStudentMini[], examMarks: ExamMarksMap): SubjectAnalysisRow[] {
  const bySubject = new Map<string, number[]>();
  students.forEach(student => {
    studentSlots(student, exam).forEach(sl => {
      const raw = examMarks[exam.id]?.[sl.subject]?.[student.id];
      if (typeof raw !== "number") return;
      if (!bySubject.has(sl.subject)) bySubject.set(sl.subject, []);
      bySubject.get(sl.subject)!.push(raw);
    });
  });
  const passMark = exam.passingMarks || 0;
  return Array.from(bySubject.entries()).map(([subject, marks]) => {
    const passCount = marks.filter(m => m >= passMark).length;
    return {
      subject, entries: marks.length,
      highest: Math.max(...marks), lowest: Math.min(...marks),
      average: marks.reduce((a, b) => a + b, 0) / marks.length,
      passCount, failCount: marks.length - passCount,
      passRate: marks.length ? (passCount / marks.length) * 100 : 0,
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

export function downloadSubjectAnalysisPDF(examName: string, rows: SubjectAnalysisRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Subject", width: 55 }, { label: "Entries", width: 25 },
    { label: "Highest", width: 25 }, { label: "Lowest", width: 25 },
    { label: "Average", width: 28 }, { label: "Pass", width: 20 },
    { label: "Fail", width: 20 }, { label: "Pass Rate", width: 28 },
  ];
  const body = rows.map(r => [r.subject, String(r.entries), String(r.highest), String(r.lowest), r.average.toFixed(1), String(r.passCount), String(r.failCount), `${r.passRate.toFixed(1)}%`]);
  drawTable(doc, cols, body, 30, examName, `Subject Analysis · ${rows.length} subject${rows.length === 1 ? "" : "s"}`);
  doc.save(fname(examName, "subject-analysis"));
}

// ── 3. Pass / Fail Report ───────────────────────────────────────────────────
export interface PassFailRow {
  grade: string; section: string; totalStudents: number;
  passed: number; failed: number; incomplete: number; passRate: number;
}

export function computePassFail(exam: ExamRecord, students: ExamStudentMini[], examMarks: ExamMarksMap): PassFailRow[] {
  const summary = computeResultSummary(exam, students, examMarks);
  const groups = new Map<string, ResultSummaryRow[]>();
  summary.forEach(r => {
    const key = `${r.grade}|${r.section}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  return Array.from(groups.entries()).map(([key, rows]) => {
    const [g, s] = key.split("|");
    const passed = rows.filter(r => r.result === "Pass").length;
    const failed = rows.filter(r => r.result === "Fail").length;
    const incomplete = rows.filter(r => r.result === "Incomplete").length;
    const graded = passed + failed;
    return { grade: g, section: s, totalStudents: rows.length, passed, failed, incomplete, passRate: graded ? (passed / graded) * 100 : 0 };
  }).sort((a, b) => a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section));
}

export function downloadPassFailPDF(examName: string, rows: PassFailRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Grade", width: 35 }, { label: "Section", width: 30 },
    { label: "Total Students", width: 38 }, { label: "Passed", width: 25 },
    { label: "Failed", width: 25 }, { label: "Incomplete", width: 32 }, { label: "Pass Rate", width: 30 },
  ];
  const body = rows.map(r => [r.grade, r.section, String(r.totalStudents), String(r.passed), String(r.failed), String(r.incomplete), `${r.passRate.toFixed(1)}%`]);
  drawTable(doc, cols, body, 30, examName, `Pass / Fail Report · ${rows.length} group${rows.length === 1 ? "" : "s"}`);
  doc.save(fname(examName, "pass-fail-report"));
}

export function downloadPassFailCSV(examName: string, rows: PassFailRow[]) {
  const headers = ["Grade", "Section", "Total Students", "Passed", "Failed", "Incomplete", "Pass Rate %"];
  const body = rows.map(r => [r.grade, r.section, String(r.totalStudents), String(r.passed), String(r.failed), String(r.incomplete), r.passRate.toFixed(1)]);
  downloadCSV(headers, body, `${examName.replace(/\s+/g, "-")}-pass-fail-report.csv`);
}

// ── 4. Teacher Performance ──────────────────────────────────────────────────
export interface TeacherPerformanceRow {
  teacherName: string; subject: string; grade: string; section: string;
  entries: number; average: number; passRate: number;
}

export function computeTeacherPerformance(
  exam: ExamRecord, students: ExamStudentMini[], examMarks: ExamMarksMap, subjectAssignments: SubjectAssignment[]
): TeacherPerformanceRow[] {
  const bucket = new Map<string, number[]>();
  students.forEach(student => {
    studentSlots(student, exam).forEach(sl => {
      const raw = examMarks[exam.id]?.[sl.subject]?.[student.id];
      if (typeof raw !== "number") return;
      const key = `${sl.subject}|${student.grade}|${student.section}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(raw);
    });
  });
  const passMark = exam.passingMarks || 0;
  const rows: TeacherPerformanceRow[] = [];
  bucket.forEach((marks, key) => {
    const [subject, grade, section] = key.split("|");
    const assignment = subjectAssignments.find(a =>
      (a.subject || "").toLowerCase() === subject.toLowerCase() &&
      normGrade(a.grade) === normGrade(grade) &&
      (a.section || "").toUpperCase() === section.toUpperCase()
    );
    const passCount = marks.filter(m => m >= passMark).length;
    rows.push({
      teacherName: assignment?.teacherName || "Unassigned",
      subject, grade, section,
      entries: marks.length,
      average: marks.reduce((a, b) => a + b, 0) / marks.length,
      passRate: marks.length ? (passCount / marks.length) * 100 : 0,
    });
  });
  return rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName) || a.subject.localeCompare(b.subject));
}

export function downloadTeacherPerformancePDF(examName: string, rows: TeacherPerformanceRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Teacher", width: 55 }, { label: "Subject", width: 42 },
    { label: "Grade", width: 25 }, { label: "Section", width: 24 },
    { label: "Entries", width: 24 }, { label: "Average", width: 28 }, { label: "Pass Rate", width: 30 },
  ];
  const body = rows.map(r => [r.teacherName, r.subject, r.grade, r.section, String(r.entries), r.average.toFixed(1), `${r.passRate.toFixed(1)}%`]);
  drawTable(doc, cols, body, 30, examName, `Teacher Performance · ${rows.length} subject sitting${rows.length === 1 ? "" : "s"}`);
  doc.save(fname(examName, "teacher-performance"));
}

// ── 5. Topper List ──────────────────────────────────────────────────────────
export interface TopperRow {
  rank: number; studentId: string; name: string; grade: string; section: string;
  rollNo: string; percentage: number; letter: string;
}

export function computeTopperList(exam: ExamRecord, students: ExamStudentMini[], examMarks: ExamMarksMap, topN = 10): TopperRow[] {
  const complete = computeResultSummary(exam, students, examMarks).filter(r => r.result !== "Incomplete");
  const sorted = [...complete].sort((a, b) => b.percentage - a.percentage);
  return sorted.slice(0, topN).map((r, i) => ({
    rank: i + 1, studentId: r.studentId, name: r.name, grade: r.grade, section: r.section,
    rollNo: r.rollNo, percentage: r.percentage, letter: r.letter,
  }));
}

export function downloadTopperListPDF(examName: string, rows: TopperRow[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const cols = [
    { label: "Rank", width: 18 }, { label: "Name", width: 55 },
    { label: "Grade", width: 25 }, { label: "Section", width: 22 },
    { label: "Roll No", width: 25 }, { label: "Percentage", width: 28 }, { label: "Letter", width: 20 },
  ];
  const body = rows.map(r => [String(r.rank), r.name, r.grade, r.section, r.rollNo, `${r.percentage.toFixed(1)}%`, r.letter]);
  drawTable(doc, cols, body, 30, examName, `Topper List — Top ${rows.length}`);
  doc.save(fname(examName, "topper-list"));
}

export function downloadTopperListCSV(examName: string, rows: TopperRow[]) {
  const headers = ["Rank", "Name", "Grade", "Section", "Roll No", "Percentage", "Letter Grade"];
  const body = rows.map(r => [String(r.rank), r.name, r.grade, r.section, r.rollNo, r.percentage.toFixed(1), r.letter]);
  downloadCSV(headers, body, `${examName.replace(/\s+/g, "-")}-topper-list.csv`);
}

// ── 6. Bulk Report Cards ────────────────────────────────────────────────────
// One page per student — subject-wise marks table + total/grade/result. Draws
// its own compact table per page rather than reusing drawTable (which prints
// one title block for the whole document, not per-student).
export function downloadBulkReportCardsPDF(examName: string, rows: ResultSummaryRow[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  rows.forEach((r, idx) => {
    if (idx > 0) doc.addPage();

    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
    doc.text(examName, 14, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text("Individual Report Card", 14, 25);

    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 24, 39);
    doc.text(r.name, 14, 37);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
    doc.text(`Roll No: ${r.rollNo || "—"}   Grade: ${r.grade}   Section: ${r.section}`, 14, 43);

    const cols = [
      { label: "Subject", width: 70 }, { label: "Marks Obtained", width: 42 },
      { label: "Max Marks", width: 36 }, { label: "Percentage", width: 34 },
    ];
    const tableWidth = cols.reduce((a, c) => a + c.width, 0);
    const startX = (pageWidth - tableWidth) / 2;
    const rowH = 8;
    let y = 52;

    doc.setFillColor(243, 244, 246); doc.setDrawColor(229, 231, 235);
    doc.rect(startX, y, tableWidth, rowH, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(75, 85, 99);
    let x = startX;
    cols.forEach(c => { doc.text(c.label, x + 2, y + 5.5); x += c.width; });
    y += rowH;

    doc.setFont("helvetica", "normal"); doc.setTextColor(17, 24, 39); doc.setFontSize(8.5);
    r.subjects.forEach(s => {
      doc.setDrawColor(229, 231, 235);
      doc.rect(startX, y, tableWidth, rowH, "S");
      const values = [s.subject, s.mark != null ? String(s.mark) : "Not entered", String(s.maxMarks), s.pct != null ? `${s.pct.toFixed(1)}%` : "—"];
      let cx = startX;
      cols.forEach((c, ci) => { doc.text(values[ci], cx + 2, y + 5.5, { maxWidth: c.width - 3 }); cx += c.width; });
      y += rowH;
    });

    y += 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(17, 24, 39);
    doc.text(`Total: ${r.obtainedTotal} / ${r.maxTotal}  (${r.maxTotal ? r.percentage.toFixed(1) : "0.0"}%)`, startX, y);
    y += 7;
    doc.text(`Overall Grade: ${r.letter}     Result: ${r.result}`, startX, y);

    y += 22;
    doc.setDrawColor(150);
    doc.line(startX, y, startX + 60, y);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text("Class Teacher", startX, y + 5);
    doc.line(startX + tableWidth - 60, y, startX + tableWidth, y);
    doc.text("Principal", startX + tableWidth - 60, y + 5);
  });

  doc.save(fname(examName, "report-cards-bulk"));
}

export function printBulkReportCards(examName: string, rows: ResultSummaryRow[]) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  const cards = rows.map(r => `
    <section class="card">
      <h1>${escapeHtml(examName)}</h1>
      <p class="meta">Individual Report Card</p>
      <h2>${escapeHtml(r.name)}</h2>
      <p class="sub">Roll No: ${escapeHtml(r.rollNo || "—")} &nbsp;·&nbsp; Grade: ${escapeHtml(r.grade)} &nbsp;·&nbsp; Section: ${escapeHtml(r.section)}</p>
      <table>
        <thead><tr><th>Subject</th><th>Marks Obtained</th><th>Max Marks</th><th>Percentage</th></tr></thead>
        <tbody>
          ${r.subjects.map(s => `<tr><td>${escapeHtml(s.subject)}</td><td>${s.mark != null ? s.mark : "Not entered"}</td><td>${s.maxMarks}</td><td>${s.pct != null ? s.pct.toFixed(1) + "%" : "—"}</td></tr>`).join("")}
        </tbody>
      </table>
      <p class="total"><strong>Total: ${r.obtainedTotal} / ${r.maxTotal} (${r.maxTotal ? r.percentage.toFixed(1) : "0.0"}%)</strong></p>
      <p class="total">Overall Grade: <strong>${escapeHtml(r.letter)}</strong> &nbsp;·&nbsp; Result: <strong>${escapeHtml(r.result)}</strong></p>
      <div class="sig"><span>Class Teacher</span><span>Principal</span></div>
    </section>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(examName)} — Report Cards</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
      .card { page-break-after: always; }
      .card:last-child { page-break-after: auto; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      .meta { color: #6b7280; margin: 0 0 18px; font-size: 12px; }
      h2 { font-size: 15px; margin: 0 0 4px; }
      .sub { color: #6b7280; font-size: 11px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; color: #6b7280; }
      .total { font-size: 12px; margin: 4px 0; }
      .sig { display: flex; justify-content: space-between; margin-top: 40px; }
      .sig span { border-top: 1px solid #9ca3af; padding-top: 4px; width: 140px; text-align: center; font-size: 10px; color: #6b7280; }
      @media print { body { padding: 0; } }
    </style></head>
    <body>${cards}</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  return true;
}

// ── Generic table print (Result Summary, Subject Analysis, Pass/Fail, Teacher
// Performance, Topper List — one flat table, dedicated print window rather
// than window.print() on the whole app, matching printExamTimetable). ────────
export function printReportTable(examName: string, title: string, subtitle: string, headers: string[], rows: string[][]) {
  const win = window.open("", "_blank", "width=1000,height=700");
  if (!win) return false;
  const bodyRows = rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(examName)} — ${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { color: #6b7280; margin: 0 0 20px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; color: #6b7280; }
      @media print { body { padding: 0; } }
    </style></head>
    <body>
      <h1>${escapeHtml(examName)} — ${escapeHtml(title)}</h1>
      <p class="meta">${escapeHtml(subtitle)}</p>
      <table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table>
    </body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  return true;
}

// ── shared helpers ───────────────────────────────────────────────────────────
const fname = (examName: string, suffix: string) => `${examName.replace(/\s+/g, "-")}-${suffix}.pdf`;

function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
