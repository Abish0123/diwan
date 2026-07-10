import { ProjectReport, PlagiarismPolicy, bandForScore } from "@/types/plagiarism";

// DrillBit-style plagiarism report PDF (cloned layout: logo header, blue
// dividers, italic-blue section headings, maroon table labels, similarity
// scale bar, Sources-Type pie + Report-Content donut, QR code, colored grade
// legend, numbered-badge source table, annotated document with circle badges
// and per-source highlight colours). Serif (Times) font throughout.

type RGB = [number, number, number];
const BRAND: RGB = [26, 127, 196];      // logo / divider blue
const HEADING: RGB = [46, 117, 182];    // italic section headings
const MAROON: RGB = [150, 38, 48];      // table labels
const INK: RGB = [45, 45, 45];
const MUTE: RGB = [120, 120, 120];
const LINE: RGB = [210, 210, 216];
const RED: RGB = [192, 57, 43];

// Per-source colour palette — ties the source table to the annotated highlights.
const PALETTE: { light: RGB; strong: RGB }[] = [
  { light: [254, 205, 211], strong: [225, 29, 72] },   // pink/red
  { light: [191, 219, 254], strong: [37, 99, 235] },   // blue
  { light: [221, 214, 254], strong: [124, 58, 237] },  // purple
  { light: [254, 215, 170], strong: [234, 88, 12] },   // orange
  { light: [187, 247, 208], strong: [22, 163, 74] },   // green
  { light: [153, 246, 228], strong: [13, 148, 136] },  // teal
  { light: [254, 240, 138], strong: [202, 138, 4] },   // yellow
  { light: [199, 210, 254], strong: [79, 70, 229] },   // indigo
];
const pal = (i: number) => PALETTE[i % PALETTE.length];

function grade(sim: number) {
  if (sim <= 10) return { letter: "A", color: [39, 131, 87] as RGB };
  if (sim <= 40) return { letter: "B", color: [43, 80, 170] as RGB };
  if (sim <= 60) return { letter: "C", color: [224, 142, 11] as RGB };
  return { letter: "D", color: [192, 57, 43] as RGB };
}
const srcTypeLabel = (t: string) => (t === "student" || t === "repository" ? "Student Paper" : t === "research" ? "Publication" : "Internet Data");

export async function generatePlagiarismPdf(report: ProjectReport, _policy: PlagiarismPolicy | null) {
  const { default: jsPDF } = await import("jspdf");
  const res = report.result!;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, CW = W - M * 2;
  const g = grade(res.overallSimilarity);

  const T = (s: string, x: number, y: number, o?: { size?: number; color?: RGB; style?: "normal" | "bold" | "italic" | "bolditalic"; align?: "left" | "center" | "right"; font?: "times" | "helvetica" }) => {
    doc.setFont(o?.font ?? "times", o?.style ?? "normal");
    doc.setFontSize(o?.size ?? 10);
    doc.setTextColor(...(o?.color ?? INK));
    doc.text(s, x, y, { align: o?.align ?? "left" });
  };
  const pageFrame = () => { doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.roundedRect(8, 8, W - 16, H - 16, 2, 2, "S"); doc.setLineWidth(0.2); };

  // teardrop logo + brand, centred
  const logo = (cy: number) => {
    const cx = W / 2 - 22;
    doc.setFillColor(...BRAND); doc.circle(cx, cy + 1.5, 3.1, "F");
    doc.triangle(cx - 2.2, cy + 0.2, cx + 2.2, cy + 0.2, cx, cy - 4.2, "F");
    doc.setFillColor(255, 255, 255); doc.circle(cx + 0.9, cy + 0.9, 1, "F");
    T("Student Diwan", cx + 6, cy + 3, { size: 18, color: BRAND, style: "bold", font: "helvetica" });
  };
  const divider = (y: number) => {
    for (let i = 0; i < 60; i++) { const t = i / 60; doc.setFillColor(Math.round(26 + t * 20), Math.round(170 - t * 50), Math.round(190 + t * 6)); doc.rect(M + (CW * i) / 60, y, CW / 60 + 0.3, 1.6, "F"); }
  };
  const heading = (s: string, x: number, y: number) => T(s, x, y, { size: 11, color: HEADING, style: "bolditalic" });

  // table row helpers (maroon label, ink value)
  const trow = (x: number, y: number, w: number, k: string, v: string, valColor?: RGB) => {
    T(k, x, y, { size: 9, color: MAROON });
    const lines = doc.splitTextToSize(v, w - 42) as string[];
    lines.forEach((ln, i) => T(ln, x + 42, y + i * 4.4, { size: 9, color: valColor ?? INK }));
    doc.setDrawColor(...LINE); doc.line(x - 2, y + Math.max(1, lines.length) * 4.4 - 1.5, x + w - 2, y + Math.max(1, lines.length) * 4.4 - 1.5);
    return Math.max(1, lines.length) * 4.4 + 1.5;
  };

  // pie / donut
  const pie = (cx: number, cy: number, r: number, slices: { v: number; c: RGB }[], hole = 0) => {
    const total = slices.reduce((a, s) => a + s.v, 0);
    if (total <= 0) { doc.setFillColor(225, 225, 230); doc.circle(cx, cy, r, "F"); }
    else {
      let a0 = -Math.PI / 2;
      for (const s of slices) {
        if (s.v <= 0) continue;
        const a1 = a0 + (s.v / total) * Math.PI * 2;
        const steps = Math.max(2, Math.ceil(((a1 - a0) / Math.PI) * 30));
        doc.setFillColor(...s.c);
        for (let i = 0; i < steps; i++) {
          const b0 = a0 + ((a1 - a0) * i) / steps, b1 = a0 + ((a1 - a0) * (i + 1)) / steps;
          doc.triangle(cx, cy, cx + r * Math.cos(b0), cy + r * Math.sin(b0), cx + r * Math.cos(b1), cy + r * Math.sin(b1), "F");
        }
        a0 = a1;
      }
    }
    if (hole > 0) { doc.setFillColor(255, 255, 255); doc.circle(cx, cy, hole, "F"); }
    doc.setDrawColor(...LINE); doc.circle(cx, cy, r, "S");
  };
  const legendList = (x: number, y: number, items: { label: string; v: number; c: RGB }[]) => {
    items.forEach((it, i) => { const yy = y + i * 6; doc.setFillColor(...it.c); doc.rect(x, yy - 2.6, 3.5, 3.5, "F"); T(`${it.label}`, x + 5, yy, { size: 8, color: INK }); T(`${it.v}%`, x + 42, yy, { size: 8, color: MUTE, align: "right" }); });
  };

  // ===================== PAGE 1 — COVER =====================
  pageFrame();
  logo(26);
  T("The Report is Generated by Student Diwan Plagiarism Detection Software", W / 2, 38, { size: 9.5, color: INK, align: "center" });
  divider(42);

  let y = 52;
  heading("Submission Information", M + 2, y); y += 7;
  const subRows: [string, string][] = [
    ["Author Name", report.studentName],
    ["Title", report.title.toUpperCase()],
    ["Paper/Submission ID", report.id.replace(/[^0-9]/g, "").slice(-7) || report.id],
    ["Submitted by", report.guideName ? `${report.guideName}` : report.studentName],
    ["Submission Date", new Date(report.createdAt).toISOString().slice(0, 19).replace("T", " ")],
    ["Total Words", `${res.wordCount}`],
    ["Document type", report.subject || "Project Report"],
  ];
  for (const [k, v] of subRows) y += trow(M + 2, y, CW, k, v);

  y += 4;
  heading("Result Information", M + 2, y); y += 8;
  T("Similarity", M + 2, y, { size: 10, color: MAROON });
  T(`${res.overallSimilarity} %`, M + 30, y, { size: 13, color: [43, 80, 170], style: "bold" });
  y += 5;
  // scale bar with ticks
  const sbX = M + 2, sbW = CW - 4, sbY = y;
  for (let i = 0; i <= 9; i++) T(String(i === 0 ? 1 : i * 10), sbX + (sbW * i) / 9, sbY - 1, { size: 6, color: MUTE, align: "center", font: "helvetica" });
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    if (i < res.overallSimilarity) { doc.setFillColor(Math.round(40 + t * 200), Math.round(180 - t * 150), 60); }
    else doc.setFillColor(228, 228, 232);
    doc.rect(sbX + (sbW * i) / 100, sbY + 1, sbW / 100 + 0.3, 3.4, "F");
  }
  y = sbY + 10;

  // two charts
  const pieCY = y + 22;
  T("Sources Type", M + 24, y + 2, { size: 9, color: INK, align: "center", style: "bold" });
  pie(M + 24, pieCY, 18, [
    { v: res.breakdown.studentRepo, c: [196, 181, 253] },
    { v: res.breakdown.research, c: [225, 29, 72] },
    { v: Math.max(0.0001, res.breakdown.internet), c: [251, 146, 138] },
  ]);
  legendList(M + 48, pieCY - 6, [
    { label: "Student Paper", v: res.breakdown.studentRepo, c: [196, 181, 253] },
    { label: "Journal / Publication", v: res.breakdown.research, c: [225, 29, 72] },
    { label: "Internet", v: res.breakdown.internet, c: [251, 146, 138] },
  ]);
  const original = Math.max(0, 100 - res.overallSimilarity);
  T("Report Content", M + CW / 2 + 24, y + 2, { size: 9, color: INK, align: "center", style: "bold" });
  pie(M + CW / 2 + 24, pieCY, 18, [
    { v: original, c: [187, 247, 208] },
    { v: res.breakdown.internet, c: [251, 146, 138] },
    { v: res.breakdown.studentRepo, c: [196, 181, 253] },
    { v: res.breakdown.research, c: [225, 29, 72] },
  ], 9);
  legendList(M + CW / 2 + 48, pieCY - 9, [
    { label: "Original", v: original, c: [187, 247, 208] },
    { label: "Internet", v: res.breakdown.internet, c: [251, 146, 138] },
    { label: "Student Repo", v: res.breakdown.studentRepo, c: [196, 181, 253] },
    { label: "Publication", v: res.breakdown.research, c: [225, 29, 72] },
  ]);
  y = pieCY + 26;

  // exclude info + database selection
  const colW = CW / 2 - 4;
  heading("Exclude Information", M + 2, y);
  heading("Database Selection", M + CW / 2 + 2, y);
  let ly = y + 7, ry = y + 7;
  const exRows: [string, string, RGB?][] = [["Quotes", "Not Excluded"], ["References/Bibliography", "Not Excluded"], ["Source: Excluded < 14 Words", "Not Excluded"], ["Excluded Source", "0 %", RED], ["Excluded Phrases", "Not Excluded"]];
  const dbRows: [string, string][] = [["Language", "English"], ["Student Papers", "Yes"], ["Journals & publishers", "Yes"], ["Internet or Web", "Yes"], ["Institution Repository", "Yes"]];
  for (const [k, v, c] of exRows) ly += trow(M + 2, ly, colW, k, v, c);
  for (const [k, v] of dbRows) ry += trow(M + CW / 2 + 2, ry, colW, k, v);

  // QR
  try {
    const QRCode = await import("qrcode");
    const url = `https://studentdiwan.app/plagiarism/report/${report.id}`;
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    const qy = Math.max(ly, ry) + 2;
    T("A Unique QR Code use to View/Download/Share Pdf File", M + 2, qy + 14, { size: 8.5, color: MUTE });
    doc.addImage(dataUrl, "PNG", W - M - 28, qy, 26, 26);
  } catch { /* qr optional */ }

  // ===================== PAGE 2 — SIMILARITY REPORT =====================
  doc.addPage(); pageFrame();
  logo(22);
  T("Student Diwan Similarity Report", M + 2, 38, { size: 12, color: MAROON, style: "bold" });
  doc.setDrawColor(...LINE); doc.line(M + 2, 41, W - M - 2, 41);

  const by = 56;
  T(String(res.overallSimilarity), M + 24, by, { size: 30, color: [43, 80, 170], style: "bold", align: "center" });
  T("SIMILARITY %", M + 24, by + 8, { size: 9, color: MUTE, align: "center" });
  T(String(res.sources.length), W / 2, by, { size: 30, color: INK, style: "bold", align: "center" });
  T("MATCHED SOURCES", W / 2, by + 8, { size: 9, color: MUTE, align: "center" });
  T(g.letter, W - M - 70, by, { size: 30, color: g.color, style: "bold", align: "center" });
  T("GRADE", W - M - 70, by + 8, { size: 9, color: MUTE, align: "center" });
  const legX = W - M - 52;
  T("A-Satisfactory (0-10%)", legX, by - 9, { size: 8.5, color: [39, 131, 87], style: "bold" });
  T("B-Upgrade (11-40%)", legX, by - 3, { size: 8.5, color: [43, 80, 170], style: "bold" });
  T("C-Poor (41-60%)", legX, by + 3, { size: 8.5, color: [224, 142, 11], style: "bold" });
  T("D-Unacceptable (61-100%)", legX, by + 9, { size: 8.5, color: RED, style: "bold" });
  doc.setDrawColor(...LINE); doc.line(M + 2, by + 14, W - M - 2, by + 14);

  // table header (maroon)
  let ty = by + 22;
  T("LOCATION", M + 2, ty, { size: 9, color: MAROON, style: "bold" });
  T("MATCHED DOMAIN", M + 26, ty, { size: 9, color: MAROON, style: "bold" });
  T("%", W - M - 34, ty, { size: 9, color: MAROON, style: "bold", align: "right" });
  T("SOURCE TYPE", W - M - 28, ty, { size: 9, color: MAROON, style: "bold" });
  ty += 3; doc.setDrawColor(...LINE); doc.line(M + 2, ty, W - M - 2, ty); ty += 5;

  res.sources.forEach((s, i) => {
    if (ty > H - 16) { doc.addPage(); pageFrame(); ty = 20; }
    const c = pal(i);
    // number badge
    doc.setFillColor(...c.light); doc.roundedRect(M + 2, ty - 4, 7, 6, 1, 1, "F");
    T(String(i + 1), M + 5.5, ty + 0.3, { size: 8, color: c.strong, style: "bold", align: "center", font: "helvetica" });
    // domain in source colour
    const label = (doc.splitTextToSize(s.label, 120) as string[]);
    label.forEach((ln, k) => T(ln, M + 26, ty + k * 4.2, { size: 9, color: c.strong }));
    T(s.matchPercent < 1 ? "<1" : String(s.matchPercent), W - M - 34, ty, { size: 9, color: INK, align: "right" });
    T(srcTypeLabel(s.type), W - M - 28, ty, { size: 8.5, color: MUTE });
    const rh = Math.max(7, label.length * 4.2 + 2);
    doc.setDrawColor(238, 238, 240); doc.line(M + 2, ty + rh - 3, W - M - 2, ty + rh - 3);
    ty += rh;
  });
  if (res.sources.length === 0) T("No external or student-paper matches detected.", M + 2, ty + 2, { size: 9, color: MUTE });

  // ===================== PAGE 3+ — ANNOTATED DOCUMENT =====================
  doc.addPage(); pageFrame();
  T(report.title, W / 2, 18, { size: 10, color: INK, style: "bold", align: "center" });
  doc.setDrawColor(...LINE); doc.line(M, 22, W - M, 22);

  const srcNum: Record<string, number> = {};
  res.sources.forEach((s, i) => { srcNum[s.label] = i + 1; });

  const lineH = 5.6, fs = 10, maxX = W - M;
  let x = M, yy = 32;
  const nl = () => { x = M; yy += lineH; if (yy > H - 16) { doc.addPage(); pageFrame(); yy = 20; } };

  res.sentenceMatches.forEach((sm) => {
    const matched = !!sm.sourceLabel && bandForScore(sm.score).band !== "green";
    const n = sm.sourceLabel ? srcNum[sm.sourceLabel] : undefined;
    const c = n ? pal(n - 1) : null;
    doc.setFont("times", "normal"); doc.setFontSize(fs);

    // numbered circle badge before a matched sentence
    if (matched && n && c) {
      if (x + 6 > maxX) nl();
      doc.setFillColor(...c.strong); doc.circle(x + 2.2, yy - 1.6, 2.2, "F");
      T(String(n), x + 2.2, yy - 0.6, { size: 6, color: [255, 255, 255], style: "bold", align: "center", font: "helvetica" });
      x += 5.4;
    }
    for (const word of sm.text.split(/\s+/)) {
      doc.setFont("times", "normal"); doc.setFontSize(fs);
      const ww = doc.getTextWidth(word + " ");
      if (x + ww > maxX) nl();
      if (matched && c) { doc.setFillColor(...c.light); doc.rect(x - 0.2, yy - 3.6, ww, 5, "F"); }
      T(word, x, yy, { size: fs, color: INK });
      x += ww;
    }
    x += 1;
  });

  // footer on all pages
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    T(`Page ${p} of ${pages}`, W / 2, H - 11, { size: 8, color: MUTE, align: "center", font: "helvetica" });
  }

  doc.save(`${report.studentName.replace(/\s/g, "_")}_plagiarism_report.pdf`);
}
