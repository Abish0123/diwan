import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdmissionsPipeline } from "./AdmissionsPipeline";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";
import type { Lead } from "@/types/admissions";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

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

function renderPipeline(leads: Lead[]) {
  return render(
    <AdmissionsProvider>
      <AdmissionsPipeline filteredLeads={leads} />
    </AdmissionsProvider>
  );
}

describe("AdmissionsPipeline", () => {
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

  it("renders all ten pipeline columns", () => {
    renderPipeline([]);
    const stages = [
      "Enquiry", "Form Sent", "Form Submitted", "Payment Done", "Exam",
      "Interview", "Doc Verification", "School Fee", "Section Allocation", "Enrolled",
    ];
    for (const stage of stages) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it("groups leads into their matching status column", () => {
    renderPipeline([
      makeLead({ id: "l1", studentName: "In Enquiry", status: "Enquiry" }),
      makeLead({ id: "l2", studentName: "In Exam", status: "Exam" }),
    ]);
    expect(screen.getByText("In Enquiry")).toBeInTheDocument();
    expect(screen.getByText("In Exam")).toBeInTheDocument();
  });

  it("sorts leads within a column newest-first by createdAt", () => {
    renderPipeline([
      makeLead({ id: "l1", studentName: "Older", status: "Enquiry", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeLead({ id: "l2", studentName: "Newer", status: "Enquiry", createdAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    const names = screen.getAllByText(/Older|Newer/).map(el => el.textContent);
    expect(names.indexOf("Newer")).toBeLessThan(names.indexOf("Older"));
  });

  it("opens the LeadProfile dialog when a card's eye icon (onOpenProfile) is triggered", async () => {
    const user = userEvent.setup();
    renderPipeline([makeLead({ studentName: "Target Lead" })]);

    const buttons = screen.getAllByRole("button");
    // dnd-kit's useSortable puts role="button" on the whole draggable card too,
    // so it also matches — the real icon button is the innermost (last) match.
    const eyeButtons = buttons.filter(b => b.querySelector("svg.lucide-eye"));
    const eyeButton = eyeButtons[eyeButtons.length - 1];
    await user.click(eyeButton);

    // LeadProfile renders the student's name as a dialog heading (h2), plus the card still shows it.
    await waitFor(() => expect(screen.getAllByText("Target Lead").length).toBeGreaterThanOrEqual(2));
  });

  it("closes the LeadProfile dialog when its Close button is clicked", async () => {
    const user = userEvent.setup();
    renderPipeline([makeLead({ studentName: "Target Lead" })]);

    const buttons = screen.getAllByRole("button");
    const eyeButtons = buttons.filter(b => b.querySelector("svg.lucide-eye"));
    const eyeButton = eyeButtons[eyeButtons.length - 1];
    await user.click(eyeButton);

    // Footer "Close" button comes before the dialog's sr-only X-button label.
    const closeBtn = (await screen.findAllByText("Close"))[0];
    await user.click(closeBtn);

    // Only the card's copy of the name should remain once the dialog closes.
    await waitFor(() => expect(screen.getAllByText("Target Lead")).toHaveLength(1));
  });
});
