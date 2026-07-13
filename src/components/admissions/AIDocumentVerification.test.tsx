import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIDocumentVerification } from "./AIDocumentVerification";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";

describe("AIDocumentVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing visually blocking when closed, but the panel stays mounted (translate-x-full)", () => {
    const onClose = vi.fn();
    const { container } = render(<AIDocumentVerification open={false} onClose={onClose} />);
    // Backdrop only renders when open.
    expect(container.querySelector(".bg-black\\/20")).not.toBeInTheDocument();
    const panel = container.querySelector(".fixed.right-0");
    expect(panel).toHaveClass("translate-x-full");
  });

  it("lists all five required documents as not uploaded initially, and submit is disabled", () => {
    render(<AIDocumentVerification open onClose={vi.fn()} />);
    expect(screen.getByText("Birth Certificate")).toBeInTheDocument();
    expect(screen.getByText("Emirates ID (Parent)")).toBeInTheDocument();
    expect(screen.getAllByText("Not Uploaded")).toHaveLength(5);
    expect(screen.getByText("Submit to Admissions Committee").closest("button")).toBeDisabled();
    expect(screen.getByText(/Verify at least 4 of 5/)).toBeInTheDocument();
  });

  it("clicking the upload dropzone marks a doc as uploaded and reveals the Verify button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIDocumentVerification open onClose={vi.fn()} />);

    const dropzones = screen.getAllByText("Click to upload or drag & drop");
    await user.click(dropzones[0]);

    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("Verify with AI")).toBeInTheDocument();
  });

  it("verifying a document shows extracted data on success (Math.random forced high)", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1); // < 0.8 => verified
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIDocumentVerification open onClose={vi.fn()} />);

    await user.click(screen.getAllByText("Click to upload or drag & drop")[0]); // birth_cert
    await user.click(screen.getByText("Verify with AI"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => expect(screen.getByText(/Verified ✓/)).toBeInTheDocument());
    expect(screen.getByText(/Name: Sara Ahmed Hassan/)).toBeInTheDocument();
    randomSpy.mockRestore();
  });

  it("verifying a document shows a failure message when Math.random rolls high", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95); // >= 0.8 => failed
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIDocumentVerification open onClose={vi.fn()} />);

    await user.click(screen.getAllByText("Click to upload or drag & drop")[0]);
    await user.click(screen.getByText("Verify with AI"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => expect(screen.getByText(/Failed ✗/)).toBeInTheDocument());
    expect(screen.getByText(/document unclear/)).toBeInTheDocument();
    randomSpy.mockRestore();
  });

  it("Verify All shows an info toast when nothing is uploaded yet", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIDocumentVerification open onClose={vi.fn()} />);
    await user.click(screen.getByText("Verify All"));
    expect(toast.info).toHaveBeenCalledWith("No uploaded documents to verify");
  });

  it("submit becomes enabled once 4 of 5 documents are verified, and calls onClose on submit", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // always verify successfully
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIDocumentVerification open onClose={onClose} />);

    const dropzones = screen.getAllByText("Click to upload or drag & drop");
    // Upload all 5
    for (const dz of dropzones) {
      await user.click(dz);
    }

    // Verify all 5 via the "Verify All" bulk action
    await user.click(screen.getByText("Verify All"));
    await act(async () => {
      // 5 docs * (2000ms verify + 300ms stagger)
      await vi.advanceTimersByTimeAsync(5 * 2300 + 100);
    });

    await waitFor(() => expect(screen.getByText("5/5 verified")).toBeInTheDocument());

    const submitBtn = screen.getByText("Submit to Admissions Committee").closest("button")!;
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    expect(toast.success).toHaveBeenCalledWith("Application submitted for review");
    expect(onClose).toHaveBeenCalled();
  });
});
