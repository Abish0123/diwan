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
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    getOne: vi.fn().mockResolvedValue(null),
    create: (...args: unknown[]) => createMock(...args),
    update: vi.fn(),
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CreateDiscountDialog } from "./CreateDiscountDialog";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CreateDiscountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockResolvedValue([]);
  });

  it("renders the create discount form with defaults", () => {
    renderWithClient(<CreateDiscountDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Create Discount Rule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create discount/i })).toBeInTheDocument();
  });

  it("shows a validation error when the discount name is too short", async () => {
    const user = userEvent.setup();
    renderWithClient(<CreateDiscountDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create discount/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a discount rule with the entered values and closes the dialog", async () => {
    createMock.mockResolvedValue({ id: "d1" });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithClient(<CreateDiscountDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByPlaceholderText(/merit scholarship/i), "Merit Award");
    await user.click(screen.getByRole("button", { name: /create discount/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [entity, payload] = createMock.mock.calls[0];
    expect(entity).toBe("FeeDiscount");
    expect(payload).toMatchObject({ name: "Merit Award", type: "Percentage", category: "Scholarship", status: "Active" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes the dialog on Cancel without submitting", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<CreateDiscountDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMock).not.toHaveBeenCalled();
  });
});
