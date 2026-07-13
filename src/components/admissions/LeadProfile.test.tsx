import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadProfile } from "./LeadProfile";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";
import type { Lead } from "@/types/admissions";

// ── Mock external boundaries ────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const smartDbMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  getOne: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMock }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/emailService", () => ({
  getStageEmail: vi.fn(() => null),
  sendSimulatedEmail: vi.fn().mockResolvedValue(true),
  sendCredentialsEmail: vi.fn().mockResolvedValue(true),
  sendInvoiceGeneratedEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/useFees", () => ({
  createFirstTermInvoiceForStudent: vi.fn().mockResolvedValue(null),
  createLeadFeeInvoice: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/firebase", () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  isFirestoreWorking: false,
}));

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: { create: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/admin-emails", () => ({
  isDefaultAdminEmail: vi.fn(() => false),
}));

vi.mock("@/hooks/useIntegrationStatus", () => ({
  useIntegrationConnected: () => ({ connected: false, loading: false }),
}));

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    studentName: "Ali Hassan",
    parentName: "Hassan Ali",
    phone: "12345678",
    email: "hassan@example.com",
    interestedClass: "Grade 5",
    source: "Website",
    notes: "",
    status: "Enquiry",
    score: 70,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderProfile(lead: Lead, onOpenChange = vi.fn()) {
  return render(
    <AdmissionsProvider>
      <LeadProfile open lead={lead} onOpenChange={onOpenChange} />
    </AdmissionsProvider>
  );
}

describe("LeadProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    smartDbMock.watch.mockImplementation((_e: string, _f: unknown, cb: (d: unknown[]) => void) => {
      cb([]);
      return vi.fn();
    });
  });

  it("renders the header with student name, class, and stage badge", () => {
    renderProfile(makeLead());
    expect(screen.getAllByText("Ali Hassan").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Grade 5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Enquiry").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the WhatsApp CTA for an Enquiry-stage lead and advances to Form Sent when clicked", async () => {
    smartDbMock.update.mockResolvedValue({});
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);
    const user = userEvent.setup();
    renderProfile(makeLead());

    await user.click(screen.getByText("Send Form via WhatsApp"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("Lead", "lead-1", expect.objectContaining({ status: "Form Sent" }))
    );
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("shows 'Mark Form Received' CTA for a Form Sent lead and moves it to Form Submitted", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Form Sent" }));

    const buttons = screen.getAllByText("Mark Form Received");
    await user.click(buttons[0]);

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("Lead", "lead-1", expect.objectContaining({ status: "Form Submitted" }))
    );
  });

  it("shows an 'Awaiting Finance Confirmation' badge for Form Submitted", () => {
    renderProfile(makeLead({ status: "Form Submitted" }));
    expect(screen.getByText("Awaiting Finance Confirmation")).toBeInTheDocument();
  });

  it("shows 'Schedule Exam' CTA for Payment Done and moves to Exam tab on click", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Payment Done" }));

    await user.click(screen.getByText("Schedule Exam"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("Lead", "lead-1", expect.objectContaining({ status: "Exam" }))
    );
  });

  it("shows the officer-only badge for Doc Verification / School Fee / Section Allocation stages", () => {
    renderProfile(makeLead({ status: "Doc Verification" }));
    expect(screen.getByText("View only — Officer Dashboard")).toBeInTheDocument();
  });

  it("locks the delete button for a restricted-stage lead when the viewer isn't on the admissions team", () => {
    authState.role = "teacher";
    renderProfile(makeLead({ status: "Section Allocation" }));
    const deleteBtn = screen.getByTitle("Only the admissions team can manage this lead");
    expect(deleteBtn).toBeDisabled();
  });

  it("allows delete for a restricted-stage lead when the viewer is on the admissions team", () => {
    authState.role = "admin";
    renderProfile(makeLead({ status: "Section Allocation" }));
    expect(screen.queryByTitle("Only the admissions team can manage this lead")).not.toBeInTheDocument();
  });

  it("opens the delete confirmation dialog and deletes the lead on confirm", async () => {
    smartDbMock.delete.mockResolvedValue({});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderProfile(makeLead(), onOpenChange);

    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find(b => b.querySelector("svg.lucide-trash-2, svg.lucide-trash2"));
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn!);

    expect(await screen.findByText("Delete Lead")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(smartDbMock.delete).toHaveBeenCalledWith("Lead", "lead-1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("advances via the footer 'Next Stage' button for a non-restricted, non-special stage", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Payment Done" }));

    await user.click(screen.getByText("Next Stage"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("Lead", "lead-1", expect.objectContaining({ status: "Exam" }))
    );
  });

  it("closes the dialog via the footer Close button", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderProfile(makeLead(), onOpenChange);

    // The dialog's own top-right X control also has an accessible "Close"
    // label (sr-only span) — the visible footer button comes first in the DOM.
    await user.click(screen.getAllByText("Close")[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the Exam tab and requires date+time before saving exam details", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Exam" }));

    await user.click(screen.getByRole("tab", { name: "Exam" }));
    await user.click(screen.getByText("Save Exam Details"));

    expect(toast.error).toHaveBeenCalledWith("Set exam date and time first");
  });

  it("saves exam details when date and time are provided", async () => {
    smartDbMock.update.mockResolvedValue({});
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Exam" }));

    await user.click(screen.getByRole("tab", { name: "Exam" }));
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-08-01" } });
    fireEvent.change(timeInput, { target: { value: "09:00" } });

    await user.click(screen.getByText("Save Exam Details"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ examDate: "2026-08-01" })
      )
    );
    expect(toast.success).toHaveBeenCalledWith("Exam details saved");
  });

  it("shows the Interview tab once the lead has reached the Interview stage", async () => {
    const user = userEvent.setup();
    renderProfile(makeLead({ status: "Interview" }));
    await user.click(screen.getByRole("tab", { name: "Interview" }));
    expect(screen.getByText("Interview Outcome")).toBeInTheDocument();
  });

  it("does not show the Exam/Interview tabs for a lead still at Enquiry", () => {
    renderProfile(makeLead({ status: "Enquiry" }));
    expect(screen.queryByRole("tab", { name: "Exam" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Interview" })).not.toBeInTheDocument();
  });

  it("renders the Communication tab content", async () => {
    const user = userEvent.setup();
    renderProfile(makeLead());
    await user.click(screen.getByRole("tab", { name: "Communication" }));
    expect(screen.getByText("Communication History")).toBeInTheDocument();
  });

  it("renders the Notes tab with lead notes or a fallback message", async () => {
    const user = userEvent.setup();
    renderProfile(makeLead({ notes: "Great candidate" }));
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByText('"Great candidate"')).toBeInTheDocument();
  });

  it("falls back to placeholder text on the Notes tab when there are no notes", async () => {
    const user = userEvent.setup();
    renderProfile(makeLead({ notes: "" }));
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByText('"No notes added yet."')).toBeInTheDocument();
  });

  it("switches into the post-enrollment onboarding flow when the lead is Enrolled", () => {
    renderProfile(makeLead({ status: "Enrolled" }));
    expect(screen.getByText("Student Enrolled Successfully!")).toBeInTheDocument();
  });
});
