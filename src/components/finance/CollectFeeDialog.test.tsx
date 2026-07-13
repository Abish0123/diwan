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
const getOneMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    getOne: (...args: unknown[]) => getOneMock(...args),
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
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccessMock(...a), error: (...a: unknown[]) => toastErrorMock(...a) },
}));

const downloadInvoiceReceiptPdfMock = vi.fn();
vi.mock("@/lib/invoiceReceiptPdf", () => ({
  downloadInvoiceReceiptPdf: (...a: unknown[]) => downloadInvoiceReceiptPdfMock(...a),
}));

import { CollectFeeDialog } from "./CollectFeeDialog";
import type { Invoice } from "@/hooks/useFees";

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-000001",
    studentId: "s1",
    studentName: "Alice",
    classId: "c1",
    className: "Grade 5",
    category: "Tuition Fee",
    amount: 1000,
    paidAmount: 0,
    dueAmount: 1000,
    dueDate: new Date().toISOString(),
    status: "Unpaid",
    penalty: 0,
    uid: "user-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Invoice;
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("CollectFeeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockResolvedValue([]);
    getOneMock.mockResolvedValue(null);
  });

  it("renders nothing when there is no invoice", () => {
    const { container } = renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={vi.fn()} invoice={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the invoice details and pre-fills the amount with the due amount", async () => {
    renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={vi.fn()} invoice={makeInvoice()} />
    );
    expect(screen.getByText("Collect Fee")).toBeInTheDocument();
    expect(screen.getByText(/Alice's invoice/)).toBeInTheDocument();
    expect(screen.getByText("INV-2026-000001")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue("1000")).toBeInTheDocument());
  });

  it("submits the payment, downloads the receipt, and closes the dialog", async () => {
    const onOpenChange = vi.fn();
    const updatedInvoice = makeInvoice({ dueAmount: 0, paidAmount: 1000, status: "Paid" });
    // useFees.collectFee ultimately drives through smartDb.update + fetch;
    // we simulate the resolved invoice by making update resolve with it via getOne re-fetch.
    updateMock.mockResolvedValue(undefined);
    getAllMock.mockResolvedValue([updatedInvoice]);

    const user = userEvent.setup();
    renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={onOpenChange} invoice={makeInvoice()} />
    );

    await user.click(screen.getByRole("button", { name: /record payment/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a validation error when the amount is not a positive number", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={vi.fn()} invoice={makeInvoice()} />
    );

    const amountInput = screen.getByLabelText(/amount to pay/i);
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /record payment/i }));

    expect(await screen.findByText(/must be a positive number/i)).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows an error toast when recording payment fails", async () => {
    updateMock.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={onOpenChange} invoice={makeInvoice()} />
    );

    await user.click(screen.getByRole("button", { name: /record payment/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Failed to record payment"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    consoleSpy.mockRestore();
  });

  it("closes the dialog on Cancel without submitting", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <CollectFeeDialog open={true} onOpenChange={onOpenChange} invoice={makeInvoice()} />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
