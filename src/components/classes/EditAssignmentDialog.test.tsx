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
  updateAssignment: vi.fn(),
}));

vi.mock("@/hooks/useAssignments", () => ({
  useAssignments: () => useAssignmentsMock,
}));

import { EditAssignmentDialog } from "./EditAssignmentDialog";
import type { Assignment } from "@/types/classes";

const baseAssignment: Assignment = {
  id: "a1",
  title: "Original Title",
  dueDate: "2026-07-01",
  status: "Pending",
} as unknown as Assignment;

describe("EditAssignmentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAssignmentsMock.updateAssignment.mockResolvedValue(undefined);
  });

  it("pre-fills the form with the assignment's current values when open", () => {
    render(<EditAssignmentDialog open={true} onOpenChange={vi.fn()} assignment={baseAssignment} />);
    expect(screen.getByLabelText("Title")).toHaveValue("Original Title");
    expect(screen.getByLabelText("Due Date")).toHaveValue("2026-07-01");
  });

  it("does not render when closed", () => {
    render(<EditAssignmentDialog open={false} onOpenChange={vi.fn()} assignment={baseAssignment} />);
    expect(screen.queryByText("Edit Assignment")).not.toBeInTheDocument();
  });

  it("resets the form fields to the assignment's values whenever it re-opens", () => {
    const { rerender } = render(
      <EditAssignmentDialog open={true} onOpenChange={vi.fn()} assignment={baseAssignment} />
    );
    rerender(<EditAssignmentDialog open={false} onOpenChange={vi.fn()} assignment={baseAssignment} />);
    const updated = { ...baseAssignment, title: "New Title", dueDate: "2026-09-01" };
    rerender(<EditAssignmentDialog open={true} onOpenChange={vi.fn()} assignment={updated} />);
    expect(screen.getByLabelText("Title")).toHaveValue("New Title");
    expect(screen.getByLabelText("Due Date")).toHaveValue("2026-09-01");
  });

  it("submits updated fields, shows success toast, and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditAssignmentDialog open={true} onOpenChange={onOpenChange} assignment={baseAssignment} />);

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Updated Title");
    await user.click(screen.getByText("Save Changes"));

    expect(useAssignmentsMock.updateAssignment).toHaveBeenCalledWith("a1", {
      title: "Updated Title",
      dueDate: "2026-07-01",
      status: "Pending",
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Assignment updated successfully");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast and does not close when updateAssignment rejects", async () => {
    useAssignmentsMock.updateAssignment.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditAssignmentDialog open={true} onOpenChange={onOpenChange} assignment={baseAssignment} />);

    await user.click(screen.getByText("Save Changes"));

    expect(toastMocks.error).toHaveBeenCalledWith("Failed to update assignment");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditAssignmentDialog open={true} onOpenChange={onOpenChange} assignment={baseAssignment} />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useAssignmentsMock.updateAssignment).not.toHaveBeenCalled();
  });
});
