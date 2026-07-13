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

const useClassesMock = vi.hoisted(() => ({
  deleteClass: vi.fn(),
}));

vi.mock("@/hooks/useClasses", () => ({
  useClasses: () => useClassesMock,
}));

import { ViewClassDialog } from "./ViewClassDialog";
import type { Class } from "@/contexts/ClassContext";

const baseClass: Class = {
  id: "c1",
  name: "Algebra I",
  subject: "Mathematics",
  time: "9:00 AM",
  teacher: "Mr. Smith",
  students: 24,
  description: "Intro to algebra",
} as unknown as Class;

describe("ViewClassDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClassesMock.deleteClass.mockResolvedValue(undefined);
  });

  it("renders nothing when classData is null", () => {
    const { container } = render(
      <ViewClassDialog open={true} onOpenChange={vi.fn()} classData={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders class details when classData is provided", () => {
    render(<ViewClassDialog open={true} onOpenChange={vi.fn()} classData={baseClass} />);
    expect(screen.getByText("Algebra I")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Mr. Smith")).toBeInTheDocument();
    expect(screen.getByText("24 enrolled")).toBeInTheDocument();
    expect(screen.getByText("Intro to algebra")).toBeInTheDocument();
  });

  it("shows a fallback description when none is provided", () => {
    const noDesc = { ...baseClass, description: "" };
    render(<ViewClassDialog open={true} onOpenChange={vi.fn()} classData={noDesc} />);
    expect(screen.getByText("No description provided for this class.")).toBeInTheDocument();
  });

  it("deletes the class, shows a success toast, and closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ViewClassDialog open={true} onOpenChange={onOpenChange} classData={baseClass} />);

    await user.click(screen.getByText("Delete Class"));

    expect(useClassesMock.deleteClass).toHaveBeenCalledWith("c1");
    expect(toastMocks.success).toHaveBeenCalledWith("Class Deleted", {
      description: "Algebra I has been removed from the directory.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close the dialog or toast when deleteClass rejects", async () => {
    useClassesMock.deleteClass.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ViewClassDialog open={true} onOpenChange={onOpenChange} classData={baseClass} />);

    await user.click(screen.getByText("Delete Class"));

    expect(useClassesMock.deleteClass).toHaveBeenCalledWith("c1");
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes the dialog via the Close Details button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ViewClassDialog open={true} onOpenChange={onOpenChange} classData={baseClass} />);

    await user.click(screen.getByText("Close Details"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
