// Shared, real jsPDF-based fee receipt generator — reused by Finance (admin),
// the student portal, and the parent portal so every "download/print receipt"
// action produces the same genuine PDF instead of separate fake stubs.
import jsPDF from "jspdf";
import { Invoice } from "@/hooks/useFees";
import { getSchoolName } from "@/lib/transportSettings";
import { format } from "date-fns";

export interface ReceiptPdfOptions {
  currency?: string;
  templateStyle?: "Classic" | "Modern" | "Minimal";
  headerText?: string;
  footerText?: string;
  accentColor?: string; // hex, e.g. "#2563eb"
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const bigint = parseInt(full, 16) || 0x2563eb;
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function safeDate(value: string | Date, fmt = "dd MMM yyyy"): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : format(d, fmt);
}

export function buildInvoiceReceiptDoc(invoice: Invoice, options: ReceiptPdfOptions = {}): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = options.currency || "BHD";
  const [r, g, b] = hexToRgb(options.accentColor || "#2563eb");
  const schoolName = getSchoolName();
  const rightX = pageWidth - 14;

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(schoolName, 14, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(options.headerText || "Official Fee Payment Receipt", 14, 24);

  doc.setTextColor(30, 30, 30);
  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PAYMENT RECEIPT", 14, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Receipt #: ${invoice.invoiceNumber}`, 14, y);
  doc.text(`Date: ${safeDate(invoice.createdAt)}`, rightX, y, { align: "right" });
  y += 6;
  doc.text(`Student: ${invoice.studentName}`, 14, y);
  doc.text(`Class: ${invoice.className}`, rightX, y, { align: "right" });
  y += 6;
  if (invoice.term) {
    doc.text(`Term: ${invoice.term}`, 14, y);
    y += 6;
  }
  doc.text(`Due Date: ${safeDate(invoice.dueDate)}`, 14, y);
  y += 10;

  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, rightX, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Description", 14, y);
  doc.text("Amount", rightX, y, { align: "right" });
  y += 2;
  doc.line(14, y, rightX, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.text(invoice.category + (invoice.term ? ` — ${invoice.term}` : ""), 14, y);
  doc.text(`${currency} ${invoice.amount.toLocaleString()}`, rightX, y, { align: "right" });
  y += 8;

  if (invoice.penalty) {
    doc.text("Late Fee Penalty", 14, y);
    doc.text(`${currency} ${invoice.penalty.toLocaleString()}`, rightX, y, { align: "right" });
    y += 8;
  }

  doc.line(14, y, rightX, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Amount Paid", 14, y);
  doc.text(`${currency} ${invoice.paidAmount.toLocaleString()}`, rightX, y, { align: "right" });
  y += 8;
  doc.text("Balance Due", 14, y);
  doc.text(`${currency} ${invoice.dueAmount.toLocaleString()}`, rightX, y, { align: "right" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Status: ${invoice.status}`, 14, y);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const footer = options.footerText || "This is a computer-generated receipt and does not require a signature.";
  doc.text(footer, 14, 280, { maxWidth: pageWidth - 28 });

  return doc;
}

export function downloadInvoiceReceiptPdf(invoice: Invoice, options?: ReceiptPdfOptions): void {
  const doc = buildInvoiceReceiptDoc(invoice, options);
  doc.save(`Receipt-${invoice.invoiceNumber}.pdf`);
}

export function printInvoiceReceiptPdf(invoice: Invoice, options?: ReceiptPdfOptions): void {
  const doc = buildInvoiceReceiptDoc(invoice, options);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl") as unknown as string;
  window.open(blobUrl, "_blank");
}
