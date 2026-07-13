import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
    info: (...args: unknown[]) => toastMocks.info(...args),
  },
}));

import { SubjectDetailsDialog } from "./SubjectDetailsDialog";

const subject = { name: "Mathematics", teacher: "Mr. Smith", completion: 60 };

describe("SubjectDetailsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when subject is null", () => {
    const { container } = render(
      <SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={null} type="syllabus" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders syllabus chapter list with completion percentage", () => {
    render(<SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={subject} type="syllabus" />);
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Chapter List")).toBeInTheDocument();
    expect(screen.getByText("Algebraic Expressions")).toBeInTheDocument();
    expect(screen.getByText("5 Items")).toBeInTheDocument();
  });

  it("renders the resources list when type is resources", () => {
    render(<SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={subject} type="resources" />);
    expect(screen.getByText("Available Resources")).toBeInTheDocument();
    expect(screen.getByText("Chapter 1: Introduction to Algebra")).toBeInTheDocument();
    expect(screen.getByText("Download All Resources")).toBeInTheDocument();
  });

  it("shows a success toast when downloading a single item", async () => {
    const user = userEvent.setup();
    render(<SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={subject} type="syllabus" />);

    const item = screen.getByText("Algebraic Expressions").closest("div.flex.items-center.justify-between")!;
    await user.click(item.querySelector("button")!);

    expect(toastMocks.success).toHaveBeenCalledWith("Downloading Algebraic Expressions...");
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uploads a file, adding a new pending syllabus item after the simulated delay", async () => {
      render(<SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={subject} type="syllabus" />);

      const file = new File(["content"], "new-chapter.pdf", { type: "application/pdf" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      await vi.waitFor(() => {
        Object.defineProperty(input, "files", { value: [file], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(toastMocks.info).toHaveBeenCalledWith("Uploading new-chapter.pdf...");

      await vi.advanceTimersByTimeAsync(1000);

      expect(toastMocks.success).toHaveBeenCalledWith("new-chapter.pdf uploaded successfully!");
      expect(screen.getByText("new-chapter")).toBeInTheDocument();
    });

    it("shows a success toast after the simulated delay when downloading all resources", async () => {
      render(<SubjectDetailsDialog open={true} onOpenChange={vi.fn()} subject={subject} type="resources" />);

      screen.getByText("Download All Resources").click();
      expect(toastMocks.info).toHaveBeenCalledWith("Preparing all resources for download...");

      await vi.advanceTimersByTimeAsync(800);

      expect(toastMocks.success).toHaveBeenCalledWith("Download started!");
    });
  });

  it("closes the dialog via the Close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SubjectDetailsDialog open={true} onOpenChange={onOpenChange} subject={subject} type="syllabus" />);

    await user.click(screen.getByText("Close"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
