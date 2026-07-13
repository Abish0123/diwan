import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const authMock = vi.hoisted(() => ({ user: { uid: "u1", name: "Admin", email: "admin@x.com" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const getAllMock = vi.fn();
const updateMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { BarcodeScanner } from "./BarcodeScanner";

const ITEMS = [
  { id: "item-1", itemCode: "STK-1", name: "Notebooks", stock: 20, minLevel: 10 },
  { id: "item-2", itemCode: "STK-2", name: "Chalk", stock: 5, minLevel: 10 },
];

function renderScanner(open = true) {
  const onClose = vi.fn();
  const utils = render(<BarcodeScanner open={open} onClose={onClose} />);
  return { ...utils, onClose };
}

describe("BarcodeScanner", () => {
  beforeEach(() => {
    getAllMock.mockReset().mockResolvedValue(ITEMS);
    updateMock.mockReset().mockResolvedValue(undefined);
    createMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.warning.mockReset();
  });

  it("renders nothing when closed", () => {
    const { container } = renderScanner(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("loads inventory and shows low-stock items when open", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("InventoryItem"));
    expect(await screen.findByText(/Low Stock \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Chalk/)).toBeInTheDocument();
  });

  it("shows an error toast when scanning a code that doesn't match any item", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Enter item code/), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByText("Scan"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No item found matching "NOPE"'));
  });

  it("issues stock for a matched item and logs the scan", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Enter item code/), { target: { value: "STK-1" } });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("InventoryItem", "item-1", { stock: 19, status: "In Stock" }));
    expect(createMock).toHaveBeenCalledWith(
      "StockMovement",
      expect.objectContaining({ itemId: "item-1", delta: -1, stockAfter: 19, by: "Admin" }),
      expect.any(String)
    );
    expect(toastMock.success).toHaveBeenCalled();
    expect(await screen.findByText("Notebooks")).toBeInTheDocument();
  });

  it("warns when receiving/issuing brings an item at/below its min level", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Enter item code/), { target: { value: "STK-2" } });
    fireEvent.click(screen.getByText("Scan"));
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
  });

  it("navigates to purchase orders and closes when 'Create purchase order' is clicked", async () => {
    const { onClose } = renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.click(await screen.findByText(/Create purchase order/));
    expect(onClose).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/inventory/orders");
  });

  it("shows an error when exporting with no scans yet", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Export Log"));
    expect(toastMock.error).toHaveBeenCalledWith("No scans to export");
  });

  it("clears the scan log when 'Clear' is clicked", async () => {
    renderScanner(true);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Enter item code/), { target: { value: "STK-1" } });
    fireEvent.click(screen.getByText("Scan"));
    await screen.findByText("Notebooks");

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("No scans yet")).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("Scan log cleared for this session");
  });
});
