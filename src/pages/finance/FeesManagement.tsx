import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { VATInvoice } from "@/components/finance/VATInvoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Filter, 
  Plus, 
  Download, 
  CreditCard, 
  User, 
  Calendar,
  MoreVertical,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  FileText,
  Printer,
  Trash2,
  Tag,
  BookOpen,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  TrendingUp,
  Eye,
  Wallet,
  GraduationCap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RecordRevenueDialog } from "@/components/finance/RecordRevenueDialog";
import { PaymentGateway } from "@/components/finance/PaymentGateway";
import { CreateFeeStructureDialog } from "@/components/finance/CreateFeeStructureDialog";
import { ImportFeeStructureDialog } from "@/components/finance/ImportFeeStructureDialog";
import { FeeStructurePrintDialog } from "@/components/finance/FeeStructurePrintDialog";
import { exportFeeStructuresToExcel } from "@/lib/exportFeeStructures";
import { CollectFeeDialog } from "@/components/finance/CollectFeeDialog";
import { CreateDiscountDialog } from "@/components/finance/CreateDiscountDialog";
import { toast } from "sonner";
import { useStudents } from "@/contexts/StudentContext";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useFees, Invoice, FeeStructure, getInvoiceDisplayStatus } from "@/hooks/useFees";
import { useAuth } from "@/hooks/useAuth";
import { useCurriculum } from "@/hooks/useCurriculum";
import { getPeriodLabels } from "@/lib/curriculumConfig";
import { smartDb } from "@/lib/localDb";
import { sendFeeReminder, sendBulkFeeReminders } from "@/lib/feeReminderEngine";
import { downloadInvoiceReceiptPdf, printInvoiceReceiptPdf } from "@/lib/invoiceReceiptPdf";
import { computeLateFee, DEFAULT_LATE_FEE_POLICY, LateFeePolicy } from "@/lib/lateFeeEngine";
import { format } from "date-fns";

// Debounces a fast-changing value (search input) so expensive derived
// computations (filtering/grouping hundreds of invoices) only re-run ~180ms
// after the user stops typing, instead of on every keystroke.
function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

interface ReminderRuleLike {
  id: string;
  name: string;
  offsetDays: number;
  direction: "before" | "after";
  channels: string[];
  messageTemplate: string;
  status: "Active" | "Inactive";
}

const FALLBACK_REMINDER_TEMPLATE =
  "Subject: Fee Payment Reminder\n\nDear Parent,\n\nThis is a reminder that a fee payment of QAR {{amount}} for {{studentName}} ({{grade}}) was due on {{dueDate}}.\n\nPlease make the payment at your earliest convenience.\n\nThank you.";

const FeesManagement = () => {
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [collectFeeDialogOpen, setCollectFeeDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const { students, loading: studentsLoading } = useStudents();
  const { settings: financialSettings } = useFinancialSettings();
  const { overdueInvoicesCount } = useDashboardStats();
  const { invoices, feeStructures, feeDiscounts, loading: feesLoading, generateInvoicesForClass, generateSingleInvoice, updateInvoiceStatus, updateInvoicePenalty } = useFees();
  const { user } = useAuth();
  const { curriculum } = useCurriculum();
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderRowId, setReminderRowId] = useState<string | null>(null);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [vatInvoiceOpen, setVatInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<FeeStructure | null>(null);
  const [importStructureOpen, setImportStructureOpen] = useState(false);
  const [printStructure, setPrintStructure] = useState<FeeStructure | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedUnpaidInvoiceIds, setSelectedUnpaidInvoiceIds] = useState<Set<string>>(new Set());

  // ── VAT invoice + online payment history, and the late fee policy —
  // consolidated here from the retired Billing page so every payment-related
  // workflow lives in one place.
  const [vatInvoiceHistory, setVatInvoiceHistory] = useState<any[]>([]);
  const [onlinePaymentHistory, setOnlinePaymentHistory] = useState<any[]>([]);
  const [invoicePreview, setInvoicePreview] = useState<{
    invoiceNo: string; studentName: string; amount: number;
    email: string; paymentMethodLabel: string; type: 'admission' | 'school_fee';
    paidAt: string;
  } | null>(null);
  const [lateFeePolicy, setLateFeePolicy] = useState<LateFeePolicy>(DEFAULT_LATE_FEE_POLICY);

  // ── Admission/School Fee invoicing — a single finance person manually
  // generates a real Invoice (via a Fee Structure) for an Admissions lead
  // right here, instead of the old separate FinancePendingPayment/"Confirm
  // Payment Received" system. The invoice then flows through the exact same
  // Collections/CollectFeeDialog payment-collection path as any other fee.
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);
  const [genFeeType, setGenFeeType] = useState<'Admission' | 'SchoolFee'>('Admission');
  const [genLeads, setGenLeads] = useState<any[]>([]);
  const [genLeadId, setGenLeadId] = useState("");
  const [genStructureId, setGenStructureId] = useState("");
  const [collectionsFeeType, setCollectionsFeeType] = useState<'all' | 'Tuition' | 'Admission' | 'SchoolFee'>('all');

  // ── Period-wise helpers (Term/Semester driven by active curriculum) ───────
  // The label ("Term" vs "Semester") and the number of periods per academic
  // year (2 or 3) both come from the school's active curriculum config —
  // set in Settings > Academic Setup. Changing the curriculum there changes
  // this grouping everywhere automatically, no separate Finance setting.
  const periodLabel = curriculum.annualStructure.periodLabel; // "Term" or "Semester"
  const periodsPerYear = curriculum.annualStructure.periods;  // 2 or 3
  const SEMESTERS = [...getPeriodLabels(curriculum), "Annual"];
  const ACADEMIC_YEARS = ["2025-2026", "2024-2025", "2023-2024"];

  // Buckets the academic year (Aug → Jul) into `periodsPerYear` equal chunks
  // and returns e.g. "Term 1" / "Semester 2" depending on the curriculum.
  const inferSemester = (dueDate: string) => {
    const m = new Date(dueDate).getMonth() + 1;
    const academicMonthIndex = m >= 8 ? m - 8 : m + 4; // Aug=0 ... Jul=11
    const bucketSize = 12 / periodsPerYear;
    const periodIndex = Math.min(periodsPerYear - 1, Math.floor(academicMonthIndex / bucketSize));
    return `${periodLabel} ${periodIndex + 1}`;
  };

  const inferAcademicYear = (dueDate: string) => {
    const d = new Date(dueDate);
    const y = d.getFullYear();
    return d.getMonth() + 1 >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  };

  const [semYear, setSemYear] = useState("all");
  const [semStatus, setSemStatus] = useState("all");
  const [semSearch, setSemSearch] = useState("");
  const debouncedSemSearch = useDebouncedValue(semSearch);
  const [collectionsYear, setCollectionsYear] = useState("all");
  const [collectionsStatus, setCollectionsStatus] = useState("all");
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());

  const toggleSemGroup = (key: string) =>
    setExpandedSems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const enrichedInvoices = useMemo(() => invoices.map(inv => ({
    ...inv,
    _sem: (inv as any).semester || inferSemester(inv.dueDate),
    _yr:  (inv as any).academicYear || inferAcademicYear(inv.dueDate),
  })), [invoices]);

  const semFiltered = useMemo(() => enrichedInvoices.filter(inv => {
    const q = debouncedSemSearch.toLowerCase();
    return (
      (!q || (inv.studentName || "").toLowerCase().includes(q) || (inv.className || "").toLowerCase().includes(q) || (inv.invoiceNumber || "").toLowerCase().includes(q)) &&
      (semYear === "all" || inv._yr === semYear) &&
      (semStatus === "all" || inv.status === semStatus)
    );
  }), [enrichedInvoices, debouncedSemSearch, semYear, semStatus]);

  const semGroups = useMemo(() => {
    const map = new Map<string, typeof semFiltered>();
    semFiltered.forEach(inv => {
      const key = `${inv._yr}||${inv._sem}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return Array.from(map.entries()).map(([key, invs]) => {
      const [yr, sem] = key.split("||");
      return {
        key, sem, yr,
        invoices: invs,
        total: invs.reduce((s, i) => s + i.amount, 0),
        paid: invs.reduce((s, i) => s + i.paidAmount, 0),
        due: invs.reduce((s, i) => s + i.dueAmount, 0),
        overdue: invs.filter(i => i.status === "Overdue").length,
        paidCount: invs.filter(i => i.status === "Paid").length,
      };
    }).sort((a, b) => b.yr.localeCompare(a.yr) || SEMESTERS.indexOf(a.sem) - SEMESTERS.indexOf(b.sem));
  }, [semFiltered]);

  const semKpis = useMemo(() => ({
    total: semFiltered.reduce((s, i) => s + i.amount, 0),
    paid: semFiltered.reduce((s, i) => s + i.paidAmount, 0),
    due: semFiltered.reduce((s, i) => s + i.dueAmount, 0),
    overdue: semFiltered.filter(i => i.status === "Overdue").reduce((s, i) => s + i.dueAmount, 0),
    rate: semFiltered.reduce((s, i) => s + i.amount, 0) > 0
      ? Math.round((semFiltered.reduce((s, i) => s + i.paidAmount, 0) / semFiltered.reduce((s, i) => s + i.amount, 0)) * 100) : 0,
  }), [semFiltered]);

  const fmtAmt = (n: number) => `${financialSettings?.currency || 'QAR'} ${n.toLocaleString()}`;

  const handleExport = () => {
    if (invoices.length === 0) {
      toast.error("No data to export");
      return;
    }
    toast.info("Exporting fee collection data...");
    const headers = ["Invoice #", "Student", "Class", "Total Amount", "Paid", "Due", "Status", "Due Date"];
    const rows = invoices.map(i => [
      i.invoiceNumber, 
      i.studentName, 
      i.className, 
      i.amount, 
      i.paidAmount, 
      i.dueAmount, 
      i.status, 
      format(new Date(i.dueDate), 'yyyy-MM-dd')
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fee_collections_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    toast.success("Export complete");
  };

  // Resolves a student's parent contact info for reminder delivery.
  // Parent accounts are matched by email only (see useParentChildren.ts) —
  // there is no real stored parentUid on the Student record, so "Parent App"
  // in-app delivery is skipped (not faked) whenever it can't be resolved.
  // Reminders must reach BOTH mother and father (not just whichever is found
  // first), so this returns every distinct parent email/phone on file.
  // Only father/mother/guardian contact fields are used — never the
  // student's own `phone` field.
  const resolveRecipient = async (studentId: string): Promise<{ parentEmails: string[]; parentPhones: string[]; parentUid?: string }> => {
    const student = students.find(s => s.id === studentId) as any;
    if (!student) return { parentEmails: [], parentPhones: [] };
    const parentEmails = [student.fatherEmail, student.motherEmail, student.guardianEmail].filter(Boolean);
    const parentPhones = [student.fatherPhone, student.motherPhone, student.guardianPhone].filter(Boolean);
    return { parentEmails: [...new Set(parentEmails)], parentPhones: [...new Set(parentPhones)] };
  };

  // Picks a generic active "after due date" reminder rule to use for a manual
  // "send now" bulk action. Per-invoice offsetDays matching against exact days
  // overdue is a separate concern (the automatic scheduled firing in
  // Automation.tsx) — this is intentionally the simplest reasonable choice.
  const getActiveReminderRule = async (): Promise<ReminderRuleLike> => {
    if (user?.uid) {
      try {
        const rules = (await smartDb.getAll("reminder_rules", user.uid)) as ReminderRuleLike[];
        const active = rules.filter(r => r.status === "Active" && r.direction === "after");
        if (active.length > 0) {
          return active.sort((a, b) => (a.offsetDays || 0) - (b.offsetDays || 0))[0];
        }
      } catch (err) {
        console.error("Failed to load reminder rules:", err);
      }
    }
    // No configured rule found — fall back to a sensible generic reminder.
    return {
      id: "fallback",
      name: "Fee Payment Reminder",
      offsetDays: 0,
      direction: "after",
      channels: ["Email", "Finance Alert"],
      messageTemplate: FALLBACK_REMINDER_TEMPLATE,
      status: "Active",
    };
  };

  const summarizeReminders = (emailCount: number, parentAppCount: number, whatsappSkipped: number, whatsappTargets: string[] = []) => {
    const parts: string[] = [];
    if (emailCount > 0) parts.push(`${emailCount} email${emailCount !== 1 ? "s" : ""}`);
    if (parentAppCount > 0) parts.push(`${parentAppCount} in-app alert${parentAppCount !== 1 ? "s" : ""}`);
    const base = parts.length > 0 ? `Reminders sent: ${parts.join(", ")}.` : "No reminders could be sent — no parent contact info on file.";
    const uniqueTargets = [...new Set(whatsappTargets)];
    const whatsappNote = whatsappSkipped > 0
      ? ` WhatsApp is not connected — configure a provider in Settings to enable it (${whatsappSkipped} skipped${uniqueTargets.length > 0 ? `; would have messaged parent number${uniqueTargets.length !== 1 ? "s" : ""}: ${uniqueTargets.join(", ")}` : ""}).`
      : "";
    return base + whatsappNote;
  };

  const handleSendReminders = async () => {
    const overdue = invoices.filter(i => getInvoiceDisplayStatus(i) === 'Overdue');
    if (overdue.length === 0) {
      toast.info("No overdue invoices found");
      return;
    }
    if (!user?.uid) return;
    setSendingReminders(true);
    try {
      const rule = await getActiveReminderRule();
      const { emailCount, parentAppCount, whatsappSkipped, whatsappTargets } = await sendBulkFeeReminders(
        overdue.map(i => ({
          studentName: i.studentName,
          className: i.className,
          amount: i.dueAmount || i.amount,
          dueDate: i.dueDate,
          invoiceNumber: i.invoiceNumber,
          studentId: i.studentId,
        })),
        rule,
        resolveRecipient,
        user.uid,
      );
      toast.success(summarizeReminders(emailCount, parentAppCount, whatsappSkipped, whatsappTargets));
    } catch (err) {
      console.error("Failed to send reminders:", err);
      toast.error("Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  };

  const handleSendRemindersToSelected = async () => {
    if (selectedUnpaidInvoiceIds.size === 0) {
      toast.info("No unpaid invoices selected");
      return;
    }
    if (!user?.uid) return;
    setSendingReminders(true);
    try {
      const selected = invoices.filter(i => selectedUnpaidInvoiceIds.has(i.id));
      const rule = await getActiveReminderRule();
      const { emailCount, parentAppCount, whatsappSkipped, whatsappTargets } = await sendBulkFeeReminders(
        selected.map(i => ({
          studentName: i.studentName,
          className: i.className,
          amount: i.dueAmount || i.amount,
          dueDate: i.dueDate,
          invoiceNumber: i.invoiceNumber,
          studentId: i.studentId,
        })),
        rule,
        resolveRecipient,
        user.uid,
      );
      toast.success(summarizeReminders(emailCount, parentAppCount, whatsappSkipped, whatsappTargets));
      setSelectedUnpaidInvoiceIds(new Set());
    } catch (err) {
      console.error("Failed to send reminders:", err);
      toast.error("Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  };

  // Single-invoice reminder — used by the per-row "Send Reminder" button in
  // the Semester Fees accordion (and reused by the Collections tab icon).
  const handleSendSingleReminder = async (invoice: Invoice) => {
    if (!user?.uid) return;
    setReminderRowId(invoice.id);
    try {
      const rule = await getActiveReminderRule();
      const recipient = await resolveRecipient(invoice.studentId);
      const result = await sendFeeReminder(
        {
          studentName: invoice.studentName,
          className: invoice.className,
          amount: invoice.dueAmount || invoice.amount,
          dueDate: invoice.dueDate,
          invoiceNumber: invoice.invoiceNumber,
        },
        rule,
        recipient,
        user.uid,
      );
      const emailCount = result.emailsSent || (result.email ? 1 : 0);
      const parentAppCount = result.parentApp ? 1 : 0;
      const whatsappSkipped = result.whatsapp === "not_connected" ? 1 : 0;
      if (recipient.parentEmails.length === 0 && emailCount === 0 && parentAppCount === 0) {
        toast.error(`No parent email on file for ${invoice.studentName} — reminder not sent`);
      } else {
        toast.success(summarizeReminders(emailCount, parentAppCount, whatsappSkipped, result.whatsappTargets), {
          description: `${invoice.studentName} — ${invoice.invoiceNumber}`,
        });
      }
    } catch (err) {
      console.error("Failed to send reminder:", err);
      toast.error("Failed to send reminder");
    } finally {
      setReminderRowId(null);
    }
  };

  const fetchPaymentHistory = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [vat, online] = await Promise.all([
        smartDb.getAll("VATInvoice", user.uid),
        smartDb.getAll("OnlinePayment", user.uid),
      ]);
      setVatInvoiceHistory(vat);
      setOnlinePaymentHistory(online);
    } catch (err) {
      console.error("Error fetching VAT/online payment history:", err);
    }
  }, [user?.uid]);

  useEffect(() => { fetchPaymentHistory(); }, [fetchPaymentHistory]);

  // ── Late fee policy — loaded once so Due Tracking can compute/apply
  // real penalties instead of just displaying "days overdue" with no charge.
  useEffect(() => {
    if (!user?.uid) return;
    smartDb.getOne<LateFeePolicy>("LateFeePolicy", user.uid).then(cfg => {
      if (cfg) setLateFeePolicy(prev => ({ ...prev, ...cfg }));
    }).catch(() => {});
  }, [user?.uid]);

  // Real Admissions leads still needing an Admission/School Fee invoice —
  // fetched fresh whenever the Generate Invoice dialog opens or the fee type
  // toggle changes, so the picker never shows a lead that's already invoiced.
  useEffect(() => {
    if (!generateInvoiceOpen || !user?.uid) return;
    smartDb.getAll("Lead", user.uid).then((all: any[]) => {
      const flagField = genFeeType === 'Admission' ? 'admissionFeesPaid' : 'schoolFeesPaid';
      setGenLeads((all || []).filter((l: any) => !l[flagField]));
    }).catch(() => setGenLeads([]));
  }, [generateInvoiceOpen, genFeeType, user?.uid]);

  const genStructureOptions = useMemo(
    () => feeStructures.filter(s => s.status === 'Active' && s.feeType === genFeeType),
    [feeStructures, genFeeType]
  );

  const generateFeeInvoice = async () => {
    const lead = genLeads.find(l => l.id === genLeadId);
    if (!lead) { toast.error("Select a lead"); return; }
    if (!genStructureId) { toast.error("Select a fee structure"); return; }
    const structure = feeStructures.find(s => s.id === genStructureId);
    const recipientEmail = lead.email || "—";
    // generateSingleInvoice sends the "please pay" invoice-generated email
    // itself when recipientEmail is provided — this is NOT a payment yet,
    // so it must never use the "payment confirmed" receipt template.
    const invoice = await generateSingleInvoice({
      studentId: lead.id,
      studentName: lead.studentName,
      className: lead.interestedClass || lead.allocatedGrade || "—",
      feeStructureId: genStructureId,
      feeType: genFeeType,
      linkedLeadId: lead.id,
      recipientEmail: recipientEmail !== "—" ? recipientEmail : undefined,
    });
    if (!invoice) return;

    setInvoicePreview({
      invoiceNo: invoice.invoiceNumber, studentName: lead.studentName, amount: invoice.amount,
      email: recipientEmail, paymentMethodLabel: structure?.name || "—",
      type: genFeeType === 'Admission' ? 'admission' : 'school_fee', paidAt: invoice.createdAt as string,
    });
    setGenerateInvoiceOpen(false);
    setGenLeadId(""); setGenStructureId("");
  };

  const handleVatInvoiceGenerated = async (data: {
    studentName: string;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
  }) => {
    if (!user) return;
    try {
      await smartDb.create("VATInvoice", {
        studentName: data.studentName,
        subtotal: data.subtotal,
        vatRate: data.vatRate,
        vatAmount: data.vatAmount,
        total: data.total,
        currency: financialSettings?.currency,
        generatedAt: new Date().toISOString(),
        uid: user.uid,
        createdAt: new Date().toISOString(),
      });
      toast.success("VAT invoice recorded");
      fetchPaymentHistory();
    } catch (error) {
      console.error("Error saving VAT invoice:", error);
      toast.error("Failed to save VAT invoice record");
    }
  };

  const handleOnlinePaymentSuccess = async (payment: {
    studentName?: string;
    amount: number;
    currency: string;
    invoiceNumber?: string;
    method: string;
    txnRef: string;
  }) => {
    if (!user) return;
    try {
      await smartDb.create("OnlinePayment", {
        studentName: payment.studentName || "—",
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        txnRef: payment.txnRef,
        invoiceNumber: payment.invoiceNumber,
        status: "Completed",
        uid: user.uid,
        createdAt: new Date().toISOString(),
      });
      toast.success("Online payment recorded");
      fetchPaymentHistory();
    } catch (error) {
      console.error("Error saving online payment:", error);
      toast.error("Failed to save online payment record");
    }
  };

  // Admission + School Fee invoices generated from the Admissions pipeline
  // (createLeadFeeInvoice, tied to a lead via linkedLeadId) — surfaced in
  // their own tab so Finance can see exactly which admission payments are
  // pending, especially ones the parent already declared paying (via the
  // admission form's own payment step) and are just waiting on a real
  // transaction check before being marked paid.
  const admissionFeeInvoices = useMemo(() =>
    enrichedInvoices
      .filter(inv => inv.feeType === 'Admission' || inv.feeType === 'SchoolFee')
      .sort((a, b) => {
        // Parent-declared-but-unconfirmed payments surface first — that's
        // the queue Finance actually needs to work through.
        const aPending = (a as any).paymentSubmittedByParent && a.status !== 'Paid' ? 0 : 1;
        const bPending = (b as any).paymentSubmittedByParent && b.status !== 'Paid' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      }),
    [enrichedInvoices]);

  const filteredInvoices = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase();
    return enrichedInvoices.filter(invoice =>
      (
        (invoice.studentName?.toLowerCase() || "").includes(q) ||
        (invoice.className?.toLowerCase() || "").includes(q) ||
        (invoice.invoiceNumber?.toLowerCase() || "").includes(q)
      ) &&
      (collectionsYear === "all" || invoice._yr === collectionsYear) &&
      (collectionsStatus === "all" || invoice.status === collectionsStatus) &&
      (collectionsFeeType === "all" || (invoice.feeType || 'Tuition') === collectionsFeeType)
    );
  }, [enrichedInvoices, debouncedSearchQuery, collectionsYear, collectionsStatus, collectionsFeeType]);

  // Shared by the "select all unpaid" checkbox's checked-state AND its
  // click handler — previously both re-ran the same .filter() from scratch.
  const unpaidFilteredInvoices = useMemo(
    () => filteredInvoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled'),
    [filteredInvoices]
  );

  const overdueInvoices = useMemo(() => {
    return invoices
      .filter(i => getInvoiceDisplayStatus(i) === 'Overdue')
      .map(i => ({
        ...i,
        computedPenalty: computeLateFee(i.dueDate, i.amount, lateFeePolicy),
        // Computed once here instead of on every render inside the table row.
        daysOverdue: Math.floor((Date.now() - new Date(i.dueDate).getTime()) / (1000 * 3600 * 24)),
      }));
  }, [invoices, lateFeePolicy]);

  // Aging buckets (0-30 / 31-60 / 61-90 / 90+ days overdue) — standard AR view.
  const agingBuckets = useMemo(() => {
    const buckets = { d30: 0, d60: 0, d90: 0, d90plus: 0 };
    overdueInvoices.forEach(inv => {
      const daysOverdue = inv.daysOverdue;
      const owed = (Number(inv.dueAmount) || 0) + inv.computedPenalty;
      if (daysOverdue <= 30) buckets.d30 += owed;
      else if (daysOverdue <= 60) buckets.d60 += owed;
      else if (daysOverdue <= 90) buckets.d90 += owed;
      else buckets.d90plus += owed;
    });
    return buckets;
  }, [overdueInvoices]);

  // Auto-apply computed late fees to overdue invoices whose stored penalty is
  // stale, so "Due Amount" always reflects the real late-fee policy instead of
  // requiring someone to manually recalculate it.
  useEffect(() => {
    if (!lateFeePolicy.autoCalculate) return;
    overdueInvoices.forEach(inv => {
      if (Math.round(inv.computedPenalty) !== Math.round(inv.penalty || 0)) {
        updateInvoicePenalty(inv.id, inv.computedPenalty);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueInvoices, lateFeePolicy.autoCalculate]);

  const handlePrintReceipt = (invoice: Invoice) => {
    printInvoiceReceiptPdf(invoice, { currency: financialSettings?.currency });
  };

  const handleDownloadReceipt = (invoice: Invoice) => {
    downloadInvoiceReceiptPdf(invoice, { currency: financialSettings?.currency });
  };

  const handleViewDetails = (invoice: Invoice) => {
    setDetailsInvoice(invoice);
    setDetailsDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fees Management</h1>
              <p className="text-sm text-slate-400">Manage school fee structures, collections, and due tracking.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => setVatInvoiceOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              VAT Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay Online
            </Button>
            <Button size="sm" className="gradient-primary" onClick={() => setRevenueDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Collect Fees
            </Button>
          </div>
        </div>
        <VATInvoice open={vatInvoiceOpen} onOpenChange={setVatInvoiceOpen} onGenerated={handleVatInvoiceGenerated} />
        <PaymentGateway open={paymentOpen} onOpenChange={setPaymentOpen} currency={financialSettings?.currency} onSuccess={handleOnlinePaymentSuccess} />

        <Tabs defaultValue="collections" className="space-y-6">
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            <TabsTrigger value="structure" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <BookOpen className="h-4 w-4" /> Fee Structure
            </TabsTrigger>
            <TabsTrigger value="collections" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Wallet className="h-4 w-4" /> Collections
            </TabsTrigger>
            <TabsTrigger value="admission-fees" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <GraduationCap className="h-4 w-4" /> Admission Fees
              {admissionFeeInvoices.some(i => i.paymentSubmittedByParent && i.status !== 'Paid') && (
                <span className="ml-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="semester" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Calendar className="h-4 w-4" /> {periodLabel} Fees
            </TabsTrigger>
            <TabsTrigger value="discounts" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Tag className="h-4 w-4" /> Discounts
            </TabsTrigger>
            <TabsTrigger value="due-tracking" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <AlertTriangle className="h-4 w-4" /> Due Tracking
            </TabsTrigger>
            <TabsTrigger value="vat-invoices" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <FileText className="h-4 w-4" /> VAT Invoices
            </TabsTrigger>
            <TabsTrigger value="online-payments" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <CreditCard className="h-4 w-4" /> Online Payments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="collections" className="space-y-6">
            {/* AI Insight Card */}
            <Card className="border-none shadow-sm bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">AI Insight</p>
                    <p className="text-xs text-muted-foreground">{overdueInvoicesCount} {overdueInvoicesCount === 1 ? "student has" : "students have"} overdue fees. Sending reminders now could improve collection by 12%.</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-primary/20 hover:bg-primary/5"
                  onClick={handleSendReminders}
                  disabled={sendingReminders}
                >
                  {sendingReminders ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Send Reminders
                </Button>
              </CardContent>
            </Card>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search student, class or invoice..." 
                  className="pl-10 rounded-xl bg-white border-none shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    value={collectionsStatus}
                    onChange={e => setCollectionsStatus(e.target.value)}
                    className="h-9 rounded-xl border-none bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none appearance-none"
                  >
                    <option value="all">All Status</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Paid">Paid</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    value={collectionsYear}
                    onChange={e => setCollectionsYear(e.target.value)}
                    className="h-9 rounded-xl border-none bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none appearance-none"
                  >
                    <option value="all">All Academic Years</option>
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    value={collectionsFeeType}
                    onChange={e => setCollectionsFeeType(e.target.value as typeof collectionsFeeType)}
                    className="h-9 rounded-xl border-none bg-white pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none appearance-none"
                  >
                    <option value="all">All Fee Types</option>
                    <option value="Tuition">Tuition</option>
                    <option value="Admission">Admission Fee</option>
                    <option value="SchoolFee">School Fee</option>
                  </select>
                </div>
                <Button size="sm" variant="outline" className="border-none bg-white shadow-sm" onClick={() => setGenerateInvoiceOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Generate Fee Invoice
                </Button>
                {selectedUnpaidInvoiceIds.size > 0 && (
                  <Button size="sm" onClick={handleSendRemindersToSelected} disabled={sendingReminders} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {sendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send Reminders ({selectedUnpaidInvoiceIds.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Collections Table */}
            <Card className="border-none shadow-sm overflow-hidden">
              {feesLoading ? (
                <div className="divide-y">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                      <div className="h-8 w-8 rounded-full bg-slate-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                        <div className="h-2 bg-slate-100 rounded w-1/4" />
                      </div>
                      <div className="h-3 bg-slate-100 rounded w-16" />
                      <div className="h-6 bg-slate-100 rounded-full w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-slate-300" />
                  </div>
                  <h3 className="text-sm font-medium">No invoices found</h3>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or generate new invoices.</p>
                </div>
              ) : (
                <>
                {/* Mobile card view */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => {
                    const isUnpaidCard = invoice.status !== 'Paid' && invoice.status !== 'Cancelled';
                    const isSelectedCard = selectedUnpaidInvoiceIds.has(invoice.id);
                    return (
                    <div key={invoice.id} className={`p-4 space-y-3 ${isSelectedCard ? "bg-blue-50/50" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isUnpaidCard && (
                            <input type="checkbox"
                              checked={isSelectedCard}
                              onChange={(e) => {
                                const newSet = new Set(selectedUnpaidInvoiceIds);
                                if (e.target.checked) newSet.add(invoice.id);
                                else newSet.delete(invoice.id);
                                setSelectedUnpaidInvoiceIds(newSet);
                              }}
                              className="cursor-pointer"
                            />
                          )}
                          <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {(invoice.studentName || '?').split(' ').map((n: string) => n[0] || "").join('')}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{invoice.studentName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{invoice.invoiceNumber}</p>
                            <p className="text-[10px] text-slate-400">Created {format(new Date(invoice.createdAt || new Date()), "dd MMM yyyy, HH:mm")}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getInvoiceDisplayStatus(invoice) === 'Paid' ? 'bg-emerald-50 text-emerald-600' : getInvoiceDisplayStatus(invoice) === 'Partial' ? 'bg-amber-50 text-amber-600' : getInvoiceDisplayStatus(invoice) === 'Overdue' ? 'bg-rose-50 text-rose-600' : getInvoiceDisplayStatus(invoice) === 'Upcoming' ? 'bg-blue-50 text-purple-600' : 'bg-slate-50 text-slate-600'}`}>
                          {getInvoiceDisplayStatus(invoice)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-50 rounded-xl p-2">
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">Total</p>
                          <p className="text-xs font-bold">{financialSettings?.currency || '$'}{(Number(invoice.amount) || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-2">
                          <p className="text-[9px] text-emerald-600 uppercase font-bold">Paid</p>
                          <p className="text-xs font-bold text-emerald-600">{financialSettings?.currency || '$'}{(Number(invoice.paidAmount) || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-2">
                          <p className="text-[9px] text-rose-600 uppercase font-bold">Due</p>
                          <p className="text-xs font-bold text-rose-600">{financialSettings?.currency || '$'}{(Number(invoice.dueAmount) || 0).toLocaleString()}</p>
                        </div>
                      </div>
                      <Button size="sm" className="w-full h-9 gradient-primary text-xs font-bold" onClick={() => { setSelectedInvoice(invoice); setCollectFeeDialogOpen(true); }}>
                        <CreditCard className="h-3.5 w-3.5 mr-2" /> Collect Payment
                      </Button>
                    </div>
                    );
                  })}
                </div>
                {/* Desktop table view */}
                <Table className="hidden md:table">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-10">
                        <input type="checkbox"
                          checked={unpaidFilteredInvoices.length > 0 &&
                            unpaidFilteredInvoices.every(i => selectedUnpaidInvoiceIds.has(i.id))}
                          onChange={(e) => {
                            const unpaid = unpaidFilteredInvoices;
                            const newSet = new Set(selectedUnpaidInvoiceIds);
                            if (e.target.checked) unpaid.forEach(i => newSet.add(i.id));
                            else unpaid.forEach(i => newSet.delete(i.id));
                            setSelectedUnpaidInvoiceIds(newSet);
                          }}
                          className="cursor-pointer"
                        />
                      </TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Invoice #</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Student</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Class</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Fee Type</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Total Amount</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Paid</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Due</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Created</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => {
                      const isUnpaidRow = invoice.status !== 'Paid' && invoice.status !== 'Cancelled';
                      const isSelectedRow = selectedUnpaidInvoiceIds.has(invoice.id);
                      return (
                      <TableRow key={invoice.id} className={`transition-colors ${isSelectedRow ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}>
                        <TableCell>
                          <input type="checkbox"
                            checked={isSelectedRow}
                            disabled={!isUnpaidRow}
                            onChange={(e) => {
                              const newSet = new Set(selectedUnpaidInvoiceIds);
                              if (e.target.checked) newSet.add(invoice.id);
                              else newSet.delete(invoice.id);
                              setSelectedUnpaidInvoiceIds(newSet);
                            }}
                            className="cursor-pointer disabled:opacity-30"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                              {(invoice.studentName || '?').split(' ').map((n: string) => n[0] || "").join('')}
                            </div>
                            <span className="font-medium">{invoice.studentName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{invoice.className}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            invoice.feeType === 'Admission' ? 'bg-violet-50 text-purple-600' :
                            invoice.feeType === 'SchoolFee' ? 'bg-teal-50 text-teal-600' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            {invoice.feeType === 'Admission' ? 'Admission' : invoice.feeType === 'SchoolFee' ? 'School Fee' : 'Tuition'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{financialSettings?.currency || '$'}{(Number(invoice.amount) || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-emerald-600 font-medium">{financialSettings?.currency || '$'}{(Number(invoice.paidAmount) || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-rose-600 font-medium">{financialSettings?.currency || '$'}{(Number(invoice.dueAmount) || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>
                            <p>{format(new Date(invoice.createdAt || new Date()), "dd MMM yyyy")}</p>
                            <p className="text-[10px] text-slate-400">{format(new Date(invoice.createdAt || new Date()), "HH:mm")}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            getInvoiceDisplayStatus(invoice) === 'Paid' ? 'bg-emerald-50 text-emerald-600' :
                            getInvoiceDisplayStatus(invoice) === 'Partial' ? 'bg-amber-50 text-amber-600' :
                            getInvoiceDisplayStatus(invoice) === 'Overdue' ? 'bg-rose-50 text-rose-600' :
                            getInvoiceDisplayStatus(invoice) === 'Upcoming' ? 'bg-blue-50 text-purple-600' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            {getInvoiceDisplayStatus(invoice)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-primary hover:bg-primary/5"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setCollectFeeDialogOpen(true);
                              }}
                            >
                              <CreditCard className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-slate-100"
                              title="Send reminder"
                              disabled={reminderRowId === invoice.id}
                              onClick={() => handleSendSingleReminder(invoice)}
                            >
                              {reminderRowId === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setCollectFeeDialogOpen(true);
                                }}>
                                  Collect Payment
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewDetails(invoice)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadReceipt(invoice)}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Download Receipt
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintReceipt(invoice)}>
                                  <Printer className="mr-2 h-4 w-4" />
                                  Print Receipt
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-rose-600"
                                  onClick={() => updateInvoiceStatus(invoice.id, 'Cancelled')}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Void Transaction
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </>
              )}
            </Card>
          </TabsContent>

          {/* ── ADMISSION FEES TAB ── */}
          <TabsContent value="admission-fees" className="space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900">Admission Fees</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Admission + School Fee invoices generated from the Admissions pipeline. Payments the parent already declared via the application form are flagged — verify the transaction, then mark paid to move the applicant forward.
              </p>
            </div>

            {admissionFeeInvoices.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-slate-200">
                <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <GraduationCap className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-black text-slate-600">No admission fee invoices yet.</p>
                  <p className="text-xs text-slate-400">These appear automatically once an applicant submits the admission form or clears Doc Verification.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Student</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Type</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Amount</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Declared Payment</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admissionFeeInvoices.map((inv: any) => (
                      <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell>
                          <p className="font-bold text-slate-900">{inv.studentName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{inv.invoiceNumber}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-purple-600">
                            {inv.feeType === 'Admission' ? 'Admission Fee' : 'School Fee'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">{financialSettings?.currency || "QAR"} {inv.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          {inv.paymentSubmittedByParent ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge className="w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border-none">
                                {inv.paymentMethodDeclared || "Declared"} · Ref {inv.paymentTxnRef || "—"}
                              </Badge>
                              <span className="text-[10px] text-slate-400">
                                {inv.paymentSubmittedAt ? new Date(inv.paymentSubmittedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-none",
                            inv.status === 'Paid' ? "bg-emerald-50 text-emerald-600"
                            : inv.status === 'Overdue' ? "bg-rose-50 text-rose-600"
                            : inv.status === 'Partial' ? "bg-blue-50 text-purple-600"
                            : "bg-slate-100 text-slate-500")}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.status !== 'Paid' && inv.status !== 'Cancelled' ? (
                            <Button size="sm" className="rounded-xl gradient-primary text-white text-xs font-bold h-8 px-3"
                              onClick={() => { setSelectedInvoice(inv); setCollectFeeDialogOpen(true); }}>
                              Mark as Paid
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ── SEMESTER FEES TAB ── */}
          <TabsContent value="semester" className="space-y-5">
            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: "Total Billed",    value: fmtAmt(semKpis.total),   cls: "bg-violet-50 text-violet-700 border border-violet-100" },
                { label: "Collected",       value: fmtAmt(semKpis.paid),    cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" },
                { label: "Pending",         value: fmtAmt(semKpis.due),     cls: "bg-amber-50 text-amber-700 border border-amber-100" },
                { label: "Overdue Amt",     value: fmtAmt(semKpis.overdue), cls: "bg-rose-50 text-rose-700 border border-rose-100" },
                { label: "Collection Rate", value: `${semKpis.rate}%`,      cls: "bg-blue-50 text-blue-700 border border-blue-100", rate: true },
              ].map(k => (
                <Card key={k.label} className={`${k.cls} shadow-none rounded-2xl`}>
                  <CardContent className="p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">{k.label}</p>
                    <p className="text-base font-black">{k.value}</p>
                    {(k as any).rate && (
                      <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${semKpis.rate}%` }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search student, class, invoice…" className="pl-10 rounded-xl bg-white border-none shadow-sm" value={semSearch} onChange={e => setSemSearch(e.target.value)} />
              </div>
              <select
                value={semYear}
                onChange={e => setSemYear(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">All Academic Years</option>
                {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={semStatus}
                onChange={e => setSemStatus(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
                <option value="Overdue">Overdue</option>
                <option value="Paid">Paid</option>
              </select>
              {selectedUnpaidInvoiceIds.size > 0 && (
                <Button size="sm" onClick={handleSendRemindersToSelected} disabled={sendingReminders} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {sendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send Reminders ({selectedUnpaidInvoiceIds.size})
                </Button>
              )}
            </div>

            {/* Semester accordion groups */}
            {feesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="ml-3 text-slate-500 text-sm">Loading…</p>
              </div>
            ) : semGroups.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 rounded-2xl">
                <CardContent className="py-16 flex flex-col items-center gap-2 text-center">
                  <BookOpen className="h-8 w-8 text-slate-300" />
                  <p className="font-bold text-slate-500">No invoices found</p>
                  <p className="text-xs text-slate-400">Adjust your filters or generate invoices from the Fee Structure tab.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {semGroups.map(group => {
                  const isOpen = expandedSems.has(group.key);
                  const pct = group.total > 0 ? Math.round((group.paid / group.total) * 100) : 0;
                  // Computed once per group per render instead of re-filtering
                  // the same array twice for the "select all unpaid" checkbox.
                  const groupUnpaid = group.invoices.filter(i => i.status !== 'Paid');
                  const statusBg: Record<string, string> = {
                    Paid: "bg-emerald-50 text-emerald-700", Partial: "bg-amber-50 text-amber-700",
                    Unpaid: "bg-slate-100 text-slate-600",  Overdue: "bg-rose-50 text-rose-700",
                  };
                  return (
                    <Card key={group.key} className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
                      {/* Group header — clickable */}
                      <button className="w-full text-left" onClick={() => toggleSemGroup(group.key)}>
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                                group.overdue > 0 ? "bg-rose-100" : group.due > 0 ? "bg-amber-100" : "bg-emerald-100"
                              }`}>
                                {group.overdue > 0
                                  ? <AlertTriangle className="h-5 w-5 text-rose-600" />
                                  : group.due > 0
                                  ? <Clock className="h-5 w-5 text-amber-600" />
                                  : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-slate-900">{group.sem}</span>
                                  <Badge variant="outline" className="text-[10px] font-bold rounded-full px-2">{group.yr}</Badge>
                                  {group.overdue > 0 && (
                                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] font-black rounded-full px-2">
                                      {group.overdue} Overdue
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">{group.invoices.length} invoice{group.invoices.length !== 1 ? "s" : ""}</p>
                              </div>
                            </div>

                            <div className="hidden md:flex items-center gap-5">
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Billed</p>
                                <p className="text-sm font-black text-slate-900">{fmtAmt(group.total)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-emerald-500 uppercase">Collected</p>
                                <p className="text-sm font-black text-emerald-600">{fmtAmt(group.paid)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-rose-400 uppercase">Pending</p>
                                <p className="text-sm font-black text-rose-600">{fmtAmt(group.due)}</p>
                              </div>
                              <div className={`h-11 w-11 rounded-full flex items-center justify-center text-xs font-black ${
                                pct === 100 ? "bg-emerald-100 text-emerald-700" : pct >= 60 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                              }`}>{pct}%</div>
                            </div>

                            {isOpen
                              ? <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                              : <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />}
                          </div>
                          {/* Collection progress bar */}
                          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"
                            }`} style={{ width: `${pct}%` }} />
                          </div>
                        </CardContent>
                      </button>

                      {/* Expanded invoice list */}
                      {isOpen && (
                        <div className="border-t border-slate-100">
                          <Table>
                            <TableHeader className="bg-slate-50">
                              <TableRow>
                                <TableHead className="w-12 text-[11px] font-black uppercase tracking-wider text-slate-400">
                                  <input type="checkbox"
                                    checked={groupUnpaid.length > 0 && groupUnpaid.every(i => selectedUnpaidInvoiceIds.has(i.id))}
                                    onChange={(e) => {
                                      const unpaid = groupUnpaid;
                                      if (e.target.checked) {
                                        const newSet = new Set(selectedUnpaidInvoiceIds);
                                        unpaid.forEach(i => newSet.add(i.id));
                                        setSelectedUnpaidInvoiceIds(newSet);
                                      } else {
                                        const newSet = new Set(selectedUnpaidInvoiceIds);
                                        unpaid.forEach(i => newSet.delete(i.id));
                                        setSelectedUnpaidInvoiceIds(newSet);
                                      }
                                    }}
                                    className="cursor-pointer"
                                  />
                                </TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Invoice #</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Student</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Class</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Paid</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Due</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Created</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Due Date</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400">Status</TableHead>
                                <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-400 text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.invoices.map(inv => {
                                const isOD = inv.status === "Overdue";
                                const daysOD = isOD ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000) : 0;
                                const isSelected = selectedUnpaidInvoiceIds.has(inv.id);
                                const isUnpaid = inv.status !== 'Paid';
                                return (
                                  <TableRow key={inv.id} className={`transition-colors ${isOD ? "bg-rose-50/30" : isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}>
                                    <TableCell>
                                      <input type="checkbox"
                                        checked={isSelected}
                                        disabled={!isUnpaid}
                                        onChange={(e) => {
                                          const newSet = new Set(selectedUnpaidInvoiceIds);
                                          if (e.target.checked) {
                                            newSet.add(inv.id);
                                          } else {
                                            newSet.delete(inv.id);
                                          }
                                          setSelectedUnpaidInvoiceIds(newSet);
                                        }}
                                        className="cursor-pointer disabled:opacity-30"
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500">{inv.invoiceNumber}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center text-xs font-black text-purple-600 shrink-0">
                                          {(inv.studentName || "?").split(" ").map((n: string) => n[0] || "").join("")}
                                        </div>
                                        <span className="font-bold text-sm">{inv.studentName}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-500">{inv.className || "—"}</TableCell>
                                    <TableCell className="font-bold text-sm">{fmtAmt(inv.amount)}</TableCell>
                                    <TableCell className="font-bold text-sm text-emerald-600">{fmtAmt(inv.paidAmount)}</TableCell>
                                    <TableCell className="font-bold text-sm text-rose-600">{fmtAmt(inv.dueAmount)}</TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                      <div>
                                        <p>{format(new Date(inv.createdAt || new Date()), "dd MMM yyyy")}</p>
                                        <p className="text-[10px] text-slate-400">{format(new Date(inv.createdAt || new Date()), "HH:mm")}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                      <div>
                                        <p>{format(new Date(inv.dueDate), "dd MMM yyyy")}</p>
                                        {isOD && <p className="text-rose-600 font-bold text-[10px]">{daysOD}d overdue</p>}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusBg[inv.status] || statusBg.Unpaid}`}>
                                        {inv.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        {inv.status !== "Paid" && inv.status !== "Cancelled" && (
                                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary hover:bg-primary/5"
                                            onClick={() => { setSelectedInvoice(inv); setCollectFeeDialogOpen(true); }}>
                                            <CreditCard className="h-4 w-4" />
                                          </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-slate-100"
                                          disabled={reminderRowId === inv.id}
                                          onClick={() => handleSendSingleReminder(inv)}>
                                          {reminderRowId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {/* Group summary footer */}
                          <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
                            <span className="font-black text-slate-400 uppercase tracking-wider">Summary:</span>
                            <span className="font-black text-slate-700">Billed: <span className="text-slate-900">{fmtAmt(group.total)}</span></span>
                            <span className="font-black text-emerald-600">Collected: {fmtAmt(group.paid)}</span>
                            <span className="font-black text-rose-600">Pending: {fmtAmt(group.due)}</span>
                            <span className="ml-auto font-black text-slate-500">{group.paidCount}/{group.invoices.length} paid</span>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="structure" className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold">Fee Structures</h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (feeStructures.length === 0) { toast.error("No fee structures to export"); return; }
                    exportFeeStructuresToExcel(feeStructures, financialSettings?.currency || "QAR");
                    toast.success("Fee structures exported to Excel");
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportStructureOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Import
                </Button>
                <Button size="sm" className="gradient-primary" onClick={() => { setEditingStructure(null); setStructureDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Structure
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {feeStructures.length === 0 ? (
                <Card className="col-span-full border-none shadow-sm">
                  <CardContent className="p-12 text-center">
                    <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4">
                      <CreditCard className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold">No Fee Structures</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                      Define your school's fee structure by class, academic year, and category — or import them from an Excel template.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <Button variant="outline" onClick={() => setImportStructureOpen(true)}>Import from Excel</Button>
                      <Button className="gradient-primary" onClick={() => { setEditingStructure(null); setStructureDialogOpen(true); }}>Create New Structure</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                feeStructures.map((structure) => (
                  <Card key={structure.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{structure.academicYear}</Badge>
                        <Badge className={structure.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'}>
                          {structure.status}
                        </Badge>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-lg mt-2">{structure.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{structure.className}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mt-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                            title="Edit fee structure"
                            onClick={() => { setEditingStructure(structure); setStructureDialogOpen(true); }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                            title="Print for parent"
                            onClick={() => { setPrintStructure(structure); setPrintDialogOpen(true); }}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted-foreground">Total Amount</span>
                        <span className="text-2xl font-bold text-primary">{financialSettings?.currency || '$'}{(Number(structure.totalAmount) || 0).toLocaleString()}</span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Components</p>
                        {structure.components.map((comp, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span>{comp.name}</span>
                            <span className="font-medium">{financialSettings?.currency || '$'}{(Number(comp.amount) || 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        className="w-full mt-4"
                        variant="outline"
                        onClick={() => generateInvoicesForClass(structure.classId, structure.id)}
                      >
                        Generate Invoices
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="discounts" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Fee Discount Rules</h2>
              <Button size="sm" className="gradient-primary" onClick={() => setDiscountDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Discount Rule
              </Button>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
              {feeDiscounts.length === 0 ? (
                <CardContent className="p-12 text-center">
                  <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4">
                    <Tag className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold">No Discount Rules</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                    Manage student scholarships, sibling discounts, and early bird offers.
                  </p>
                  <Button className="mt-6 gradient-primary" onClick={() => setDiscountDialogOpen(true)}>Add Discount Rule</Button>
                </CardContent>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Discount Name</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Category</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Type</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Value</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feeDiscounts.map((discount) => (
                      <TableRow key={discount.id}>
                        <TableCell className="font-medium">{discount.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full">
                            {discount.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{discount.type}</TableCell>
                        <TableCell className="font-bold text-primary">
                          {discount.type === 'Percentage' ? `${Number(discount.value) || 0}%` : `${financialSettings?.currency || '$'}${(Number(discount.value) || 0).toLocaleString()}`}
                        </TableCell>
                        <TableCell>
                          <Badge className={discount.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600'}>
                            {discount.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="due-tracking" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Overdue Payments</h2>
              <Button size="sm" variant="outline" onClick={handleSendReminders} disabled={sendingReminders}>
                {sendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Bulk Reminders
              </Button>
            </div>

            {/* Aging analysis — standard AR buckets, includes any applied late fee */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "0–30 Days", value: agingBuckets.d30, tone: "bg-amber-50 text-amber-700" },
                { label: "31–60 Days", value: agingBuckets.d60, tone: "bg-orange-50 text-orange-700" },
                { label: "61–90 Days", value: agingBuckets.d90, tone: "bg-rose-50 text-rose-700" },
                { label: "90+ Days", value: agingBuckets.d90plus, tone: "bg-red-100 text-red-800" },
              ].map(b => (
                <Card key={b.label} className="border-none shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{b.label}</p>
                    <p className={`text-lg font-bold mt-1 ${b.tone.split(" ")[1]}`}>{fmtAmt(b.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
              {overdueInvoices.length === 0 ? (
                <CardContent className="p-12 text-center">
                  <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold">All caught up!</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                    There are currently no overdue fee payments.
                  </p>
                </CardContent>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Student</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Due Amount</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Late Fee</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Due Date</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Days Overdue</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueInvoices.map((invoice) => {
                      const daysOverdue = invoice.daysOverdue;
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center text-xs font-bold text-rose-600">
                                {(invoice.studentName || '?').split(' ').map(n => n[0] || "").join('')}
                              </div>
                              <div>
                                <p className="font-medium">{invoice.studentName}</p>
                                <p className="text-xs text-muted-foreground">{invoice.className}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-rose-600 font-bold">
                            {financialSettings?.currency || '$'}{(Number(invoice.dueAmount) || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs">
                            {invoice.computedPenalty > 0
                              ? <Badge variant="outline" className="rounded-full border-rose-200 text-rose-600">+{financialSettings?.currency || '$'}{invoice.computedPenalty.toLocaleString()}</Badge>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{format(new Date(invoice.dueDate), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="rounded-full">
                              {daysOverdue} Days
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="text-primary" onClick={() => {
                              setSelectedInvoice(invoice);
                              setCollectFeeDialogOpen(true);
                            }}>
                              Send Reminder
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>


          {/* ── VAT INVOICES TAB ── */}
          <TabsContent value="vat-invoices" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">VAT Invoice History</h3>
                <p className="text-xs text-slate-500 mt-0.5">Generated via the "VAT Invoice" button above.</p>
              </div>
              <Button size="sm" className="gradient-primary rounded-xl" onClick={() => setVatInvoiceOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Generate VAT Invoice
              </Button>
            </div>

            {vatInvoiceHistory.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-slate-200">
                <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-black text-slate-600">No VAT invoices generated yet.</p>
                  <p className="text-xs text-slate-400">Generate a VAT invoice from the toolbar above to see it listed here.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Student</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Subtotal</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">VAT Rate</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">VAT Amount</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Total</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Generated Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vatInvoiceHistory.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium">{item.studentName}</TableCell>
                        <TableCell>{item.currency || financialSettings?.currency} {(Number(item.subtotal) || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-600">
                            {item.vatRate}%
                          </Badge>
                        </TableCell>
                        <TableCell>{item.currency || financialSettings?.currency} {(Number(item.vatAmount) || 0).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{item.currency || financialSettings?.currency} {(Number(item.total) || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.generatedAt ? new Date(item.generatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ── ONLINE PAYMENTS TAB ── */}
          <TabsContent value="online-payments" className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Online Payments</h3>
                <p className="text-xs text-slate-500 mt-0.5">Payments processed through the online payment gateway.</p>
              </div>
              <Button size="sm" className="gradient-primary rounded-xl" onClick={() => setPaymentOpen(true)}>
                <CreditCard className="mr-2 h-4 w-4" />
                New Payment
              </Button>
            </div>

            {onlinePaymentHistory.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-2 border-slate-200">
                <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-black text-slate-600">No online payments recorded yet.</p>
                  <p className="text-xs text-slate-400">Payments made through the online gateway will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Txn Ref</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Student</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Amount</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Method</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Card Brand</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Date</TableHead>
                      <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onlinePaymentHistory.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-bold text-emerald-600 font-mono text-xs">{item.txnRef}</TableCell>
                        <TableCell className="font-medium">{item.studentName}</TableCell>
                        <TableCell className="font-medium">{item.currency || financialSettings?.currency} {(Number(item.amount) || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600">
                            {item.method === "myfatoorah_card" ? "Card" : item.method === "myfatoorah_bank" ? "Bank Transfer" : item.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.cardBrand || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600">
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <RecordRevenueDialog 
        open={revenueDialogOpen} 
        onOpenChange={setRevenueDialogOpen} 
        type="student" 
      />

      <CreateFeeStructureDialog
        open={structureDialogOpen}
        onOpenChange={(open) => { setStructureDialogOpen(open); if (!open) setEditingStructure(null); }}
        structure={editingStructure ?? undefined}
      />

      <ImportFeeStructureDialog
        open={importStructureOpen}
        onOpenChange={setImportStructureOpen}
      />

      <FeeStructurePrintDialog
        open={printDialogOpen}
        onOpenChange={(open) => { setPrintDialogOpen(open); if (!open) setPrintStructure(null); }}
        structure={printStructure}
        currency={financialSettings?.currency || "QAR"}
      />

      <CreateDiscountDialog
        open={discountDialogOpen}
        onOpenChange={setDiscountDialogOpen}
      />

      <CollectFeeDialog
        open={collectFeeDialogOpen}
        onOpenChange={setCollectFeeDialogOpen}
        invoice={selectedInvoice}
      />

      {/* ── Generate Fee Invoice (Admission/School Fee) ──
          The manual step a single finance person takes: pick a fee type,
          an admissions lead who still needs that invoice, and which Fee
          Structure to bill them from. Creates one real Invoice via the same
          engine as bulk class invoicing — it then shows up in Collections
          like any other invoice, paid via the same Collect Payment flow. */}
      <Dialog open={generateInvoiceOpen} onOpenChange={setGenerateInvoiceOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Generate Fee Invoice</DialogTitle>
            <DialogDescription>
              Creates a real invoice for an admissions lead — it appears in Collections and is paid the same way as any other fee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Fee Type</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setGenFeeType('Admission'); setGenLeadId(""); setGenStructureId(""); }}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold border ${genFeeType === 'Admission' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>
                  Admission Fee
                </button>
                <button type="button"
                  onClick={() => { setGenFeeType('SchoolFee'); setGenLeadId(""); setGenStructureId(""); }}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold border ${genFeeType === 'SchoolFee' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200'}`}>
                  School Fee
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Admissions Lead</label>
              <select value={genLeadId} onChange={e => setGenLeadId(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="">
                  {genLeads.length === 0 ? "No leads awaiting this invoice" : "Select a lead…"}
                </option>
                {genLeads.map(l => (
                  <option key={l.id} value={l.id}>{l.studentName} — {l.interestedClass || l.allocatedGrade || "—"} ({l.status})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Fee Structure</label>
              <select value={genStructureId} onChange={e => setGenStructureId(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="">
                  {genStructureOptions.length === 0 ? `No ${genFeeType === 'Admission' ? 'Admission Fee' : 'School Fee'} structures — create one first` : "Select a fee structure…"}
                </option>
                {genStructureOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {financialSettings?.currency || 'QAR'} {s.totalAmount.toLocaleString()}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateInvoiceOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" disabled={!genLeadId || !genStructureId} onClick={generateFeeInvoice}>
              Generate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Admission/School Fee Invoice Generated (Email Simulation) ── */}
      <Dialog open={!!invoicePreview} onOpenChange={open => { if (!open) setInvoicePreview(null); }}>
        <DialogContent className="sm:max-w-[520px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="sr-only"><DialogTitle>Invoice Generated</DialogTitle></DialogHeader>
          {invoicePreview && (
            <div className="bg-white">
              <div className="bg-primary px-8 py-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Invoice Emailed</p>
                <p className="text-lg font-black">Student Diwan ERP</p>
                <p className="text-xs opacity-80 mt-0.5">To: {invoicePreview.email}</p>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div>
                  <p className="text-base font-black text-slate-900">
                    {invoicePreview.type === 'school_fee' ? 'School Fee' : 'Admission Fee'} Invoice
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    This invoice is now in Collections, awaiting payment. Details below.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                  {[
                    { label: 'Invoice Number', value: invoicePreview.invoiceNo, mono: true },
                    { label: 'Student Name', value: invoicePreview.studentName },
                    { label: 'Fee Type', value: invoicePreview.type === 'school_fee' ? 'Annual School Fee' : 'Admission Fee' },
                    { label: 'Fee Structure', value: invoicePreview.paymentMethodLabel },
                    { label: 'Amount Due', value: `${financialSettings?.currency || 'QAR'} ${invoicePreview.amount.toLocaleString()}`, highlight: true },
                    { label: 'Generated', value: new Date(invoicePreview.paidAt).toLocaleDateString('en-QA', { day: 'numeric', month: 'long', year: 'numeric' }) },
                    { label: 'Status', value: 'UNPAID', green: false },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center px-4 py-3">
                      <span className="text-xs font-bold text-slate-500">{row.label}</span>
                      <span className={`text-xs font-black ${row.green ? 'text-emerald-600' : row.highlight ? 'text-slate-900 text-sm' : 'text-slate-700'} ${row.mono ? 'font-mono tracking-wider' : ''}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                  This invoice was generated in Student Diwan ERP and emailed to{' '}
                  <strong className="text-slate-600">{invoicePreview.email}</strong>. Collect payment for
                  it from the Collections tab like any other invoice.
                </p>

                <Button className="w-full rounded-xl gradient-primary text-white font-bold h-11"
                  onClick={() => setInvoicePreview(null)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialogOpen} onOpenChange={(open) => { setDetailsDialogOpen(open); if (!open) setDetailsInvoice(null); }}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Invoice Details
            </DialogTitle>
            <DialogDescription>
              {detailsInvoice ? `${detailsInvoice.invoiceNumber} — ${detailsInvoice.studentName}` : ""}
            </DialogDescription>
          </DialogHeader>

          {detailsInvoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono font-medium">{detailsInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Student</span>
                  <span className="font-medium">{detailsInvoice.studentName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Class</span>
                  <span className="font-medium">{detailsInvoice.className}</span>
                </div>
                {detailsInvoice.term && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{periodLabel}</span>
                    <span className="font-medium">{detailsInvoice.term}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium">{detailsInvoice.category}</span>
                </div>
                <div className="pt-2 border-t flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-bold">{financialSettings?.currency || '$'}{(Number(detailsInvoice.amount) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid Amount</span>
                  <span className="font-bold text-emerald-600">{financialSettings?.currency || '$'}{(Number(detailsInvoice.paidAmount) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Due Amount</span>
                  <span className="font-bold text-rose-600">{financialSettings?.currency || '$'}{(Number(detailsInvoice.dueAmount) || 0).toLocaleString()}</span>
                </div>
                {detailsInvoice.penalty > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Penalty</span>
                    <span className="font-bold text-rose-600">{financialSettings?.currency || '$'}{(Number(detailsInvoice.penalty) || 0).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium">{format(new Date(detailsInvoice.dueDate), 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{format(new Date(detailsInvoice.createdAt), 'MMM dd, yyyy')}</span>
                </div>
                <div className="pt-2 border-t flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    getInvoiceDisplayStatus(detailsInvoice) === 'Paid' ? 'bg-emerald-50 text-emerald-600' :
                    getInvoiceDisplayStatus(detailsInvoice) === 'Partial' ? 'bg-amber-50 text-amber-600' :
                    getInvoiceDisplayStatus(detailsInvoice) === 'Overdue' ? 'bg-rose-50 text-rose-600' :
                    getInvoiceDisplayStatus(detailsInvoice) === 'Upcoming' ? 'bg-blue-50 text-purple-600' :
                    'bg-slate-50 text-slate-600'
                  }`}>
                    {getInvoiceDisplayStatus(detailsInvoice)}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => handleDownloadReceipt(detailsInvoice)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Receipt
                </Button>
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => handlePrintReceipt(detailsInvoice)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default FeesManagement;
