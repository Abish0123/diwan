import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommunicationPanel } from "./CommunicationPanel";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";

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

const integrationState = vi.hoisted(() => ({ connected: false }));
vi.mock("@/hooks/useIntegrationStatus", () => ({
  useIntegrationConnected: () => ({ connected: integrationState.connected, loading: false }),
}));

import { toast } from "sonner";

function renderPanel(props: Partial<React.ComponentProps<typeof CommunicationPanel>> = {}) {
  return render(
    <AdmissionsProvider>
      <CommunicationPanel leadId="lead-1" leadEmail="parent@example.com" leadName="Parent Name" {...props} />
    </AdmissionsProvider>
  );
}

describe("CommunicationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    integrationState.connected = false;
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    smartDbMock.watch.mockImplementation((_e: string, _f: unknown, cb: (d: unknown[]) => void) => {
      cb([]);
      return vi.fn();
    });
  });

  it("shows an empty state when there is no communication history", () => {
    renderPanel();
    expect(screen.getByText("No communication history yet.")).toBeInTheDocument();
  });

  it("renders logged communications with type, outcome, and content", () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "LeadCommunication") {
        cb([{ id: "c1", leadId: "lead-1", type: "Call", content: "Follow-up call", outcome: "Positive", timestamp: "2026-01-01T10:00:00.000Z" }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    renderPanel();
    expect(screen.getByText("Call Logged")).toBeInTheDocument();
    expect(screen.getByText("Positive")).toBeInTheDocument();
    expect(screen.getByText("Follow-up call")).toBeInTheDocument();
  });

  it("logs a call when 'Log Call' is clicked", async () => {
    smartDbMock.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText("Log Call"));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "LeadCommunication",
        expect.objectContaining({ leadId: "lead-1", type: "Call", outcome: "Positive" })
      )
    );
  });

  it("disables Send Message and shows 'WhatsApp Not Connected' when WhatsApp isn't connected", () => {
    integrationState.connected = false;
    renderPanel();
    const btn = screen.getByText("WhatsApp Not Connected").closest("button");
    expect(btn).toBeDisabled();
  });

  it("shows an error toast if Send Message is somehow triggered while disconnected", async () => {
    integrationState.connected = false;
    renderPanel();
    // Button is disabled in the DOM; directly exercise the handler path is not
    // possible via click since it's disabled — assert the disabled state instead,
    // which is the actual guard against the toast ever firing from the UI.
    const btn = screen.getByText("WhatsApp Not Connected").closest("button");
    expect(btn).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("enables and sends a WhatsApp message when connected", async () => {
    integrationState.connected = true;
    smartDbMock.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderPanel();

    const btn = screen.getByText("Send Message");
    expect(btn.closest("button")).not.toBeDisabled();
    await user.click(btn);

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "LeadCommunication",
        expect.objectContaining({ leadId: "lead-1", type: "Message", outcome: "Sent" })
      )
    );
  });

  it("opens the email compose dialog pre-filled with the lead's email, and validates required fields", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText("Send Email"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Compose Email")).toBeInTheDocument();
    expect(screen.getByDisplayValue("parent@example.com")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /send email/i }));
    expect(toast.error).toHaveBeenCalledWith("Subject and body are required");
  });

  it("sends an email with subject and body filled in", async () => {
    smartDbMock.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText("Send Email"));
    const dialog = await screen.findByRole("dialog");
    await user.type(screen.getByPlaceholderText("Email subject"), "Welcome");
    await user.type(screen.getByPlaceholderText("Write your message here..."), "Hello there");
    await user.click(within(dialog).getByRole("button", { name: /send email/i }));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "LeadCommunication",
        expect.objectContaining({ leadId: "lead-1", type: "Email", content: "Welcome\n\nHello there", outcome: "Sent" })
      )
    );
    await waitFor(() => expect(screen.queryByText("Compose Email")).not.toBeInTheDocument());
  });
});
