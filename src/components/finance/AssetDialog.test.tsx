import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Radix Select needs these in jsdom ───────────────────────────────────────
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// ── Mock external boundaries ────────────────────────────────────────────────
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

const authMock = vi.hoisted(() => ({ user: { uid: "user-1" } as { uid: string } | null }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMock.user }),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccessMock(...a), error: (...a: unknown[]) => toastErrorMock(...a) },
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: { now: () => ({ __ts: true }) },
}));

import { AssetDialog } from "./AssetDialog";
import type { Asset } from "@/types/finance";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    name: "School Bus #1",
    category: "Vehicles",
    purchaseDate: "2025-01-01",
    purchaseValue: 50000,
    currentValue: 40000,
    status: "Active",
    depreciation: "10%",
    assignedToStaffId: "",
    uid: "user-1",
    createdAt: "2025-01-01",
    ...overrides,
  } as Asset;
}

describe("AssetDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: "user-1" };
    getAllMock.mockResolvedValue([
      { id: "s1", name: "Jane Teacher", status: "Active" },
      { id: "s2", name: "Retired Staff", status: "Inactive" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the create form when no asset is supplied", async () => {
    render(<AssetDialog isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Add New Asset")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create asset/i })).toBeInTheDocument();
  });

  it("fetches only active staff into the assignment dropdown when opened", async () => {
    render(<AssetDialog isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("Staff", undefined));

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /assigned to/i }));
    // Only the active staff member should show; the inactive one is filtered out.
    expect(await screen.findByRole("option", { name: "Jane Teacher" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Retired Staff" })).not.toBeInTheDocument();
  });

  it("does not fetch staff when the dialog is closed", () => {
    render(<AssetDialog isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it("pre-fills the form with the existing asset's values when editing", () => {
    render(<AssetDialog isOpen={true} onClose={vi.fn()} asset={makeAsset()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Edit Asset")).toBeInTheDocument();
    expect(screen.getByDisplayValue("School Bus #1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update asset/i })).toBeInTheDocument();
  });

  it("shows a validation error when the asset name is too short on submit", async () => {
    const user = userEvent.setup();
    render(<AssetDialog isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create asset/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a new asset with assignedToStaffId/assignedToName defaulted to null when unassigned", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    createMock.mockResolvedValue({ id: "new-asset" });
    const user = userEvent.setup();

    render(<AssetDialog isOpen={true} onClose={onClose} onSuccess={onSuccess} />);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText("e.g. School Bus #1"), "New Projector");
    // Category is required — pick one from the select.
    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(await screen.findByRole("option", { name: "Equipment" }));

    await user.click(screen.getByRole("button", { name: /create asset/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [entity, payload] = createMock.mock.calls[0];
    expect(entity).toBe("AssetRecord");
    expect(payload).toMatchObject({
      name: "New Projector",
      assignedToStaffId: null,
      assignedToName: null,
      uid: "user-1",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Asset created successfully");
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("updates an existing asset via smartDb.update and shows the update toast", async () => {
    updateMock.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<AssetDialog isOpen={true} onClose={vi.fn()} asset={makeAsset()} onSuccess={onSuccess} />);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /update asset/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("AssetRecord", "a1", expect.objectContaining({ name: "School Bus #1" })));
    expect(toastSuccessMock).toHaveBeenCalledWith("Asset updated successfully");
  });

  it("shows an error toast and does not call onSuccess/onClose when the save fails", async () => {
    createMock.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AssetDialog isOpen={true} onClose={onClose} onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText("e.g. School Bus #1"), "Broken Save");
    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(await screen.findByRole("option", { name: "Equipment" }));
    await user.click(screen.getByRole("button", { name: /create asset/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Failed to save asset"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does nothing on submit when there is no authenticated user", async () => {
    authMock.user = null;
    const user = userEvent.setup();
    render(<AssetDialog isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("e.g. School Bus #1"), "Whatever");
    await user.click(screen.getByRole("button", { name: /create asset/i }));

    expect(createMock).not.toHaveBeenCalled();
  });
});
