import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StudentDetailsDialog } from "./StudentDetailsDialog";
import { StudentProvider } from "@/contexts/StudentContext";
import { CurriculumProvider } from "@/contexts/CurriculumContext";
import { LearningUniverseProvider } from "@/contexts/LearningUniverseContext";
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

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastMocks.success(...a),
    error: (...a: unknown[]) => toastMocks.error(...a),
    warning: (...a: unknown[]) => toastMocks.warning(...a),
    info: (...a: unknown[]) => toastMocks.info(...a),
  },
}));

const sampleStudent: Student = {
  id: "s1",
  uid: "admin-1",
  name: "Jane Roe",
  email: "jane.roe@example.com",
  phone: "12345678",
  classId: "Grade 5 - A",
  grade: "5",
  className: "Grade 5 - A",
  section: "A",
  status: "Active",
  fatherPhone: "5550001",
  riskScore: 10,
} as Student;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CurriculumProvider>
      <StudentProvider>
        <LearningUniverseProvider>{children}</LearningUniverseProvider>
      </StudentProvider>
    </CurriculumProvider>
  );
}

function renderDialog(props: Partial<React.ComponentProps<typeof StudentDetailsDialog>> = {}) {
  const onOpenChange = vi.fn();
  const utils = render(
    <Wrapper>
      <StudentDetailsDialog student={sampleStudent} open onOpenChange={onOpenChange} {...props} />
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
    return [];
  });
  smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
    if (entity === "Student") queueMicrotask(() => cb([sampleStudent]));
    return vi.fn();
  });
});

describe("StudentDetailsDialog", () => {
  it("renders nothing when student is null", () => {
    const { container } = render(
      <Wrapper>
        <StudentDetailsDialog student={null} open onOpenChange={vi.fn()} />
      </Wrapper>
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the student's name, id and grade/section label from className", async () => {
    renderDialog();
    expect(await screen.findByText("Jane Roe")).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
    // gradeSectionLabel prefers className when present.
    expect(screen.getByText("Grade 5 - A")).toBeInTheDocument();
  });

  it("shows every tab (behaviour/medical/fees included) for a full-access admin role", async () => {
    renderDialog();
    await screen.findByText("Jane Roe");
    expect(screen.getByRole("tab", { name: /behaviour/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /medical/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /fees/i })).toBeInTheDocument();
  });

  it("hides behaviour/medical/fees tabs for a role with none of the relevant scopes (librarian)", async () => {
    authMocks.role = "librarian";
    renderDialog();
    await screen.findByText("Jane Roe");
    expect(screen.queryByRole("tab", { name: /behaviour/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /medical/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /fees/i })).not.toBeInTheDocument();
    // Tabs common to everyone remain.
    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();
  });

  it("shows only the medical tab (not behaviour/fees) for the nurse role", async () => {
    authMocks.role = "nurse";
    renderDialog();
    await screen.findByText("Jane Roe");
    expect(screen.getByRole("tab", { name: /medical/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /behaviour/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /fees/i })).not.toBeInTheDocument();
  });

  it("shows only the fees tab for the accountant role", async () => {
    authMocks.role = "accountant";
    renderDialog();
    await screen.findByText("Jane Roe");
    expect(screen.getByRole("tab", { name: /fees/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /medical/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /behaviour/i })).not.toBeInTheDocument();
  });

  it("shows only the behaviour tab for the counselor role", async () => {
    authMocks.role = "counselor";
    renderDialog();
    await screen.findByText("Jane Roe");
    expect(screen.getByRole("tab", { name: /behaviour/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /medical/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /fees/i })).not.toBeInTheDocument();
  });

  it("enters edit mode, edits a field, and saves via updateStudent", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /edit profile/i }));
    const rollInput = screen.getAllByDisplayValue("")[0];
    await user.type(rollInput, "R-42");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Student",
      "s1",
      expect.objectContaining({ rollNumber: "R-42" })
    ));
    expect(toastMocks.success).toHaveBeenCalledWith("Profile saved successfully");
  });

  it("discards edits and returns to read-only view when Discard is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /edit profile/i }));
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.getByRole("button", { name: /edit profile/i })).toBeInTheDocument();
    expect(smartDbMocks.update).not.toHaveBeenCalled();
  });

  it("closes the dialog via Close when not editing", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await screen.findByText("Jane Roe");
    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a failure toast when saving throws", async () => {
    const user = userEvent.setup();
    smartDbMocks.update.mockRejectedValueOnce(new Error("boom"));
    renderDialog();
    await screen.findByText("Jane Roe");
    await user.click(screen.getByRole("button", { name: /edit profile/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to save"));
  });

  it("marks today's attendance via the Quick Action menu and shows a success toast", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /quick action/i }));
    await user.click(await screen.findByText(/mark attendance/i));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalledWith(
      "attendance",
      expect.objectContaining({ studentId: "s1", status: "Present" })
    ));
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("marked present"));
  });

  it("opens the Report Incident modal from Quick Action, validates empty description, then submits", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /quick action/i }));
    await user.click(await screen.findByText(/report incident/i));

    expect(await screen.findByText("Report Incident")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /^report incident$/i });
    expect(submitBtn).toBeDisabled();

    const descBox = screen.getByPlaceholderText(/describe the incident/i);
    await user.type(descBox, "Talked during exam");
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalledWith(
      "BehaviorIncident",
      expect.objectContaining({ studentId: "s1", description: "Talked during exam", type: "Demerit" }),
      expect.any(String)
    ));
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("Incident reported for"));
  });

  it("escalates risk score once 5+ demerits have accumulated for the student", async () => {
    const existingDemerits = Array.from({ length: 4 }, (_, i) => ({
      id: `bhv-${i}`, studentId: "s1", studentName: "Jane Roe", type: "Demerit",
      category: "Conduct", severity: "Low", description: `d${i}`, date: "2026-01-01", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return [sampleStudent];
      if (entity === "BehaviorIncident") return existingDemerits;
      return [];
    });
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /quick action/i }));
    await user.click(await screen.findByText(/report incident/i));
    await user.type(screen.getByPlaceholderText(/describe the incident/i), "Another one");
    await user.click(screen.getByRole("button", { name: /^report incident$/i }));

    await waitFor(() => expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Student",
      "s1",
      expect.objectContaining({ riskScore: 75, performance: "Below Average" })
    ));
    expect(toastMocks.warning).toHaveBeenCalledWith(
      expect.stringContaining("Parent-Teacher Conference Triggered"),
      expect.anything()
    );
  });

  it("checks library clearance and reports outstanding loans/fines via toast.error", async () => {
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return [sampleStudent];
      if (entity === "library_loans") return [{ studentId: "s1", returnedAt: null }];
      if (entity === "LibraryFine") return [{ studentId: "s1", status: "unpaid", amount: 5 }];
      return [];
    });
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /quick action/i }));
    await user.click(await screen.findByText(/library clearance/i));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(
      expect.stringContaining("is NOT cleared")
    ));
  });

  it("reports the student as cleared when there are no outstanding loans or fines", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("button", { name: /quick action/i }));
    await user.click(await screen.findByText(/library clearance/i));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(
      expect.stringContaining("is cleared")
    ));
  });

  it("calls the parent via tel: link from the header action button", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");
    await user.click(screen.getByTitle("Call Parent"));
    expect(toastMocks.info).toHaveBeenCalledWith(expect.stringContaining("Calling"));
  });

  it("shows an error toast emailing the parent when no email is on file", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");
    await user.click(screen.getByTitle("Email Parent"));
    expect(toastMocks.error).toHaveBeenCalledWith("No email address available");
  });

  it("records an academic result and shows it computed against the 100-point default total", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");

    await user.click(screen.getByRole("tab", { name: /academic/i }));
    await user.type(screen.getByPlaceholderText("Subject"), "Math");
    await user.type(screen.getByPlaceholderText("Marks"), "85");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalledWith(
      "ExamResult",
      expect.objectContaining({ studentId: "s1", subject: "Math", marksObtained: 85, totalMarks: 100, grade: "A" })
    ));
  });

  it("shows real attendance stats on the Attendance tab computed from fetched records", async () => {
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "Student") return [sampleStudent];
      if (entity === "attendance") return [
        { studentId: "s1", status: "Present", date: "2026-06-01" },
        { studentId: "s1", status: "Absent", date: "2026-06-02" },
      ];
      return [];
    });
    renderDialog();
    await screen.findByText("Jane Roe");
    await userEvent.setup().click(screen.getByRole("tab", { name: /^attendance$/i }));

    expect(await screen.findByText("50%")).toBeInTheDocument();
  });

  it("shows an empty state on the Fees tab when there are no invoices (admin has fees access)", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText("Jane Roe");
    await user.click(screen.getByRole("tab", { name: /fees/i }));
    expect(await screen.findByText("No transactions logged")).toBeInTheDocument();
  });
});
