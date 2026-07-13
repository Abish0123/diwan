import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddEnquiryDialog } from "./AddEnquiryDialog";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";
import { ClassProvider } from "@/contexts/ClassContext";
import { CurriculumProvider } from "@/contexts/CurriculumContext";

beforeAll(() => {
  // Radix's Select trigger calls this on pointer events; jsdom doesn't implement it.
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

function renderDialog(open = true, onOpenChange = vi.fn()) {
  return render(
    <CurriculumProvider>
      <ClassProvider>
        <AdmissionsProvider>
          <AddEnquiryDialog open={open} onOpenChange={onOpenChange} />
        </AdmissionsProvider>
      </ClassProvider>
    </CurriculumProvider>
  );
}

describe("AddEnquiryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    smartDbMock.watch.mockImplementation((_e: string, _f: unknown, cb: (d: unknown[]) => void) => {
      cb([]);
      return vi.fn();
    });
  });

  it("does not render dialog content when closed", () => {
    renderDialog(false);
    expect(screen.queryByText("Add New Enquiry")).not.toBeInTheDocument();
  });

  it("renders the form with required fields when open", () => {
    renderDialog(true);
    expect(screen.getByText("Add New Enquiry")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Full Name").length).toBe(2);
    expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog(true, onOpenChange);

    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits a new lead with combined notes and resets/closes the dialog", async () => {
    smartDbMock.create.mockResolvedValue({ id: "new-lead", createdAt: new Date().toISOString() });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog(true, onOpenChange);

    const nameInputs = screen.getAllByPlaceholderText("Full Name");
    await user.type(nameInputs[0], "New Student");
    await user.type(nameInputs[1], "New Parent");
    await user.type(screen.getAllByPlaceholderText("+974 ...")[0], "5551234");
    await user.type(screen.getByPlaceholderText("email@example.com"), "new@example.com");

    await user.click(screen.getByText("Save Enquiry"));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "Lead",
        expect.objectContaining({
          studentName: "New Student",
          parentName: "New Parent",
          phone: "5551234",
          email: "new@example.com",
          status: "Enquiry",
        })
      )
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes optional fields (DOB, gender, nationality) in the joined notes string when provided", async () => {
    smartDbMock.create.mockResolvedValue({ id: "new-lead", createdAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderDialog(true);

    const nameInputs = screen.getAllByPlaceholderText("Full Name");
    await user.type(nameInputs[0], "Student Two");
    await user.type(nameInputs[1], "Parent Two");
    await user.type(screen.getAllByPlaceholderText("+974 ...")[0], "5551234");
    await user.type(screen.getByPlaceholderText("email@example.com"), "two@example.com");

    const dobInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dobInput, { target: { value: "2015-05-01" } });

    await user.click(screen.getByText("Save Enquiry"));

    await waitFor(() =>
      expect(smartDbMock.create).toHaveBeenCalledWith(
        "Lead",
        expect.objectContaining({ notes: expect.stringContaining("DOB: 2015-05-01") })
      )
    );
  });
});
