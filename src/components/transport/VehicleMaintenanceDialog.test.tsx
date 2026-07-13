import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ---- Mock external boundaries used by the underlying MaintenanceLogDialog ----

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "new-id" }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { uid: "user-1", displayName: "Ali Driver", email: "ali@example.com" } })),
}));

import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { VehicleMaintenanceDialog } from "./VehicleMaintenanceDialog";

const vehicle = { id: "v1", regNumber: "QA-1234" };

beforeEach(() => {
  vi.clearAllMocks();
  (smartDb.getAll as any).mockResolvedValue([]);
  (smartDb.create as any).mockResolvedValue({ id: "new-id" });
  (smartDb.update as any).mockResolvedValue(undefined);
  (useAuth as any).mockReturnValue({ user: { uid: "user-1", displayName: "Ali Driver", email: "ali@example.com" } });
});

describe("VehicleMaintenanceDialog", () => {
  it("renders nothing when vehicle is null", () => {
    const { container } = render(
      <VehicleMaintenanceDialog vehicle={null} onClose={vi.fn()} onChanged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("maps the vehicle's regNumber to the subject name shown in the dialog", async () => {
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText("QA-1234")).toBeInTheDocument();
    await waitFor(() => expect(smartDb.getAll).toHaveBeenCalledWith("MaintenanceLog", undefined));
  });

  it("shows an empty history message when there are no logs for the vehicle", async () => {
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No maintenance issues reported yet.")).toBeInTheDocument());
  });

  it("filters MaintenanceLog rows to this vehicle's id (entity is TransportVehicle, not e.g. an asset)", async () => {
    (smartDb.getAll as any).mockResolvedValue([
      { id: "m1", assetId: "v1", assetName: "QA-1234", issue: "Brake noise", reportedBy: "Ali", reportedAt: "2026-01-01", status: "Open", uid: "user-1" },
      { id: "m2", assetId: "other-vehicle", assetName: "QA-9999", issue: "Unrelated", reportedBy: "Bob", reportedAt: "2026-01-02", status: "Open", uid: "user-1" },
    ]);
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("Brake noise")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated")).not.toBeInTheDocument();
  });

  it("reporting an issue persists against TransportVehicle and sets status to Maintenance", async () => {
    const onChanged = vi.fn();
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={vi.fn()} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText("No maintenance issues reported yet.")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Describe the issue/i), { target: { value: "Flat tire" } });
    fireEvent.click(screen.getByRole("button", { name: /Report Issue/i }));

    await waitFor(() => expect(smartDb.create).toHaveBeenCalledWith(
      "MaintenanceLog",
      expect.objectContaining({ assetId: "v1", assetName: "QA-1234", issue: "Flat tire", status: "Open" }),
      expect.any(String)
    ));
    expect(smartDb.update).toHaveBeenCalledWith("TransportVehicle", "v1", { status: "Maintenance" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("resolving the only open issue restores the vehicle to Available (resolvedStatus prop)", async () => {
    (smartDb.getAll as any).mockResolvedValue([
      { id: "m1", assetId: "v1", assetName: "QA-1234", issue: "Brake noise", reportedBy: "Ali", reportedAt: "2026-01-01", status: "Open", uid: "user-1" },
    ]);
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={vi.fn()} onChanged={vi.fn()} />);

    const resolveBtn = await screen.findByRole("button", { name: /Mark Resolved/i });
    fireEvent.click(resolveBtn);

    await waitFor(() => expect(smartDb.update).toHaveBeenCalledWith("TransportVehicle", "v1", { status: "Available" }));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("back to Available"));
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<VehicleMaintenanceDialog vehicle={vehicle} onClose={onClose} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No maintenance issues reported yet.")).toBeInTheDocument());

    // Both the footer's labeled Close button and Radix's built-in X close
    // button share the accessible name "Close" (sr-only span) — the footer
    // button is the first one in DOM order.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
