import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Book } from "@/types/library";

// jsdom doesn't implement these, but Radix Select's pointer-based interactions
// call them during open/select.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

// ── Mock external boundaries (mirrors src/contexts/StudentContext.test.tsx) ─

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

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role, isMockSession: authMocks.isMockSession }),
}));

const parentChildrenMocks = vi.hoisted(() => ({
  children: [] as { id: string }[],
}));

vi.mock("@/hooks/useParentChildren", () => ({
  useParentChildren: () => ({ children: parentChildrenMocks.children }),
}));

const branchMocks = vi.hoisted(() => ({
  activeBranchId: null as string | null,
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ activeBranchId: branchMocks.activeBranchId }),
}));

vi.mock("@/lib/firebase", () => ({
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
  isFirestoreWorking: false,
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getAllByEmail: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

import { StudentProvider } from "@/contexts/StudentContext";
import { IssueBookDialog } from "./IssueBookDialog";

const sampleStudents = [
  { id: "s1", name: "Alice", uid: "someone-else", rollNumber: "R1" },
  { id: "s2", name: "Bob", uid: "someone-else", rollNumber: "R2" },
];

const sampleBook: Book = {
  id: "BK001",
  title: "1984",
  author: "George Orwell",
  category: "Classic",
  status: "Available",
  isbn: "978-123",
  addedDate: "2024-01-01",
};

function renderWithProvider(ui: React.ReactElement) {
  return render(<StudentProvider>{ui}</StudentProvider>);
}

describe("IssueBookDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1", email: "admin@school.test" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    parentChildrenMocks.children = [];
    branchMocks.activeBranchId = null;

    smartDbMocks.getAllByEmail.mockResolvedValue([]);
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return sampleStudents;
      if (entity === "attendance") return [];
      if (entity === "Invoice") return [];
      return [];
    });
    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      if (entity === "Student") {
        queueMicrotask(() => cb(sampleStudents));
      }
      return () => {};
    });
  });

  it("renders dialog content with the selected book title", async () => {
    renderWithProvider(<IssueBookDialog open={true} onOpenChange={vi.fn()} book={sampleBook} onIssueBook={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Issue Book" })).toBeInTheDocument();
    expect(await screen.findByText("1984")).toBeInTheDocument();
  });

  it("shows a fallback message when no book is selected", () => {
    renderWithProvider(<IssueBookDialog open={true} onOpenChange={vi.fn()} book={null} onIssueBook={vi.fn()} />);
    expect(screen.getByText("No book selected")).toBeInTheDocument();
  });

  it("shows error toast and does not submit when no student selected", async () => {
    const user = userEvent.setup();
    const onIssueBook = vi.fn();
    renderWithProvider(
      <IssueBookDialog open={true} onOpenChange={vi.fn()} book={sampleBook} onIssueBook={onIssueBook} />
    );

    await user.click(screen.getByRole("button", { name: "Issue Book" }));

    expect(toastMocks.error).toHaveBeenCalledWith("Please select a student");
    expect(onIssueBook).not.toHaveBeenCalled();
  });

  it("submits issue data for the selected student", async () => {
    const user = userEvent.setup();
    const onIssueBook = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProvider(
      <IssueBookDialog open={true} onOpenChange={onOpenChange} book={sampleBook} onIssueBook={onIssueBook} />
    );

    // Wait for students list to populate the select
    await screen.findByText("1984");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Alice (R1)" }));

    await user.click(screen.getByRole("button", { name: "Issue Book" }));

    expect(onIssueBook).toHaveBeenCalledTimes(1);
    expect(onIssueBook.mock.calls[0][0]).toBe("BK001");
    expect(onIssueBook.mock.calls[0][1].studentId).toBe("s1");
    expect(toastMocks.success).toHaveBeenCalledWith("Book Issued", {
      description: "1984 has been issued successfully.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows 'No students found' when the roster is empty", async () => {
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return [];
      return [];
    });
    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      queueMicrotask(() => cb([]));
      return () => {};
    });

    const user = userEvent.setup();
    renderWithProvider(<IssueBookDialog open={true} onOpenChange={vi.fn()} book={sampleBook} onIssueBook={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "No students found" })).toBeInTheDocument();
  });
});
