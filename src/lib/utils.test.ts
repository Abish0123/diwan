import { describe, it, expect } from "vitest";
import { cn, formatDate, getInitials } from "./utils";

describe("cn", () => {
  it("merges plain class name strings", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("resolves conflicting tailwind classes by keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional class objects", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("filters out falsy values (undefined, null, false, empty string)", () => {
    expect(cn("base", undefined, null, false, "")).toBe("base");
  });

  it("handles arrays of class values", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("returns an empty string when given no meaningful input", () => {
    expect(cn()).toBe("");
    expect(cn(undefined, null, false)).toBe("");
  });
});

describe("formatDate", () => {
  it("returns N/A for null", () => {
    expect(formatDate(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatDate(undefined)).toBe("N/A");
  });

  it("returns N/A for an empty string", () => {
    expect(formatDate("")).toBe("N/A");
  });

  it("formats a Firestore-like Timestamp object via toDate()", () => {
    const fakeDate = new Date("2026-01-15T00:00:00.000Z");
    const timestamp = { toDate: () => fakeDate };
    expect(formatDate(timestamp)).toBe(fakeDate.toLocaleDateString());
  });

  it("formats a valid ISO date string", () => {
    const iso = "2026-01-15T00:00:00.000Z";
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });

  it("formats a valid Date object", () => {
    const d = new Date("2026-03-01T00:00:00.000Z");
    expect(formatDate(d)).toBe(d.toLocaleDateString());
  });

  it("returns N/A for an invalid date string", () => {
    expect(formatDate("not-a-real-date")).toBe("N/A");
  });

  it("returns N/A for an object that isn't a Timestamp and isn't a valid date input", () => {
    expect(formatDate({ foo: "bar" })).toBe("N/A");
  });

  it("does not treat an object with a non-function toDate property as a Timestamp", () => {
    // toDate exists but is not a function -> falls through to `new Date(...)` path,
    // which will produce an invalid date for a plain object, so N/A is returned.
    expect(formatDate({ toDate: "nope" })).toBe("N/A");
  });

  it("formats a numeric epoch timestamp", () => {
    const epoch = 1700000000000;
    expect(formatDate(epoch)).toBe(new Date(epoch).toLocaleDateString());
  });

  it("returns N/A for 0 (falsy) rather than treating it as epoch start", () => {
    // KNOWN BUG: `!date` treats numeric 0 as falsy, so a legitimate epoch-start
    // timestamp of 0 is short-circuited to "N/A" instead of being formatted.
    expect(formatDate(0)).toBe("N/A");
  });
});

describe("getInitials", () => {
  it("returns ?? for undefined", () => {
    expect(getInitials(undefined)).toBe("??");
  });

  it("returns ?? for null", () => {
    expect(getInitials(null)).toBe("??");
  });

  it("returns ?? for an empty string", () => {
    expect(getInitials("")).toBe("??");
  });

  it("returns first+last initial for a two-word name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("uses only the first two of multiple words (first and second word initials)", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });

  it("collapses multiple internal spaces when splitting words", () => {
    expect(getInitials("John    Doe")).toBe("JD");
  });

  it("trims leading/trailing whitespace before splitting", () => {
    expect(getInitials("  John Doe  ")).toBe("JD");
  });

  it("returns up to first two characters for a single-word name", () => {
    expect(getInitials("John")).toBe("JO");
  });

  it("returns a single uppercased character for a one-letter name", () => {
    expect(getInitials("J")).toBe("J");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("john doe")).toBe("JD");
  });

  it("falls back to the raw substring of a whitespace-only string (single 'word' after trim)", () => {
    // "   ".trim() -> "" -> split(/\s+/) -> [""] (length 1, not >= 2), so the function
    // falls through to name.substring(0, 2) on the ORIGINAL untrimmed string, yielding two spaces.
    expect(getInitials("   ")).toBe("   ".substring(0, 2).toUpperCase());
  });
});
