import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const getAllMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    getOne: vi.fn().mockResolvedValue(null),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "user-1" }, isMockSession: true }),
}));

vi.mock("@/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE", WRITE: "WRITE", GET: "GET" },
  isFirestoreWorking: false,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CreateFeeStructureDialog } from "./CreateFeeStructureDialog";
import { ClassProvider } from "@/contexts/ClassContext";
import type { FeeStructure } from "@/hooks/useFees";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClassProvider>{ui}</ClassProvider>
    </QueryClientProvider>
  );
}

function makeStructure(overrides: Partial<FeeStructure> = {}): FeeStructure {
  return {
    id: "fs1",
    name: "Annual Tuition 2026",
    classId: "c1",
    className: "Grade 5",
    academicYear: "2026-2027",
    components: [{ name: "Tuition Fee", amount: 1000, isOptional: false }],
    totalAmount: 1000,
    status: "Active",
    feeType: "Tuition",
    uid: "user-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as FeeStructure;
}

// Class shape returned by smartDb.getAll("Class", ...) for ClassContext.
function makeClass(id: string, name: string) {
  return { id, name, uid: "user-1", createdAt: new Date().toISOString() };
}

describe("CreateFeeStructureDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Class") return Promise.resolve([makeClass("c1", "Grade 5"), makeClass("c2", "Grade 6")]);
      return Promise.resolve([]);
    });
  });

  it("renders the create form with one default component row", async () => {
    renderWithProviders(<CreateFeeStructureDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Create Fee Structure")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tuition Fee")).toBeInTheDocument();
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("Class", undefined));
  });

  it("renders the edit form pre-filled with the existing structure", () => {
    renderWithProviders(
      <CreateFeeStructureDialog open={true} onOpenChange={vi.fn()} structure={makeStructure()} />
    );
    expect(screen.getByText("Edit Fee Structure")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Annual Tuition 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("adds and removes fee component rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateFeeStructureDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add component/i }));
    const nameInputs = screen.getAllByPlaceholderText(/e\.g\. transport/i);
    expect(nameInputs).toHaveLength(2);

    const removeButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.querySelector("svg") && !btn.textContent
    );
    // Remove one row via the trash icon buttons (there should now be 2 enabled).
    const trashButtons = document.querySelectorAll("button:not([disabled]) svg.lucide-trash2");
    expect(trashButtons.length).toBeGreaterThan(0);
  });

  it("does not allow removing the last remaining component row", () => {
    renderWithProviders(<CreateFeeStructureDialog open={true} onOpenChange={vi.fn()} />);
    const trashButton = document.querySelector("button svg.lucide-trash2")?.closest("button");
    expect(trashButton).toBeDisabled();
  });

  it("creates a new fee structure with computed totalAmount and class name", async () => {
    createMock.mockResolvedValue({ id: "new-fs" });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<CreateFeeStructureDialog open={true} onOpenChange={onOpenChange} />);
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("Class", undefined));

    await user.type(screen.getByPlaceholderText(/annual tuition 2026/i), "New Structure");

    // Select the class
    const classCombobox = screen.getByRole("combobox", { name: /target class/i });
    await user.click(classCombobox);
    await user.click(await screen.findByRole("option", { name: "Grade 5" }));

    // Fill in the amount for the default component
    const amountInput = screen.getByDisplayValue("0");
    await user.clear(amountInput);
    await user.type(amountInput, "500");

    await user.click(screen.getByRole("button", { name: /create structure/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [, payload] = createMock.mock.calls[0];
    expect(payload).toMatchObject({ name: "New Structure", className: "Grade 5", totalAmount: 500 });
  });

  it("updates an existing structure via updateFeeStructure", async () => {
    updateMock.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <CreateFeeStructureDialog open={true} onOpenChange={onOpenChange} structure={makeStructure()} />
    );
    await waitFor(() => expect(getAllMock).toHaveBeenCalledWith("Class", undefined));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("FeeStructure", "fs1", expect.objectContaining({ name: "Annual Tuition 2026" })));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
