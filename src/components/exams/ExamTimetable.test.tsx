import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// smartDb is a genuine external (MySQL write-through) boundary reached via
// seatingStore.ts's module import chain — stub it out.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn(() => Promise.resolve({})),
    getOne: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
  },
}));

import { ExamTimetable } from "./ExamTimetable";
import { saveSeating, defaultConfig } from "@/lib/seatingStore";
import type { ExamRecord, ExamSlot } from "@/lib/examStore";

function makeSlot(overrides: Partial<ExamSlot> = {}): ExamSlot {
  return {
    subject: "Mathematics",
    date: "2026-08-03",
    start: "09:00",
    end: "11:00",
    invigilator: "Mr. Ali",
    room: "R1",
    ...overrides,
  };
}

function makeExam(overrides: Partial<ExamRecord> = {}): ExamRecord {
  return {
    id: "EXM-1",
    name: "Mid Term - 1",
    type: "Unit Test",
    grade: "Grade 6",
    section: "A",
    sections: ["A"],
    subjects: "1 Subject",
    startDate: "2026-08-03",
    endDate: "2026-08-03",
    appeared: 0,
    total: 0,
    status: "Scheduled",
    slots: [makeSlot()],
    published: false,
    gradePlans: [],
    mode: "Offline",
    venue: "Main Block",
    room: "R1",
    invigilator: "Mr. Ali",
    durationMin: 120,
    maxMarks: 100,
    passingMarks: 35,
    publishedToTeachers: false,
    publishedToStudents: false,
    ...overrides,
  } as ExamRecord;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("ExamTimetable", () => {
  it("renders exam header info (name, mode badge, type, venue, marks)", () => {
    render(<ExamTimetable exam={makeExam()} studentId="STU-1" />);
    expect(screen.getByText("Mid Term - 1")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByText("Unit Test")).toBeInTheDocument();
    expect(screen.getByText("Main Block")).toBeInTheDocument();
    expect(screen.getByText("Max 100 · Pass 35")).toBeInTheDocument();
  });

  it("shows the hall/seat callout and Hall/Seat table columns for offline exams", () => {
    render(<ExamTimetable exam={makeExam()} studentId="STU-1" />);
    // "Hall"/"Seat" appear both in the header callout and the table column headers
    expect(screen.getAllByText("Hall").length).toBe(2);
    expect(screen.getAllByText("Seat").length).toBe(2);
  });

  it("hides the hall/seat callout for Online exams and shows Mode column instead", () => {
    render(<ExamTimetable exam={makeExam({ mode: "Online" })} studentId="STU-1" />);
    expect(screen.queryByText("Seat")).not.toBeInTheDocument();
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
  });

  it("renders one table row per slot with formatted date/day/time/duration", () => {
    const exam = makeExam({
      slots: [
        makeSlot({ subject: "Mathematics", date: "2026-08-03", start: "09:00", end: "11:00" }),
        makeSlot({ subject: "Science", date: "2026-08-01", start: "10:00", end: "10:45" }),
      ],
    });
    render(<ExamTimetable exam={exam} studentId="STU-1" />);
    // Sorted ascending by date: Science (08-01) before Mathematics (08-03)
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows[0]).toHaveTextContent("Science");
    expect(rows[1]).toHaveTextContent("Mathematics");
    expect(screen.getByText("2 hr")).toBeInTheDocument(); // 120 min duration for Mathematics
    expect(screen.getByText("45 min")).toBeInTheDocument(); // 45 min duration for Science
  });

  it("shows the empty state when the exam has no slots", () => {
    render(<ExamTimetable exam={makeExam({ slots: [] })} studentId="STU-1" />);
    expect(screen.getByText("Subject-wise timetable not published yet.")).toBeInTheDocument();
    // Footnote is only shown when slots exist
    expect(screen.queryByText(/Report 15 minutes early/)).not.toBeInTheDocument();
  });

  it("uses the seating plan's allocated room/seat when one exists for the student", () => {
    const exam = makeExam();
    const cfg = defaultConfig(exam.id);
    saveSeating({
      ...cfg,
      assignments: [
        { studentId: "STU-1", name: "Amina", rollNo: "1", grade: "Grade 6", section: "A", roomNo: "Room 202", seatLabel: "07" },
      ],
    });
    render(<ExamTimetable exam={exam} studentId="STU-1" />);
    expect(screen.getAllByText("Room 202").length).toBeGreaterThan(0);
    expect(screen.getAllByText("07").length).toBeGreaterThan(0);
  });

  it("falls back to a deterministic hash-based seat when no seating plan covers the student", () => {
    const exam = makeExam();
    render(<ExamTimetable exam={exam} studentId="STU-NOSEAT" />);
    // seatNumber() produces a stable "R<row>-<col>" label — just assert the
    // fallback room ("R1" from exam.room / slot.room) is shown since no plan exists.
    expect(screen.getAllByText("R1").length).toBeGreaterThan(0);
  });

  it("shows the reporting footnote only for offline exams with slots", () => {
    render(<ExamTimetable exam={makeExam()} studentId="STU-1" />);
    expect(screen.getByText(/Report 15 minutes early/)).toBeInTheDocument();
  });
});
