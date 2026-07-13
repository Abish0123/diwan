import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const useAssignmentsMock = vi.hoisted(() => ({
  addAssignment: vi.fn(),
}));

vi.mock("@/hooks/useAssignments", () => ({
  useAssignments: () => useAssignmentsMock,
}));

import { CreateAssignmentDialog } from "./CreateAssignmentDialog";

describe("CreateAssignmentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAssignmentsMock.addAssignment.mockResolvedValue(undefined);
  });

  it("renders form fields when open", () => {
    render(<CreateAssignmentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);
    expect(screen.getByText("Create New Assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignment Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due Date")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CreateAssignmentDialog open={false} onOpenChange={vi.fn()} classId="class-1" />);
    expect(screen.queryByText("Create New Assignment")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not submit when title or due date is missing", async () => {
    const user = userEvent.setup();
    render(<CreateAssignmentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);

    await user.click(screen.getByText("Create Assignment"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all fields");
    expect(useAssignmentsMock.addAssignment).not.toHaveBeenCalled();
  });

  it("submits with default Pending status, shows success toast, and resets/closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateAssignmentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.type(screen.getByLabelText("Assignment Title"), "Algebra Basics");
    await user.type(screen.getByLabelText("Due Date"), "2026-08-01");
    await user.click(screen.getByText("Create Assignment"));

    expect(useAssignmentsMock.addAssignment).toHaveBeenCalledWith({
      title: "Algebra Basics",
      dueDate: "2026-08-01",
      status: "Pending",
      classId: "class-1",
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Assignment created successfully");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast and keeps dialog open when addAssignment rejects", async () => {
    useAssignmentsMock.addAssignment.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CreateAssignmentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.type(screen.getByLabelText("Assignment Title"), "Algebra Basics");
    await user.type(screen.getByLabelText("Due Date"), "2026-08-01");
    await user.click(screen.getByText("Create Assignment"));

    expect(toastMocks.error).toHaveBeenCalledWith("Failed to create assignment");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    consoleSpy.mockRestore();
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateAssignmentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useAssignmentsMock.addAssignment).not.toHaveBeenCalled();
  });
});
