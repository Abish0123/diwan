import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import { AddBookDialog } from "./AddBookDialog";

describe("AddBookDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when open", () => {
    render(<AddBookDialog open={true} onOpenChange={vi.fn()} onAddBook={vi.fn()} />);
    expect(screen.getByText("Add New Book")).toBeInTheDocument();
    expect(screen.getByLabelText("Book Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Author")).toBeInTheDocument();
  });

  it("does not render dialog content when closed", () => {
    render(<AddBookDialog open={false} onOpenChange={vi.fn()} onAddBook={vi.fn()} />);
    expect(screen.queryByText("Add New Book")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not submit when required fields are missing", async () => {
    const user = userEvent.setup();
    const onAddBook = vi.fn();
    render(<AddBookDialog open={true} onOpenChange={vi.fn()} onAddBook={onAddBook} />);

    await user.click(screen.getByText("Add to Inventory"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in required fields");
    expect(onAddBook).not.toHaveBeenCalled();
  });

  it("submits a new book with defaults filled in and resets the form", async () => {
    const user = userEvent.setup();
    const onAddBook = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddBookDialog open={true} onOpenChange={onOpenChange} onAddBook={onAddBook} />);

    await user.type(screen.getByLabelText("Book Title"), "The Great Gatsby");
    await user.type(screen.getByLabelText("Author"), "F. Scott Fitzgerald");
    await user.type(screen.getByLabelText("ISBN"), "978-000");
    await user.click(screen.getByText("Add to Inventory"));

    expect(onAddBook).toHaveBeenCalledTimes(1);
    const book = onAddBook.mock.calls[0][0];
    expect(book.title).toBe("The Great Gatsby");
    expect(book.author).toBe("F. Scott Fitzgerald");
    expect(book.category).toBe("Fiction");
    expect(book.status).toBe("Available");
    expect(book.isbn).toBe("978-000");
    expect(book.quantity).toBe(1);
    expect(toastMocks.success).toHaveBeenCalledWith("Book Added", {
      description: "The Great Gatsby has been added to the library.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("defaults ISBN to N/A when left blank", async () => {
    const user = userEvent.setup();
    const onAddBook = vi.fn();
    render(<AddBookDialog open={true} onOpenChange={vi.fn()} onAddBook={onAddBook} />);

    await user.type(screen.getByLabelText("Book Title"), "Title Only");
    await user.type(screen.getByLabelText("Author"), "Some Author");
    await user.click(screen.getByText("Add to Inventory"));

    expect(onAddBook).toHaveBeenCalledTimes(1);
    expect(onAddBook.mock.calls[0][0].isbn).toBe("N/A");
  });

  it("cancel button closes the dialog without submitting", async () => {
    const user = userEvent.setup();
    const onAddBook = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddBookDialog open={true} onOpenChange={onOpenChange} onAddBook={onAddBook} />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddBook).not.toHaveBeenCalled();
  });
});
