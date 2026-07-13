import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteStudentDialog } from "./DeleteStudentDialog";
import { StudentProvider } from "@/contexts/StudentContext";
import type { Student } from "@/types";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
  isMockSession: true,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role, isMockSession: authMocks.isMockSession }),
}));

vi.mock("@/lib/firebase", () => ({
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
  isFirestoreWorking: false,
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getOne: vi.fn(),
  getAllByEmail: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastMocks.success(...a), error: (...a: unknown[]) => toastMocks.error(...a) } }));

const sampleStudent: Student = {
  id: "s1",
  uid: "admin-1",
  name: "Jane Roe",
  email: "jane.roe@example.com",
  classId: "Grade 5 - A",
  status: "Active",
} as Student;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <StudentProvider>{children}</StudentProvider>;
}

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteStudentDialog>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <Wrapper>
      <DeleteStudentDialog student={sampleStudent} open onOpenChange={onOpenChange} {...props} />
    </Wrapper>
  );
  return { ...utils, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.user = { uid: "admin-1", email: "admin@school.test" };
  authMocks.role = "admin";
  authMocks.isMockSession = true;

  smartDbMocks.getOne.mockResolvedValue(null);
  smartDbMocks.create.mockResolvedValue({ id: "new-id" });
  smartDbMocks.update.mockResolvedValue(undefined);
  smartDbMocks.delete.mockResolvedValue(undefined);
  smartDbMocks.getAllByEmail.mockResolvedValue([]);
  smartDbMocks.getAll.mockImplementation(async (entity: string) => {
    if (entity === "Student") return [sampleStudent];
    if (entity === "users") return [];
    return [];
  });
  smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
    if (entity === "Student") queueMicrotask(() => cb([sampleStudent]));
    return vi.fn();
  });
});

describe("DeleteStudentDialog", () => {
  it("renders nothing when student is null", () => {
    const { container } = render(
      <Wrapper>
        <DeleteStudentDialog student={null} open onOpenChange={vi.fn()} />
      </Wrapper>
    );
    // Dialog root renders no content because the component returns null.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows the confirmation with the student's name and id", async () => {
    renderDialog();
    expect(await screen.findByText("Delete Student")).toBeInTheDocument();
    expect(screen.getByText(/Jane Roe/)).toBeInTheDocument();
    expect(screen.getByText(/s1/)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked without deleting", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await screen.findByText("Delete Student");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(smartDbMocks.delete).not.toHaveBeenCalled();
  });

  it("deletes the student and cascades deletion of matching student/parent user accounts by email", async () => {
    const user = userEvent.setup();
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return [sampleStudent];
      if (entity === "users") {
        return [
          { id: "u1", email: "jane.roe@example.com", role: "student" },
          { id: "u2", email: "parent.jane.roe@example.com", role: "parent" },
          { id: "u3", email: "someoneelse@example.com", role: "teacher" },
        ];
      }
      return [];
    });
    const { onOpenChange } = renderDialog();
    await screen.findByText("Delete Student");

    await user.click(screen.getByRole("button", { name: /delete record/i }));

    await waitFor(() => expect(smartDbMocks.delete).toHaveBeenCalledWith("Student", "s1"));
    await waitFor(() => {
      const userDeleteCalls = smartDbMocks.delete.mock.calls.filter(c => c[0] === "users");
      expect(userDeleteCalls.map(c => c[1]).sort()).toEqual(["u1", "u2"]);
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Student Jane Roe deleted successfully");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast and keeps the dialog open when deletion fails", async () => {
    const user = userEvent.setup();
    smartDbMocks.delete.mockImplementation(async (entity: string) => {
      if (entity === "Student") throw new Error("boom");
    });
    const { onOpenChange } = renderDialog();
    await screen.findByText("Delete Student");

    await user.click(screen.getByRole("button", { name: /delete record/i }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to delete student"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
