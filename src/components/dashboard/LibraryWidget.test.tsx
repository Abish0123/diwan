import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LibraryWidget } from "./LibraryWidget";

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const toastInfoMock = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => toastInfoMock(...args) } }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("LibraryWidget", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    toastInfoMock.mockReset();
    navigateMock.mockReset();
  });

  it("shows a loading state before data resolves", () => {
    getAllMock.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><LibraryWidget /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when the library has no books", async () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><LibraryWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No books in the library yet.")).toBeInTheDocument());
  });

  it("renders up to 3 books with their category/status tags", async () => {
    getAllMock.mockResolvedValue([
      { title: "Book A", category: "Fiction", status: "Available" },
      { title: "Book B", category: "Science", status: "Checked Out" },
      { title: "Book C" },
      { title: "Book D (should be truncated)" },
    ]);
    render(<MemoryRouter><LibraryWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Book A")).toBeInTheDocument());
    expect(screen.getByText("Book B")).toBeInTheDocument();
    expect(screen.getByText("Book C")).toBeInTheDocument();
    expect(screen.queryByText("Book D (should be truncated)")).not.toBeInTheDocument();
    expect(screen.getByText("Fiction")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("shows a toast with availability info when a book is clicked", async () => {
    getAllMock.mockResolvedValue([{ title: "Book A", category: "Fiction", status: "Available" }]);
    render(<MemoryRouter><LibraryWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Book A")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Book A"));
    expect(toastInfoMock).toHaveBeenCalledWith("Book: Book A", expect.objectContaining({ description: expect.any(String) }));
  });

  it("navigates to /library when View All is clicked", async () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><LibraryWidget /></MemoryRouter>);
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/library");
  });
});
