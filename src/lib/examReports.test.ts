import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExamRecord } from "@/lib/examStore";
import type { SubjectAssignment } from "@/lib/timetableRules";

// ── mock jsPDF (constructor + chained drawing calls used by the download*PDF fns) ──
const jsPDFInstance = {
  internal: { pageSize: { getWidth: () => 297 } },
  setFontSize: vi.fn().mockReturnThis(),
  setFont: vi.fn().mockReturnThis(),
  setTextColor: vi.fn().mockReturnThis(),
  setFillColor: vi.fn().mockReturnThis(),
  setDrawColor: vi.fn().mockReturnThis(),
  text: vi.fn().mockReturnThis(),
  rect: vi.fn().mockReturnThis(),
  line: vi.fn().mockReturnThis(),
  addPage: vi.fn().mockReturnThis(),
  save: vi.fn(),
};
vi.mock("jspdf", () => ({
  default: vi.fn(() => jsPDFInstance),
}));

vi.mock("@/lib/seatingReports", () => ({
  drawTable: vi.fn(),
}));

import {
  loadExamStudents,
  hasAnyMarks,
  computeResultSummary,
  computeSubjectAnalysis,
  computePassFail,
  computeTeacherPerformance,
  computeTopperList,
  downloadResultSummaryPDF,
  downloadResultSummaryCSV,
  downloadSubjectAnalysisPDF,
  downloadPassFailPDF,
  downloadPassFailCSV,
  downloadTeacherPerformancePDF,
  downloadTopperListPDF,
  downloadTopperListCSV,
  downloadBulkReportCardsPDF,
  printBulkReportCards,
  printReportTable,
  type ExamStudentMini,
  type ExamMarksMap,
  type ResultSummaryRow,
} from "./examReports";
import { drawTable } from "@/lib/seatingReports";

// ── fixtures ─────────────────────────────────────────────────────────────────
function baseExam(overrides: Partial<ExamRecord> = {}): ExamRecord {
  return {
    id: "exam-1",
    name: "Mid Term - 1",
    type: "Midterm",
    grade: "Grade 6",
    section: "All Sections",
    sections: [],
    subjects: "2 Subjects",
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    appeared: 0,
    total: 0,
    status: "Scheduled" as any,
    slots: [
      { subject: "Mathematics", date: "2026-07-01", start: "09:00", end: "10:00", invigilator: "", room: "" },
      { subject: "Science", date: "2026-07-02", start: "09:00", end: "10:00", invigilator: "", room: "" },
    ],
    published: true,
    maxMarks: 100,
    passingMarks: 40,
    ...overrides,
  } as unknown as ExamRecord;
}

function student(overrides: Partial<ExamStudentMini> = {}): ExamStudentMini {
  return { id: "s1", name: "Aisha Khan", grade: "Grade 6", section: "A", rollNo: "101", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── loadExamStudents ─────────────────────────────────────────────────────────
describe("loadExamStudents", () => {
  it("maps raw student records to ExamStudentMini and includes only those matching the exam's grade/section", () => {
    const exam = baseExam();
    const raw = [
      { id: "1", name: "Aisha", grade: "6", section: "a" },
      { studentId: "2", studentName: "Ben", gradeLevel: "Grade 7", section: "A" }, // wrong grade
    ];
    const result = loadExamStudents(exam, raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "1", name: "Aisha", grade: "6", section: "A" });
  });

  it("falls back to alternate id/name/roll fields when primary fields are absent", () => {
    const exam = baseExam();
    const raw = [{ uid: "u9", displayName: "Carlos", grade: "Grade 6", section: "A", admissionNumber: "AD9" }];
    const result = loadExamStudents(exam, raw);
    expect(result[0]).toMatchObject({ id: "u9", name: "Carlos", rollNo: "AD9" });
  });

  it("defaults name to 'Student' when no name field is present", () => {
    const exam = baseExam();
    const result = loadExamStudents(exam, [{ id: "1", grade: "Grade 6", section: "A" }]);
    expect(result[0].name).toBe("Student");
  });

  it("filters out records with no resolvable id", () => {
    const exam = baseExam();
    const result = loadExamStudents(exam, [{ grade: "Grade 6", section: "A" }]);
    expect(result).toHaveLength(0);
  });

  it("returns an empty array when allStudents is null/undefined", () => {
    const exam = baseExam();
    expect(loadExamStudents(exam, null as any)).toEqual([]);
    expect(loadExamStudents(exam, undefined as any)).toEqual([]);
  });

  it("uppercases the section field", () => {
    const exam = baseExam();
    const result = loadExamStudents(exam, [{ id: "1", grade: "Grade 6", section: "a" }]);
    expect(result[0].section).toBe("A");
  });

  it("excludes a student whose grade does not appear in any exam grade plan", () => {
    const exam = baseExam({ grade: "Grade 6", gradePlans: undefined } as any);
    const result = loadExamStudents(exam, [{ id: "1", grade: "Grade 9", section: "A" }]);
    expect(result).toHaveLength(0);
  });

  it("matches a specific section against an exam scoped to that section only", () => {
    const exam = baseExam({ section: "B", sections: ["B"] });
    const inSection = loadExamStudents(exam, [{ id: "1", grade: "Grade 6", section: "B" }]);
    const outOfSection = loadExamStudents(exam, [{ id: "2", grade: "Grade 6", section: "C" }]);
    expect(inSection).toHaveLength(1);
    expect(outOfSection).toHaveLength(0);
  });
});

// ── hasAnyMarks ──────────────────────────────────────────────────────────────
describe("hasAnyMarks", () => {
  it("returns false when the exam has no entry at all", () => {
    expect(hasAnyMarks({}, "exam-1")).toBe(false);
  });

  it("returns false when the exam exists but every subject map is empty", () => {
    const marks: ExamMarksMap = { "exam-1": { Mathematics: {} } };
    expect(hasAnyMarks(marks, "exam-1")).toBe(false);
  });

  it("returns true when at least one subject has at least one mark", () => {
    const marks: ExamMarksMap = { "exam-1": { Mathematics: {}, Science: { s1: 80 } } };
    expect(hasAnyMarks(marks, "exam-1")).toBe(true);
  });

  it("handles a null/undefined subject bucket gracefully", () => {
    const marks: ExamMarksMap = { "exam-1": { Mathematics: undefined as any } };
    expect(hasAnyMarks(marks, "exam-1")).toBe(false);
  });
});

// ── computeResultSummary ─────────────────────────────────────────────────────
describe("computeResultSummary", () => {
  it("computes obtained/max totals, percentage and letter grade for a fully-graded student", () => {
    const exam = baseExam();
    const students = [student()];
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 }, Science: { s1: 70 } } };
    const rows = computeResultSummary(exam, students, marks);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.obtainedTotal).toBe(160);
    expect(r.maxTotal).toBe(200);
    expect(r.percentage).toBe(80);
    expect(r.letter).toBe("A"); // 80 -> "A" per letterFromPct
    expect(r.result).toBe("Pass");
  });

  it("marks a student Incomplete when not all subjects have marks entered, but still computes a letter from the graded subset", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 } } }; // Science missing
    const rows = computeResultSummary(exam, [student()], marks);
    expect(rows[0].result).toBe("Incomplete");
    // letter is computed from whatever WAS graded (100% on the one graded subject), even
    // though the student is Incomplete overall — letter only falls back to "—" when
    // graded.length === 0.
    expect(rows[0].letter).toBe("A+");
  });

  it("shows letter '—' only when zero subjects are graded at all", () => {
    const exam = baseExam();
    const rows = computeResultSummary(exam, [student()], {});
    expect(rows[0].letter).toBe("—");
  });

  it("marks a student Incomplete (not Fail) when zero subjects are graded", () => {
    const exam = baseExam();
    const rows = computeResultSummary(exam, [student()], {});
    expect(rows[0].result).toBe("Incomplete");
    expect(rows[0].obtainedTotal).toBe(0);
    expect(rows[0].percentage).toBe(0);
  });

  it("marks Fail when fully graded but below the passing percentage", () => {
    const exam = baseExam({ maxMarks: 100, passingMarks: 40 });
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 20 }, Science: { s1: 30 } } };
    const rows = computeResultSummary(exam, [student()], marks);
    expect(rows[0].percentage).toBe(25);
    expect(rows[0].result).toBe("Fail");
  });

  it("treats a mark of exactly the passing percentage as Pass (>=)", () => {
    const exam = baseExam({ maxMarks: 100, passingMarks: 40 });
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 40 }, Science: { s1: 40 } } };
    const rows = computeResultSummary(exam, [student()], marks);
    expect(rows[0].percentage).toBe(40);
    expect(rows[0].result).toBe("Pass");
  });

  it("treats mark 0 as a real entered mark, not as missing", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 0 }, Science: { s1: 0 } } };
    const rows = computeResultSummary(exam, [student()], marks);
    expect(rows[0].result).not.toBe("Incomplete");
    expect(rows[0].obtainedTotal).toBe(0);
    expect(rows[0].result).toBe("Fail");
  });

  it("defaults maxMarks to 100 when exam.maxMarks is falsy", () => {
    const exam = baseExam({ maxMarks: undefined as any });
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 50 }, Science: { s1: 50 } } };
    const rows = computeResultSummary(exam, [student()], marks);
    expect(rows[0].subjects[0].maxMarks).toBe(100);
  });

  it("sorts by grade, then section, then percentage descending", () => {
    const exam = baseExam({
      gradePlans: [
        {
          grade: "Grade 6", section: "All Sections", sections: [], subjects: "2 Subjects",
          startDate: "2026-07-01", endDate: "2026-07-05", appeared: 0, total: 0,
          slots: [
            { subject: "Mathematics", date: "2026-07-01", start: "09:00", end: "10:00", invigilator: "", room: "" },
            { subject: "Science", date: "2026-07-02", start: "09:00", end: "10:00", invigilator: "", room: "" },
          ],
        },
      ],
    } as any);
    const students = [
      student({ id: "s1", grade: "Grade 6", section: "B" }),
      student({ id: "s2", grade: "Grade 6", section: "A" }),
      student({ id: "s3", grade: "Grade 6", section: "A" }),
    ];
    const marks: ExamMarksMap = {
      "exam-1": {
        Mathematics: { s1: 90, s2: 60, s3: 95 },
        Science: { s1: 90, s2: 60, s3: 95 },
      },
    };
    const rows = computeResultSummary(exam, students, marks);
    // Section A rows first (s3 then s2 by pct desc), then section B (s1)
    expect(rows.map(r => r.studentId)).toEqual(["s3", "s2", "s1"]);
  });

  it("returns an empty subjects array for a student with no matching grade plan slots", () => {
    const exam = baseExam();
    const rows = computeResultSummary(exam, [student({ grade: "Grade 9" })], {});
    expect(rows).toHaveLength(1);
    expect(rows[0].subjects).toEqual([]);
    expect(rows[0].result).toBe("Incomplete");
  });
});

// ── computeSubjectAnalysis ────────────────────────────────────────────────────
describe("computeSubjectAnalysis", () => {
  it("computes highest/lowest/average/pass stats per subject", () => {
    const exam = baseExam({ passingMarks: 40 });
    const students = [student({ id: "s1" }), student({ id: "s2" })];
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90, s2: 30 } } };
    const rows = computeSubjectAnalysis(exam, students, marks);
    expect(rows).toHaveLength(1);
    const math = rows[0];
    expect(math.subject).toBe("Mathematics");
    expect(math.entries).toBe(2);
    expect(math.highest).toBe(90);
    expect(math.lowest).toBe(30);
    expect(math.average).toBe(60);
    expect(math.passCount).toBe(1);
    expect(math.failCount).toBe(1);
    expect(math.passRate).toBe(50);
  });

  it("excludes subjects with zero entries entirely (no NaN rows)", () => {
    const exam = baseExam();
    const rows = computeSubjectAnalysis(exam, [student()], {});
    expect(rows).toEqual([]);
  });

  it("sorts subjects alphabetically", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 50 }, Science: { s1: 50 } } };
    const rows = computeSubjectAnalysis(exam, [student()], marks);
    expect(rows.map(r => r.subject)).toEqual(["Mathematics", "Science"]);
  });

  it("ignores non-numeric mark values", () => {
    const exam = baseExam();
    const marks: any = { "exam-1": { Mathematics: { s1: "absent" } } };
    const rows = computeSubjectAnalysis(exam, [student()], marks);
    expect(rows).toEqual([]);
  });
});

// ── computePassFail ────────────────────────────────────────────────────────
describe("computePassFail", () => {
  it("groups by grade+section and computes pass rate over graded (non-incomplete) students", () => {
    const exam = baseExam({ passingMarks: 40 });
    const students = [
      student({ id: "s1", section: "A" }),
      student({ id: "s2", section: "A" }),
      student({ id: "s3", section: "A" }), // incomplete
    ];
    const marks: ExamMarksMap = {
      "exam-1": {
        Mathematics: { s1: 90, s2: 20 }, // s3 missing entirely -> incomplete
        Science: { s1: 90, s2: 20 },
      },
    };
    const rows = computePassFail(exam, students, marks);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.grade).toBe("Grade 6");
    expect(row.section).toBe("A");
    expect(row.totalStudents).toBe(3);
    expect(row.passed).toBe(1);
    expect(row.failed).toBe(1);
    expect(row.incomplete).toBe(1);
    expect(row.passRate).toBe(50); // 1 pass / (1 pass + 1 fail)
  });

  it("passRate is 0 when there are no graded (pass+fail) students at all", () => {
    const exam = baseExam();
    const rows = computePassFail(exam, [student()], {});
    expect(rows[0].passRate).toBe(0);
    expect(rows[0].incomplete).toBe(1);
  });

  it("sorts groups by grade then section", () => {
    const exam = baseExam({
      gradePlans: [
        {
          grade: "Grade 6", section: "All Sections", sections: [], subjects: "2 Subjects",
          startDate: "2026-07-01", endDate: "2026-07-05", appeared: 0, total: 0,
          slots: [{ subject: "Mathematics", date: "2026-07-01", start: "09:00", end: "10:00", invigilator: "", room: "" }],
        },
      ],
    } as any);
    const students = [
      student({ id: "s1", section: "B" }),
      student({ id: "s2", section: "A" }),
    ];
    const rows = computePassFail(exam, students, {});
    expect(rows.map(r => r.section)).toEqual(["A", "B"]);
  });
});

// ── computeTeacherPerformance ─────────────────────────────────────────────────
describe("computeTeacherPerformance", () => {
  function assignment(overrides: Partial<SubjectAssignment> = {}): SubjectAssignment {
    return { subject: "Mathematics", grade: "Grade 6", section: "A", teacherName: "Ms. Rao", ...overrides } as SubjectAssignment;
  }

  it("attributes marks to the matching teacher assignment by subject/grade/section", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 }, Science: { s1: 60 } } };
    const rows = computeTeacherPerformance(exam, [student()], marks, [assignment()]);
    const math = rows.find(r => r.subject === "Mathematics")!;
    expect(math.teacherName).toBe("Ms. Rao");
    expect(math.average).toBe(90);
    expect(math.entries).toBe(1);
  });

  it("labels the row 'Unassigned' when no matching subject assignment exists", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 } } };
    const rows = computeTeacherPerformance(exam, [student()], marks, []);
    expect(rows[0].teacherName).toBe("Unassigned");
  });

  it("computes passRate per subject/grade/section bucket using exam.passingMarks", () => {
    const exam = baseExam({ passingMarks: 50 });
    const students = [student({ id: "s1" }), student({ id: "s2" })];
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90, s2: 10 } } };
    const rows = computeTeacherPerformance(exam, students, marks, [assignment()]);
    expect(rows[0].passRate).toBe(50);
  });

  it("matches assignment case-insensitively for subject and section", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 } } };
    const rows = computeTeacherPerformance(exam, [student()], marks, [assignment({ subject: "mathematics", section: "a" })]);
    expect(rows[0].teacherName).toBe("Ms. Rao");
  });

  it("sorts rows by teacher name then subject", () => {
    const exam = baseExam();
    const marks: ExamMarksMap = { "exam-1": { Mathematics: { s1: 90 }, Science: { s1: 60 } } };
    const rows = computeTeacherPerformance(exam, [student()], marks, [
      assignment({ subject: "Mathematics", teacherName: "Zed" }),
      assignment({ subject: "Science", teacherName: "Amy" }),
    ]);
    expect(rows.map(r => r.teacherName)).toEqual(["Amy", "Zed"]);
  });
});

// ── computeTopperList ─────────────────────────────────────────────────────────
describe("computeTopperList", () => {
  it("ranks graded students by percentage descending and excludes incomplete ones", () => {
    const exam = baseExam();
    const students = [
      student({ id: "s1" }),
      student({ id: "s2" }),
      student({ id: "s3" }), // incomplete
    ];
    const marks: ExamMarksMap = {
      "exam-1": {
        Mathematics: { s1: 70, s2: 95 }, // s3 has no marks
        Science: { s1: 70, s2: 95 },
      },
    };
    const toppers = computeTopperList(exam, students, marks);
    expect(toppers).toHaveLength(2);
    expect(toppers[0]).toMatchObject({ rank: 1, studentId: "s2", percentage: 95 });
    expect(toppers[1]).toMatchObject({ rank: 2, studentId: "s1", percentage: 70 });
  });

  it("respects the topN limit", () => {
    const exam = baseExam();
    const students = Array.from({ length: 5 }, (_, i) => student({ id: `s${i}` }));
    const marks: ExamMarksMap = { "exam-1": { Mathematics: {}, Science: {} } };
    students.forEach((s, i) => {
      (marks["exam-1"].Mathematics as any)[s.id] = 50 + i;
      (marks["exam-1"].Science as any)[s.id] = 50 + i;
    });
    const toppers = computeTopperList(exam, students, marks, 2);
    expect(toppers).toHaveLength(2);
    expect(toppers[0].studentId).toBe("s4");
    expect(toppers[1].studentId).toBe("s3");
  });

  it("returns an empty list when every student is incomplete", () => {
    const exam = baseExam();
    const toppers = computeTopperList(exam, [student()], {});
    expect(toppers).toEqual([]);
  });
});

// ── download*PDF / CSV / print functions (external boundaries mocked) ────────
describe("PDF/CSV/print export functions", () => {
  const sampleRow: ResultSummaryRow = {
    studentId: "s1", name: "Aisha Khan", grade: "Grade 6", section: "A", rollNo: "101",
    subjects: [{ subject: "Mathematics", mark: 90, maxMarks: 100, pct: 90 }],
    obtainedTotal: 90, maxTotal: 100, percentage: 90, letter: "A", result: "Pass",
  };

  it("downloadResultSummaryPDF draws a table and saves a filename derived from the exam name", () => {
    downloadResultSummaryPDF("Mid Term - 1", [sampleRow], ["Mathematics"]);
    expect(drawTable).toHaveBeenCalledTimes(1);
    expect(jsPDFInstance.save).toHaveBeenCalledWith("Mid-Term---1-result-summary.pdf");
  });

  it("downloadResultSummaryCSV creates and clicks an anchor for download", () => {
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: any) => {
      const el = origCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    downloadResultSummaryCSV("Mid Term - 1", [sampleRow], ["Mathematics"]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    (document.createElement as any).mockRestore();
  });

  it("downloadSubjectAnalysisPDF / downloadPassFailPDF / downloadTeacherPerformancePDF / downloadTopperListPDF all save without throwing", () => {
    downloadSubjectAnalysisPDF("Exam", [{ subject: "Math", entries: 1, highest: 1, lowest: 1, average: 1, passCount: 1, failCount: 0, passRate: 100 }]);
    downloadPassFailPDF("Exam", [{ grade: "Grade 6", section: "A", totalStudents: 1, passed: 1, failed: 0, incomplete: 0, passRate: 100 }]);
    downloadTeacherPerformancePDF("Exam", [{ teacherName: "Ms. Rao", subject: "Math", grade: "Grade 6", section: "A", entries: 1, average: 90, passRate: 100 }]);
    downloadTopperListPDF("Exam", [{ rank: 1, studentId: "s1", name: "Aisha", grade: "Grade 6", section: "A", rollNo: "101", percentage: 90, letter: "A" }]);
    expect(jsPDFInstance.save).toHaveBeenCalledTimes(4);
  });

  it("downloadPassFailCSV and downloadTopperListCSV trigger a download without throwing", () => {
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
    expect(() => downloadPassFailCSV("Exam", [{ grade: "Grade 6", section: "A", totalStudents: 1, passed: 1, failed: 0, incomplete: 0, passRate: 100 }])).not.toThrow();
    expect(() => downloadTopperListCSV("Exam", [{ rank: 1, studentId: "s1", name: "Aisha", grade: "Grade 6", section: "A", rollNo: "101", percentage: 90, letter: "A" }])).not.toThrow();
  });

  it("downloadBulkReportCardsPDF adds one page per student after the first and saves once", () => {
    downloadBulkReportCardsPDF("Exam", [sampleRow, { ...sampleRow, studentId: "s2", name: "Ben" }]);
    expect(jsPDFInstance.addPage).toHaveBeenCalledTimes(1);
    expect(jsPDFInstance.save).toHaveBeenCalledTimes(1);
  });

  it("printBulkReportCards opens a window, writes HTML, and triggers print on load", () => {
    const writeSpy = vi.fn();
    const closeSpy = vi.fn();
    const printSpy = vi.fn();
    const focusSpy = vi.fn();
    const fakeWin: any = { document: { write: writeSpy, close: closeSpy }, print: printSpy, focus: focusSpy };
    vi.spyOn(window, "open").mockReturnValue(fakeWin);

    const ok = printBulkReportCards("Exam", [sampleRow]);

    expect(ok).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain("Aisha Khan");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    fakeWin.onload();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(printSpy).toHaveBeenCalledTimes(1);
    (window.open as any).mockRestore();
  });

  it("printBulkReportCards returns false when window.open is blocked (popup blocker)", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const ok = printBulkReportCards("Exam", [sampleRow]);
    expect(ok).toBe(false);
    (window.open as any).mockRestore();
  });

  it("printReportTable escapes HTML in cell values to avoid injection", () => {
    const writeSpy = vi.fn();
    const fakeWin: any = { document: { write: writeSpy, close: vi.fn() }, print: vi.fn(), focus: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakeWin);

    printReportTable("Exam", "Result Summary", "subtitle", ["Name"], [['<script>alert(1)</script>']]);

    expect(writeSpy.mock.calls[0][0]).toContain("&lt;script&gt;");
    expect(writeSpy.mock.calls[0][0]).not.toContain("<script>alert(1)</script>");
    (window.open as any).mockRestore();
  });

  it("printReportTable returns false when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(printReportTable("Exam", "Title", "sub", [], [])).toBe(false);
    (window.open as any).mockRestore();
  });
});
