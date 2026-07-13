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

const useStudentsMock = vi.hoisted(() => ({
  updateStudent: vi.fn(),
}));

vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => useStudentsMock,
}));

import { EditStudentDialog } from "./EditStudentDialog";
import type { Student } from "@/types/classes";

const baseStudent: Student = {
  id: "s1",
  name: "Jane Doe",
  email: "jane@example.com",
  status: "Active",
} as unknown as Student;

describe("EditStudentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudentsMock.updateStudent.mockResolvedValue(undefined);
  });

  it("pre-fills the form with the student's current values when open", () => {
    render(<EditStudentDialog open={true} onOpenChange={vi.fn()} student={baseStudent} />);
    expect(screen.getByLabelText("Full Name")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Email Address")).toHaveValue("jane@example.com");
  });

  it("does not render when closed", () => {
    render(<EditStudentDialog open={false} onOpenChange={vi.fn()} student={baseStudent} />);
    expect(screen.queryByText("Edit Student")).not.toBeInTheDocument();
  });

  it("submits updated fields, shows success toast, and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditStudentDialog open={true} onOpenChange={onOpenChange} student={baseStudent} />);

    await user.clear(screen.getByLabelText("Full Name"));
    await user.type(screen.getByLabelText("Full Name"), "Jane Smith");
    await user.click(screen.getByText("Save Changes"));

    expect(useStudentsMock.updateStudent).toHaveBeenCalledWith("s1", {
      name: "Jane Smith",
      email: "jane@example.com",
      status: "Active",
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Student updated successfully");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast and does not close when updateStudent rejects", async () => {
    useStudentsMock.updateStudent.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditStudentDialog open={true} onOpenChange={onOpenChange} student={baseStudent} />);

    await user.click(screen.getByText("Save Changes"));

    expect(toastMocks.error).toHaveBeenCalledWith("Failed to update student");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EditStudentDialog open={true} onOpenChange={onOpenChange} student={baseStudent} />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useStudentsMock.updateStudent).not.toHaveBeenCalled();
  });
});
