// Real jsPDF-based pass generator for Security — used by both Visitor
// Management and Gate Pass so "Print Pass" produces an actual document
// instead of a toast pretending it was sent to a printer.
import jsPDF from "jspdf";
import { getSchoolName } from "@/lib/transportSettings";
import { format } from "date-fns";

function buildPassDoc(options: {
  passType: string;
  passId: string;
  name: string;
  subtitle: string;
  rows: { label: string; value: string }[];
  accentColor?: [number, number, number];
}): jsPDF {
  const doc = new jsPDF({ format: [220, 320] }); // card-style narrow page
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 10;
  const schoolName = getSchoolName();
  const [r, g, b] = options.accentColor || [37, 99, 235];

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(schoolName, pageWidth / 2, 11, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(options.passType, pageWidth / 2, 19, { align: "center" });

  doc.setTextColor(30, 30, 30);
  let y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(options.name, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(options.subtitle, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setDrawColor(220, 220, 220);
  doc.line(10, y, rightX, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  options.rows.forEach(row => {
    doc.setTextColor(120, 120, 120);
    doc.text(row.label, 10, y);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text(row.value, rightX, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 7;
  });

  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(10, y, rightX, y);
  y += 10;

  // Barcode-style visual block standing in for a scannable pass ID
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(10, y, pageWidth - 20, 22, 2, 2, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(options.passId, pageWidth / 2, y + 14, { align: "center" });
  y += 32;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text("This pass must be visible at all times while on campus.", pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(`Printed ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pageWidth / 2, y, { align: "center" });

  return doc;
}

export function printVisitorPassPdf(visitor: {
  id: string;
  name: string;
  purpose: string;
  host: string;
  checkIn: string;
}): void {
  const doc = buildPassDoc({
    passType: "Visitor Pass",
    passId: visitor.id,
    name: visitor.name,
    subtitle: `Visiting ${visitor.host}`,
    accentColor: [37, 99, 235],
    rows: [
      { label: "Purpose", value: visitor.purpose },
      { label: "Host", value: visitor.host },
      { label: "Check-in Time", value: visitor.checkIn },
    ],
  });
  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  window.open(blobUrl, "_blank");
}

export function printGatePassPdf(pass: {
  id: string;
  name: string;
  type: string;
  reason: string;
  outTime: string;
  expectedIn: string;
}): void {
  const doc = buildPassDoc({
    passType: `${pass.type} Gate Pass`,
    passId: pass.id,
    name: pass.name,
    subtitle: pass.reason,
    accentColor: [217, 119, 6],
    rows: [
      { label: "Reason", value: pass.reason },
      { label: "Time Out", value: pass.outTime },
      { label: "Expected Return", value: pass.expectedIn || "—" },
    ],
  });
  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  window.open(blobUrl, "_blank");
}
