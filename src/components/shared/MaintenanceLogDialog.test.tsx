import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", displayName: "Admin One", email: "admin@school.test" } as
    | { uid: string; displayName?: string; email?: string }
    | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authMocks.user }) }));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMocks }));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastMocks.success(...a), error: (...a: unknown[]) => toastMocks.error(...a) } }));

import { MaintenanceLogDialog } from "./MaintenanceLogDialog";

const subject = { id: "asset-1", name: "Projector A" };

function renderDialog(props: Partial<React.ComponentProps<typeof MaintenanceLogDialog>> = {}) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const utils = render(
    <MaintenanceLogDialog
      subject={subject}
      entity="AssetRecord"
      resolvedStatus="Active"
      onClose={onClose}
      onChanged={onChanged}
      {...props}
    />
  );
  return { ...utils, onClose, onChanged };
}

describe("MaintenanceLogDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1", displayName: "Admin One", email: "admin@school.test" };
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
  });

  it("renders nothing when subject is null", () => {
    const { container } = render(
      <MaintenanceLogDialog subject={null} entity="AssetRecord" resolvedStatus="Active" onClose={vi.fn()} onChanged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the subject name, loads history, and shows empty state when there are no logs", async () => {
    renderDialog();
    expect(screen.getByText("Projector A")).toBeInTheDocument();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalledWith("MaintenanceLog", undefined));
    expect(await screen.findByText("No maintenance issues reported yet.")).toBeInTheDocument();
  });

  it("renders existing logs filtered to this subject, with Open/Resolved badges", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", assetId: "asset-1", assetName: "Projector A", issue: "Bulb broken", status: "Open", reportedBy: "Bob", reportedAt: "2026-01-01T00:00:00.000Z" },
      { id: "l2", assetId: "asset-1", assetName: "Projector A", issue: "Fixed already", status: "Resolved", reportedBy: "Bob", reportedAt: "2026-01-02T00:00:00.000Z" },
      { id: "l3", assetId: "other-asset", assetName: "Other", issue: "Irrelevant", status: "Open", reportedBy: "Bob", reportedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    renderDialog();
    expect(await screen.findByText("Bulb broken")).toBeInTheDocument();
    expect(screen.getByText("Fixed already")).toBeInTheDocument();
    expect(screen.queryByText("Irrelevant")).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("shows a validation error toast when reporting with an empty issue", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /report issue/i }));
    expect(toastMocks.error).toHaveBeenCalledWith("Describe the issue first.");
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("reports a new issue, creates a MaintenanceLog, and sets the subject to Maintenance", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDialog();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText(/describe the issue/i), "Screen flickering");
    await user.click(screen.getByRole("button", { name: /report issue/i }));

    await waitFor(() =>
      expect(smartDbMocks.create).toHaveBeenCalledWith(
        "MaintenanceLog",
        expect.objectContaining({ assetId: "asset-1", issue: "Screen flickering", status: "Open" }),
        expect.stringMatching(/^maint-/)
      )
    );
    expect(smartDbMocks.update).toHaveBeenCalledWith("AssetRecord", "asset-1", { status: "Maintenance" });
    expect(toastMocks.success).toHaveBeenCalledWith("Reported an issue on Projector A — status set to Maintenance.");
    expect(onChanged).toHaveBeenCalled();
  });

  it("resolves the last open issue and restores the resolvedStatus on the entity", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", assetId: "asset-1", assetName: "Projector A", issue: "Bulb broken", status: "Open", reportedBy: "Bob", reportedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const user = userEvent.setup();
    const { onChanged } = renderDialog();

    await screen.findByText("Bulb broken");
    await user.click(screen.getByRole("button", { name: /mark resolved/i }));

    await waitFor(() =>
      expect(smartDbMocks.update).toHaveBeenCalledWith(
        "MaintenanceLog",
        "l1",
        expect.objectContaining({ status: "Resolved" })
      )
    );
    expect(smartDbMocks.update).toHaveBeenCalledWith("AssetRecord", "asset-1", { status: "Active" });
    expect(toastMocks.success).toHaveBeenCalledWith("Resolved — Projector A is back to Active.");
    expect(onChanged).toHaveBeenCalled();
  });

  it("leaves entity status alone and shows a generic toast when other issues are still open", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", assetId: "asset-1", assetName: "Projector A", issue: "First", status: "Open", reportedBy: "Bob", reportedAt: "2026-01-01T00:00:00.000Z" },
      { id: "l2", assetId: "asset-1", assetName: "Projector A", issue: "Second", status: "Open", reportedBy: "Bob", reportedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Second");
    const resolveButtons = screen.getAllByRole("button", { name: /mark resolved/i });
    await user.click(resolveButtons[0]);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Marked resolved."));
    expect(smartDbMocks.update).not.toHaveBeenCalledWith("AssetRecord", "asset-1", { status: "Active" });
  });

  it("calls onClose when the Close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    // Two buttons match /close/: the footer "Close" button and the dialog's
    // sr-only "Close" X button. Pick the visible footer one explicitly.
    const closeButtons = screen.getAllByRole("button", { name: /^close$/i });
    const footerCloseButton = closeButtons.find((btn) => btn.textContent === "Close")!;
    await user.click(footerCloseButton);
    expect(onClose).toHaveBeenCalled();
  });
});
