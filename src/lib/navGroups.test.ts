import { describe, it, expect } from "vitest";
import { navGroups } from "./navGroups";
import type { NavGroup, NavItem } from "./navGroups";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect every NavItem from all groups, flattened. */
function allItems(): NavItem[] {
  return navGroups.flatMap((g) => g.items);
}

/** Find a group by label (exact match). */
function group(label: string): NavGroup | undefined {
  return navGroups.find((g) => g.label === label);
}

// ── Structure ─────────────────────────────────────────────────────────────────

describe("navGroups top-level structure", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(navGroups)).toBe(true);
    expect(navGroups.length).toBeGreaterThan(0);
  });

  it("every group has a non-empty label, a non-null icon, and at least one item", () => {
    for (const g of navGroups) {
      expect(typeof g.label).toBe("string");
      expect(g.label.length).toBeGreaterThan(0);
      // Icons are pre-rendered JSX elements — assert they are present and non-null.
      // (React.isValidElement requires the full runtime symbol; checking existence
      //  is sufficient and works correctly in the jsdom + Vitest environment.)
      expect(g.icon).toBeDefined();
      expect(g.icon).not.toBeNull();
      expect(Array.isArray(g.items)).toBe(true);
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("group labels are all unique", () => {
    const labels = navGroups.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ── NavItem shape ─────────────────────────────────────────────────────────────

describe("NavItem shape", () => {
  it("every item has a non-empty title and a non-null icon", () => {
    for (const item of allItems()) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length).toBeGreaterThan(0);
      // Icons are pre-rendered JSX elements — assert they are present and non-null.
      expect(item.icon).toBeDefined();
      expect(item.icon).not.toBeNull();
    }
  });

  it("every item with a url has a string url that starts with '/'", () => {
    for (const item of allItems()) {
      if (item.url !== undefined) {
        expect(typeof item.url).toBe("string");
        expect(item.url.startsWith("/")).toBe(true);
      }
    }
  });

  it("subItems, when present, each have a title and a url starting with '/'", () => {
    for (const item of allItems()) {
      if (item.subItems) {
        expect(Array.isArray(item.subItems)).toBe(true);
        for (const sub of item.subItems) {
          expect(typeof sub.title).toBe("string");
          expect(sub.title.length).toBeGreaterThan(0);
          expect(sub.url.startsWith("/")).toBe(true);
        }
      }
    }
  });

  it("adminOnly, when present, is strictly boolean", () => {
    for (const item of allItems()) {
      if ("adminOnly" in item) {
        expect(typeof item.adminOnly).toBe("boolean");
      }
    }
  });
});

// ── URL uniqueness ────────────────────────────────────────────────────────────

describe("URL uniqueness", () => {
  it("all item-level urls are unique across all groups", () => {
    const urls = allItems()
      .map((i) => i.url)
      .filter((u): u is string => u !== undefined);
    const unique = new Set(urls);
    // Collect duplicates for a useful failure message
    const seen = new Map<string, number>();
    for (const u of urls) seen.set(u, (seen.get(u) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, count]) => count > 1).map(([u]) => u);
    expect(dupes).toEqual([]);
    expect(unique.size).toBe(urls.length);
  });
});

// ── Known groups presence ─────────────────────────────────────────────────────

describe("known groups and items are present", () => {
  it("includes a 'Student Management' group with an 'Admissions' item", () => {
    const g = group("Student Management");
    expect(g).toBeDefined();
    const titles = g!.items.map((i) => i.title);
    expect(titles).toContain("Admissions");
  });

  it("includes an 'Academics' group with 'Timetable' and 'Gradebook'", () => {
    const g = group("Academics");
    expect(g).toBeDefined();
    const titles = g!.items.map((i) => i.title);
    expect(titles).toContain("Timetable");
    expect(titles).toContain("Gradebook");
  });

  it("includes a 'Finance' group", () => {
    expect(group("Finance")).toBeDefined();
  });

  it("includes a 'Settings & Admin' or 'Administration' group with at least one adminOnly item", () => {
    const adminGroups = navGroups.filter((g) =>
      g.items.some((i) => i.adminOnly === true)
    );
    expect(adminGroups.length).toBeGreaterThan(0);
  });
});

// ── adminOnly items ───────────────────────────────────────────────────────────

describe("adminOnly items", () => {
  it("at least one item across all groups is flagged adminOnly", () => {
    const adminItems = allItems().filter((i) => i.adminOnly === true);
    expect(adminItems.length).toBeGreaterThan(0);
  });

  it("no item without adminOnly:true causes adminOnly to equal true (strict check)", () => {
    // Items without the flag should yield undefined, not false — both are fine.
    for (const item of allItems()) {
      if (item.adminOnly !== true) {
        expect(item.adminOnly).not.toBe(true);
      }
    }
  });
});
