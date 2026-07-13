import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractText } from "./textExtract";

// Mock the two external SDKs used for docx/pdf extraction so tests don't
// depend on real binary parsing.
vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

// jsdom's File/Blob implementation doesn't provide working .text()/.arrayBuffer()
// in this environment, so build a minimal File-like stand-in exposing exactly the
// surface textExtract.ts actually uses (name, text(), arrayBuffer()).
function makeFile(name: string, content: string, type = "text/plain"): File {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return {
    name,
    type,
    size: bytes.byteLength,
    text: () => Promise.resolve(content),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as File;
}

describe("extractText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("txt files", () => {
    it("reads plain text content and reports ok:true", async () => {
      const file = makeFile("notes.txt", "Hello world");
      const result = await extractText(file);
      expect(result).toEqual({ text: "Hello world", ok: true });
    });

    it("handles empty txt files", async () => {
      const file = makeFile("empty.txt", "");
      const result = await extractText(file);
      expect(result).toEqual({ text: "", ok: true });
    });

    it("is case-insensitive on the extension", async () => {
      const file = makeFile("REPORT.TXT", "Upper case ext");
      const result = await extractText(file);
      expect(result).toEqual({ text: "Upper case ext", ok: true });
    });
  });

  describe("rtf files", () => {
    it("strips RTF control words/groups (e.g. fonttbl) and returns plain text", async () => {
      // Realistic RTF shape: a nested control group (fonttbl) followed by
      // plain text at the top level, e.g. as produced by WordPad/Word.
      const rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}\\viewkind4\\uc1\\pard\\b Hello \\b0 World\\par}";
      const file = makeFile("doc.rtf", rtf);
      const result = await extractText(file);
      expect(result.ok).toBe(true);
      expect(result.text).not.toMatch(/\\/);
      expect(result.text).toContain("Hello");
      expect(result.text).toContain("World");
    });

    it("converts \\par to newlines", async () => {
      const rtf = "{\\rtf1{\\fonttbl{\\f0 Arial;}}\\pard Line one\\par Line two}";
      const file = makeFile("doc.rtf", rtf);
      const result = await extractText(file);
      expect(result.text).toContain("Line one");
      expect(result.text).toContain("\n Line two");
    });

    it("removes hex-escaped characters like \\'e9", async () => {
      const rtf = "{\\rtf1{\\fonttbl{\\f0 Arial;}}\\pard caf\\'e9 test}";
      const file = makeFile("doc.rtf", rtf);
      const result = await extractText(file);
      expect(result.text).not.toMatch(/\\'/);
      expect(result.text).toBe("caf test");
    });

    // KNOWN BUG: stripRtf's group-stripping regex `/\{\\[^{}]+\}/g` removes an
    // entire single-level (non-nested) `{...}` group wholesale, including any
    // plain text inside it — it doesn't distinguish "control-word-only" groups
    // from groups that happen to also contain real document text. A minimal
    // flat RTF payload like this one (no nested control groups) loses ALL of
    // its text, even though it isn't a scanned/empty document.
    it("loses all text for a minimal flat (non-nested) RTF payload", async () => {
      const rtf = "{\\rtf1\\ansi Hello \\b World\\b0 !}";
      const file = makeFile("doc.rtf", rtf);
      const result = await extractText(file);
      expect(result.ok).toBe(true);
      expect(result.text).toBe("");
    });

    it("trims leading/trailing whitespace", async () => {
      const rtf = "   {\\rtf1 padded text}   ";
      const file = makeFile("doc.rtf", rtf);
      const result = await extractText(file);
      expect(result.text).toBe(result.text.trim());
    });

    it("handles an empty rtf file", async () => {
      const file = makeFile("empty.rtf", "");
      const result = await extractText(file);
      expect(result).toEqual({ text: "", ok: true });
    });
  });

  describe("docx files", () => {
    it("delegates to mammoth.extractRawText and returns its value", async () => {
      const mammoth = await import("mammoth");
      (mammoth.extractRawText as ReturnType<typeof vi.fn>).mockResolvedValue({
        value: "Extracted docx text",
      });
      const file = makeFile("report.docx", "binary-ish content", "application/vnd.openxmlformats");
      const result = await extractText(file);
      expect(result).toEqual({ text: "Extracted docx text", ok: true });
      expect(mammoth.extractRawText).toHaveBeenCalledWith(
        expect.objectContaining({ arrayBuffer: expect.anything() })
      );
    });

    it("handles mammoth returning an empty value", async () => {
      const mammoth = await import("mammoth");
      (mammoth.extractRawText as ReturnType<typeof vi.fn>).mockResolvedValue({ value: "" });
      const file = makeFile("empty.docx", "");
      const result = await extractText(file);
      expect(result).toEqual({ text: "", ok: true });
    });

    it("catches mammoth errors and returns ok:false with a message", async () => {
      const mammoth = await import("mammoth");
      (mammoth.extractRawText as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("corrupt zip")
      );
      const file = makeFile("bad.docx", "junk");
      const result = await extractText(file);
      expect(result.ok).toBe(false);
      expect(result.text).toBe("");
      expect(result.note).toBe("Could not read the file: corrupt zip");
    });
  });

  describe("pdf files", () => {
    async function mockPdfDocument(pagesText: string[]) {
      const pdfjs = await import("pdfjs-dist");
      const pages = pagesText.map((str) => ({
        getTextContent: vi.fn().mockResolvedValue({
          items: str.length ? [{ str }] : [],
        }),
      }));
      (pdfjs.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
        promise: Promise.resolve({
          numPages: pages.length,
          getPage: vi.fn((p: number) => Promise.resolve(pages[p - 1])),
        }),
      });
      return pdfjs;
    }

    it("extracts text across multiple pages and joins with newlines", async () => {
      await mockPdfDocument([
        "This is page one with plenty of real text content.",
        "This is page two with even more text content here.",
      ]);
      const file = makeFile("report.pdf", "pdf-bytes", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(true);
      expect(result.text).toContain("This is page one with plenty of real text content.");
      expect(result.text).toContain("This is page two with even more text content here.");
      expect(result.text.split("\n").length).toBeGreaterThanOrEqual(2);
    });

    it("flags likely-scanned PDFs when extracted text is under 20 chars", async () => {
      await mockPdfDocument(["short", ""]);
      const file = makeFile("scanned.pdf", "pdf-bytes", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(false);
      expect(result.note).toMatch(/scanned PDF/);
      // Text is still returned even though flagged as not-ok.
      expect(result.text).toContain("short");
    });

    it("treats an empty PDF (no text at all) as a scanned PDF", async () => {
      await mockPdfDocument(["", ""]);
      const file = makeFile("blank.pdf", "pdf-bytes", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(false);
      expect(result.note).toMatch(/scanned PDF/);
    });

    it("treats items without a 'str' property as empty strings", async () => {
      const pdfjs = await import("pdfjs-dist");
      (pdfjs.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockResolvedValue({
            getTextContent: vi.fn().mockResolvedValue({
              items: [{ notStr: "ignored" }, { str: "real text that is long enough to pass the twenty char check" }],
            }),
          }),
        }),
      });
      const file = makeFile("mixed.pdf", "pdf-bytes", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(true);
      expect(result.text).toContain("real text that is long enough to pass the twenty char check");
    });

    it("catches pdfjs errors and returns ok:false with a message", async () => {
      const pdfjs = await import("pdfjs-dist");
      (pdfjs.getDocument as ReturnType<typeof vi.fn>).mockReturnValue({
        promise: Promise.reject(new Error("invalid PDF structure")),
      });
      const file = makeFile("broken.pdf", "not-a-real-pdf", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(false);
      expect(result.text).toBe("");
      expect(result.note).toBe("Could not read the file: invalid PDF structure");
    });

    it("handles a zero-page PDF without iterating any pages", async () => {
      await mockPdfDocument([]);
      const file = makeFile("nopages.pdf", "pdf-bytes", "application/pdf");
      const result = await extractText(file);
      expect(result.ok).toBe(false); // 0 chars < 20
      expect(result.text).toBe("");
    });
  });

  describe("doc (legacy binary) files", () => {
    it("returns ok:false with an unsupported-format note and no text", async () => {
      const file = makeFile("legacy.doc", "binary junk", "application/msword");
      const result = await extractText(file);
      expect(result).toEqual({
        text: "",
        ok: false,
        note: "Legacy .doc isn't supported in-browser — please upload PDF, DOCX, or TXT.",
      });
    });
  });

  describe("unknown/other extensions", () => {
    it("falls back to reading as plain text for unrecognized extensions", async () => {
      const file = makeFile("data.csv", "a,b,c\n1,2,3");
      const result = await extractText(file);
      expect(result).toEqual({ text: "a,b,c\n1,2,3", ok: true });
    });

    it("falls back to plain text when there is no extension at all", async () => {
      const file = makeFile("README", "plain readme content");
      const result = await extractText(file);
      expect(result).toEqual({ text: "plain readme content", ok: true });
    });
  });
});
