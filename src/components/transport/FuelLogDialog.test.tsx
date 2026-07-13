import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ---- Mock external boundaries ----

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "new-id" }),
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
import { FuelLogDialog } from "./FuelLogDialog";

const vehicle = { id: "v1", regNumber: "QA-1234" };

beforeEach(() => {
  vi.clearAllMocks();
  (smartDb.getAll as any).mockResolvedValue([]);
  (smartDb.create as any).mockResolvedValue({ id: "new-id" });
  (useAuth as any).mockReturnValue({ user: { uid: "user-1", displayName: "Ali Driver", email: "ali@example.com" } });
});

describe("FuelLogDialog", () => {
  it("renders nothing when vehicle is null", () => {
    const { container } = render(<FuelLogDialog vehicle={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the vehicle registration and an empty history message when there are no logs", async () => {
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    expect(screen.getAllByText("QA-1234").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("No fuel fill-ups logged yet.")).toBeInTheDocument());
  });

  it("loads and filters logs for this vehicle, sorted by date descending", async () => {
    (smartDb.getAll as any).mockResolvedValue([
      { id: "f1", vehicleId: "v1", vehicleReg: "QA-1234", liters: 10, amount: 30, date: "2026-01-01", loggedBy: "A", uid: "user-1" },
      { id: "f2", vehicleId: "other", vehicleReg: "QA-9999", liters: 20, amount: 60, date: "2026-02-01", loggedBy: "B", uid: "user-1" },
      { id: "f3", vehicleId: "v1", vehicleReg: "QA-1234", liters: 15, amount: 45, date: "2026-03-01", loggedBy: "C", uid: "user-1" },
    ]);
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    // f2 belongs to a different vehicle and must be excluded
    expect(screen.queryByText(/20L/)).not.toBeInTheDocument();
    const entries = screen.getAllByText(/L · QAR/);
    expect(entries).toHaveLength(2);
    // f3 (2026-03-01) should come before f1 (2026-01-01)
    expect(entries[0].textContent).toContain("15L");
    expect(entries[1].textContent).toContain("10L");
  });

  it("computes the total for fuel logged in the current month", async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    (smartDb.getAll as any).mockResolvedValue([
      { id: "f1", vehicleId: "v1", vehicleReg: "QA-1234", liters: 10, amount: 100, date: `${thisMonth}-05`, loggedBy: "A", uid: "user-1" },
      { id: "f2", vehicleId: "v1", vehicleReg: "QA-1234", liters: 5, amount: 50, date: "2000-01-01", loggedBy: "B", uid: "user-1" },
    ]);
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/QAR 100 this month/)).toBeInTheDocument());
  });

  it("rejects submission when liters is missing/zero", async () => {
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("120"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Log Fill-up/i }));

    expect(toast.error).toHaveBeenCalledWith("Enter the liters filled");
    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("rejects submission when amount is missing/zero", async () => {
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("40"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /Log Fill-up/i }));

    expect(toast.error).toHaveBeenCalledWith("Enter the amount paid");
    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("creates a FuelLog and a matching Transport Expense on valid submission", async () => {
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("40"), { target: { value: "40" } });
    fireEvent.change(screen.getByPlaceholderText("120"), { target: { value: "120" } });
    fireEvent.change(screen.getByPlaceholderText("optional"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: /Log Fill-up/i }));

    await waitFor(() => expect(smartDb.create).toHaveBeenCalledWith(
      "FuelLog",
      expect.objectContaining({ vehicleId: "v1", vehicleReg: "QA-1234", liters: 40, amount: 120, odometer: 5000, loggedBy: "Ali Driver", uid: "user-1" }),
      expect.any(String)
    ));
    expect(smartDb.create).toHaveBeenCalledWith(
      "Expense",
      expect.objectContaining({
        category: "Transport",
        amount: 120,
        status: "Paid",
        sourceType: "FuelLog",
        description: expect.stringContaining("QA-1234"),
        uid: "user-1",
      }),
      expect.stringContaining("expense-fuel-")
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Logged 40L"));
    // New entry should appear immediately in the history without a refetch
    expect(await screen.findByText(/40L · QAR 120/)).toBeInTheDocument();
  });

  it("shows an error toast when persistence fails", async () => {
    (smartDb.create as any).mockRejectedValueOnce(new Error("db down"));
    render(<FuelLogDialog vehicle={vehicle} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("40"), { target: { value: "40" } });
    fireEvent.change(screen.getByPlaceholderText("120"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /Log Fill-up/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to log fuel fill-up"));
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<FuelLogDialog vehicle={vehicle} onClose={onClose} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    // Both the footer's labeled Close button and Radix's built-in X close
    // button share the accessible name "Close" (sr-only span) — the footer
    // button is the first one in DOM order.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
