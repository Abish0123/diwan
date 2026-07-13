import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Book } from "@/types/library";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

import { EditBookDialog } from "./EditBookDialog";

const sampleBook: Book = {
  id: "BK001",
  title: "1984",
  author: "George Orwell",
  category: "Classic",
  status: "Available",
  isbn: "978-123",
  addedDate: "2024-01-01",
  description: "Dystopian classic",
  quantity: 3,
};

describe("EditBookDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with no book gracefully (empty fields)", () => {
    render(<EditBookDialog open={true} onOpenChange={vi.fn()} book={null} onUpdateBook={vi.fn()} />);
    expect(screen.getByText("Edit Book")).toBeInTheDocument();
    expect(screen.getByLabelText("Book Title")).toHaveValue("");
  });

  it("pre-fills form fields from the provided book", () => {
    render(<EditBookDialog open={true} onOpenChange={vi.fn()} book={sampleBook} onUpdateBook={vi.fn()} />);
    expect(screen.getByLabelText("Book Title")).toHaveValue("1984");
    expect(screen.getByLabelText("Author")).toHaveValue("George Orwell");
    expect(screen.getByLabelText("ISBN")).toHaveValue("978-123");
    expect(screen.getByLabelText("Quantity")).toHaveValue(3);
    expect(screen.getByLabelText("Description")).toHaveValue("Dystopian classic");
  });

  it("shows error and does not submit when book is null", async () => {
    const user = userEvent.setup();
    const onUpdateBook = vi.fn();
    render(<EditBookDialog open={true} onOpenChange={vi.fn()} book={null} onUpdateBook={onUpdateBook} />);

    await user.type(screen.getByLabelText("Book Title"), "Something");
    await user.type(screen.getByLabelText("Author"), "Someone");
    await user.click(screen.getByText("Save Changes"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in required fields");
    expect(onUpdateBook).not.toHaveBeenCalled();
  });

  it("submits merged updates on save", async () => {
    const user = userEvent.setup();
    const onUpdateBook = vi.fn();
    const onOpenChange = vi.fn();
    render(<EditBookDialog open={true} onOpenChange={onOpenChange} book={sampleBook} onUpdateBook={onUpdateBook} />);

    const titleInput = screen.getByLabelText("Book Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Animal Farm");
    await user.click(screen.getByText("Save Changes"));

    expect(onUpdateBook).toHaveBeenCalledTimes(1);
    const updated = onUpdateBook.mock.calls[0][0];
    expect(updated.title).toBe("Animal Farm");
    expect(updated.id).toBe("BK001");
    expect(updated.author).toBe("George Orwell");
    expect(toastMocks.success).toHaveBeenCalledWith("Book Updated", {
      description: "Animal Farm has been updated.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updates form when the book prop changes", () => {
    const { rerender } = render(
      <EditBookDialog open={true} onOpenChange={vi.fn()} book={sampleBook} onUpdateBook={vi.fn()} />
    );
    expect(screen.getByLabelText("Book Title")).toHaveValue("1984");

    const otherBook: Book = { ...sampleBook, id: "BK002", title: "Brave New World" };
    rerender(<EditBookDialog open={true} onOpenChange={vi.fn()} book={otherBook} onUpdateBook={vi.fn()} />);
    expect(screen.getByLabelText("Book Title")).toHaveValue("Brave New World");
  });
});
