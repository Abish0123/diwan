// ─────────────────────────────────────────────────────────────────────────────
// PDF/CSV report generators for exam seating — Room Allocation Report, Student
// Seating Report, Room-wise Attendance Sheet, Seating Chart, Invigilator
// Report. Follows the same jsPDF manual-grid pattern used for exam timetables
// (see src/pages/academics/Exams.tsx downloadTimetablePDF) for visual
// consistency across the app.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import type { ExamRoom, SeatAssignment, RoomRollRange } from "@/lib/seatingStore";

interface RoomGroup { room: ExamRoom; seats: SeatAssignment[] }

// Exported so other report generators (e.g. src/lib/examReports.ts) can reuse
// the same visual table style instead of re-implementing jsPDF drawing.
export function drawTable(
  doc: jsPDF,
  cols: { label: string; width: number }[],
  rows: string[][],
  startY: number,
  title: string,
  subtitle: string,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = cols.reduce((a, c) => a + c.width, 0);
  const startX = (pageWidth - tableWidth) / 2;
  const rowH = 8;

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(title, 14, 16);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(subtitle, 14, 22);

  const drawHeader = (y: number) => {
    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(229, 231, 235);
    doc.rect(startX, y, tableWidth, rowH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    let x = startX;
    cols.forEach(c => { doc.text(c.label, x + 2, y + 5.5); x += c.width; });
    return y + rowH;
  };

  let y = drawHeader(startY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(8.5);

  rows.forEach(row => {
    if (y + rowH > pageHeight - 12) {
      doc.addPage();
      y = drawHeader(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(17, 24, 39);
    }
    doc.setDrawColor(229, 231, 235);
    doc.rect(startX, y, tableWidth, rowH, "S");
    let x = startX;
    cols.forEach((c, ci) => { doc.text(String(row[ci] ?? ""), x + 2, y + 5.5, { maxWidth: c.width - 3 }); x += c.width; });
    y += rowH;
  });
}

const fname = (examName: string, suffix: string) => `${examName.replace(/\s+/g, "-")}-${suffix}.pdf`;

// ── 1. Room Allocation Report ───────────────────────────────────────────────
// Room No | Grade(s) | Section(s) | Roll Range | Total Students | Invigilator
export function downloadRoomAllocationReport(examName: string, rollRanges: RoomRollRange[], assignments: SeatAssignment[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Room No", width: 35 },
    { label: "Grade(s)", width: 50 },
    { label: "Section(s)", width: 40 },
    { label: "Roll Range", width: 35 },
    { label: "Total Students", width: 35 },
    { label: "Invigilator", width: 60 },
  ];
  const rows = rollRanges.map(r => {
    const inRoom = assignments.filter(a => a.roomNo === r.roomNo);
    const grades = Array.from(new Set(inRoom.map(a => a.grade))).join(", ");
    const sections = Array.from(new Set(inRoom.map(a => a.section))).sort().join(", ");
    return [r.roomNo, grades, sections, `${r.rollFrom} – ${r.rollTo}`, String(r.count), r.invigilator || "TBD"];
  });
  drawTable(doc, cols, rows, 30, examName, `Room Allocation Report · ${rollRanges.length} rooms · ${assignments.length} students`);
  doc.save(fname(examName, "room-allocation-report"));
}

// ── 2. Student Seating Report ───────────────────────────────────────────────
// Student ID | Name | Grade | Section | Roll No | Room No | Seat No
export function downloadStudentSeatingReport(examName: string, assignments: SeatAssignment[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Student ID", width: 35 },
    { label: "Student Name", width: 55 },
    { label: "Grade", width: 30 },
    { label: "Section", width: 25 },
    { label: "Roll No", width: 25 },
    { label: "Room No", width: 30 },
    { label: "Seat No", width: 25 },
  ];
  const sorted = [...assignments].sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }) || a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true }));
  const rows = sorted.map(a => [a.studentId, a.name, a.grade, a.section, a.rollNo, a.roomNo, a.seatLabel]);
  drawTable(doc, cols, rows, 30, examName, `Student Seating Report · ${assignments.length} students`);
  doc.save(fname(examName, "student-seating-report"));
}

export function downloadStudentSeatingCSV(examName: string, assignments: SeatAssignment[]) {
  const headers = ["Student ID", "Student Name", "Grade", "Section", "Roll No", "Room No", "Seat No"];
  const sorted = [...assignments].sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }) || a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true }));
  const rows = sorted.map(a => [a.studentId, a.name, a.grade, a.section, a.rollNo, a.roomNo, a.seatLabel]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examName.replace(/\s+/g, "-")}-student-seating-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 3. Room-wise Attendance Sheet ───────────────────────────────────────────
// One page per room: exam title, date, subject code/name, room no, student
// list with signature column, invigilator signature line at the bottom.
export function downloadAttendanceSheets(
  examName: string,
  examDate: string,
  subjectCode: string,
  subjectName: string,
  byRoom: RoomGroup[],
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  byRoom.forEach((group, roomIdx) => {
    if (roomIdx > 0) doc.addPage();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(examName, 14, 16);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Attendance Sheet  ·  ${examDate || "Date TBD"}  ·  ${subjectCode ? `${subjectCode} — ` : ""}${subjectName || "Subject TBD"}`, 14, 23);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(124, 58, 237);
    doc.text(`Room: ${group.room.roomNo}`, 14, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Invigilator: ${group.room.invigilator || "____________________"}`, pageWidth - 90, 32);

    const cols = [
      { label: "#", width: 10 },
      { label: "Roll No", width: 22 },
      { label: "Student Name", width: 62 },
      { label: "Grade/Sec", width: 28 },
      { label: "Seat", width: 18 },
      { label: "Signature", width: 42 },
    ];
    const tableWidth = cols.reduce((a, c) => a + c.width, 0);
    const startX = (pageWidth - tableWidth) / 2;
    const rowH = 9;
    let y = 40;

    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(200, 200, 200);
    doc.rect(startX, y, tableWidth, rowH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    let x = startX;
    cols.forEach(c => { doc.text(c.label, x + 2, y + 6); x += c.width; });
    y += rowH;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(17, 24, 39);
    const seats = [...group.seats].sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true }));
    seats.forEach((s, i) => {
      if (y + rowH > pageHeight - 30) {
        doc.addPage();
        y = 16;
        doc.setFillColor(243, 244, 246);
        doc.rect(startX, y, tableWidth, rowH, "FD");
        doc.setFont("helvetica", "bold");
        let hx = startX;
        cols.forEach(c => { doc.text(c.label, hx + 2, y + 6); hx += c.width; });
        y += rowH;
        doc.setFont("helvetica", "normal");
      }
      doc.setDrawColor(229, 231, 235);
      doc.rect(startX, y, tableWidth, rowH, "S");
      const values = [String(i + 1), s.rollNo, s.name, `${s.grade} - ${s.section}`, s.seatLabel, ""];
      let cx = startX;
      cols.forEach((c, ci) => { if (values[ci]) doc.text(values[ci], cx + 2, y + 6, { maxWidth: c.width - 3 }); cx += c.width; });
      y += rowH;
    });

    // Invigilator signature block at the bottom of each room's sheet.
    const sigY = Math.min(y + 20, pageHeight - 20);
    doc.setDrawColor(150);
    doc.line(startX, sigY, startX + 70, sigY);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Invigilator Signature", startX, sigY + 5);
    doc.line(startX + tableWidth - 70, sigY, startX + tableWidth, sigY);
    doc.text("Date & Time", startX + tableWidth - 70, sigY + 5);
  });

  doc.save(fname(examName, "attendance-sheets"));
}

// ── 4. Seating Chart PDF ────────────────────────────────────────────────────
// Visual room-by-room grid — mirrors the on-screen seating plan.
export function downloadSeatingChart(examName: string, byRoom: RoomGroup[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const cellW = (pageWidth - margin * 2 - 4 * 4) / 5; // 5 columns per row
  const cellH = 16;

  byRoom.forEach((group, roomIdx) => {
    if (roomIdx > 0) doc.addPage();
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(examName, margin, 16);
    doc.setFontSize(11);
    doc.setTextColor(124, 58, 237);
    doc.text(`Seating Chart — ${group.room.roomNo}`, margin, 24);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`${group.seats.length} students · Invigilator: ${group.room.invigilator || "TBD"}`, margin, 30);
    doc.setFontSize(8);
    doc.text("FRONT OF ROOM / BOARD", pageWidth / 2, 38, { align: "center" });

    const seats = [...group.seats].sort((a, b) => a.seatLabel.localeCompare(b.seatLabel, undefined, { numeric: true }));
    let x = margin, y = 44;
    seats.forEach((s, i) => {
      if (i > 0 && i % 5 === 0) { x = margin; y += cellH + 4; }
      if (y + cellH > doc.internal.pageSize.getHeight() - 12) { doc.addPage(); x = margin; y = 16; }
      doc.setDrawColor(124, 58, 237);
      doc.setFillColor(245, 243, 255);
      doc.roundedRect(x, y, cellW, cellH, 1.5, 1.5, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(124, 58, 237);
      doc.text(`Seat ${s.seatLabel}`, x + 2, y + 5);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(s.name, x + 2, y + 9.5, { maxWidth: cellW - 4 });
      doc.setTextColor(100);
      doc.text(`${s.grade}-${s.section} · Roll ${s.rollNo}`, x + 2, y + 13.5, { maxWidth: cellW - 4 });
      x += cellW + 4;
    });
  });

  doc.save(fname(examName, "seating-chart"));
}

// ── Hall Ticket Mapping ──────────────────────────────────────────────────────
// Tabular student → allocated hall/seat map (the data behind individual hall
// tickets), for admin/exam-cell use rather than per-student printouts.
export interface HallTicketMappingRow {
  studentId: string; name: string; admissionNo: string;
  grade: string; section: string; rollNo: string;
  allocatedRoom: string; allocatedSeat: string;
}

export function downloadHallTicketMappingReport(examName: string, rows: HallTicketMappingRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Student ID", width: 28 },
    { label: "Student Name", width: 48 },
    { label: "Admission No", width: 35 },
    { label: "Grade", width: 25 },
    { label: "Section", width: 20 },
    { label: "Roll No", width: 22 },
    { label: "Allocated Hall", width: 35 },
    { label: "Allocated Seat", width: 28 },
  ];
  const body = rows.map(r => [r.studentId, r.name, r.admissionNo, r.grade, r.section, r.rollNo, r.allocatedRoom || "—", r.allocatedSeat || "—"]);
  drawTable(doc, cols, body, 30, examName, `Hall Ticket Mapping · ${rows.length} students`);
  doc.save(fname(examName, "hall-ticket-mapping"));
}

export function downloadHallTicketMappingCSV(examName: string, rows: HallTicketMappingRow[]) {
  const headers = ["Student ID", "Student Name", "Admission No", "Grade", "Section", "Roll No", "Allocated Hall", "Allocated Seat"];
  const body = rows.map(r => [r.studentId, r.name, r.admissionNo, r.grade, r.section, r.rollNo, r.allocatedRoom, r.allocatedSeat]);
  const csv = [headers, ...body].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examName.replace(/\s+/g, "-")}-hall-ticket-mapping.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 5. Invigilator Report ───────────────────────────────────────────────────
// Per-invigilator: which room, how many students, grade/section mix, roll range.
export function downloadInvigilatorReport(examName: string, byRoom: RoomGroup[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const cols = [
    { label: "Invigilator", width: 55 },
    { label: "Room No", width: 30 },
    { label: "Grade(s) / Section(s)", width: 65 },
    { label: "Roll Range", width: 35 },
    { label: "Students", width: 30 },
  ];
  const rows = byRoom.map(({ room, seats }) => {
    const rolls = seats.map(s => parseInt(String(s.rollNo).replace(/\D/g, ""), 10)).filter(Number.isFinite);
    const gradeSections = Array.from(new Set(seats.map(s => `${s.grade}-${s.section}`))).join(", ");
    return [
      room.invigilator || "Unassigned", room.roomNo, gradeSections,
      rolls.length ? `${Math.min(...rolls)} – ${Math.max(...rolls)}` : "—", String(seats.length),
    ];
  });
  drawTable(doc, cols, rows, 30, examName, `Invigilator Report · ${byRoom.length} rooms`);
  doc.save(fname(examName, "invigilator-report"));
}
