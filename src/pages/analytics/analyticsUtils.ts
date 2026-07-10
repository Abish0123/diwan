// Shared helpers for wiring analytics dashboards to real seeded data.

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Coerce any value to a finite number, falling back to 0. */
export function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Sum a numeric field over a list of records. */
export function sumBy<T>(rows: T[], pick: (r: T) => unknown): number {
  return rows.reduce((acc, r) => acc + num(pick(r)), 0);
}

/** Average of a numeric field over a list, 0 when empty. */
export function avgBy<T>(rows: T[], pick: (r: T) => unknown): number {
  if (!rows.length) return 0;
  return sumBy(rows, pick) / rows.length;
}

/**
 * Extract the grade label from a student record. Students are seeded with a
 * `classId` such as "Grade 10-A"; also support explicit grade fields.
 */
export function studentGrade(s: any): string {
  const raw = s?.grade ?? s?.classId ?? s?.class ?? s?.className ?? "";
  const str = String(raw).trim();
  if (!str) return "Unknown";
  // "Grade 10-A" -> "Grade 10"
  const dash = str.split("-")[0].trim();
  return dash || "Unknown";
}

/** Extract the section label ("A", "B"...) from a student record. */
export function studentSection(s: any): string {
  if (s?.section) return String(s.section).trim();
  const raw = String(s?.classId ?? s?.class ?? "").trim();
  const parts = raw.split("-");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "—";
}

/** Parse a record's date string to a Date, or null. */
export function recDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Group dated, amount-bearing records into the last `count` calendar months
 * (anchored on `anchor`, default today). Returns [{ name: "Mon", value }].
 */
export function monthlySeries<T>(
  rows: T[],
  getDate: (r: T) => unknown,
  getAmount: (r: T) => unknown,
  count = 6,
  anchor = new Date(),
): { name: string; value: number; key: string }[] {
  const buckets: { name: string; value: number; key: string }[] = [];
  const index = new Map<string, number>();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    index.set(key, buckets.length);
    buckets.push({ name: MONTHS[d.getMonth()], value: 0, key });
  }
  for (const r of rows) {
    const d = recDate(getDate(r));
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = index.get(key);
    if (idx !== undefined) buckets[idx].value += num(getAmount(r));
  }
  return buckets;
}

/** Format a money amount with the configured currency code. */
export function money(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(safe);
  } catch {
    return `${currency || ""} ${Math.round(safe).toLocaleString()}`.trim();
  }
}

/** Trigger a client-side CSV download from an array of row objects. */
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    rows = [{ note: "No data available" }];
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
