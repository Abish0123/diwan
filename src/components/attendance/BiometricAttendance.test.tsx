import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const authMock = vi.hoisted(() => ({ user: { uid: "u1" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const notifyMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/classPublishNotify", () => ({
  notifyParentsOfStudents: (...args: unknown[]) => notifyMock(...args),
}));

const getAllMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { BiometricAttendance } from "./BiometricAttendance";

const STUDENTS = [
  { id: "STU-1", name: "Ahmad", grade: "Grade 5", section: "A" },
  { id: "STU-2", name: "Sara", grade: "Grade 3", section: "B" },
];

function renderComp(open = true) {
  const onClose = vi.fn();
  const utils = render(<BiometricAttendance open={open} onClose={onClose} />);
  return { ...utils, onClose };
}

describe("BiometricAttendance", () => {
  beforeEach(() => {
    getAllMock.mockReset().mockResolvedValue(STUDENTS);
    createMock.mockReset().mockResolvedValue(undefined);
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    notifyMock.mockClear();
  });

  it("loads the student roster when opened", async () => {
    renderComp(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("Student", undefined));
  });

  it("shows an error toast when the scanned code matches no student", async () => {
    renderComp(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    const input = screen.getByPlaceholderText(/Scan card or type Student ID/);
    fireEvent.change(input, { target: { value: "NOPE" } });
    fireEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No student found matching "NOPE"'));
  });

  it("records a Present attendance entry for a matched student ID", async () => {
    renderComp(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    const input = screen.getByPlaceholderText(/Scan card or type Student ID/);
    fireEvent.change(input, { target: { value: "STU-1" } });
    fireEvent.click(screen.getByText("Record"));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith(
      "attendance",
      expect.objectContaining({ entityId: "STU-1", name: "Ahmad", status: "Present", source: "RFID Scan" }),
      expect.stringContaining("ATT-STU-STU-1-")
    ));
    expect(await screen.findByText("Ahmad")).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("Ahmad marked Present");
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("records a Late entry and notifies parents when 'Mark as Late' is checked", async () => {
    renderComp(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Mark as Late instead of Present/));

    const input = screen.getByPlaceholderText(/Scan card or type Student ID/);
    fireEvent.change(input, { target: { value: "STU-2" } });
    fireEvent.click(screen.getByText("Record"));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith(
      "attendance",
      expect.objectContaining({ status: "Late" }),
      expect.any(String)
    ));
    await waitFor(() => expect(notifyMock).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("Sara marked Late");
  });

  it("updates the mode placeholder when switching between RFID and Fingerprint", async () => {
    renderComp(true);
    expect(screen.getByPlaceholderText(/Scan card or type Student ID/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Fingerprint"));
    expect(screen.getByPlaceholderText(/Type Student ID \(device output\)/)).toBeInTheDocument();
  });

  it("updates the Present/Late/Total stat counters as scans come in", async () => {
    renderComp(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    const input = screen.getByPlaceholderText(/Scan card or type Student ID/);
    fireEvent.change(input, { target: { value: "STU-1" } });
    fireEvent.click(screen.getByText("Record"));
    await screen.findByText("Ahmad");

    const statLabels = screen.getAllByText("Present");
    const statContainer = statLabels
      .map(el => el.closest(".bg-muted\\/50"))
      .find((el): el is Element => !!el);
    expect(statContainer?.textContent).toBe("1Present");
  });

  it("expands and collapses the device info panel", () => {
    renderComp(true);
    expect(screen.queryByText(/No physical scanner is connected/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Device Info"));
    expect(screen.getByText(/No physical scanner is connected/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Device Info"));
    expect(screen.queryByText(/No physical scanner is connected/)).not.toBeInTheDocument();
  });

  it("closes via the X button", () => {
    const { onClose } = renderComp(true);
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalled();
  });
});
