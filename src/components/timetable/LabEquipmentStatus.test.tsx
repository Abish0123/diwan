import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mock external boundary: smartDb ─────────────────────────────────────────
const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

import { LabEquipmentStatus } from "./LabEquipmentStatus";

function makeItem(overrides: Partial<{ name: string; category: string; stock: number; status: string }> = {}) {
  return {
    name: "Microscope",
    category: "Lab Equipment",
    stock: 10,
    status: "In Stock",
    ...overrides,
  };
}

describe("LabEquipmentStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when the room is not a lab (no roomType, name doesn't match /lab/)", () => {
    const { container } = render(<LabEquipmentStatus room="Room 101" />);
    expect(container).toBeEmptyDOMElement();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("treats a room name containing 'lab' as a lab via the regex fallback when roomType is absent", async () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    render(<LabEquipmentStatus room="Science Lab" />);
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalledWith("InventoryItem", undefined));
  });

  it("does not treat 'Global Studies' as a lab (word-boundary regex avoids matching 'lab' inside another word)", () => {
    // KNOWN BUG check: ensure \blab\b doesn't false-positive on substrings like "collaborative"
    render(<LabEquipmentStatus room="Collaborative Studio" />);
    expect(screen.queryByText(/Checking lab equipment/i)).not.toBeInTheDocument();
  });

  it("treats room as a lab when roomType is 'Laboratory', regardless of room name", async () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    render(<LabEquipmentStatus room="Room 202" roomType="Laboratory" />);
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
  });

  it("treats room as a lab when roomType is 'Computer Lab'", async () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    render(<LabEquipmentStatus room="Room 202" roomType="Computer Lab" />);
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
  });

  it("does NOT treat a non-lab roomType as a lab even if the room name contains 'lab'", () => {
    // roomType takes precedence over the name regex per the component's isLab logic.
    render(<LabEquipmentStatus room="Language Lab" roomType="Classroom" />);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("shows a loading indicator while the inventory fetch is in flight", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    smartDbMocks.getAll.mockReturnValue(new Promise((resolve) => { resolveFn = resolve; }));
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(screen.getByText(/Checking lab equipment stock/i)).toBeInTheDocument();
    resolveFn([]);
    await waitFor(() => expect(screen.queryByText(/Checking lab equipment stock/i)).not.toBeInTheDocument());
  });

  it("shows a warning when there are no Lab Equipment items tracked in inventory", async () => {
    smartDbMocks.getAll.mockResolvedValue([makeItem({ category: "Stationery" })]);
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/No Lab Equipment items tracked in Inventory yet/i)).toBeInTheDocument();
  });

  it("shows an out-of-stock alert (taking priority over low stock) listing affected item names", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeItem({ name: "Beaker", status: "Out of Stock" }),
      makeItem({ name: "Bunsen Burner", status: "Low Stock" }),
    ]);
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/1 lab item out of stock: Beaker/i)).toBeInTheDocument();
  });

  it("pluralizes 'items' when more than one item is out of stock", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeItem({ name: "Beaker", status: "Out of Stock" }),
      makeItem({ name: "Flask", status: "Out of Stock" }),
    ]);
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/2 lab items out of stock: Beaker, Flask/i)).toBeInTheDocument();
  });

  it("shows a low-stock alert when nothing is out of stock but some items are running low", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeItem({ name: "Test Tube", status: "Low Stock" }),
      makeItem({ name: "Beaker", status: "In Stock" }),
    ]);
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/1 lab item running low: Test Tube/i)).toBeInTheDocument();
  });

  it("shows an all-in-stock confirmation when every item is in stock", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      makeItem({ name: "Beaker", status: "In Stock" }),
      makeItem({ name: "Flask", status: "In Stock" }),
    ]);
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/All 2 Lab Equipment items in stock/i)).toBeInTheDocument();
  });

  it("falls back to an empty item list (and shows the 'no items tracked' message) if the fetch rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));
    render(<LabEquipmentStatus room="Science Lab" />);
    expect(await screen.findByText(/No Lab Equipment items tracked in Inventory yet/i)).toBeInTheDocument();
  });
});
