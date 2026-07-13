import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { PipelineColumn } from "./PipelineColumn";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";
import type { Lead } from "@/types/admissions";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// ── Mock external boundaries ────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const smartDbMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  getOne: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMock }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/emailService", () => ({
  getStageEmail: vi.fn(() => null),
  sendSimulatedEmail: vi.fn().mockResolvedValue(true),
  sendCredentialsEmail: vi.fn().mockResolvedValue(true),
  sendInvoiceGeneratedEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/useFees", () => ({
  createFirstTermInvoiceForStudent: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/firebase", () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  isFirestoreWorking: false,
}));

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: { create: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/admin-emails", () => ({
  isDefaultAdminEmail: vi.fn(() => false),
}));

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    studentName: "Ali Hassan",
    parentName: "Hassan Ali",
    phone: "12345678",
    email: "hassan@example.com",
    interestedClass: "Grade 5",
    source: "Website",
    notes: "",
    status: "Enquiry",
    score: 70,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderColumn(props: Partial<React.ComponentProps<typeof PipelineColumn>> = {}) {
  return render(
    <AdmissionsProvider>
      <DndContext>
        <PipelineColumn id="Enquiry" title="Enquiry" leads={[]} {...props} />
      </DndContext>
    </AdmissionsProvider>
  );
}

describe("PipelineColumn", () => {
  beforeAll(() => {
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    smartDbMock.watch.mockImplementation((_e: string, _f: unknown, cb: (d: unknown[]) => void) => {
      cb([]);
      return vi.fn();
    });
  });

  it("renders the column title and lead count badge", () => {
    renderColumn({ title: "Enquiry", leads: [makeLead(), makeLead({ id: "lead-2" })] });
    expect(screen.getByText("Enquiry")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders zero for an empty column", () => {
    renderColumn({ leads: [] });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders a LeadCard for each lead passed in", () => {
    renderColumn({ leads: [makeLead({ studentName: "Student A" }), makeLead({ id: "lead-2", studentName: "Student B" })] });
    expect(screen.getByText("Student A")).toBeInTheDocument();
    expect(screen.getByText("Student B")).toBeInTheDocument();
  });

  it("shows a lock icon on restricted stages for a non-admissions-team viewer", () => {
    authState.role = "teacher";
    renderColumn({ id: "Enrolled", title: "Enrolled", leads: [] });
    expect(screen.getByTitle("Only the admissions team can manage this stage")).toBeInTheDocument();
    authState.role = "admin";
  });

  it("does not show a lock icon on restricted stages for an admissions-team viewer", () => {
    authState.role = "admin";
    renderColumn({ id: "Enrolled", title: "Enrolled", leads: [] });
    expect(screen.queryByTitle("Only the admissions team can manage this stage")).not.toBeInTheDocument();
  });

  it("does not show a lock icon on non-restricted stages regardless of role", () => {
    authState.role = "teacher";
    renderColumn({ id: "Enquiry", title: "Enquiry", leads: [] });
    expect(screen.queryByTitle("Only the admissions team can manage this stage")).not.toBeInTheDocument();
    authState.role = "admin";
  });
});
