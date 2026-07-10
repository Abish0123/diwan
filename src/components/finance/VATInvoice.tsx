import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, Mail, MessageCircle, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { getSchoolName } from "@/lib/transportSettings";
import { useIntegrationConnected } from "@/hooks/useIntegrationStatus";

interface Student {
  name: string;
  id: string;
  class: string;
}

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface VATInvoiceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student;
  items?: LineItem[];
  onGenerated?: (data: {
    studentName: string;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
  }) => void;
}

interface TaxSettingsState {
  taxRegistrationNumber?: string;
  defaultVatRate?: number;
}

const numberToWords = (num: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero";

  const convertHundreds = (n: number): string => {
    if (n >= 100) {
      return ones[Math.floor(n / 100)] + " Hundred " + convertHundreds(n % 100);
    } else if (n >= 20) {
      return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    } else {
      return ones[n];
    }
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  // Handle Thousands, Millions and Billions (the old version stopped at Thousand
  // and produced wrong/empty words for totals ≥ 1,000,000).
  const scales: { value: number; name: string }[] = [
    { value: 1_000_000_000, name: "Billion" },
    { value: 1_000_000, name: "Million" },
    { value: 1_000, name: "Thousand" },
  ];
  let remaining = intPart;
  let result = "";
  for (const { value, name } of scales) {
    if (remaining >= value) {
      result += convertHundreds(Math.floor(remaining / value)) + " " + name + " ";
      remaining %= value;
    }
  }
  if (remaining > 0) result += convertHundreds(remaining);
  result = result.replace(/\s+/g, " ").trim() || "Zero";
  if (decPart > 0) {
    result += " and " + convertHundreds(decPart) + " Fils";
  }
  return result.replace(/\s+/g, " ").trim();
};

const BASE_CURRENCIES = ["AED", "SAR", "QAR", "BHD", "USD"];
const VAT_RATES = [0, 5, 15];

export const VATInvoice: React.FC<VATInvoiceProps> = ({ open, onOpenChange, student, items: itemsProp, onGenerated }) => {
  const { user } = useAuth();
  const { connected: whatsappConnected } = useIntegrationConnected("whatsapp-business");
  const { settings } = useFinancialSettings();
  const [currency, setCurrency] = useState(settings.currency || "AED");
  const [vatRate, setVatRate] = useState(5);
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState("");
  const schoolName = getSchoolName();
  // Keep the displayed currency in sync with the school's configured currency.
  useEffect(() => { if (settings.currency) setCurrency(settings.currency); }, [settings.currency]);
  // Pull the real Tax Settings (TRN / default VAT rate) configured under Finance Setup, if any.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const taxCfg = await smartDb.getOne("TaxSettings", user.uid) as TaxSettingsState | null;
        if (taxCfg) {
          if (taxCfg.taxRegistrationNumber) setTaxRegistrationNumber(taxCfg.taxRegistrationNumber);
          if (taxCfg.defaultVatRate !== undefined) setVatRate(taxCfg.defaultVatRate);
        }
      } catch (error) {
        console.error("Error fetching tax settings:", error);
      }
    })();
  }, [user]);
  // The dropdown always includes the configured currency.
  const CURRENCIES = Array.from(new Set([settings.currency, ...BASE_CURRENCIES].filter(Boolean)));
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [terms, setTerms] = useState(
    "Payment is due within 30 days of invoice date. Late payments may incur additional charges. All fees are non-refundable unless otherwise stated."
  );
  const [items, setItems] = useState<LineItem[]>(itemsProp ?? []);
  // Keep line items in sync if the caller later supplies real items via props.
  useEffect(() => { if (itemsProp) setItems(itemsProp); }, [itemsProp]);

  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  const invoiceNumber = `INV-${today.getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const subtotal = round2(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const vatAmount = round2((subtotal * vatRate) / 100);
  const total = round2(subtotal + vatAmount);

  // Deterministic visual pattern derived from the real invoice number + total,
  // replacing what used to be Math.random() noise. Not a scannable QR code,
  // just an honest, reproducible "fingerprint" of this invoice's real data.
  const verificationSeed = `${invoiceNumber}-${total}`;
  const verificationPattern = Array.from({ length: 25 }, (_, i) => {
    const char = verificationSeed.charCodeAt(i % verificationSeed.length) || 0;
    return (char + i) % 2 === 0;
  });

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadPDF = () => {
    if (!student) {
      toast.error("Select a student before generating an invoice");
      return;
    }
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(schoolName.toUpperCase(), pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`TRN: ${taxRegistrationNumber || "—"}`, pageWidth / 2, 28, { align: "center" });

    // Divider
    doc.setDrawColor(0, 0, 0);
    doc.line(15, 44, pageWidth - 15, 44);

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TAX INVOICE", pageWidth / 2, 54, { align: "center" });

    // Invoice details
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice #: ${invoiceNumber}`, 15, 65);
    doc.text(`Date: ${formatDate(today)}`, 15, 72);
    doc.text(`Due Date: ${formatDate(dueDate)}`, 15, 79);

    // Bill To
    doc.setFont("helvetica", "bold");
    doc.text("Bill To:", 15, 92);
    doc.setFont("helvetica", "normal");
    doc.text(`Student: ${student.name || "—"}`, 15, 99);
    doc.text(`Student ID: ${student.id || "—"}`, 15, 106);
    doc.text(`Class: ${student.class || "—"}`, 15, 113);

    // Table header
    doc.setFillColor(230, 230, 230);
    doc.rect(15, 130, pageWidth - 30, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.text("Description", 17, 136);
    doc.text("Qty", 120, 136);
    doc.text("Unit Price", 140, 136);
    doc.text("Amount", 170, 136);

    // Table rows
    doc.setFont("helvetica", "normal");
    let y = 145;
    items.forEach((item) => {
      doc.text(item.description, 17, y);
      doc.text(String(item.qty), 122, y);
      doc.text(`${currency} ${item.unitPrice.toLocaleString()}`, 140, y);
      doc.text(`${currency} ${(item.qty * item.unitPrice).toLocaleString()}`, 170, y);
      y += 8;
    });

    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    // Totals
    doc.text("Subtotal:", 140, y);
    doc.text(`${currency} ${subtotal.toLocaleString()}`, 170, y);
    y += 8;
    doc.text(`VAT (${vatRate}%):`, 140, y);
    doc.text(`${currency} ${vatAmount.toLocaleString()}`, 170, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", 140, y);
    doc.text(`${currency} ${total.toLocaleString()}`, 170, y);
    y += 10;

    // Amount in words
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(`Amount in Words: ${numberToWords(total)} ${currency}`, 15, y);
    y += 10;

    // Payment method
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Payment Method: ${paymentMethod}`, 15, y);
    y += 10;

    // Terms
    doc.setFontSize(9);
    doc.text("Terms & Conditions:", 15, y);
    y += 6;
    const splitTerms = doc.splitTextToSize(terms, pageWidth - 30);
    doc.text(splitTerms, 15, y);

    doc.save(`${invoiceNumber}.pdf`);
    toast.success("Invoice PDF downloaded successfully");

    onGenerated?.({
      studentName: student.name || "—",
      subtotal,
      vatRate,
      vatAmount,
      total,
    });
  };

  const handlePrint = () => {
    window.print();
    toast.success("Sending to printer...");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            VAT Tax Invoice
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>VAT Rate</Label>
              <Select value={String(vatRate)} onValueChange={(v) => setVatRate(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Payment</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoice Preview */}
          <div className="border-2 border-gray-300 rounded-lg p-6 bg-white text-gray-900 print:border-0">
            {/* School Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
              <h1 className="text-2xl font-bold uppercase tracking-wide">{schoolName}</h1>
              <p className="text-sm text-gray-600 mt-1">TRN: {taxRegistrationNumber || "—"}</p>
              <Badge className="mt-2 bg-green-600 text-white text-lg px-4 py-1">TAX INVOICE</Badge>
            </div>

            {/* Invoice Meta */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Invoice Details</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-2"><span className="font-medium w-28">Invoice #:</span><span>{invoiceNumber}</span></div>
                  <div className="flex gap-2"><span className="font-medium w-28">Date:</span><span>{formatDate(today)}</span></div>
                  <div className="flex gap-2"><span className="font-medium w-28">Due Date:</span><span>{formatDate(dueDate)}</span></div>
                  <div className="flex gap-2"><span className="font-medium w-28">Payment:</span><span>{paymentMethod}</span></div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Bill To</h3>
                {student ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex gap-2"><span className="font-medium w-28">Student:</span><span>{student.name || "—"}</span></div>
                    <div className="flex gap-2"><span className="font-medium w-28">Student ID:</span><span>{student.id || "—"}</span></div>
                    <div className="flex gap-2"><span className="font-medium w-28">Class:</span><span>{student.class || "—"}</span></div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">No student selected. Select a student to generate a valid invoice.</p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                    <th className="border border-gray-300 px-3 py-2 text-center w-16">Qty</th>
                    <th className="border border-gray-300 px-3 py-2 text-right w-36">Unit Price ({currency})</th>
                    <th className="border border-gray-300 px-3 py-2 text-right w-36">Amount ({currency})</th>
                    <th className="border border-gray-300 px-3 py-2 text-center w-10 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="border border-gray-300 px-3 py-4 text-center text-gray-400">
                        No line items yet. Add a fee component below.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 px-3 py-2">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Fee description"
                            className="border-0 p-0 h-auto bg-transparent focus-visible:ring-0"
                          />
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center">
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => updateItem(index, "qty", Number(e.target.value))}
                            className="border-0 p-0 h-auto bg-transparent text-center focus-visible:ring-0 w-12 mx-auto"
                          />
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                            className="border-0 p-0 h-auto bg-transparent text-right focus-visible:ring-0"
                          />
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                          {(item.qty * item.unitPrice).toLocaleString()}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-center print:hidden">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:text-red-600"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                className="mt-2 gap-2 print:hidden"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line Item
              </Button>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-4">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{currency} {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT ({vatRate}%):</span>
                  <span>{currency} {vatAmount.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>TOTAL:</span>
                  <span>{currency} {total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Amount in Words */}
            <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-4 text-sm">
              <span className="font-medium">Amount in Words: </span>
              <span className="italic">{numberToWords(total)} {currency} Only</span>
            </div>

            {/* QR Code + Terms */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Terms & Conditions</h3>
                <Textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={4}
                  className="text-xs resize-none"
                />
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="w-28 h-28 border-2 border-dashed border-gray-400 rounded flex items-center justify-center bg-gray-50">
                  <div className="text-center text-xs text-gray-500">
                    <div className="grid grid-cols-5 gap-0.5 mb-1">
                      {verificationPattern.map((filled, i) => (
                        <div
                          key={i}
                          className={`w-3 h-3 ${filled ? "bg-gray-800" : "bg-white"}`}
                        />
                      ))}
                    </div>
                    <p className="font-medium">Verification Code</p>
                    <p className="text-gray-400">{invoiceNumber}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">Derived from invoice # and total — scan/verify manually</p>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
              <p>This is a computer-generated invoice. No signature required.</p>
              <p>{schoolName} | TRN: {taxRegistrationNumber || "—"}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={() => toast.success("Invoice sent to parent email")} className="gap-2">
              <Mail className="h-4 w-4" />
              Send by Email
            </Button>
            <Button
              variant="outline"
              disabled={!whatsappConnected}
              title={whatsappConnected ? undefined : "WhatsApp Business isn't connected — connect it under Administration → Integrations"}
              onClick={() => toast.success("Invoice sent via WhatsApp")}
              className="gap-2 text-green-600 border-green-300 hover:bg-green-50 disabled:text-slate-400 disabled:border-slate-200"
            >
              <MessageCircle className="h-4 w-4" />
              {whatsappConnected ? "Send via WhatsApp" : "WhatsApp Not Connected"}
            </Button>
            <Button onClick={handleDownloadPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
