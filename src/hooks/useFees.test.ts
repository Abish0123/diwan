import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---- Mock external boundaries ----

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "new-id" }),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/firebase", () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE", WRITE: "WRITE", GET: "GET" },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/emailService", () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
  sendInvoiceGeneratedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { uid: "user-1" } })),
}));

vi.mock("@/hooks/useFinancialSettings", () => ({
  useFinancialSettings: vi.fn(() => ({ settings: { maxCombinedDiscountPct: 100 }, loading: false })),
}));

import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useFees,
  getInvoiceDisplayStatus,
  buildTermInvoiceRows,
  createLeadFeeInvoice,
  createFirstTermInvoiceForStudent,
  createTransportFeeInvoice,
  createExamFeeInvoice,
  createHostelFeeInvoice,
  advanceLeadOnFeeInvoicePaid,
  type Invoice,
  type FeeStructure,
} from "./useFees";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (smartDb.getAll as any).mockResolvedValue([]);
  (smartDb.getOne as any).mockResolvedValue(null);
  (smartDb.create as any).mockResolvedValue({ id: "new-id" });
  (smartDb.update as any).mockResolvedValue(undefined);
  (smartDb.delete as any).mockResolvedValue(undefined);
  (useAuth as any).mockReturnValue({ user: { uid: "user-1" } });
});

describe("getInvoiceDisplayStatus", () => {
  it("passes through Paid/Cancelled/Partial status unchanged", () => {
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Paid" }))).toBe("Paid");
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Cancelled" }))).toBe("Cancelled");
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Partial" }))).toBe("Partial");
  });

  it("derives Upcoming for an Unpaid invoice whose due date hasn't arrived", () => {
    const future = new Date(Date.now() + 100000).toISOString();
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Unpaid", dueDate: future }))).toBe("Upcoming");
  });

  it("derives Overdue for an Unpaid invoice whose due date has passed", () => {
    const past = new Date(Date.now() - 100000).toISOString();
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Unpaid", dueDate: past }))).toBe("Overdue");
  });

  it("falls back to the raw status when dueDate is unparsable", () => {
    expect(getInvoiceDisplayStatus(makeInvoice({ status: "Unpaid", dueDate: "not-a-date" }))).toBe("Unpaid");
  });
});

describe("buildTermInvoiceRows", () => {
  function makeStructure(components: { name: string; amount: number; isOptional: boolean }[]): FeeStructure {
    return {
      id: "fs1",
      name: "Standard Tuition",
      classId: "c1",
      className: "Grade 5",
      academicYear: "2026",
      totalAmount: components.reduce((s, c) => s + c.amount, 0),
      components,
      status: "Active",
      uid: "user-1",
      createdAt: new Date().toISOString(),
    };
  }

  it("returns null when there are no term-labeled components", () => {
    const structure = makeStructure([{ name: "Registration", amount: 100, isOptional: false }]);
    expect(buildTermInvoiceRows(structure)).toBeNull();
  });

  it("bundles one-time components into Term 1 and separates later terms", () => {
    const structure = makeStructure([
      { name: "Registration Fee", amount: 100, isOptional: false },
      { name: "Tuition Fee - Term 1", amount: 1000, isOptional: false },
      { name: "Tuition Fee - Term 2", amount: 900, isOptional: false },
      { name: "Tuition Fee - Term 3", amount: 800, isOptional: false },
    ]);
    const rows = buildTermInvoiceRows(structure)!;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ term: "Term 1", termNumber: 1, amount: 1100 });
    expect(rows[1]).toMatchObject({ term: "Term 2", termNumber: 2, amount: 900 });
    expect(rows[2]).toMatchObject({ term: "Term 3", termNumber: 3, amount: 800 });
    // Term 1 due soonest, later terms further out
    expect(new Date(rows[0].dueDate).getTime()).toBeLessThan(new Date(rows[1].dueDate).getTime());
    expect(new Date(rows[1].dueDate).getTime()).toBeLessThan(new Date(rows[2].dueDate).getTime());
  });

  it("sorts terms numerically even if components are out of order", () => {
    const structure = makeStructure([
      { name: "Tuition Fee - Term 2", amount: 500, isOptional: false },
      { name: "Tuition Fee - Term 1", amount: 500, isOptional: false },
    ]);
    const rows = buildTermInvoiceRows(structure)!;
    expect(rows.map(r => r.termNumber)).toEqual([1, 2]);
  });
});

describe("useFees hook", () => {
  it("starts in a loading state and then resolves with fetched data", async () => {
    const structures = [{ id: "fs1", name: "Tuition", status: "Active" } as any];
    const discounts = [{ id: "d1", name: "Sibling", status: "Active" } as any];
    const invoices = [makeInvoice()];
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "FeeStructure") return Promise.resolve(structures);
      if (entity === "FeeDiscount") return Promise.resolve(discounts);
      if (entity === "Invoice") return Promise.resolve(invoices);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.feeStructures).toEqual(structures);
    expect(result.current.feeDiscounts).toEqual(discounts);
    expect(result.current.invoices).toHaveLength(1);
    expect(result.current.invoices[0].amount).toBe(1000);
  });

  it("derives paidAmount/dueAmount for invoices missing those fields based on status", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") {
        return Promise.resolve([
          { id: "a", amount: 500, status: "Paid" }, // paidAmount undefined -> should become amount
          { id: "b", amount: 500, status: "Unpaid" }, // dueAmount undefined -> should become amount
          { id: "c", amount: 500, status: "Partial", paidAmount: 200 }, // dueAmount = amount - paidAmount
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const [a, b, c] = result.current.invoices;
    expect(a.paidAmount).toBe(500);
    expect(a.dueAmount).toBe(0); // Paid -> falls to `amount - paidAmount` branch = 500-500=0
    expect(b.paidAmount).toBe(0);
    expect(b.dueAmount).toBe(500);
    expect(c.paidAmount).toBe(200);
    expect(c.dueAmount).toBe(300);
  });

  it("does not fetch when there is no authenticated user", async () => {
    (useAuth as any).mockReturnValue({ user: null });
    renderHook(() => useFees(), { wrapper });
    // give any microtasks a chance to run
    await act(async () => {
      await Promise.resolve();
    });
    expect(smartDb.getAll).not.toHaveBeenCalled();
  });

  it("createFeeStructure persists via smartDb and shows a success toast", async () => {
    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createFeeStructure({
        name: "New Fee",
        classId: "c1",
        className: "Grade 5",
        academicYear: "2026",
        totalAmount: 500,
        components: [],
        status: "Active",
      } as any);
    });

    expect(smartDb.create).toHaveBeenCalledWith(
      "FeeStructure",
      expect.objectContaining({ name: "New Fee", uid: "user-1" })
    );
    expect(toast.success).toHaveBeenCalledWith("Fee structure created successfully");
  });

  it("createFeeStructure is a no-op when there is no user", async () => {
    (useAuth as any).mockReturnValue({ user: null });
    const { result } = renderHook(() => useFees(), { wrapper });

    await act(async () => {
      await result.current.createFeeStructure({ name: "X" } as any);
    });

    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("bulkImportFeeStructures skips rows missing classId or components, creates the rest", async () => {
    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let summary: { created: number; skipped: number } | undefined;
    await act(async () => {
      summary = await result.current.bulkImportFeeStructures([
        { name: "Valid", classId: "c1", className: "Grade 5", academicYear: "2026", totalAmount: 100, components: [{ name: "Fee", amount: 100, isOptional: false }], status: "Active" } as any,
        { name: "NoClassId", classId: "", className: "Grade 6", academicYear: "2026", totalAmount: 100, components: [{ name: "Fee", amount: 100, isOptional: false }], status: "Active" } as any,
        { name: "NoComponents", classId: "c2", className: "Grade 7", academicYear: "2026", totalAmount: 100, components: [], status: "Active" } as any,
      ]);
    });

    expect(summary).toEqual({ created: 1, skipped: 2 });
    expect(smartDb.create).toHaveBeenCalledTimes(1);
  });

  it("collectFee updates the invoice, records revenue, and marks Paid when fully covered", async () => {
    const invoice = makeInvoice({ amount: 1000, paidAmount: 0, dueAmount: 1000, penalty: 0 });
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([invoice]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invoices).toHaveLength(1);

    let paid: Invoice | undefined;
    await act(async () => {
      paid = await result.current.collectFee("inv-1", 1000, "Cash", "2026-07-13");
    });

    expect(paid?.status).toBe("Paid");
    expect(paid?.dueAmount).toBe(0);
    expect(smartDb.update).toHaveBeenCalledWith(
      "Invoice",
      "inv-1",
      expect.objectContaining({ paidAmount: 1000, dueAmount: 0, status: "Paid" })
    );
    expect(smartDb.create).toHaveBeenCalledWith(
      "StudentRevenue",
      expect.objectContaining({ amount: 1000, invoiceId: "inv-1", uid: "user-1" })
    );
  });

  it("collectFee marks Partial status when payment doesn't cover the full due amount", async () => {
    const invoice = makeInvoice({ amount: 1000, paidAmount: 0, dueAmount: 1000, penalty: 0 });
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([invoice]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let paid: Invoice | undefined;
    await act(async () => {
      paid = await result.current.collectFee("inv-1", 400, "Cash", "2026-07-13");
    });

    expect(paid?.status).toBe("Partial");
    expect(paid?.dueAmount).toBe(600);
  });

  it("collectFee throws when the invoice cannot be found", async () => {
    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.collectFee("missing-id", 100, "Cash", "2026-07-13");
      })
    ).rejects.toThrow("Invoice not found");
  });

  it("updateInvoicePenalty recomputes dueAmount from amount + penalty - paidAmount", async () => {
    const invoice = makeInvoice({ amount: 1000, paidAmount: 200, dueAmount: 800, penalty: 0 });
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([invoice]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateInvoicePenalty("inv-1", 50);
    });

    expect(smartDb.update).toHaveBeenCalledWith("Invoice", "inv-1", { penalty: 50, dueAmount: 850 });
  });

  it("generateInvoicesForClass shows an error and creates nothing when no students match the class", async () => {
    const structure = {
      id: "fs1", name: "Tuition", classId: "c1", className: "Grade 5",
      academicYear: "2026", totalAmount: 1000, components: [], status: "Active", uid: "user-1", createdAt: "",
    };
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "FeeStructure") return Promise.resolve([structure]);
      if (entity === "Student") return Promise.resolve([]); // no matching students
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    (smartDb.create as any).mockClear();
    await act(async () => {
      await result.current.generateInvoicesForClass("c1", "fs1");
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("No students found"));
    expect(smartDb.create).not.toHaveBeenCalledWith("Invoice", expect.anything());
  });

  it("generateInvoicesForClass creates one invoice per matching student and notifies", async () => {
    const structure = {
      id: "fs1", name: "Tuition", classId: "c1", className: "Grade 5",
      academicYear: "2026", totalAmount: 1000, components: [], status: "Active", uid: "user-1", createdAt: "",
    };
    const students = [
      { id: "s1", name: "Alice", classId: "c1", grade: "Grade 5" },
      { id: "s2", name: "Bob", classId: "other-class", grade: "Grade 5" }, // matches via grade
      { id: "s3", name: "Carol", classId: "unrelated", grade: "Grade 9" }, // no match
    ];
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "FeeStructure") return Promise.resolve([structure]);
      if (entity === "Student") return Promise.resolve(students);
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "Staff") return Promise.resolve([]);
      if (entity === "Scholarship") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useFees(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.generateInvoicesForClass("c1", "fs1");
    });

    const invoiceCreateCalls = (smartDb.create as any).mock.calls.filter((c: any[]) => c[0] === "Invoice");
    // Only s1 and s2 match (by classId or grade) — s3 should be excluded.
    expect(invoiceCreateCalls).toHaveLength(2);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Invoices generated for 2 students"));
  });
});

describe("createLeadFeeInvoice", () => {
  it("returns null when no matching Active fee structure exists", async () => {
    (smartDb.getAll as any).mockResolvedValue([]);
    const result = await createLeadFeeInvoice({
      uid: "user-1", leadId: "lead-1", studentName: "Alice", className: "Grade 5", feeType: "Admission",
    });
    expect(result).toBeNull();
  });

  it("creates a flat Admission invoice from the matching Active structure", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "FeeStructure") {
        return Promise.resolve([
          { id: "fs-admission", name: "Admission Fee", status: "Active", feeType: "Admission", totalAmount: 300, components: [], classId: "", className: "", academicYear: "2026", uid: "u", createdAt: "" },
        ]);
      }
      return Promise.resolve([]);
    });

    const invoice = await createLeadFeeInvoice({
      uid: "user-1", leadId: "lead-1", studentName: "Alice", className: "Grade 5", feeType: "Admission",
    });

    expect(invoice).not.toBeNull();
    expect(invoice!.amount).toBe(300);
    expect(invoice!.feeType).toBe("Admission");
    expect(invoice!.linkedLeadId).toBe("lead-1");
  });

  it("uses the grade's real Tuition structure (Term 1 amount) for SchoolFee when one matches the class", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "FeeStructure") {
        return Promise.resolve([
          {
            id: "fs-tuition", name: "Grade 5 Tuition", status: "Active", feeType: "Tuition",
            className: "Grade 5", classId: "c1", academicYear: "2026", uid: "u", createdAt: "",
            totalAmount: 2000,
            components: [
              { name: "Registration Fee", amount: 100, isOptional: false },
              { name: "Tuition Fee - Term 1", amount: 900, isOptional: false },
              { name: "Tuition Fee - Term 2", amount: 1000, isOptional: false },
            ],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const invoice = await createLeadFeeInvoice({
      uid: "user-1", leadId: "lead-1", studentName: "Alice", className: "Grade 5", feeType: "SchoolFee",
    });

    expect(invoice).not.toBeNull();
    // Term 1 amount = 900 (tuition) + 100 (one-time Registration) = 1000
    expect(invoice!.amount).toBe(1000);
    expect(invoice!.term).toBe("Term 1");
  });
});

describe("createTransportFeeInvoice / createExamFeeInvoice", () => {
  it("returns null when monthlyFee is zero or unset (no fabricated fee)", async () => {
    const result = await createTransportFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5", monthlyFee: 0,
    });
    expect(result).toBeNull();
    expect(smartDb.create).not.toHaveBeenCalled();
  });

  it("creates a Transport invoice with the provided real monthlyFee", async () => {
    (smartDb.getAll as any).mockResolvedValue([]);
    const result = await createTransportFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5", monthlyFee: 150, route: "Route A",
    });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(150);
    expect(result!.feeType).toBe("Transport");
    expect(result!.category).toBe("Transport Fee — Route A");
  });

  it("returns null for exam fee invoice when examFee is 0", async () => {
    const result = await createExamFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5", examFee: 0,
    });
    expect(result).toBeNull();
  });
});

describe("createHostelFeeInvoice", () => {
  it("returns null when no Active Hostel structure exists", async () => {
    (smartDb.getAll as any).mockResolvedValue([]);
    const result = await createHostelFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5",
    });
    expect(result).toBeNull();
  });

  it("matches a Hostel structure with an exact className/roomType match", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "FeeStructure") {
        return Promise.resolve([
          { id: "hostel-deluxe", name: "Hostel Deluxe", status: "Active", feeType: "Hostel", className: "Deluxe", totalAmount: 900, components: [], classId: "", academicYear: "", uid: "u", createdAt: "" },
          { id: "hostel-standard", name: "Hostel Standard", status: "Active", feeType: "Hostel", className: "Standard", totalAmount: 500, components: [], classId: "", academicYear: "", uid: "u", createdAt: "" },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await createHostelFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5", roomType: "Deluxe",
    });
    expect(result!.amount).toBe(900);
  });

  // KNOWN BUG: the lookup's fallback clause `!s.className` treats a Hostel
  // structure with no className set as a match for ANY roomType (it's meant
  // as "generic structure with no room-type restriction", but combined with
  // `.find()` returning the FIRST match, a blank-className structure earlier
  // in the array wins over a later structure whose className actually equals
  // the requested roomType) — so room-type selection is order-dependent
  // rather than always preferring the specific match.
  it("a className-less Hostel structure earlier in the list wins over a later specific match (order-dependent)", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "FeeStructure") {
        return Promise.resolve([
          { id: "hostel-generic", name: "Hostel Generic", status: "Active", feeType: "Hostel", className: "", totalAmount: 500, components: [], classId: "", academicYear: "", uid: "u", createdAt: "" },
          { id: "hostel-deluxe", name: "Hostel Deluxe", status: "Active", feeType: "Hostel", className: "Deluxe", totalAmount: 900, components: [], classId: "", academicYear: "", uid: "u", createdAt: "" },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await createHostelFeeInvoice({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5", roomType: "Deluxe",
    });
    // Documents actual (surprising) behavior: picks the generic 500 structure,
    // not the 900 Deluxe-specific one, because it appears first in the array.
    expect(result!.amount).toBe(500);
  });
});

describe("createFirstTermInvoiceForStudent", () => {
  it("returns null when no Active Tuition structure matches the student's grade", async () => {
    (smartDb.getAll as any).mockResolvedValue([]);
    const result = await createFirstTermInvoiceForStudent({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5",
    });
    expect(result).toBeNull();
  });

  it("creates the Term 1 invoice from the matching Tuition structure", async () => {
    (smartDb.getAll as any).mockImplementation((entity: string) => {
      if (entity === "Invoice") return Promise.resolve([]);
      if (entity === "FeeStructure") {
        return Promise.resolve([
          {
            id: "fs1", name: "Grade 5 Tuition", status: "Active", feeType: "Tuition",
            className: "Grade 5", classId: "c1", academicYear: "2026", uid: "u", createdAt: "",
            totalAmount: 1000, components: [],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await createFirstTermInvoiceForStudent({
      uid: "user-1", studentId: "s1", studentName: "Alice", classId: "c1", className: "Grade 5",
    });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(1000);
  });
});

describe("advanceLeadOnFeeInvoicePaid", () => {
  it("is a no-op when the invoice has no linkedLeadId", async () => {
    await advanceLeadOnFeeInvoicePaid(makeInvoice({ linkedLeadId: undefined }));
    expect(smartDb.update).not.toHaveBeenCalled();
  });

  it("is a no-op for feeTypes other than Admission/SchoolFee", async () => {
    await advanceLeadOnFeeInvoicePaid(makeInvoice({ linkedLeadId: "lead-1", feeType: "Transport" }));
    expect(smartDb.update).not.toHaveBeenCalled();
  });

  it("advances an Admission invoice's lead to Payment Done", async () => {
    (smartDb.getOne as any).mockResolvedValue({ email: "parent@example.com", parentName: "Mrs. Smith" });
    await advanceLeadOnFeeInvoicePaid(makeInvoice({ linkedLeadId: "lead-1", feeType: "Admission" }));

    expect(smartDb.update).toHaveBeenCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({ status: "Payment Done", admissionFeesPaid: true })
    );
  });

  it("advances a SchoolFee invoice's lead to Section Allocation", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    await advanceLeadOnFeeInvoicePaid(makeInvoice({ linkedLeadId: "lead-1", feeType: "SchoolFee" }));

    expect(smartDb.update).toHaveBeenCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({ status: "Section Allocation", schoolFeesPaid: true })
    );
  });
});
