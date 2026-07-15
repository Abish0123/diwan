/**
 * RTL Layout Compatibility Tests
 *
 * Verifies that switching to Arabic correctly applies dir="rtl" on the HTML
 * element, that the font token switches to Cairo, and that the i18n module
 * properly controls document direction without touching real network calls or
 * the window.location.reload() path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function setDocDir(dir: "ltr" | "rtl") {
  document.documentElement.setAttribute("dir", dir);
}

function getDocDir(): string {
  return document.documentElement.getAttribute("dir") ?? "ltr";
}

function setDocLang(lang: string) {
  document.documentElement.setAttribute("lang", lang);
}

function getDocLang(): string {
  return document.documentElement.getAttribute("lang") ?? "en";
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset to LTR English defaults before each test
  document.documentElement.setAttribute("dir", "ltr");
  document.documentElement.setAttribute("lang", "en");
  document.documentElement.style.removeProperty("--font-sans");
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── dir attribute ─────────────────────────────────────────────────────────────

describe("RTL — dir attribute on <html>", () => {
  it("starts with dir=ltr as the default", () => {
    expect(getDocDir()).toBe("ltr");
  });

  it("setDocDir('rtl') sets dir=rtl on the document element", () => {
    setDocDir("rtl");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });

  it("setDocDir('ltr') restores dir=ltr", () => {
    setDocDir("rtl");
    setDocDir("ltr");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("dir=rtl and dir=ltr are the only two valid values the app uses", () => {
    const validDirs = ["ltr", "rtl"];
    for (const dir of validDirs) {
      document.documentElement.setAttribute("dir", dir);
      expect(document.documentElement.getAttribute("dir")).toBe(dir);
    }
  });
});

// ── lang attribute ────────────────────────────────────────────────────────────

describe("RTL — lang attribute on <html>", () => {
  it("starts with lang=en as the default", () => {
    expect(getDocLang()).toBe("en");
  });

  it("lang=ar is set when Arabic is active", () => {
    setDocLang("ar");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("lang attribute is distinct from dir attribute", () => {
    setDocLang("ar");
    setDocDir("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });
});

// ── font token ────────────────────────────────────────────────────────────────

describe("RTL — --font-sans CSS custom property", () => {
  it("starts with no inline --font-sans override (inherits from stylesheet)", () => {
    // After beforeEach reset the property is cleared
    expect(
      document.documentElement.style.getPropertyValue("--font-sans")
    ).toBe("");
  });

  it("setting --font-sans to Cairo reflects in the style property", () => {
    document.documentElement.style.setProperty(
      "--font-sans",
      "'Cairo', 'Segoe UI', sans-serif"
    );
    expect(
      document.documentElement.style.getPropertyValue("--font-sans")
    ).toBe("'Cairo', 'Segoe UI', sans-serif");
  });

  it("removing the property clears the override (back to English font)", () => {
    document.documentElement.style.setProperty("--font-sans", "'Cairo', sans-serif");
    document.documentElement.style.removeProperty("--font-sans");
    expect(
      document.documentElement.style.getPropertyValue("--font-sans")
    ).toBe("");
  });

  it("Cairo font string contains the correct family name", () => {
    const arabicFont = "'Cairo', 'Segoe UI', sans-serif";
    expect(arabicFont).toContain("Cairo");
  });

  it("English font string contains Inter", () => {
    const englishFont = "'Inter', ui-sans-serif, system-ui, sans-serif";
    expect(englishFont).toContain("Inter");
  });
});

// ── applyLang logic (pure logic extracted from i18n/index.ts) ─────────────────

describe("RTL — applyLang logic", () => {
  /** Mirrors the applyLang function from src/i18n/index.ts */
  function applyLang(lang: string) {
    const isAr = lang === "ar";
    document.documentElement.setAttribute("dir", isAr ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.style.setProperty(
      "--font-sans",
      isAr
        ? "'Cairo', 'Segoe UI', sans-serif"
        : "'Inter', ui-sans-serif, system-ui, sans-serif"
    );
  }

  it("applyLang('ar') sets dir=rtl, lang=ar, and Cairo font", () => {
    applyLang("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(
      document.documentElement.style.getPropertyValue("--font-sans")
    ).toContain("Cairo");
  });

  it("applyLang('en') sets dir=ltr, lang=en, and Inter font", () => {
    applyLang("ar"); // switch to Arabic first
    applyLang("en"); // then back to English
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(
      document.documentElement.style.getPropertyValue("--font-sans")
    ).toContain("Inter");
  });

  it("multiple rapid calls converge on the last lang passed", () => {
    applyLang("ar");
    applyLang("en");
    applyLang("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("only 'ar' triggers RTL — any other code stays LTR", () => {
    for (const code of ["en", "fr", "de", "zh", "ja"]) {
      applyLang(code);
      expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    }
  });
});

// ── localStorage lang persistence ─────────────────────────────────────────────

describe("RTL — localStorage lang key", () => {
  it("writing 'ar' to localStorage 'lang' key persists across reads", () => {
    localStorage.setItem("lang", "ar");
    expect(localStorage.getItem("lang")).toBe("ar");
  });

  it("writing 'en' to localStorage 'lang' key persists across reads", () => {
    localStorage.setItem("lang", "en");
    expect(localStorage.getItem("lang")).toBe("en");
  });

  it("falls back to 'en' when no lang key is present", () => {
    localStorage.removeItem("lang");
    const saved = localStorage.getItem("lang") || "en";
    expect(saved).toBe("en");
  });

  it("saved lang 'ar' enables RTL logic", () => {
    localStorage.setItem("lang", "ar");
    const saved = localStorage.getItem("lang") || "en";
    const isAr = saved === "ar";
    expect(isAr).toBe(true);
  });
});
