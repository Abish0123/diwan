import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── External IO boundaries (examStore/seatingStore's own dependencies) ─────
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
    getOne: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock("@/lib/emailService", () => ({
  sendPlainEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/repositories/StudentRepository", () => ({
  studentRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/repositories/UserRepository", () => ({
  userRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/repositories/SubjectAssignmentRepository", () => ({
  subjectAssignmentRepository: { getAll: vi.fn().mockResolvedValue([]) },
}));

// ── The 4 step "...Content" page components ─────────────────────────────────
// These are full standalone /exams/* route pages (hundreds of lines each,
// with their own heavy provider/IO trees) reused as steps inside this wizard
// shell. ExamSetupWizard's own logic under test is purely "which step is
// active / locked / next" — not those pages' internals (which belong to
// their own page-level tests) — so they're stubbed with a recognizable marker
// that still receives the real props the wizard passes down.
vi.mock("@/pages/exams/RoomAllocation", () => ({
  RoomAllocationContent: ({ examId }: { examId: string }) => <div data-testid="rooms-content">Rooms for {examId}</div>,
}));
vi.mock("@/pages/exams/HallTickets", () => ({
  HallTicketsContent: ({ examId }: { examId: string }) => <div data-testid="tickets-content">Tickets for {examId}</div>,
}));
vi.mock("@/pages/exams/InvigilatorAllocation", () => ({
  InvigilatorAllocationContent: ({ examId }: { examId: string }) => <div data-testid="invigilators-content">Invigilators for {examId}</div>,
}));
vi.mock("@/pages/exams/ExamAttendance", () => ({
  ExamAttendanceContent: ({ examId }: { examId: string }) => <div data-testid="attendance-content">Attendance for {examId}</div>,
}));

import { ExamSetupWizard, computeUnlockedSteps } from "./ExamSetupWizard";
import { getExams, setExams, type ExamRecord } from "@/lib/examStore";
import { saveSeating, defaultConfig } from "@/lib/seatingStore";
import type { WizardStepId } from "./ExamWizardSteps";

function makeExam(overrides: Partial<ExamRecord> = {}): ExamRecord {
  return {
    id: "EXM-1",
    name: "Mid Term - 1",
    type: "Unit Test",
    grade: "Grade 6",
    section: "A",
    sections: ["A"],
    subjects: "1 Subject",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    appeared: 0,
    total: 0,
    status: "Scheduled",
    slots: [],
    published: false,
    gradePlans: [],
    mode: "Offline",
    venue: "",
    room: "",
    invigilator: "",
    durationMin: 60,
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
  // getExams() self-heals its localStorage version key and, on a version
  // mismatch, wipes LS_KEY the FIRST time it's ever called. Prime it here so
  // that call doesn't race with (and blow away) the setExams(...) a test does
  // just before rendering the component that reads exams on mount.
  getExams();
});

describe("computeUnlockedSteps", () => {
  it("only unlocks 'schedule' when there is no selected exam", () => {
    expect(computeUnlockedSteps(undefined)).toEqual(new Set(["schedule"]));
  });

  it("unlocks 'rooms' and 'attendance' once the exam has any slots, but not hall-tickets/invigilators without seating", () => {
    const exam = makeExam({ slots: [{ subject: "Math", date: "2026-08-01", start: "09:00", end: "10:00", invigilator: "", room: "" }] });
    const unlocked = computeUnlockedSteps(exam);
    expect(unlocked.has("rooms")).toBe(true);
    expect(unlocked.has("attendance")).toBe(true);
    expect(unlocked.has("hall-tickets")).toBe(false);
    expect(unlocked.has("invigilators")).toBe(false);
  });

  it("unlocks hall-tickets and invigilators once a seating plan with rooms exists", () => {
    const exam = makeExam({ slots: [{ subject: "Math", date: "2026-08-01", start: "09:00", end: "10:00", invigilator: "", room: "" }] });
    saveSeating({
      ...defaultConfig(exam.id),
      rooms: [{ id: "R1", roomNo: "Room 1", capacity: 25, invigilator: "Mr. A" }],
    });
    const unlocked = computeUnlockedSteps(exam);
    expect(unlocked.has("hall-tickets")).toBe(true);
    expect(unlocked.has("invigilators")).toBe(true);
  });
});

describe("ExamSetupWizard", () => {
  it("renders the schedule step's children when step='schedule'", () => {
    setExams([makeExam()]);
    render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="schedule" onStepChange={vi.fn()}>
        <div data-testid="schedule-children">Schedule body</div>
      </ExamSetupWizard>
    );
    expect(screen.getByTestId("schedule-children")).toBeInTheDocument();
    expect(screen.queryByTestId("rooms-content")).not.toBeInTheDocument();
  });

  it("renders the matching step content component for each non-schedule step", () => {
    setExams([makeExam()]);
    const { rerender } = render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="rooms" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    expect(screen.getByTestId("rooms-content")).toHaveTextContent("Rooms for EXM-1");

    rerender(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="hall-tickets" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    expect(screen.getByTestId("tickets-content")).toHaveTextContent("Tickets for EXM-1");

    rerender(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="invigilators" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    expect(screen.getByTestId("invigilators-content")).toHaveTextContent("Invigilators for EXM-1");

    rerender(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="attendance" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    expect(screen.getByTestId("attendance-content")).toHaveTextContent("Attendance for EXM-1");
  });

  it("shows a 'Continue' button that is disabled with a Lock icon when the next step isn't unlocked yet", () => {
    setExams([makeExam({ slots: [] })]); // no slots -> rooms step locked
    render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="schedule" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    const continueBtn = screen.getByText(/Continue to Room Allocation/).closest("button")!;
    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveAttribute("title", expect.stringContaining("Complete this step before continuing"));
  });

  it("enables the Continue button and calls onStepChange once the next step is unlocked", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    setExams([makeExam({ slots: [{ subject: "Math", date: "2026-08-01", start: "09:00", end: "10:00", invigilator: "", room: "" }] })]);
    render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="schedule" onStepChange={onStepChange}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    const continueBtn = screen.getByText(/Continue to Room Allocation/).closest("button")!;
    expect(continueBtn).not.toBeDisabled();
    await user.click(continueBtn);
    expect(onStepChange).toHaveBeenCalledWith("rooms");
  });

  it("shows a 'Back' button on non-first steps and calls onStepChange when clicked", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    setExams([makeExam()]);
    render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="rooms" onStepChange={onStepChange}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    const backBtn = screen.getByText(/Back to Exam Schedule/).closest("button")!;
    await user.click(backBtn);
    expect(onStepChange).toHaveBeenCalledWith("schedule");
  });

  it("hides the Continue button on the final step (attendance)", () => {
    setExams([makeExam()]);
    render(
      <ExamSetupWizard examId="EXM-1" onExamIdChange={vi.fn()} step="attendance" onStepChange={vi.fn()}>
        <div>schedule</div>
      </ExamSetupWizard>
    );
    expect(screen.queryByText(/Continue to/)).not.toBeInTheDocument();
    expect(screen.getByText(/Back to Invigilators/)).toBeInTheDocument();
  });
});
