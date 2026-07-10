// Extracts plain text from uploaded report files, in the browser.
// PDF  -> pdf.js     DOCX -> mammoth     TXT/RTF -> native
// DOC (legacy binary) and scanned PDFs (OCR) are not supported client-side.

export interface ExtractResult {
  text: string;
  ok: boolean;
  note?: string;
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\[^{}]+\}/g, "")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\r/g, "")
    .trim();
}

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() || "";

  try {
    if (ext === "txt") {
      return { text: await file.text(), ok: true };
    }
    if (ext === "rtf") {
      return { text: stripRtf(await file.text()), ok: true };
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer });
      return { text: res.value, ok: true };
    }
    if (ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      // Wire up the worker (Vite resolves the bundled worker asset URL).
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
      }
      if (text.trim().length < 20) {
        return { text, ok: false, note: "This looks like a scanned PDF — OCR (server-side) would be required to read it." };
      }
      return { text, ok: true };
    }
    if (ext === "doc") {
      return { text: "", ok: false, note: "Legacy .doc isn't supported in-browser — please upload PDF, DOCX, or TXT." };
    }
    return { text: await file.text(), ok: true };
  } catch (e) {
    return { text: "", ok: false, note: `Could not read the file: ${(e as Error).message}` };
  }
}
