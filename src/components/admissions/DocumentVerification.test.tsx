import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentVerification } from "./DocumentVerification";
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

import { toast } from "sonner";

function renderDocs(leadId = "lead-1") {
  return render(
    <AdmissionsProvider>
      <DocumentVerification leadId={leadId} />
    </AdmissionsProvider>
  );
}

describe("DocumentVerification", () => {
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

  it("renders all three required document rows as Missing when none uploaded", () => {
    renderDocs();
    expect(screen.getByText("Birth Certificate")).toBeInTheDocument();
    expect(screen.getByText("ID Proof")).toBeInTheDocument();
    expect(screen.getByText("Previous Records")).toBeInTheDocument();
    // Each row shows the status twice: once next to the icon, once in the Badge.
    expect(screen.getAllByText("Missing")).toHaveLength(6);
  });

  it("renders a document's real status when it exists", () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "LeadDocument") {
        cb([{ id: "doc-1", leadId: "lead-1", name: "Birth Certificate", type: "Birth Certificate", status: "Verified" }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    renderDocs();
    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Missing")).toHaveLength(4);
  });

  it("uploads the next missing document when 'Upload New' is clicked", async () => {
    smartDbMock.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderDocs();

    await user.click(screen.getByText("Upload New"));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "LeadDocument",
        expect.objectContaining({ leadId: "lead-1", type: "Birth Certificate", status: "Pending" })
      )
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Birth Certificate"));
  });

  it("shows an info toast when all required documents are already uploaded", async () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "LeadDocument") {
        cb([
          { id: "d1", leadId: "lead-1", name: "Birth Certificate", type: "Birth Certificate", status: "Verified" },
          { id: "d2", leadId: "lead-1", name: "ID Proof", type: "ID Proof", status: "Verified" },
          { id: "d3", leadId: "lead-1", name: "Previous Records", type: "Previous Records", status: "Verified" },
        ]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    const user = userEvent.setup();
    renderDocs();

    await user.click(screen.getByText("Upload New"));
    expect(toast.info).toHaveBeenCalledWith("All required documents are already uploaded");
    expect(smartDbMock.create).not.toHaveBeenCalled();
  });

  it("verifies a pending document via the row's dropdown menu", async () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "LeadDocument") {
        cb([{ id: "doc-1", leadId: "lead-1", name: "Birth Certificate", type: "Birth Certificate", status: "Pending" }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderDocs();

    const moreButtons = screen.getAllByRole("button");
    const moreBtn = moreButtons.find(b => b.querySelector("svg.lucide-ellipsis-vertical, svg.lucide-more-vertical"));
    expect(moreBtn).toBeTruthy();
    await user.click(moreBtn!);

    const verifyItem = await screen.findByText("Verify Document");
    await user.click(verifyItem);

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith("LeadDocument", "doc-1", { status: "Verified" })
    );
    expect(toast.success).toHaveBeenCalledWith("Document verified");
  });

  it("does not show a 'Verify Document' option for an already-verified document", async () => {
    smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
      if (entity === "LeadDocument") {
        cb([{ id: "doc-1", leadId: "lead-1", name: "Birth Certificate", type: "Birth Certificate", status: "Verified" }]);
      } else {
        cb([]);
      }
      return vi.fn();
    });
    const user = userEvent.setup();
    renderDocs();

    const moreButtons = screen.getAllByRole("button");
    const moreBtn = moreButtons.find(b => b.querySelector("svg.lucide-ellipsis-vertical, svg.lucide-more-vertical"));
    await user.click(moreBtn!);

    expect(await screen.findByText("View Document")).toBeInTheDocument();
    expect(screen.queryByText("Verify Document")).not.toBeInTheDocument();
  });
});
