// Real jsPDF-based bill generator for the cafeteria — used by both the admin
// POS checkout and the student ordering/payment flow so every generated bill
// is a genuine PDF, not a toast pretending to be one.
import jsPDF from "jspdf";
import { getSchoolName } from "@/lib/transportSettings";
import { format } from "date-fns";

export interface CafeteriaBillItem {
  name: string;
  qty: number;
  price: number;
}

export interface CafeteriaBillOptions {
  billNumber: string;
  studentName?: string;
  grade?: string;
  items: CafeteriaBillItem[];
  total: number;
  currency: string;
  paymentMethod: string;
  date?: Date;
}

export function buildCafeteriaBillDoc(options: CafeteriaBillOptions): jsPDF {
  const doc = new jsPDF({ format: [220, 320] }); // receipt-style narrow page
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 10;
  const schoolName = getSchoolName();
  const when = options.date ?? new Date();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(schoolName, pageWidth / 2, 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Cafeteria Bill / Receipt", pageWidth / 2, 17, { align: "center" });

  doc.setTextColor(30, 30, 30);
  let y = 30;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Bill #: ${options.billNumber}`, 10, y);
  y += 5;
  doc.text(`Date: ${format(when, "dd MMM yyyy, HH:mm")}`, 10, y);
  y += 5;
  if (options.studentName) {
    doc.text(`Student: ${options.studentName}${options.grade ? ` (${options.grade})` : ""}`, 10, y);
    y += 5;
  }
  doc.text(`Payment: ${options.paymentMethod}`, 10, y);
  y += 6;

  doc.setDrawColor(200, 200, 200);
  doc.line(10, y, rightX, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Item", 10, y);
  doc.text("Qty", pageWidth - 40, y, { align: "right" });
  doc.text("Amount", rightX, y, { align: "right" });
  y += 2;
  doc.line(10, y, rightX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  options.items.forEach((it) => {
    doc.text(it.name, 10, y, { maxWidth: pageWidth - 60 });
    doc.text(String(it.qty), pageWidth - 40, y, { align: "right" });
    doc.text(`${options.currency} ${(it.price * it.qty).toFixed(2)}`, rightX, y, { align: "right" });
    y += 6;
  });

  y += 2;
  doc.line(10, y, rightX, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total", 10, y);
  doc.text(`${options.currency} ${options.total.toFixed(2)}`, rightX, y, { align: "right" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Thank you! Bon appétit.", pageWidth / 2, y, { align: "center" });

  return doc;
}

export function downloadCafeteriaBillPdf(options: CafeteriaBillOptions): void {
  const doc = buildCafeteriaBillDoc(options);
  doc.save(`Cafeteria-Bill-${options.billNumber}.pdf`);
}

export function printCafeteriaBillPdf(options: CafeteriaBillOptions): void {
  const doc = buildCafeteriaBillDoc(options);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  window.open(blobUrl, "_blank");
}

export function printTodaysMenuPdf(
  sections: { label: string; time: string; items: { name: string; price: number; badges: string[] }[] }[],
  currency: string
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 14;
  const schoolName = getSchoolName();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(schoolName, 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Today's Cafeteria Menu — ${format(new Date(), "EEEE, dd MMM yyyy")}`, 14, 20);

  doc.setTextColor(30, 30, 30);
  let y = 38;

  sections.forEach((section) => {
    if (section.items.length === 0) return;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(section.label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(section.time, rightX, y, { align: "right" });
    doc.setTextColor(30, 30, 30);
    y += 3;
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, rightX, y);
    y += 7;

    section.items.forEach((item) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const badgeText = item.badges.length ? ` (${item.badges.join(", ")})` : "";
      doc.text(`${item.name}${badgeText}`, 14, y, { maxWidth: pageWidth - 60 });
      doc.text(`${currency} ${item.price}`, rightX, y, { align: "right" });
      y += 7;
    });
    y += 6;
  });

  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  window.open(blobUrl, "_blank");
}
