import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationCenter } from "./AutomationCenter";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";

beforeAll(() => {
  // Radix's Select trigger calls this on pointer events; jsdom doesn't implement it.
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

function renderCenter() {
  return render(
    <AdmissionsProvider>
      <AutomationCenter />
    </AdmissionsProvider>
  );
}

describe("AutomationCenter", () => {
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

  it("shows the empty state when there are no automation rules", () => {
    renderCenter();
    expect(screen.getByText("No automations yet — create one to get started.")).toBeInTheDocument();
    expect(screen.getByText("0 Running")).toBeInTheDocument();
  });

  it("renders existing automation rules with trigger, action, and last-run time", () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "AdmissionsAutomationRule") {
        cb([{ id: "r1", name: "Welcome Email", trigger: "Enquiry", condition: "x", action: "Send Email", isActive: true }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    renderCenter();
    expect(screen.getByText("Welcome Email")).toBeInTheDocument();
    expect(screen.getByText("Trigger: Enquiry")).toBeInTheDocument();
    expect(screen.getByText("Action: Send Email")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("1 Running")).toBeInTheDocument();
  });

  it("formats a recent lastRun as a relative time", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "AdmissionsAutomationRule") {
        cb([{ id: "r1", name: "Rule", trigger: "Enquiry", condition: "x", action: "Send Email", isActive: true, lastRun: fiveMinAgo }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    renderCenter();
    expect(screen.getByText("5 mins ago")).toBeInTheDocument();
  });

  it("validates required fields before creating a rule", async () => {
    const user = userEvent.setup();
    renderCenter();

    await user.click(screen.getByText("Create Automation"));
    await user.click(screen.getByText("Create Rule"));
    expect(toast.error).toHaveBeenCalledWith("Give the automation a name");
  });

  it("requires a trigger stage once a name is provided", async () => {
    const user = userEvent.setup();
    renderCenter();

    await user.click(screen.getByText("Create Automation"));
    await user.type(screen.getByLabelText("Name"), "My rule");
    await user.click(screen.getByText("Create Rule"));
    expect(toast.error).toHaveBeenCalledWith("Select a trigger stage");
  });

  it("creates an automation rule and closes the dialog on success", async () => {
    smartDbMock.create.mockResolvedValue({});
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderCenter();

    await user.click(screen.getByText("Create Automation"));
    await user.type(screen.getByLabelText("Name"), "Welcome on enquiry");

    await user.click(screen.getByText("When a lead moves to…"));
    await user.click(await screen.findByText("Enquiry"));

    // fireEvent.change avoids userEvent.type's special {curly-brace} key syntax.
    fireEvent.change(screen.getByLabelText("Message template"), { target: { value: "Hi {parentName}" } });
    await user.click(screen.getByText("Create Rule"));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "AdmissionsAutomationRule",
        expect.objectContaining({
          name: "Welcome on enquiry",
          trigger: "Enquiry",
          action: "Send Email",
          template: "Hi {parentName}",
          isActive: true,
        })
      )
    );
    // The trigger button is also labelled "Create Automation" and stays on the
    // page — check the dialog itself (via its distinguishing description) closed.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("toggles a rule's active state", async () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "AdmissionsAutomationRule") {
        cb([{ id: "r1", name: "Rule", trigger: "Enquiry", condition: "x", action: "Send Email", isActive: true }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderCenter();

    // Two other switches on this page (Smart Verification, Auto Follow-up cards)
    // are always-checked and static — the rule's own switch is the last one.
    const switches = screen.getAllByRole("switch");
    await user.click(switches[switches.length - 1]);

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("AdmissionsAutomationRule", "r1", { isActive: false })
    );
  });

  it("deletes a rule when the trash icon is clicked", async () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "AdmissionsAutomationRule") {
        cb([{ id: "r1", name: "Rule To Delete", trigger: "Enquiry", condition: "x", action: "Send Email", isActive: true }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    smartDbMock.delete.mockResolvedValue({});
    const user = userEvent.setup();
    renderCenter();

    const buttons = screen.getAllByRole("button");
    const trashBtn = buttons.find(b => b.querySelector("svg.lucide-trash2"));
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn!);

    await waitFor(() =>
      expect(smartDbMock.delete).toHaveBeenCalledWith("AdmissionsAutomationRule", "r1")
    );
  });
});
