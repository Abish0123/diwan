// Real jsPDF-based Purchase Order document — "Send to Vendor" was previously
// just a status change with nothing to actually email or print to the
// supplier. This generates the document a Store Keeper would attach to an
// email or hand over in person.
import jsPDF from "jspdf";
import { getSchoolName } from "@/lib/transportSettings";
import { format } from "date-fns";

interface POLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface POForPrint {
  poNumber: string;
  vendorName: string;
  vendorAddress?: string;
  vendorContact?: string;
  department: string;
  requestedBy?: string;
  expectedDeliveryDate?: string;
  status: string;
  items: POLineItem[];
  amount: number;
}

export function printPurchaseOrderPdf(po: POForPrint): void {
  const doc = new jsPDF();
  const schoolName = getSchoolName();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(schoolName, marginX, 14);
  doc.setFontSize(11);
  doc.text("PURCHASE ORDER", rightX, 14, { align: "right" });

  doc.setTextColor(30, 30, 30);
  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(po.poNumber, marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Status: ${po.status}`, rightX, y, { align: "right" });
  y += 8;

  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, y, rightX, y);
  y += 8;

  doc.setFontSize(9);
  const leftCol: [string, string][] = [
    ["Vendor", po.vendorName],
    ["Vendor Contact", po.vendorContact || "—"],
    ["Vendor Address", po.vendorAddress || "—"],
  ];
  const rightCol: [string, string][] = [
    ["Requesting Department", po.department],
    ["Requested By", po.requestedBy || "—"],
    ["Expected Delivery", po.expectedDeliveryDate || "—"],
  ];
  leftCol.forEach((row, i) => {
    doc.setTextColor(120, 120, 120);
    doc.text(row[0], marginX, y + i * 10);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text(row[1], marginX, y + i * 10 + 4.5);
    doc.setFont("helvetica", "normal");
  });
  rightCol.forEach((row, i) => {
    doc.setTextColor(120, 120, 120);
    doc.text(row[0], pageWidth / 2 + 10, y + i * 10);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text(row[1], pageWidth / 2 + 10, y + i * 10 + 4.5);
    doc.setFont("helvetica", "normal");
  });
  y += leftCol.length * 10 + 6;

  // Item table — drawn manually (no autotable dependency), same approach
  // used by securityPassPdf.ts elsewhere in this app.
  const colX = { item: marginX, qty: pageWidth - 85, price: pageWidth - 60, total: rightX };
  doc.setFillColor(37, 99, 235);
  doc.rect(marginX, y, pageWidth - marginX * 2, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Item", colX.item + 2, y + 5.5);
  doc.text("Qty", colX.qty, y + 5.5, { align: "right" });
  doc.text("Unit Price", colX.price, y + 5.5, { align: "right" });
  doc.text("Total", colX.total, y + 5.5, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  po.items.forEach((line, i) => {
    const rowH = 8;
    if (i % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(marginX, y, pageWidth - marginX * 2, rowH, "F");
    }
    doc.text(line.name, colX.item + 2, y + 5.5);
    doc.text(String(line.quantity), colX.qty, y + 5.5, { align: "right" });
    doc.text(line.unitPrice.toLocaleString(), colX.price, y + 5.5, { align: "right" });
    doc.text((line.quantity * line.unitPrice).toLocaleString(), colX.total, y + 5.5, { align: "right" });
    y += rowH;
  });

  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, y, rightX, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Grand Total: ${po.amount.toLocaleString()}`, rightX, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`, marginX, doc.internal.pageSize.getHeight() - 10);

  doc.save(`${po.poNumber}.pdf`);
}
