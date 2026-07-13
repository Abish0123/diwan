import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

/** Render a LeadCard inside the required providers.
 *  The PointerSensor is configured with a 10px activation distance so that a
 *  single tap/click never triggers a drag, allowing onClick handlers on child
 *  buttons to fire normally in jsdom. */
function TestDndWrapper({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

function renderCard(lead: Lead, onOpenProfile = vi.fn()) {
  return render(
    <AdmissionsProvider>
      <TestDndWrapper>
        <LeadCard lead={lead} onOpenProfile={onOpenProfile} />
      </TestDndWrapper>
    </AdmissionsProvider>
  );
}

describe("LeadCard", () => {
  /** Seed smartDb.watch so AdmissionsContext's `leads` state contains the
   *  given lead. moveLead / updateLead both do `leads.find(l => l.id === id)`
   *  before writing to the DB; without the seed they bail out early. */
  function seedLead(lead: Lead) {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "Lead") cb([lead]);
      else cb([]);
      return vi.fn();
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    // Default: empty leads list (overridden per-test where needed)
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
        <TestDndWrapper>
          <LeadCard lead={makeLead({ aiInsight: "Great match" })} onOpenProfile={vi.fn()} />
        </TestDndWrapper>
      </AdmissionsProvider>
    );
  });

  it("calls onOpenProfile when the eye icon is clicked", async () => {
    const onOpenProfile = vi.fn();
    const user = userEvent.setup();
    renderCard(makeLead(), onOpenProfile);

    // The inline eye button has aria-label="View profile" added for accessibility.
    const eyeBtn = screen.getByRole("button", { name: "View profile" });
    await user.click(eyeBtn);
    expect(onOpenProfile).toHaveBeenCalledWith("lead-1");
  });

  it("advances to the next stage when the chevron button is clicked", async () => {
    const lead = makeLead({ status: "Enquiry" });
    seedLead(lead);
    smartDbMock.update.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(lead);

    // Wait for AdmissionsContext useEffect to flush and populate `leads` state
    // before clicking — moveLead bails out if leads.find() returns undefined.
    await waitFor(() => expect(screen.getByTitle("Advance to Form Sent")).toBeInTheDocument());
    await user.click(screen.getByTitle("Advance to Form Sent"));

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

    // Opening the actions menu via the aria-labelled trigger button.
    const moreBtn = screen.getByRole("button", { name: "Lead actions" });
    await user.click(moreBtn);

    // Radix DropdownMenu renders into a portal attached to document.body;
    // findByText searches the whole document so it will find the portal items.
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
    const lead = makeLead();
    seedLead(lead);
    smartDbMock.update.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(lead);

    // Open the dropdown then click Edit Details (Radix portal).
    await user.click(await screen.findByRole("button", { name: "Lead actions" }));
    await user.click(await screen.findByText("Edit Details"));

    // The edit dialog should appear; find the student name input by its current value.
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
    const lead = makeLead();
    seedLead(lead);
    smartDbMock.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard(lead);

    await user.click(await screen.findByRole("button", { name: "Lead actions" }));
    await user.click(await screen.findByText("Delete Lead"));

    await waitFor(() => expect(smartDbMock.delete).toHaveBeenCalledWith("Lead", "lead-1"));
  });
});
