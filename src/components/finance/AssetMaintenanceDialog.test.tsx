import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock external boundaries (used by the underlying MaintenanceLogDialog) ──
const getAllMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "user-1", displayName: "Finance Admin", email: "finance@school.com" } }),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccessMock(...a), error: (...a: unknown[]) => toastErrorMock(...a) },
}));

import { AssetMaintenanceDialog } from "./AssetMaintenanceDialog";

describe("AssetMaintenanceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when asset is null", () => {
    const { container } = render(
      <AssetMaintenanceDialog asset={null} onClose={vi.fn()} onChanged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("forwards the asset id/name as the subject and renders the maintenance history dialog", async () => {
    render(
      <AssetMaintenanceDialog
        asset={{ id: "a1", name: "School Bus #1" } as any}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByText("School Bus #1")).toBeInTheDocument();
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("MaintenanceLog", undefined));
    expect(await screen.findByText(/no maintenance issues reported yet/i)).toBeInTheDocument();
  });

  it("reports a new issue against the AssetRecord entity and sets its status to Maintenance", async () => {
    createMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const user = userEvent.setup();

    render(
      <AssetMaintenanceDialog
        asset={{ id: "a1", name: "School Bus #1" } as any}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    );

    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    await user.type(screen.getByPlaceholderText(/describe the issue/i), "Flat tyre");
    await user.click(screen.getByRole("button", { name: /report issue/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith(
      "MaintenanceLog",
      expect.objectContaining({ assetId: "a1", assetName: "School Bus #1", issue: "Flat tyre" }),
      expect.any(String)
    ));
    // resolvedStatus is fixed to "Active" for assets, and the entity updated is AssetRecord.
    expect(updateMock).toHaveBeenCalledWith("AssetRecord", "a1", { status: "Maintenance" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("calls onClose when the dialog's onOpenChange fires with false (Close button)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetMaintenanceDialog
        asset={{ id: "a1", name: "School Bus #1" } as any}
        onClose={onClose}
        onChanged={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
