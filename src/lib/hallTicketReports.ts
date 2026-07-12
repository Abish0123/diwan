// ─────────────────────────────────────────────────────────────────────────────
// Per-student Hall Ticket PDFs, bundled into a single downloadable ZIP.
// Each ticket is drawn manually with jsPDF (same manual-grid approach as
// seatingReports.ts / examReports.ts) onto its own one-page A4 document, so
// every student gets a separate .pdf file inside the archive rather than one
// giant combined PDF.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import JSZip from "jszip";

export interface HallTicketScheduleRow {
  subject: string;
  date: string;   // already formatted, e.g. "12 Jul 2026"
  time: string;   // already formatted, e.g. "9:00 AM"
  hall: string;
}

export interface HallTicketData {
  studentId: string;
  studentName: string;
  admissionNo: string;
  rollNo: string;
  grade: string;
  section: string;
  venue: string;
  hallNo: string;
  seatNo: string;
  schedule: HallTicketScheduleRow[];
}

const INSTRUCTIONS = [
  "Report to the examination hall at least 15 minutes before the scheduled time.",
  "This Hall Ticket must be presented along with a valid school ID card.",
  "Mobile phones and electronic devices are strictly prohibited in the hall.",
  "Write your Roll Number on every answer sheet before starting.",
  "No student will be allowed to leave the hall during the first 30 minutes.",
  "Ignorance of examination rules will not be accepted as an excuse.",
];

function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "ticket";
}

// Draws one hall ticket, filling the current page of `doc` top-to-bottom.
function drawTicket(doc: jsPDF, schoolName: string, schoolAddress: string, examName: string, ticket: HallTicketData) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
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
  doc.text("HALL TICKET", pageW - marginX, 14, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(examName, pageW - marginX, 21, { align: "right" });

  let y = 48;

  // ── Student info ──
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(ticket.studentName, marginX, y);
  y += 9;

  const info: [string, string][] = [
    ["Admission No.", ticket.admissionNo],
    ["Roll No.", ticket.rollNo],
    ["Grade", ticket.grade],
    ["Section", `Section ${ticket.section}`],
  ];
  const infoColW = contentW / 2;
  info.forEach(([label, value], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = marginX + col * infoColW;
    const yy = y + row * 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(value || "—", x, yy + 5.5);
  });
  y += 30;

  // ── Venue / Hall / Seat boxes ──
  const boxGap = 4;
  const boxW = (contentW - boxGap * 2) / 3;
  const boxH = 20;
  const boxes: [string, string, [number, number, number], [number, number, number]][] = [
    ["VENUE", ticket.venue || "TBD", [239, 246, 255], [37, 99, 235]],
    ["HALL NO.", ticket.hallNo || "—", [245, 243, 255], [124, 58, 237]],
    ["SEAT NO.", ticket.seatNo || "—", [236, 253, 245], [5, 150, 105]],
  ];
  boxes.forEach(([label, value, bg, fg], i) => {
    const x = marginX + i * (boxW + boxGap);
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(label, x + 4, y + 7);
    doc.setFontSize(12);
    doc.text(String(value), x + 4, y + 15);
  });
  y += boxH + 12;

  // ── Exam schedule table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("EXAMINATION SCHEDULE", marginX, y);
  y += 5;

  const cols = [
    { label: "SUBJECT", width: contentW * 0.34 },
    { label: "DATE", width: contentW * 0.24 },
    { label: "TIME", width: contentW * 0.2 },
    { label: "HALL", width: contentW * 0.22 },
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
  ticket.schedule.slice(0, 8).forEach((slot, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentW, rowH, "F");
    }
    doc.setTextColor(30, 41, 59);
    let xx = marginX;
    const cells = [slot.subject, slot.date, slot.time, slot.hall];
    cols.forEach((c, ci) => { doc.text(cells[ci] || "—", xx + 2.5, y + 5.5); xx += c.width; });
    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + rowH, marginX + contentW, y + rowH);
    y += rowH;
  });
  y += 10;

  // ── Important instructions ──
  const instrH = 8 + INSTRUCTIONS.length * 5.5;
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(marginX, y, contentW, instrH, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 83, 9);
  doc.text("IMPORTANT INSTRUCTIONS", marginX + 4, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 53, 15);
  INSTRUCTIONS.forEach((ins, i) => {
    doc.text(`${i + 1}. ${ins}`, marginX + 4, y + 13 + i * 5.5, { maxWidth: contentW - 8 });
  });

  // ── Footer: signatures + barcode, anchored near the bottom of the page ──
  const footerY = pageH - 30;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, footerY, marginX + 45, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Principal's Signature", marginX, footerY + 5);

  doc.line(marginX + 75, footerY, marginX + 110, footerY);
  doc.text("Controller of Exams", marginX + 75, footerY + 5);

  doc.setFillColor(241, 245, 249);
  doc.rect(pageW - marginX - 35, footerY - 12, 35, 16, "F");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("BARCODE", pageW - marginX - 17.5, footerY - 4, { align: "center" });

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Valid only with original school ID card · ${examName} · Roll No. ${ticket.rollNo}`,
    pageW / 2, pageH - 8, { align: "center" }
  );
}

// Single hall ticket, for a student/parent downloading their own — the same
// drawTicket() the admin bulk export uses, just one PDF instead of a ZIP.
export function downloadHallTicketPdf(
  schoolName: string,
  schoolAddress: string,
  examName: string,
  ticket: HallTicketData,
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  drawTicket(doc, schoolName, schoolAddress, examName, ticket);
  doc.save(`${sanitizeFileName(examName)}_${sanitizeFileName(ticket.rollNo)}_HallTicket.pdf`);
}

// One PDF per student, bundled into a single ZIP archive so the admin gets
// "Download All" instead of triggering N separate browser downloads.
export async function downloadAllHallTicketsZip(
  schoolName: string,
  schoolAddress: string,
  examName: string,
  grade: string,
  section: string,
  tickets: HallTicketData[],
): Promise<void> {
  if (tickets.length === 0) return;
  const zip = new JSZip();

  for (const ticket of tickets) {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    drawTicket(doc, schoolName, schoolAddress, examName, ticket);
    const bytes = doc.output("arraybuffer");
    const fileName = `${sanitizeFileName(ticket.rollNo)}_${sanitizeFileName(ticket.studentName)}.pdf`;
    zip.file(fileName, bytes);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(examName)}_${sanitizeFileName(grade)}_Section-${sanitizeFileName(section)}_HallTickets.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
