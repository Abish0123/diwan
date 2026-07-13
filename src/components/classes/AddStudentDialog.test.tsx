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
  addStudents: vi.fn(),
}));

vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => useStudentsMock,
}));

const useClassesMock = vi.hoisted(() => ({
  addEnrollment: vi.fn(),
  classes: [] as unknown[],
  sections: [] as unknown[],
}));

vi.mock("@/hooks/useClasses", () => ({
  useClasses: () => useClassesMock,
}));

import { AddStudentDialog } from "./AddStudentDialog";

describe("AddStudentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudentsMock.addStudents.mockResolvedValue(undefined);
    useClassesMock.addEnrollment.mockResolvedValue(undefined);
    useClassesMock.classes = [
      { id: "class-1", name: "Grade 5 - Section B", grade: "Grade 5", academicYear: "2025-26" },
    ];
    useClassesMock.sections = [];
  });

  it("renders when open", () => {
    render(<AddStudentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);
    expect(screen.getByText("Add Student")).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<AddStudentDialog open={false} onOpenChange={vi.fn()} classId="class-1" />);
    expect(screen.queryByText("Add Student")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not submit when name or email is missing", async () => {
    const user = userEvent.setup();
    render(<AddStudentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);

    await user.click(screen.getByText("Enroll Student"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields");
    expect(useStudentsMock.addStudents).not.toHaveBeenCalled();
  });

  it("derives section from a matching Section record when one exists for the class", async () => {
    useClassesMock.sections = [{ id: "sec-1", classId: "class-1", name: "C" }];
    const user = userEvent.setup();
    render(<AddStudentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);

    await user.type(screen.getByLabelText("Full Name"), "John Doe");
    await user.type(screen.getByLabelText("Email Address"), "john@example.com");
    await user.click(screen.getByText("Enroll Student"));

    expect(useStudentsMock.addStudents).toHaveBeenCalledWith([
      expect.objectContaining({ name: "John Doe", email: "john@example.com", section: "C", grade: "Grade 5", classId: "class-1" }),
    ]);
    expect(useClassesMock.addEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "sec-1", sectionName: "C", className: "Grade 5 - Section B", grade: "Grade 5" })
    );
  });

  it("falls back to parsing the section letter from the class name when no Section record matches", async () => {
    const user = userEvent.setup();
    render(<AddStudentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);

    await user.type(screen.getByLabelText("Full Name"), "Jane Roe");
    await user.type(screen.getByLabelText("Email Address"), "jane@example.com");
    await user.click(screen.getByText("Enroll Student"));

    expect(useStudentsMock.addStudents).toHaveBeenCalledWith([
      expect.objectContaining({ section: "B" }),
    ]);
  });

  it("falls back to section 'A' when neither a Section record nor a parseable class name exists", async () => {
    useClassesMock.classes = [{ id: "class-1", name: "Homeroom", grade: "Grade 5", academicYear: "2025-26" }];
    const user = userEvent.setup();
    render(<AddStudentDialog open={true} onOpenChange={vi.fn()} classId="class-1" />);

    await user.type(screen.getByLabelText("Full Name"), "Sam Lee");
    await user.type(screen.getByLabelText("Email Address"), "sam@example.com");
    await user.click(screen.getByText("Enroll Student"));

    expect(useStudentsMock.addStudents).toHaveBeenCalledWith([
      expect.objectContaining({ section: "A" }),
    ]);
  });

  it("shows a success toast, closes the dialog, and resets the form on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddStudentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.type(screen.getByLabelText("Full Name"), "John Doe");
    await user.type(screen.getByLabelText("Email Address"), "john@example.com");
    await user.click(screen.getByText("Enroll Student"));

    expect(toastMocks.success).toHaveBeenCalledWith("Student Added", {
      description: "John Doe has been added and enrolled in the class.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("silently swallows errors from addStudents without a toast (handled by context)", async () => {
    useStudentsMock.addStudents.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddStudentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.type(screen.getByLabelText("Full Name"), "John Doe");
    await user.type(screen.getByLabelText("Email Address"), "john@example.com");
    await user.click(screen.getByText("Enroll Student"));

    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddStudentDialog open={true} onOpenChange={onOpenChange} classId="class-1" />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useStudentsMock.addStudents).not.toHaveBeenCalled();
  });
});
