import { describe, it, expect } from "vitest";
import {
  parseLocation,
  validateLocation,
  formatLocation,
  slotOptions,
  computeShelfOccupancy,
  suggestCategory,
  nextBookId,
  ZONE_BY_CATEGORY,
  CATEGORY_BY_ZONE,
  RACKS,
  SHELVES,
  SHELF_CAPACITY,
} from "./libraryShelf";

describe("parseLocation", () => {
  it("parses a valid ZONE-RACK-SHELF code", () => {
    expect(parseLocation("SCI-A-3")).toEqual({ zone: "SCI", rack: "A", shelf: 3 });
  });

  it("trims whitespace and uppercases lowercase input", () => {
    expect(parseLocation("  sci-a-3  ")).toEqual({ zone: "SCI", rack: "A", shelf: 3 });
  });

  it("accepts two-letter zones and double-digit shelf numbers", () => {
    expect(parseLocation("CS-J-20")).toEqual({ zone: "CS", rack: "J", shelf: 20 });
  });

  it("returns null for malformed codes", () => {
    expect(parseLocation("garbage")).toBeNull();
    expect(parseLocation("SCI-3")).toBeNull();
    expect(parseLocation("SCI_A_3")).toBeNull();
    expect(parseLocation("")).toBeNull();
  });

  it("returns null when rack letter is not in A-J", () => {
    expect(parseLocation("SCI-K-3")).toBeNull();
    expect(parseLocation("SCI-Z-3")).toBeNull();
  });

  it("returns null when shelf number is out of 1-20 range", () => {
    expect(parseLocation("SCI-A-0")).toBeNull();
    expect(parseLocation("SCI-A-21")).toBeNull();
  });

  it("accepts shelf boundary values 1 and 20", () => {
    expect(parseLocation("SCI-A-1")).toEqual({ zone: "SCI", rack: "A", shelf: 1 });
    expect(parseLocation("SCI-A-20")).toEqual({ zone: "SCI", rack: "A", shelf: 20 });
  });

  it("returns null for a 5-letter zone (exceeds {2,4})", () => {
    expect(parseLocation("SCIEN-A-3")).toBeNull();
  });

  it("rejects a 3-digit shelf number (exceeds {1,2})", () => {
    expect(parseLocation("SCI-A-100")).toBeNull();
  });
});

describe("validateLocation", () => {
  it("errors on empty/whitespace-only code", () => {
    expect(validateLocation("")).toEqual({ ok: false, error: "Shelf location is required" });
    expect(validateLocation("   ")).toEqual({ ok: false, error: "Shelf location is required" });
  });

  it("errors with format guidance for a malformed code", () => {
    const result = validateLocation("notacode");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ZONE-RACK-SHELF/);
  });

  it("errors on an unknown zone even if the format is structurally valid", () => {
    const result = validateLocation("XXX-A-3");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unknown zone "XXX"/);
  });

  it("passes with no warning when no category is supplied", () => {
    expect(validateLocation("SCI-A-3")).toEqual({ ok: true });
  });

  it("passes with no warning when zone matches the given category", () => {
    expect(validateLocation("SCI-A-3", "Science")).toEqual({ ok: true });
  });

  it("passes with a warning when zone does not match the given category", () => {
    const result = validateLocation("SCI-A-3", "Mathematics");
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/This is a Mathematics book/);
    expect(result.warning).toMatch(/MAT/);
    expect(result.warning).toMatch(/SCI/);
  });

  it("passes with no warning when category is not a known key in ZONE_BY_CATEGORY", () => {
    // expectedZone becomes undefined, so the mismatch branch is skipped
    const result = validateLocation("SCI-A-3", "NotARealCategory");
    expect(result).toEqual({ ok: true });
  });
});

describe("formatLocation", () => {
  it("joins zone, rack, and shelf with hyphens", () => {
    expect(formatLocation("SCI", "A", 3)).toBe("SCI-A-3");
  });

  it("accepts a string shelf value as-is", () => {
    expect(formatLocation("SCI", "A", "07")).toBe("SCI-A-07");
  });
});

describe("computeShelfOccupancy", () => {
  it("counts copies per valid shelf location", () => {
    const books = [
      { id: "b1", shelfLocation: "SCI-A-3" },
      { id: "b2", shelfLocation: "SCI-A-3" },
      { id: "b3", shelfLocation: "MAT-B-1" },
    ];
    const copies = [
      { bookId: "b1" },
      { bookId: "b2" },
      { bookId: "b1" },
      { bookId: "b3" },
    ];
    expect(computeShelfOccupancy(books, copies)).toEqual({
      "SCI-A-3": 3,
      "MAT-B-1": 1,
    });
  });

  it("ignores copies for books with no shelfLocation", () => {
    const books = [{ id: "b1" }];
    const copies = [{ bookId: "b1" }];
    expect(computeShelfOccupancy(books, copies)).toEqual({});
  });

  it("ignores copies for books with an invalid shelfLocation", () => {
    const books = [{ id: "b1", shelfLocation: "not-a-code" }];
    const copies = [{ bookId: "b1" }];
    expect(computeShelfOccupancy(books, copies)).toEqual({});
  });

  it("ignores copies whose bookId doesn't match any known book", () => {
    const books = [{ id: "b1", shelfLocation: "SCI-A-3" }];
    const copies = [{ bookId: "unknown" }];
    expect(computeShelfOccupancy(books, copies)).toEqual({});
  });

  it("returns an empty object for empty inputs", () => {
    expect(computeShelfOccupancy([], [])).toEqual({});
  });
});

describe("slotOptions", () => {
  it("returns all rack/shelf combos (10 racks x 20 shelves) when occupancy is empty and needed is small", () => {
    const options = slotOptions("SCI", {}, 1);
    expect(options.length).toBe(RACKS.length * SHELVES.length);
    expect(options[0]).toMatchObject({ rack: "A", shelf: 1, code: "SCI-A-1", used: 0, free: SHELF_CAPACITY });
  });

  it("excludes slots that don't have enough free capacity for `needed`", () => {
    const occupancy = { "SCI-A-1": SHELF_CAPACITY }; // full
    const options = slotOptions("SCI", occupancy, 1);
    expect(options.find((o) => o.code === "SCI-A-1")).toBeUndefined();
  });

  it("includes a partially-full slot when free capacity >= needed", () => {
    const occupancy = { "SCI-A-1": SHELF_CAPACITY - 2 }; // 2 free
    const options = slotOptions("SCI", occupancy, 2);
    const slot = options.find((o) => o.code === "SCI-A-1");
    expect(slot).toMatchObject({ used: SHELF_CAPACITY - 2, free: 2 });
  });

  it("excludes a slot when free capacity < needed", () => {
    const occupancy = { "SCI-A-1": SHELF_CAPACITY - 1 }; // 1 free
    const options = slotOptions("SCI", occupancy, 2);
    expect(options.find((o) => o.code === "SCI-A-1")).toBeUndefined();
  });

  it("treats a missing occupancy entry as 0 used", () => {
    const options = slotOptions("SCI", {}, SHELF_CAPACITY);
    const slot = options.find((o) => o.code === "SCI-A-1");
    expect(slot).toMatchObject({ used: 0, free: SHELF_CAPACITY });
  });

  it("subtracts excludeCount from the excludeCode slot so a book can keep re-filing at its own code", () => {
    // Book currently has 3 copies at SCI-A-1 (full at 8 with others already there? use exact numbers)
    const occupancy = { "SCI-A-1": SHELF_CAPACITY }; // fully occupied, including this book's own 3 copies
    const options = slotOptions("SCI", occupancy, 3, "SCI-A-1", 3);
    const slot = options.find((o) => o.code === "SCI-A-1");
    // used = max(0, 8 - 3) = 5, free = 8 - 5 = 3 >= needed(3) -> included anyway
    expect(slot).toMatchObject({ used: 5, free: 3 });
  });

  it("always includes the excludeCode slot even if it doesn't have enough free capacity", () => {
    const occupancy = { "SCI-A-1": SHELF_CAPACITY }; // full even after excluding a small count
    const options = slotOptions("SCI", occupancy, 10, "SCI-A-1", 1);
    const slot = options.find((o) => o.code === "SCI-A-1");
    expect(slot).toBeDefined();
    expect(slot).toMatchObject({ used: SHELF_CAPACITY - 1, free: SHELF_CAPACITY - (SHELF_CAPACITY - 1) });
  });

  it("does not let excludeCount push used below 0", () => {
    const occupancy = { "SCI-A-1": 2 };
    const options = slotOptions("SCI", occupancy, 1, "SCI-A-1", 999);
    const slot = options.find((o) => o.code === "SCI-A-1");
    expect(slot).toMatchObject({ used: 0, free: SHELF_CAPACITY });
  });

  it("only generates codes within the given zone", () => {
    const options = slotOptions("MAT", {}, 1);
    expect(options.every((o) => o.code.startsWith("MAT-"))).toBe(true);
  });
});

describe("suggestCategory", () => {
  it("suggests Computer for programming-related titles, even when 'science' also appears", () => {
    expect(suggestCategory("Computer Science Fundamentals")).toBe("Computer");
    expect(suggestCategory("Intro to Programming")).toBe("Computer");
  });

  it("suggests Science for physics/chemistry/biology titles", () => {
    expect(suggestCategory("Physics Fundamentals")).toBe("Science");
    expect(suggestCategory("Basic Chemistry")).toBe("Science");
    expect(suggestCategory("Biology 101")).toBe("Science");
  });

  it("suggests Mathematics for math-related titles", () => {
    expect(suggestCategory("Algebra Basics")).toBe("Mathematics");
    expect(suggestCategory("Calculus for Beginners")).toBe("Mathematics");
  });

  it("suggests History for historical titles", () => {
    expect(suggestCategory("Ancient Civilizations")).toBe("History");
    expect(suggestCategory("World War Stories")).toBe("History");
  });

  it("suggests Literature for fiction/novel titles", () => {
    expect(suggestCategory("The Great Gatsby")).toBe("Literature");
    expect(suggestCategory("A Book of Poetry")).toBe("Literature");
  });

  it("suggests English for grammar-related titles", () => {
    expect(suggestCategory("English Grammar Guide")).toBe("English");
  });

  it("suggests Environmental for ecology/climate titles", () => {
    expect(suggestCategory("Climate Change Basics")).toBe("Environmental");
  });

  it("suggests Geography for atlas titles", () => {
    expect(suggestCategory("World Atlas")).toBe("Geography");
  });

  it("suggests Arts for art/design titles", () => {
    expect(suggestCategory("Art and Design Principles")).toBe("Arts");
  });

  it("is case-insensitive", () => {
    expect(suggestCategory("ALGEBRA MASTERY")).toBe("Mathematics");
  });

  it("returns null when no keyword matches", () => {
    expect(suggestCategory("Untitled Miscellany")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(suggestCategory("")).toBeNull();
  });
});

describe("nextBookId", () => {
  it("formats an incrementing 5-digit padded id with the current year", () => {
    const year = new Date().getFullYear();
    expect(nextBookId(0)).toBe(`LIB-${year}-00001`);
    expect(nextBookId(4)).toBe(`LIB-${year}-00005`);
  });

  it("pads correctly up to 5 digits and beyond", () => {
    const year = new Date().getFullYear();
    expect(nextBookId(99998)).toBe(`LIB-${year}-99999`);
    expect(nextBookId(99999)).toBe(`LIB-${year}-100000`);
  });
});

describe("ZONE_BY_CATEGORY / CATEGORY_BY_ZONE consistency", () => {
  it("is a consistent bidirectional mapping", () => {
    for (const [cat, zone] of Object.entries(ZONE_BY_CATEGORY)) {
      expect(CATEGORY_BY_ZONE[zone]).toBe(cat);
    }
  });
});
