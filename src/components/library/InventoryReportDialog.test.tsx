import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Book } from "@/types/library";

import { InventoryReportDialog } from "./InventoryReportDialog";

function makeBook(overrides: Partial<Book>): Book {
  return {
    id: "BK1",
    title: "Book",
    author: "Author",
    category: "Fiction",
    status: "Available",
    isbn: "978",
    addedDate: "2024-01-01",
    ...overrides,
  };
}

describe("InventoryReportDialog", () => {
  it("renders nothing meaningful when closed", () => {
    render(<InventoryReportDialog open={false} onOpenChange={vi.fn()} books={[]} />);
    expect(screen.queryByText("Inventory Report")).not.toBeInTheDocument();
  });

  it("computes and displays total/available/borrowed counts", () => {
    const books = [
      makeBook({ id: "1", category: "Fiction", status: "Available" }),
      makeBook({ id: "2", category: "Fiction", status: "Borrowed" }),
      makeBook({ id: "3", category: "Science", status: "Borrowed" }),
    ];
    render(<InventoryReportDialog open={true} onOpenChange={vi.fn()} books={books} />);

    expect(screen.getByText("Inventory Report")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // total assets
    expect(screen.getByText("1")).toBeInTheDocument(); // available
    expect(screen.getByText("2")).toBeInTheDocument(); // borrowed
  });

  it("renders category breakdown sorted by count descending", () => {
    const books = [
      makeBook({ id: "1", category: "Fiction" }),
      makeBook({ id: "2", category: "Fiction" }),
      makeBook({ id: "3", category: "Science" }),
    ];
    render(<InventoryReportDialog open={true} onOpenChange={vi.fn()} books={books} />);

    const categoryLabels = screen.getAllByText(/Fiction|Science/);
    // Fiction (2 books, 66%) should appear before Science (1 book, 33%) in DOM order
    expect(categoryLabels[0].textContent).toBe("Fiction");
    expect(screen.getByText("2 Books (67%)")).toBeInTheDocument();
    expect(screen.getByText("1 Books (33%)")).toBeInTheDocument();
  });

  it("handles an empty book list without crashing", () => {
    render(<InventoryReportDialog open={true} onOpenChange={vi.fn()} books={[]} />);
    expect(screen.getByText("Inventory Report")).toBeInTheDocument();
    // Total/available should render as 0
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });
});
