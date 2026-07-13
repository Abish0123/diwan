import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

import AssignmentsPro from "./AssignmentsPro";

const classData = { name: "Grade 5 - A" };

describe("AssignmentsPro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the seeded assignments table and KPI cards", () => {
    render(<AssignmentsPro classData={classData} />);
    expect(screen.getByText("English - My Family Essay")).toBeInTheDocument();
    expect(screen.getByText("Total Assignments")).toBeInTheDocument();
    expect(screen.getByText(/Assignments/)).toBeInTheDocument();
  });

  it("filters assignments via the search box", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    await user.type(screen.getByPlaceholderText("Search assignments..."), "fractions");
    expect(screen.getByText("Maths - Fractions Worksheet")).toBeInTheDocument();
    expect(screen.queryByText("English - My Family Essay")).not.toBeInTheDocument();
  });

  it("shows the empty state when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    await user.type(screen.getByPlaceholderText("Search assignments..."), "zzz-none");
    expect(screen.getByText("No assignments found.")).toBeInTheDocument();
  });

  it("opens the View dialog with assignment details", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    const row = screen.getByText("English - My Family Essay").closest("tr")!;
    await user.click(within(row).getByTitle("View details"));
    expect(screen.getByText("Essay · English · Due 01 Jun 2024")).toBeInTheDocument();
  });

  it("duplicates an assignment and shows a toast", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    const row = screen.getByText("English - My Family Essay").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "" })); // dropdown trigger (MoreVertical)
    await user.click(await screen.findByText("Duplicate"));

    expect(toastMocks.success).toHaveBeenCalledWith('"English - My Family Essay" duplicated');
    expect(screen.getByText("English - My Family Essay (Copy)")).toBeInTheDocument();
  });

  it("deletes an assignment after confirming in the delete dialog", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    const row = screen.getByText("English - My Family Essay").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Delete"));

    expect(screen.getByText("Delete Assignment?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(toastMocks.success).toHaveBeenCalledWith('"English - My Family Essay" deleted');
    expect(screen.queryByText("English - My Family Essay")).not.toBeInTheDocument();
  });

  it("validates required fields when creating a new assignment", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} createOpen={true} onCreateOpenChange={vi.fn()} />);
    await user.click(screen.getByText("Create Assignment"));
    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields (title, subject, due date)");
  });

  it("creates a new assignment with the provided fields", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    const onCreateOpenChange = vi.fn();
    render(<AssignmentsPro classData={classData} createOpen={true} onCreateOpenChange={onCreateOpenChange} />);

    await user.type(screen.getByPlaceholderText("e.g. English - My Family Essay"), "New HW");
    // Select a subject from the dropdown
    const subjectTrigger = screen.getByText("Select subject");
    await user.click(subjectTrigger);
    await user.click(await screen.findByText("Mathematics"));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, "2026-08-01");

    await user.click(screen.getByText("Create Assignment"));
    await vi.advanceTimersByTimeAsync(600);

    expect(screen.getByText("New HW")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows submissions split and sends reminders to students who have not submitted", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    const row = screen.getByText("English - My Family Essay").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "" }));
    await user.click(await screen.findByText("View Submissions"));

    expect(screen.getByText("Submissions")).toBeInTheDocument();
    await user.click(screen.getByText("Remind All"));
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("Reminder sent to"));
  });

  it("enters and saves grades for a student", async () => {
    const user = userEvent.setup();
    render(<AssignmentsPro classData={classData} />);
    const row = screen.getByText("English - My Family Essay").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Enter Grades"));

    expect(screen.getByText("Enter Grades")).toBeInTheDocument();
    const marksInput = screen.getAllByPlaceholderText("0-100")[0];
    await user.type(marksInput, "95");
    await user.click(screen.getByText("Save Grades"));

    expect(toastMocks.success).toHaveBeenCalledWith('Grades saved for "English - My Family Essay"');
  });
});
