import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddStudentDialog } from "./AddStudentDialog";
import { StudentProvider } from "@/contexts/StudentContext";
import { ClassProvider } from "@/contexts/ClassContext";
import { CurriculumProvider } from "@/contexts/CurriculumContext";
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

vi.mock("@/hooks/useParentChildren", () => ({
  useParentChildren: () => ({ children: [] }),
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ activeBranchId: null }),
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

const sampleClasses = [
  { id: "c1", name: "Grade 5 - A", grade: "Grade 5", section: "A" },
  { id: "c2", name: "Grade 5 - B", grade: "Grade 5", section: "B" },
  { id: "c3", name: "Grade 6 - A", grade: "Grade 6", section: "A" },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CurriculumProvider>
      <ClassProvider>
        <StudentProvider>{children}</StudentProvider>
      </ClassProvider>
    </CurriculumProvider>
  );
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddStudentDialog>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <Wrapper>
      <AddStudentDialog open onOpenChange={onOpenChange} {...props} />
    </Wrapper>
  );
  return { ...utils, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.user = { uid: "admin-1", email: "admin@school.test" };
  authMocks.role = "admin";
  authMocks.isMockSession = true;

  smartDbMocks.getOne.mockResolvedValue(null); // curriculum config -> default
  smartDbMocks.create.mockResolvedValue({ id: "new-id" });
  smartDbMocks.update.mockResolvedValue(undefined);
  smartDbMocks.delete.mockResolvedValue(undefined);
  smartDbMocks.getAllByEmail.mockResolvedValue([]);
  smartDbMocks.getAll.mockImplementation(async (entity: string) => {
    if (entity === "Class") return sampleClasses;
    if (entity === "Student") return [];
    return [];
  });
  smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
    if (entity === "Student") queueMicrotask(() => cb([]));
    return vi.fn();
  });
});

describe("AddStudentDialog", () => {
  it("renders the 'Add New Student' heading and empty form when creating", async () => {
    renderDialog();
    expect(await screen.findByText("Add New Student")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/john.doe@school.com/i)).toHaveValue("");
  });

  it("shows a validation error and does not submit when required fields are missing", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Add New Student");
    await user.click(screen.getByRole("button", { name: /add student/i }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields"));
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("populates available grades from real classes and sections scoped to the selected grade", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Add New Student");

    await user.click(screen.getByText("Select Grade"));
    expect(await screen.findByText("Grade 5")).toBeInTheDocument();
    expect(screen.getByText("Grade 6")).toBeInTheDocument();
    await user.click(screen.getByText("Grade 5"));

    await user.click(screen.getByText("Select Section"));
    expect(await screen.findByText("Section A")).toBeInTheDocument();
    expect(screen.getByText("Section B")).toBeInTheDocument();
  });

  it("creates a new student with generated student/parent credentials and calls smartDb.create for both users", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await screen.findByText("Add New Student");

    await user.type(screen.getByLabelText(/Full Name/i), "John Doe");
    await user.type(screen.getByPlaceholderText(/john.doe@school.com/i), "john.doe@example.com");

    await user.click(screen.getByText("Select Grade"));
    await user.click(await screen.findByText("Grade 5"));
    await user.click(screen.getByText("Select Section"));
    await user.click(await screen.findByText("Section A"));

    await user.click(screen.getByRole("button", { name: /add student/i }));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Student",
      expect.objectContaining({ name: "John Doe", email: "john.doe@example.com" }),
      undefined
    ));

    // Student + parent user records both persisted.
    await waitFor(() => {
      const userCreateCalls = smartDbMocks.create.mock.calls.filter(c => c[0] === "users");
      expect(userCreateCalls.length).toBe(2);
      expect(userCreateCalls.some(c => c[1].role === "student")).toBe(true);
      expect(userCreateCalls.some(c => c[1].role === "parent")).toBe(true);
    });

    expect(toastMocks.success).toHaveBeenCalledWith(
      "Student admitted — credentials generated",
      expect.objectContaining({ description: expect.stringContaining("Student:") })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // KNOWN BUG: generateUsername(name, extraArg) only ever reads its FIRST
  // argument as a role id (see src/lib/roles.ts). The dialog calls it with a
  // student's full name (e.g. "John Doe") and a "parent" role id — neither
  // matches any registered role id, so both usernames silently fall back to
  // the generic "USR" prefix instead of a student/parent-specific one.
  it("falls back to the generic USR-prefixed username because generateUsername's role-id lookup never matches a person's name", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Add New Student");

    await user.type(screen.getByLabelText(/Full Name/i), "Jane Roe");
    await user.type(screen.getByPlaceholderText(/john.doe@school.com/i), "jane.roe@example.com");
    await user.click(screen.getByText("Select Grade"));
    await user.click(await screen.findByText("Grade 5"));
    await user.click(screen.getByText("Select Section"));
    await user.click(await screen.findByText("Section A"));
    await user.click(screen.getByRole("button", { name: /add student/i }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
    const [, options] = toastMocks.success.mock.calls[0];
    expect(options.description).toMatch(/Student: USR\d+/);
  });

  it("pre-fills the form when editing an existing student and updates without generating new credentials", async () => {
    const user = userEvent.setup();
    const student: Student = {
      id: "s1",
      uid: "admin-1",
      name: "Existing Kid",
      email: "existing@example.com",
      classId: "Grade 5 - A",
      status: "Active",
    } as Student;

    renderDialog({ student });
    expect(await screen.findByText("Edit Student Profile")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toHaveValue("Existing Kid");
    expect(screen.getByDisplayValue("existing@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Student",
      "s1",
      expect.objectContaining({ name: "Existing Kid", email: "existing@example.com" })
    ));
    // No new user credentials should be minted while editing.
    expect(smartDbMocks.create.mock.calls.filter(c => c[0] === "users")).toHaveLength(0);
    expect(toastMocks.success).toHaveBeenCalledWith("Student updated successfully");
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await screen.findByText("Add New Student");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a failure toast when saving throws", async () => {
    const user = userEvent.setup();
    smartDbMocks.create.mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    await screen.findByText("Add New Student");

    await user.type(screen.getByLabelText(/Full Name/i), "Err Case");
    await user.type(screen.getByPlaceholderText(/john.doe@school.com/i), "err@example.com");
    await user.click(screen.getByText("Select Grade"));
    await user.click(await screen.findByText("Grade 5"));
    await user.click(screen.getByText("Select Section"));
    await user.click(await screen.findByText("Section A"));
    await user.click(screen.getByRole("button", { name: /add student/i }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to add student"));
  });
});
