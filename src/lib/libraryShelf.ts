/* --------------------------- Shelf Location scheme ---------------------------
 * Structured supply-chain slotting code: ZONE-RACK-SHELF, e.g. "SCI-A-3".
 *   ZONE  — subject section, derived 1:1 from the book's Category so every
 *           title lands in the right physical section (a book can only be
 *           slotted in the zone that matches its own category).
 *   RACK  — bookcase letter A–J (10 bookcases per zone).
 *   SHELF — shelf number 1–20 within that bookcase.
 * Shared between the Library catalogue (src/pages/Library.tsx) and the
 * Inventory & Procurement "Record Purchase" flow (src/pages/inventory/
 * Purchases.tsx) so a book procured through a Purchase Order lands on a real,
 * capacity-checked shelf using the exact same logic a librarian would use. */

export const CATALOG_CATEGORIES = [
  "Mathematics", "Science", "English", "Literature", "History",
  "Environmental", "Computer", "Geography", "Arts",
];

export const ZONE_BY_CATEGORY: Record<string, string> = {
  Mathematics: "MAT", Science: "SCI", English: "ENG", Literature: "LIT",
  History: "HIS", Environmental: "ENV", Computer: "CS", General: "GEN",
  Geography: "GEO", Arts: "ART",
};
export const CATEGORY_BY_ZONE: Record<string, string> = Object.fromEntries(
  Object.entries(ZONE_BY_CATEGORY).map(([cat, zone]) => [zone, cat])
);
export const RACKS = Array.from({ length: 10 }, (_, i) => String.fromCharCode(65 + i)); // A..J
export const SHELVES = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
const LOCATION_RE = /^([A-Z]{2,4})-([A-Z])-(\d{1,2})$/;

export function parseLocation(code: string): { zone: string; rack: string; shelf: number } | null {
  const m = LOCATION_RE.exec(code.trim().toUpperCase());
  if (!m) return null;
  const shelf = parseInt(m[3], 10);
  if (!RACKS.includes(m[2]) || shelf < 1 || shelf > 20) return null;
  return { zone: m[1], rack: m[2], shelf };
}

// Format + zone-vs-category validation. Rack/shelf range are structural
// (always enforced); a zone/category mismatch is returned as a warning the
// caller can let the librarian override, since a book may deliberately be
// overflow-shelved in another section.
export function validateLocation(code: string, category?: string): { ok: boolean; error?: string; warning?: string } {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Shelf location is required" };
  const parsed = parseLocation(trimmed);
  if (!parsed) {
    return { ok: false, error: "Use ZONE-RACK-SHELF format, e.g. SCI-A-3 (rack A–J, shelf 1–20)" };
  }
  if (!CATEGORY_BY_ZONE[parsed.zone]) {
    return { ok: false, error: `Unknown zone "${parsed.zone}" — valid zones: ${Object.values(ZONE_BY_CATEGORY).join(", ")}` };
  }
  const expectedZone = category ? ZONE_BY_CATEGORY[category] : undefined;
  if (expectedZone && parsed.zone !== expectedZone) {
    return { ok: true, warning: `This is a ${category} book — its zone is usually ${expectedZone}, not ${parsed.zone}. Save anyway?` };
  }
  return { ok: true };
}
export function formatLocation(zone: string, rack: string, shelf: number | string): string {
  return `${zone}-${rack}-${shelf}`;
}

// One shelf holds SHELF_CAPACITY physical copies before it's considered full
// — a stated, documented assumption (typical textbook shelf), not fabricated
// per-shelf data. Occupancy itself is always the real, live count of copies
// already filed at that code.
export const SHELF_CAPACITY = 8;

// All rack/shelf slots in a zone, each annotated with real occupancy and
// whether it has room for `needed` more copies. `excludeCode`/`excludeCount`
// let a book being re-filed exclude its own current copies from the count
// at its existing code, so editing doesn't lock a book out of its own shelf.
export function slotOptions(
  zone: string,
  occupancy: Record<string, number>,
  needed: number,
  excludeCode?: string,
  excludeCount?: number
): { rack: string; shelf: number; code: string; used: number; free: number }[] {
  const out: { rack: string; shelf: number; code: string; used: number; free: number }[] = [];
  for (const rack of RACKS) {
    for (const shelf of SHELVES) {
      const code = formatLocation(zone, rack, shelf);
      const raw = occupancy[code] || 0;
      const used = code === excludeCode ? Math.max(0, raw - (excludeCount || 0)) : raw;
      out.push({ rack, shelf, code, used, free: SHELF_CAPACITY - used });
    }
  }
  return out.filter((o) => o.free >= needed || o.code === excludeCode);
}

// Real, live count of physical copies currently filed at each shelf code,
// derived from the actual LibraryCopy + LibraryItem rows — never fabricated.
export function computeShelfOccupancy(
  books: { id: string; shelfLocation?: string }[],
  copies: { bookId: string }[]
): Record<string, number> {
  const locByBook: Record<string, string | undefined> = {};
  for (const b of books) locByBook[b.id] = b.shelfLocation;
  const occ: Record<string, number> = {};
  for (const c of copies) {
    const loc = locByBook[c.bookId];
    if (loc && parseLocation(loc)) occ[loc] = (occ[loc] || 0) + 1;
  }
  return occ;
}

// Lightweight keyword guess so a librarian typing "Physics Fundamentals" sees
// Category jump to "Science" without touching the dropdown, and so a book
// procured through a Purchase Order (which only carries a free-text title)
// can still be filed under a real category automatically.
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  // Computer must be checked before Science — "Computer Science" contains
  // "science" and would otherwise be misfiled under the Science zone.
  [/computer|programming|coding|software/i, "Computer"],
  [/physic|chemistr|biolog|\bscience\b/i, "Science"],
  [/math|algebra|geometry|calculus|arithmetic/i, "Mathematics"],
  [/histor|civili[sz]ation|ancient|war\b/i, "History"],
  [/literatur|novel|poetry|fiction|gatsby/i, "Literature"],
  [/english|grammar|vocabular/i, "English"],
  [/environment|ecolog|climate/i, "Environmental"],
  [/geograph|atlas/i, "Geography"],
  [/\bart\b|design/i, "Arts"],
];
export function suggestCategory(title: string): string | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(title)) return cat;
  return null;
}

// Auto-generated Resource ID scheme, shared so a book created from a
// procurement delivery gets the same LIB-YYYY-NNNNN id a librarian would.
export function nextBookId(existingCount: number): string {
  const year = new Date().getFullYear();
  return `LIB-${year}-${String(existingCount + 1).padStart(5, "0")}`;
}
