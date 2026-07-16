import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// autoTranslate.ts is a module with module-level side effects (dict building,
// module-load `flattenPairs` calls). Reset the registry per test so the
// startAutoTranslate / stopAutoTranslate singleton state stays isolated.
vi.mock("./locales/en.json", () => ({
  default: {
    common: { save: "Save", cancel: "Cancel", loading: "Loading" },
    nav: { students: "Students", dashboard: "Dashboard" },
  },
}));

vi.mock("./locales/ar.json", () => ({
  default: {
    common: { save: "حفظ", cancel: "إلغاء", loading: "جارٍ التحميل" },
    nav: { students: "الطلاب", dashboard: "لوحة التحكم" },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTextNode(text: string): Text {
  return document.createTextNode(text);
}

function bodyWithText(text: string): HTMLElement {
  const div = document.createElement("div");
  div.textContent = text;
  document.body.appendChild(div);
  return div;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
});

afterEach(() => {
  // Stop any running observer from a test to prevent leaks
  vi.resetModules();
  document.body.innerHTML = "";
});

// ── Dictionary — locale-derived pairs ────────────────────────────────────────

describe("locale-derived dictionary", () => {
  it("translates 'Save' (from MANUAL dict) → Arabic حفظ", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("Save");
    startAutoTranslate();
    expect(div.textContent).toBe("حفظ");
    stopAutoTranslate();
  });

  it("translates 'Cancel' (from MANUAL dict) → Arabic إلغاء", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("Cancel");
    startAutoTranslate();
    expect(div.textContent).toBe("إلغاء");
    stopAutoTranslate();
  });

  it("translates 'Students' (MANUAL sidebar term) → Arabic الطلاب", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("Students");
    startAutoTranslate();
    expect(div.textContent).toBe("الطلاب");
    stopAutoTranslate();
  });

  it("leaves unknown text unchanged", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("ZZZ_unknown_phrase_XYZ");
    startAutoTranslate();
    expect(div.textContent).toBe("ZZZ_unknown_phrase_XYZ");
    stopAutoTranslate();
  });

  it("is case-insensitive for the lookup key", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    // 'save' (lowercase) should match the 'Save' entry
    const div = bodyWithText("save");
    startAutoTranslate();
    expect(div.textContent).toBe("حفظ");
    stopAutoTranslate();
  });
});

// ── Numeric / punctuation-only text ──────────────────────────────────────────

describe("numeric and punctuation-only strings are left untouched", () => {
  it("leaves a pure number string unchanged", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("12345");
    startAutoTranslate();
    expect(div.textContent).toBe("12345");
    stopAutoTranslate();
  });

  it("leaves a percentage string unchanged", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("98%");
    startAutoTranslate();
    expect(div.textContent).toBe("98%");
    stopAutoTranslate();
  });
});

// ── Attribute translation ─────────────────────────────────────────────────────

describe("attribute translation (placeholder, title, aria-label, alt)", () => {
  it("translates the 'placeholder' attribute on an input", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const input = document.createElement("input");
    input.setAttribute("placeholder", "Search");
    document.body.appendChild(input);

    startAutoTranslate();

    expect(input.getAttribute("placeholder")).toBe("بحث");
    stopAutoTranslate();
  });

  it("translates the 'title' attribute on an element", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const btn = document.createElement("button");
    btn.setAttribute("title", "Delete");
    document.body.appendChild(btn);

    startAutoTranslate();

    expect(btn.getAttribute("title")).toBe("حذف");
    stopAutoTranslate();
  });

  it("translates the 'aria-label' attribute", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Cancel");
    document.body.appendChild(btn);

    startAutoTranslate();

    expect(btn.getAttribute("aria-label")).toBe("إلغاء");
    stopAutoTranslate();
  });

  it("leaves an unknown attribute value unchanged", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const el = document.createElement("div");
    el.setAttribute("title", "some_untranslatable_value");
    document.body.appendChild(el);

    startAutoTranslate();

    expect(el.getAttribute("title")).toBe("some_untranslatable_value");
    stopAutoTranslate();
  });
});

// ── data-no-translate opt-out ─────────────────────────────────────────────────

describe("data-no-translate opt-out", () => {
  it("skips an element that has data-no-translate attribute", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = document.createElement("div");
    div.setAttribute("data-no-translate", "");
    div.textContent = "Save";
    document.body.appendChild(div);

    startAutoTranslate();

    expect(div.textContent).toBe("Save");
    stopAutoTranslate();
  });
});

// ── SKIP_TAGS ─────────────────────────────────────────────────────────────────

describe("SKIP_TAGS — script/style/code/pre are never translated", () => {
  it("does not translate text inside a <script> tag", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const script = document.createElement("script");
    // Use type="text/plain" so jsdom does not try to execute the content as
    // JavaScript (which would throw "Save is not defined").  The skip-tag
    // logic in autoTranslate checks the tag name only, so type is irrelevant.
    script.type = "text/plain";
    script.textContent = "Save";
    document.body.appendChild(script);

    startAutoTranslate();

    expect(script.textContent).toBe("Save");
    stopAutoTranslate();
  });

  it("does not translate text inside a <code> tag", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const code = document.createElement("code");
    code.textContent = "Cancel";
    document.body.appendChild(code);

    startAutoTranslate();

    expect(code.textContent).toBe("Cancel");
    stopAutoTranslate();
  });
});

// ── Lifecycle: startAutoTranslate / stopAutoTranslate ─────────────────────────

describe("lifecycle", () => {
  it("startAutoTranslate() is idempotent — calling it twice does not throw", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    expect(() => {
      startAutoTranslate();
      startAutoTranslate(); // second call should be a no-op
    }).not.toThrow();
    stopAutoTranslate();
  });

  it("stopAutoTranslate() disconnects the observer and is safe to call when already stopped", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    startAutoTranslate();
    stopAutoTranslate();
    expect(() => stopAutoTranslate()).not.toThrow(); // second stop is a no-op
  });

  it("after stopAutoTranslate(), newly added nodes are no longer translated", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    startAutoTranslate();
    stopAutoTranslate();

    // Add a node AFTER stopping — it should remain in English.
    const div = bodyWithText("Delete");

    // Allow any pending rAF/microtasks to settle (observer is gone, nothing should fire).
    await new Promise((r) => setTimeout(r, 0));
    expect(div.textContent).toBe("Delete");
  });
});

// ── Trailing punctuation stripping ───────────────────────────────────────────

describe("trailing-punctuation strip-and-retry", () => {
  it("translates 'Loading...' (ellipsis) using the base 'Loading' entry", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("Loading...");
    startAutoTranslate();
    // 'Loading' is in MANUAL → 'جارٍ التحميل', suffix '...' is re-appended
    expect(div.textContent).toBe("جارٍ التحميل...");
    stopAutoTranslate();
  });

  it("translates 'Delete:' (colon suffix) by stripping the colon", async () => {
    const { startAutoTranslate, stopAutoTranslate } = await import("./autoTranslate");
    const div = bodyWithText("Delete:");
    startAutoTranslate();
    expect(div.textContent).toBe("حذف:");
    stopAutoTranslate();
  });
});
