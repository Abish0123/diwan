import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { LeadCard } from "./LeadCard";
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

import { toast } from "sonner";

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

function renderCard(lead: Lead, onOpenProfile = vi.fn()) {
  return render(
    <AdmissionsProvider>
      <DndContext>
        <LeadCard lead={lead} onOpenProfile={onOpenProfile} />
      </DndContext>
    </AdmissionsProvider>
  );
}

describe("LeadCard", () => {
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

  it("renders student name, class, score badge, parent, and phone", () => {
    renderCard(makeLead());
    expect(screen.getByText("Ali Hassan")).toBeInTheDocument();
    expect(screen.getByText("Grade 5")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("Hassan Ali")).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
  });

  it("falls back to placeholders when optional fields are missing", () => {
    renderCard(makeLead({ studentName: undefined as any, interestedClass: undefined as any, parentName: undefined as any, phone: undefined as any }));
    expect(screen.getByText("Unknown Student")).toBeInTheDocument();
    expect(screen.getByText("Class TBD")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the AI insight popover trigger only when aiInsight is set", () => {
    const { rerender } = renderCard(makeLead({ aiInsight: undefined }));
    expect(screen.queryByText("AI Insight")).not.toBeInTheDocument();

    rerender(
      <AdmissionsProvider>
        <DndContext>
          <LeadCard lead={makeLead({ aiInsight: "Great match" })} onOpenProfile={vi.fn()} />
        </DndContext>
      </AdmissionsProvider>
    );
  });

  it("calls onOpenProfile when the eye icon is clicked", async () => {
    const onOpenProfile = vi.fn();
    const user = userEvent.setup();
    renderCard(makeLead(), onOpenProfile);

    // The eye button has no accessible name; select via icon container button list.
    const buttons = screen.getAllByRole("button");
    const eyeButton = buttons.find(b => b.querySelector("svg.lucide-eye"));
    expect(eyeButton).toBeTruthy();
    await user.click(eyeButton!);
    expect(onOpenProfile).toHaveBeenCalledWith("lead-1");
  });

  it("advances to the next stage when the chevron button is clicked", async () => {
    smartDbMock.update.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(makeLead({ status: "Enquiry" }));

    const advanceBtn = screen.getByTitle("Advance to Form Sent");
    await user.click(advanceBtn);

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ status: "Form Sent" })
      )
    );
  });

  it("does not render an advance button for a lead already on the last stage", () => {
    renderCard(makeLead({ status: "Enrolled" }));
    expect(screen.queryByTitle(/Advance to/)).not.toBeInTheDocument();
  });

  it("locks editing/deleting/dragging for a restricted-stage lead when viewer is not on the admissions team", async () => {
    authState.role = "teacher";
    const user = userEvent.setup();
    renderCard(makeLead({ status: "Enrolled" }));

    // Lock icon with the admissions-team-only title should be visible.
    expect(screen.getByTitle("Only the admissions team can manage this lead")).toBeInTheDocument();

    // Opening the actions menu, Edit/Delete should be disabled.
    const moreButtons = screen.getAllByRole("button");
    const moreBtn = moreButtons.find(b => b.querySelector("svg.lucide-more-vertical"));
    await user.click(moreBtn!);

    const editItem = await screen.findByText("Edit Details");
    const deleteItem = await screen.findByText("Delete Lead");
    expect(editItem.closest('[role="menuitem"]')).toHaveAttribute("aria-disabled", "true");
    expect(deleteItem.closest('[role="menuitem"]')).toHaveAttribute("aria-disabled", "true");
  });

  it("allows the admissions team to manage a restricted-stage lead (no lock icon)", () => {
    authState.role = "admin";
    renderCard(makeLead({ status: "Enrolled" }));
    expect(screen.queryByTitle("Only the admissions team can manage this lead")).not.toBeInTheDocument();
  });

  it("opens the edit dialog, edits a field, and saves via updateLead", async () => {
    smartDbMock.update.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(makeLead());

    const moreButtons = screen.getAllByRole("button");
    const moreBtn = moreButtons.find(b => b.querySelector("svg.lucide-more-vertical"));
    await user.click(moreBtn!);
    await user.click(await screen.findByText("Edit Details"));

    const nameInput = await screen.findByDisplayValue("Ali Hassan");
    await user.clear(nameInput);
    await user.type(nameInput, "Ali Updated");

    await user.click(screen.getByText("Save Changes"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ studentName: "Ali Updated" })
      )
    );
    await waitFor(() => expect(screen.queryByText("Edit Lead Details")).not.toBeInTheDocument());
  });

  it("deletes the lead when Delete Lead is clicked", async () => {
    smartDbMock.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(makeLead());

    const moreButtons = screen.getAllByRole("button");
    const moreBtn = moreButtons.find(b => b.querySelector("svg.lucide-more-vertical"));
    await user.click(moreBtn!);
    await user.click(await screen.findByText("Delete Lead"));

    await waitFor(() => expect(smartDbMock.delete).toHaveBeenCalledWith("Lead", "lead-1"));
  });
});
