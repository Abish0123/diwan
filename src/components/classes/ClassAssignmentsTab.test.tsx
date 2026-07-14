import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

const useAssignmentsMock = vi.hoisted(() => ({
  assignments: [] as unknown[],
  addAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  loading: false,
}));
vi.mock("@/hooks/useAssignments", () => ({ useAssignments: () => useAssignmentsMock }));

const useStudentsMock = vi.hoisted(() => ({ students: [] as unknown[] }));
vi.mock("@/contexts/StudentContext", () => ({ useStudents: () => useStudentsMock }));

const useSubmissionsMock = vi.hoisted(() => ({
  submissions: [] as unknown[],
  updateSubmission: vi.fn(),
  addSubmission: vi.fn(),
}));
vi.mock("@/hooks/useSubmissions", () => ({ useSubmissions: () => useSubmissionsMock }));

import { ClassAssignmentsTab } from "./ClassAssignmentsTab";

describe("ClassAssignmentsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAssignmentsMock.assignments = [
      { id: "a1", title: "Algebra HW", dueDate: "2026-08-01", classId: "class-1", status: "Active", submissionsCount: 3 },
      { id: "a2", title: "Geometry HW", dueDate: "2026-08-05", classId: "class-1", status: "Completed", submissionsCount: 10 },
      { id: "a3", title: "Other class HW", dueDate: "2026-08-05", classId: "class-2", status: "Active", submissionsCount: 1 },
    ];
    useAssignmentsMock.loading = false;
    useAssignmentsMock.deleteAssignment.mockResolvedValue(undefined);
    useStudentsMock.students = [];
    useSubmissionsMock.submissions = [];
  });

  it("scopes the assignment list to the given classId", () => {
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    expect(screen.getByText("Algebra HW")).toBeInTheDocument();
    expect(screen.getByText("Geometry HW")).toBeInTheDocument();
    expect(screen.queryByText("Other class HW")).not.toBeInTheDocument();
  });

  it("shows a loading state", () => {
    useAssignmentsMock.loading = true;
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    expect(screen.getByText("Loading Assignments...")).toBeInTheDocument();
  });

  it("shows an empty state and clears search", async () => {
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    await user.type(screen.getByPlaceholderText("Search assignments..."), "nonexistent");
    expect(screen.getByText("No assignments found")).toBeInTheDocument();
    await user.click(screen.getByText("Clear Filters"));
    expect(screen.getByText("Algebra HW")).toBeInTheDocument();
  });

  it("filters the list via the search box", async () => {
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    await user.type(screen.getByPlaceholderText("Search assignments..."), "algebra");
    expect(screen.getByText("Algebra HW")).toBeInTheDocument();
    expect(screen.queryByText("Geometry HW")).not.toBeInTheDocument();
  });

  it("exports assignments to CSV", async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    (URL as any).createObjectURL = createObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    await user.click(screen.getByText("Export"));

    expect(clickSpy).toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith("Assignments exported successfully");
    vi.restoreAllMocks();
  });

  it("shows an error toast when exporting with no assignments", async () => {
    useAssignmentsMock.assignments = [];
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    await user.click(screen.getByText("Export"));
    expect(toastMocks.error).toHaveBeenCalledWith("No assignments to export");
  });

  it("opens the create assignment dialog", async () => {
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    await user.click(screen.getByText("Create Assignment"));
    expect(screen.getByText("Create New Assignment")).toBeInTheDocument();
  });

  it("deletes a non-demo assignment via the row menu", async () => {
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    const row = screen.getByText("Algebra HW").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Delete"));

    expect(useAssignmentsMock.deleteAssignment).toHaveBeenCalledWith("a1");
    expect(toastMocks.success).toHaveBeenCalledWith("Assignment deleted");
  });

  it("refuses to delete demo-prefixed assignment ids", async () => {
    useAssignmentsMock.assignments = [
      { id: "demo-1", title: "Demo HW", dueDate: "2026-08-01", classId: "class-1", status: "Active", submissionsCount: 0 },
    ];
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    const row = screen.getByText("Demo HW").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Delete"));

    expect(useAssignmentsMock.deleteAssignment).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledWith("Cannot delete demo data");
  });

  it("opens the Edit Assignment dialog for the selected assignment", async () => {
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    const row = screen.getByText("Algebra HW").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Edit Assignment"));

    expect(screen.getByText("Edit Assignment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Algebra HW")).toBeInTheDocument();
  });

  it("opens View Submissions dialog scoped to the class' students", async () => {
    useStudentsMock.students = [{ id: "s1", name: "Alice Smith", classId: "class-1" }];
    const user = userEvent.setup();
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);
    const row = screen.getByText("Algebra HW").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("View Submissions"));

    expect(screen.getByText("Submissions: Algebra HW")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("shows computed active/completion/pending-grading KPI cards", () => {
    render(<ClassAssignmentsTab classId="class-1" className="Grade 5 - A" />);

    // Locate each card by its heading, then assert the numeric value within it.
    // This avoids the ambiguous getByText("1") failure when multiple elements
    // share the same text (e.g. active count = 1, pending grading = 1).
    const activeCard = screen.getByText("Active Assignments").closest(".rounded-2xl")!;
    expect(within(activeCard).getByText("1")).toBeInTheDocument(); // 1 Active assignment in class-1

    expect(screen.getByText("Completion Rate")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();

    const pendingCard = screen.getByText("Pending Grading").closest(".rounded-2xl")!;
    expect(within(pendingCard).getByText("1")).toBeInTheDocument(); // 1 Completed assignment in class-1
  });
});
