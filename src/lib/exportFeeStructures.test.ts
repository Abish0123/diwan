import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { exportFeeStructuresToExcel } from "./exportFeeStructures";
import { FeeStructure } from "@/hooks/useFees";

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({ __ws: true })),
    book_new: vi.fn(() => ({ __wb: true })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

function structure(overrides: Partial<FeeStructure> = {}): FeeStructure {
  return {
    id: "1",
    name: "Grade 5 Standard",
    className: "Grade 5",
    academicYear: "2026-2027",
    status: "Active",
    totalAmount: 1000,
    components: [
      { name: "Tuition", amount: 800 },
      { name: "Library", amount: 200 },
    ],
    ...overrides,
  } as FeeStructure;
}

describe("exportFeeStructuresToExcel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when given an empty array", () => {
    exportFeeStructuresToExcel([], "USD");
    expect(XLSX.utils.json_to_sheet).not.toHaveBeenCalled();
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  it("builds a row per structure with fixed columns and dynamic component columns", () => {
    exportFeeStructuresToExcel([structure()], "USD");

    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledTimes(1);
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row["Structure Name"]).toBe("Grade 5 Standard");
    expect(row["Class/Grade"]).toBe("Grade 5");
    expect(row["Academic Year"]).toBe("2026-2027");
    expect(row["Status"]).toBe("Active");
    expect(row["Tuition (USD)"]).toBe(800);
    expect(row["Library (USD)"]).toBe(200);
    expect(row["Total Amount"]).toBe(1000);
  });

  it("orders keys so Total Amount is last, after the dynamic component columns", () => {
    exportFeeStructuresToExcel([structure()], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    const keys = Object.keys(rows[0]);
    expect(keys[keys.length - 1]).toBe("Total Amount");
    expect(keys.indexOf("Tuition (USD)")).toBeGreaterThan(keys.indexOf("Status"));
  });

  it("unions component names across structures with differing components, preserving first-seen order", () => {
    const s1 = structure({
      id: "1",
      name: "S1",
      components: [{ name: "Tuition", amount: 500 }],
    });
    const s2 = structure({
      id: "2",
      name: "S2",
      components: [
        { name: "Transport", amount: 300 },
        { name: "Tuition", amount: 600 },
      ],
    });

    exportFeeStructuresToExcel([s1, s2], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];

    // s1 has no Transport component -> defaults to 0
    expect(rows[0]["Tuition (USD)"]).toBe(500);
    expect(rows[0]["Transport (USD)"]).toBe(0);

    // s2 has both
    expect(rows[1]["Tuition (USD)"]).toBe(600);
    expect(rows[1]["Transport (USD)"]).toBe(300);

    // column order: Tuition seen first (from s1), then Transport (from s2)
    const keys = Object.keys(rows[0]);
    expect(keys.indexOf("Tuition (USD)")).toBeLessThan(keys.indexOf("Transport (USD)"));
  });

  it("defaults missing components to 0 when a structure has no components array", () => {
    const s1 = structure({ components: [{ name: "Tuition", amount: 100 }] });
    const s2 = structure({ id: "2", name: "No Components", components: undefined as any });

    exportFeeStructuresToExcel([s1, s2], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];

    expect(rows[1]["Tuition (USD)"]).toBe(0);
    expect(rows[1]["Structure Name"]).toBe("No Components");
    expect(rows[1]["Total Amount"]).toBe(1000);
  });

  it("handles a structure with an empty components array", () => {
    const s1 = structure({ components: [] });
    exportFeeStructuresToExcel([s1], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    // no component columns beyond the fixed ones
    expect(Object.keys(rows[0])).toEqual([
      "Structure Name",
      "Class/Grade",
      "Academic Year",
      "Status",
      "Total Amount",
    ]);
  });

  it("appends component columns using the given currency label", () => {
    exportFeeStructuresToExcel([structure()], "AED");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    expect(rows[0]["Tuition (AED)"]).toBe(800);
    expect(rows[0]["Tuition (USD)"]).toBeUndefined();
  });

  it("creates a new workbook, appends the sheet named 'Fee Structures', and writes the file", () => {
    exportFeeStructuresToExcel([structure()], "USD");

    expect(XLSX.utils.book_new).toHaveBeenCalledTimes(1);
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
      { __wb: true },
      { __ws: true },
      "Fee Structures"
    );
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    const [wbArg, filenameArg] = (XLSX.writeFile as any).mock.calls[0];
    expect(wbArg).toEqual({ __wb: true });
    expect(filenameArg).toMatch(/^fee_structures_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("handles multiple structures producing multiple rows in input order", () => {
    const s1 = structure({ id: "1", name: "Alpha", totalAmount: 100 });
    const s2 = structure({ id: "2", name: "Beta", totalAmount: 200 });
    const s3 = structure({ id: "3", name: "Gamma", totalAmount: 300 });

    exportFeeStructuresToExcel([s1, s2, s3], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    expect(rows.map((r: any) => r["Structure Name"])).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(rows.map((r: any) => r["Total Amount"])).toEqual([100, 200, 300]);
  });

  it("treats a zero total amount and zero component amount correctly (not as missing)", () => {
    const s1 = structure({
      totalAmount: 0,
      components: [{ name: "Tuition", amount: 0 }],
    });
    exportFeeStructuresToExcel([s1], "USD");
    const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0];
    expect(rows[0]["Total Amount"]).toBe(0);
    expect(rows[0]["Tuition (USD)"]).toBe(0);
  });
});
