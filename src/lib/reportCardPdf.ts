// Real report-card PDF — same manual jsPDF-grid approach as
// hallTicketReports.ts, replacing ParentReportCards.tsx's old
// toast.success("Downloading PDF report card…") stub that never produced a file.
import jsPDF from "jspdf";

export interface ReportCardPdfSubject {
  subject: string;
  obtained: number;
  max: number;
  pct: number;
  letter: string;
}

export interface ReportCardPdfData {
  studentName: string;
  grade: string;
  section: string;
  term: string;
  year: string;
  subjects: ReportCardPdfSubject[];
  overallPct: number;
  overallGrade: string;
  attendancePct?: number | null;
  classTeacherRemark?: string;
  principalRemark?: string;
  teacherName?: string;
  principalName?: string;
  published: boolean;
}

function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "report-card";
}

export function downloadReportCardPdf(
  schoolName: string,
  schoolAddress: string,
  data: ReportCardPdfData,
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentW = pageW - marginX * 2;

  // ── Header banner ──
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageW, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(schoolName, marginX, 16);
  if (schoolAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 228, 240);
    doc.text(schoolAddress, marginX, 23);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(200, 215, 235);
  doc.text(data.published ? "REPORT CARD" : "PROVISIONAL REPORT CARD", pageW - marginX, 14, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.term} · ${data.year}`, pageW - marginX, 21, { align: "right" });

  let y = 48;

  // ── Student info ──
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.studentName, marginX, y);
  y += 9;

  const info: [string, string][] = [
    ["Grade", data.grade],
    ["Section", data.section],
    ["Attendance", data.attendancePct != null ? `${data.attendancePct}%` : "—"],
    ["Status", data.published ? "Published" : "Provisional"],
  ];
  const infoColW = contentW / 4;
  info.forEach(([label, value], i) => {
    const x = marginX + i * infoColW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(value || "—", x, y + 5.5);
  });
  y += 18;

  // ── Overall grade box ──
  const boxGap = 4;
  const boxW = (contentW - boxGap) / 2;
  const boxH = 20;
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(marginX, y, boxW, boxH, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(124, 58, 237);
  doc.text("OVERALL GRADE", marginX + 4, y + 7);
  doc.setFontSize(16);
  doc.text(String(data.overallGrade), marginX + 4, y + 16);

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(marginX + boxW + boxGap, y, boxW, boxH, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(37, 99, 235);
  doc.text("OVERALL PERCENTAGE", marginX + boxW + boxGap + 4, y + 7);
  doc.setFontSize(16);
  doc.text(`${Math.round(data.overallPct)}%`, marginX + boxW + boxGap + 4, y + 16);
  y += boxH + 12;

  // ── Subject table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("SUBJECT-WISE MARKS", marginX, y);
  y += 5;

  const cols = [
    { label: "SUBJECT", width: contentW * 0.4 },
    { label: "OBTAINED", width: contentW * 0.2 },
    { label: "PERCENTAGE", width: contentW * 0.2 },
    { label: "GRADE", width: contentW * 0.2 },
  ];
  const rowH = 8;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(marginX, y, contentW, rowH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  let x = marginX;
  cols.forEach(c => { doc.text(c.label, x + 2.5, y + 5.5); x += c.width; });
  y += rowH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  data.subjects.forEach((s, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentW, rowH, "F");
    }
    doc.setTextColor(30, 41, 59);
    let xx = marginX;
    const cells = [s.subject, `${s.obtained}/${s.max}`, `${Math.round(s.pct)}%`, s.letter];
    cols.forEach((c, ci) => { doc.text(cells[ci] || "—", xx + 2.5, y + 5.5); xx += c.width; });
    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + rowH, marginX + contentW, y + rowH);
    y += rowH;
  });
  y += 10;

  // ── Remarks ──
  if (data.classTeacherRemark || data.principalRemark) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    const remarkLines = [
      data.classTeacherRemark ? `Class Teacher: ${data.classTeacherRemark}` : "",
      data.principalRemark ? `Principal: ${data.principalRemark}` : "",
    ].filter(Boolean);
    const boxH2 = 10 + remarkLines.length * 6;
    doc.roundedRect(marginX, y, contentW, boxH2, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text("REMARKS", marginX + 4, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 53, 15);
    remarkLines.forEach((line, i) => doc.text(line, marginX + 4, y + 13 + i * 6, { maxWidth: contentW - 8 }));
    y += boxH2 + 10;
  }

  // ── Footer signatures ──
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 30;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, footerY, marginX + 45, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(data.teacherName || "Class Teacher's Signature", marginX, footerY + 5);

  doc.line(marginX + 75, footerY, marginX + 110, footerY);
  doc.text(data.principalName || "Principal's Signature", marginX + 75, footerY + 5);

  doc.save(`${sanitizeFileName(data.studentName)}_${sanitizeFileName(data.term)}_ReportCard.pdf`);
}
