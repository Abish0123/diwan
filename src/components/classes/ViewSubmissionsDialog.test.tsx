import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

const useStudentsMock = vi.hoisted(() => ({
  students: [] as unknown[],
}));

vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => useStudentsMock,
}));

const useSubmissionsMock = vi.hoisted(() => ({
  submissions: [] as unknown[],
  updateSubmission: vi.fn(),
  addSubmission: vi.fn(),
}));

vi.mock("@/hooks/useSubmissions", () => ({
  useSubmissions: () => useSubmissionsMock,
}));

import { ViewSubmissionsDialog } from "./ViewSubmissionsDialog";
import type { Assignment } from "@/types/classes";

const assignment: Assignment = {
  id: "a1",
  title: "Algebra HW",
  dueDate: "2026-07-20",
  classId: "class-1",
} as unknown as Assignment;

describe("ViewSubmissionsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudentsMock.students = [
      { id: "s1", name: "Alice Smith", classId: "class-1" },
      { id: "s2", name: "Bob Jones", classId: "class-1" },
      { id: "s3", name: "Carl Other", classId: "class-2" },
    ];
    useSubmissionsMock.submissions = [
      { id: "sub1", assignmentId: "a1", studentId: "s1", status: "Submitted", submissionDate: "2026-07-18" },
    ];
    useSubmissionsMock.updateSubmission.mockResolvedValue(undefined);
    useSubmissionsMock.addSubmission.mockResolvedValue(undefined);
  });

  it("renders nothing when assignment is null", () => {
    const { container } = render(
      <ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("only lists students belonging to the assignment's class", () => {
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.queryByText("Carl Other")).not.toBeInTheDocument();
    expect(screen.getByText(/Total Students: 2/)).toBeInTheDocument();
  });

  it("shows Submitted status with date for a student with a matching submission", () => {
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);
    const row = screen.getByText("Alice Smith").closest("tr")!;
    expect(within(row).getByText("Submitted")).toBeInTheDocument();
    expect(within(row).getByText("2026-07-18")).toBeInTheDocument();
  });

  it("defaults to Pending status with a dash date for a student without a submission", () => {
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);
    const row = screen.getByText("Bob Jones").closest("tr")!;
    expect(within(row).getByText("Pending")).toBeInTheDocument();
    expect(within(row).getByText("-")).toBeInTheDocument();
  });

  it("updates an existing submission's status via the dropdown menu", async () => {
    const user = userEvent.setup();
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);

    const row = screen.getByText("Alice Smith").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Mark Late"));

    expect(useSubmissionsMock.updateSubmission).toHaveBeenCalledWith("sub1", { status: "Late" });
    expect(useSubmissionsMock.addSubmission).not.toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith("Submission status updated");
  });

  it("creates a new submission when a student without one has a status set", async () => {
    const user = userEvent.setup();
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);

    const row = screen.getByText("Bob Jones").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Mark Submitted"));

    expect(useSubmissionsMock.addSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "a1",
        studentId: "s2",
        status: "Submitted",
      })
    );
  });

  it("shows an error toast when the status update fails", async () => {
    useSubmissionsMock.updateSubmission.mockRejectedValue(new Error("fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ViewSubmissionsDialog open={true} onOpenChange={vi.fn()} assignment={assignment} />);

    const row = screen.getByText("Alice Smith").closest("tr")!;
    await user.click(within(row).getByRole("button"));
    await user.click(await screen.findByText("Mark Pending"));

    expect(toastMocks.error).toHaveBeenCalledWith("Failed to update status");
    consoleSpy.mockRestore();
  });
});
