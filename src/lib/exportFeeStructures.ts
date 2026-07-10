import * as XLSX from "xlsx";
import { FeeStructure } from "@/hooks/useFees";

/**
 * One row of the exported worksheet. Component columns are dynamic (derived
 * from the union of all distinct component names across the given
 * structures), so they're captured here as an index signature alongside the
 * fixed columns.
 */
export interface FeeStructureExportRow {
  "Structure Name": string;
  "Class/Grade": string;
  "Academic Year": string;
  "Status": string;
  [componentName: string]: string | number;
  "Total Amount": number;
}

/**
 * Exports the given fee structures to an .xlsx workbook, one row per
 * structure. Since different structures can have different component names
 * (and different counts of components), the union of all distinct component
 * names is collected first and used as the dynamic column set — each row
 * gets a value under every such column, blank (0) if that structure doesn't
 * define that particular component.
 */
export function exportFeeStructuresToExcel(structures: FeeStructure[], currency: string): void {
  if (!structures.length) return;

  const componentNames: string[] = [];
  const seen = new Set<string>();
  for (const structure of structures) {
    for (const component of structure.components ?? []) {
      if (!seen.has(component.name)) {
        seen.add(component.name);
        componentNames.push(component.name);
      }
    }
  }

  const rows: FeeStructureExportRow[] = structures.map((structure) => {
    const componentAmounts = new Map(
      (structure.components ?? []).map((c) => [c.name, c.amount])
    );

    const row: FeeStructureExportRow = {
      "Structure Name": structure.name,
      "Class/Grade": structure.className,
      "Academic Year": structure.academicYear,
      "Status": structure.status,
      "Total Amount": structure.totalAmount,
    };

    for (const name of componentNames) {
      row[`${name} (${currency})`] = componentAmounts.get(name) ?? 0;
    }

    return row;
  });

  // Reorder each row so "Total Amount" appears last, after the dynamic
  // component columns (json_to_sheet preserves key insertion order).
  const orderedRows = rows.map((row) => {
    const { "Total Amount": totalAmount, ...rest } = row;
    return { ...rest, "Total Amount": totalAmount };
  });

  const ws = XLSX.utils.json_to_sheet(orderedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fee Structures");

  const filename = `fee_structures_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
