import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BulkUploadDialog } from "./BulkUploadDialog";

// ── Mock external boundaries ────────────────────────────────────────────────

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastMocks.success(...a), error: (...a: unknown[]) => toastMocks.error(...a) } }));

function renderDialog(props: Partial<React.ComponentProps<typeof BulkUploadDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onUploadSuccess = vi.fn();
  const utils = render(
    <BulkUploadDialog open onOpenChange={onOpenChange} onUploadSuccess={onUploadSuccess} {...props} />
  );
  return { ...utils, onOpenChange, onUploadSuccess };
}

function makeCsvFile(name: string, content: string) {
  return new File([content], name, { type: "text/csv" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BulkUploadDialog", () => {
  it("renders the upload prompt when no file is selected", () => {
    renderDialog();
    expect(screen.getByText("Bulk Student Upload")).toBeInTheDocument();
    expect(screen.getByText(/Click to upload or drag and drop/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start upload/i })).toBeDisabled();
  });

  it("rejects a file with an invalid type and shows an error toast", async () => {
    const user = userEvent.setup();
    renderDialog();
    const input = document.getElementById("file-upload") as HTMLInputElement;
    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    await user.upload(input, badFile);

    expect(toastMocks.error).toHaveBeenCalledWith("Invalid file type", {
      description: "Please upload a CSV or Excel file.",
    });
    // Still showing the empty dropzone, not the selected-file state.
    expect(screen.getByText(/Click to upload or drag and drop/i)).toBeInTheDocument();
  });

  it("accepts a valid CSV file and enables the Start Upload button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();
    const input = document.getElementById("file-upload") as HTMLInputElement;
    const file = makeCsvFile("students.csv", "Name,Email,Class\nJohn Doe,john@example.com,Grade 10-A");
    await user.upload(input, file);

    expect(await screen.findByText("students.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start upload/i })).toBeEnabled();
  });

  it("allows removing the selected file before upload", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();
    const input = document.getElementById("file-upload") as HTMLInputElement;
    const file = makeCsvFile("students.csv", "Name,Email,Class\nJohn Doe,john@example.com,Grade 10-A");
    await user.upload(input, file);
    expect(await screen.findByText("students.csv")).toBeInTheDocument();

    // The X button inside the selected-file row.
    const removeButtons = screen.getAllByRole("button");
    const removeBtn = removeButtons.find(b => b.querySelector("svg.lucide-x"));
    expect(removeBtn).toBeTruthy();
    await user.click(removeBtn!);

    expect(screen.getByText(/Click to upload or drag and drop/i)).toBeInTheDocument();
  });

  it("parses a CSV file, maps rows to students, and calls onUploadSuccess", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenChange, onUploadSuccess } = renderDialog();
    const input = document.getElementById("file-upload") as HTMLInputElement;
    const csv = "Name,Email,Class,Phone\nJohn Doe,john@example.com,Grade 10-A,+1234567890";
    const file = makeCsvFile("students.csv", csv);
    await user.upload(input, file);
    await screen.findByText("students.csv");

    await user.click(screen.getByRole("button", { name: /start upload/i }));

    // Advance the simulated upload delay (setTimeout 1500ms) inside FileReader onload.
    await vi.advanceTimersByTimeAsync(1600);

    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled());
    const [students] = onUploadSuccess.mock.calls[0];
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      name: "John Doe",
      email: "john@example.com",
      classId: "Grade 10-A",
      status: "Active",
      phone: "+1234567890",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Bulk Upload Successful",
      expect.objectContaining({ description: expect.stringContaining("1 student records") })
    );
  });

  it("shows an error toast when the CSV has no valid records", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();
    const input = document.getElementById("file-upload") as HTMLInputElement;
    // Header only, no data rows -> parses to zero records.
    const file = makeCsvFile("empty.csv", "Name,Email,Class\n");
    await user.upload(input, file);
    await screen.findByText("empty.csv");

    await user.click(screen.getByRole("button", { name: /start upload/i }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(
      "Upload Failed",
      expect.objectContaining({ description: expect.stringContaining("No valid student records") })
    ));
  });

  it("downloads a sample template when 'Download Sample Template' is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    renderDialog();
    await user.click(screen.getByText("Download Sample Template"));

    expect(createObjectURL).toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith("Template downloaded successfully");
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
