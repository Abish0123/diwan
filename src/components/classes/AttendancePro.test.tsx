import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMocks }));

import AttendancePro from "./AttendancePro";

const students = [
  { id: "s1", name: "Ahmed Ali", classId: "c1", rollNumber: 1 },
  { id: "s2", name: "Zara Khan", classId: "c1", rollNumber: 2 },
];

const classData = { name: "Grade 5", grade: "Grade 5" };

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("AttendancePro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
  });

  it("shows loading then renders the student roster with 'Not Marked' status", async () => {
    render(<AttendancePro classData={classData} students={students} />);
    expect(screen.getByText("Loading attendance…")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Ahmed Ali")).toBeInTheDocument());
    expect(screen.getByText("Zara Khan")).toBeInTheDocument();
    // Not-yet-marked students show up in the "Not Marked" filter count.
    expect(screen.getByText(/2 Not Marked/)).toBeInTheDocument();
  });

  it("marks a single student's status via the daily table and persists via smartDb", async () => {
    const user = userEvent.setup();
    render(<AttendancePro classData={classData} students={students} />);
    await waitFor(() => expect(screen.getByText("Ahmed Ali")).toBeInTheDocument());

    const row = screen.getByText("Ahmed Ali").closest("tr")!;
    await user.click(within(row).getByText("Present"));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalled());
    const [entity, rec] = smartDbMocks.create.mock.calls[0];
    expect(entity).toBe("attendance");
    expect(rec).toMatchObject({ entityId: "s1", entityType: "student", status: "Present", date: isoToday() });
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Attendance updated"));
  });

  it("marks all present via bulk action", async () => {
    const user = userEvent.setup();
    render(<AttendancePro classData={classData} students={students} />);
    await waitFor(() => expect(screen.getByText("Ahmed Ali")).toBeInTheDocument());

    await user.click(screen.getByText("Mark All Present"));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("All students marked Present"));
  });

  it("filters section when multiple sections provided", async () => {
    const user = userEvent.setup();
    const sections = [{ letter: "A", classId: "c1" }, { letter: "B", classId: "c2" }];
    render(<AttendancePro classData={classData} students={students} sections={sections} />);
    await waitFor(() => expect(screen.getByText("Ahmed Ali")).toBeInTheDocument());

    expect(screen.getByText("Section")).toBeInTheDocument();
  });

  it("opens the Take Attendance dialog when markOpen is true and saves attendance", async () => {
    const user = userEvent.setup();
    const onMarkOpenChange = vi.fn();
    render(
      <AttendancePro
        classData={classData}
        students={students}
        markOpen={true}
        onMarkOpenChange={onMarkOpenChange}
      />
    );
    await waitFor(() => expect(screen.getByText("Take Attendance")).toBeInTheDocument());

    await user.click(screen.getByText("Save Attendance"));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("Attendance saved for")));
    expect(onMarkOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an empty state when there are no students", async () => {
    render(<AttendancePro classData={classData} students={[]} />);
    await waitFor(() => expect(screen.getByText("No students match this filter.")).toBeInTheDocument());
  });
});
