import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { Invoice, getInvoiceDisplayStatus, advanceLeadOnFeeInvoicePaid } from "@/hooks/useFees";
import { downloadInvoiceReceiptPdf } from "@/lib/invoiceReceiptPdf";
import { createPaymentSession, getPaymentTransaction, GatewayNotConfiguredError } from "@/lib/paymentGateway";
import {
  Wallet, CreditCard, Package, AlertCircle, Download, Calendar,
  Receipt, Banknote, Landmark, Smartphone, FileText, Layers, ChevronRight,
} from "lucide-react";

const bhd = (n: number) =>
  `BHD ${n.toLocaleString("en-BH")}`;

type FeeStatus = "Paid" | "Partial Paid" | "Due" | "Overdue";
type DisplayStatus = ReturnType<typeof getInvoiceDisplayStatus>;

interface FeeRow {
  type: string;
  dueDate: string;
  total: number;
  paid: number;
  pending: number;
  status: FeeStatus;
  displayStatus: DisplayStatus;
  invoice: Invoice;
}

interface PaymentRow {
  date: string;
  id: string;
  description: string;
  method: string;
  methodIcon: typeof CreditCard;
  amount: number;
  status: string;
}

function statusBadge(status: DisplayStatus) {
  switch (status) {
    case "Paid":     return "bg-emerald-100 text-emerald-700";
    case "Partial":  return "bg-amber-100 text-amber-700";
    case "Overdue":  return "bg-rose-100 text-rose-700";
    case "Upcoming": return "bg-blue-100 text-blue-700";
    case "Cancelled":return "bg-slate-100 text-slate-500";
    default:         return "bg-blue-100 text-blue-700";
  }
}

// Map a raw Invoice row from the "Invoice" table into a Fee Details row.
// status: "Paid" | "Unpaid" | "Partial" | "Overdue" (+ legacy "Cancelled")
function invoiceToFeeRow(inv: Invoice): FeeRow {
  const total = Number(inv.amount) || 0;
  const raw = String(inv.status || "Unpaid");
  let status: FeeStatus;
  let paid: number;
  if (raw === "Paid") { status = "Paid"; paid = total; }
  else if (raw === "Partial") { status = "Partial Paid"; paid = Number(inv.paidAmount) || total / 2; }
  else if (raw === "Overdue") { status = "Overdue"; paid = 0; }
  else { status = "Due"; paid = 0; }
  const baseType = inv.category || inv.invoiceNumber || "Fee";
  const type = inv.term ? `${baseType} — ${inv.term}` : baseType;
  return {
    type,
    dueDate: inv.dueDate || "—",
    total,
    paid,
    pending: Math.max(total - paid, 0),
    status,
    displayStatus: getInvoiceDisplayStatus(inv),
    invoice: inv,
  };
}

export default function StudentFees() {
  const [year, setYear] = useState("2026-27");
  const { user } = useAuth();
  const { students } = useStudents();
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const downloadReceipt = (invoice: Invoice) => {
    if (invoice.status !== "Paid") return;
    downloadInvoiceReceiptPdf(invoice);
    toast.success("Receipt downloaded");
  };

  // Resolve the logged-in student the same way Profile.tsx does.
  const student = useMemo(() => {
    if (!students?.length) return null;
    return (
      students.find(
        (s: any) =>
          (user?.email && s.email === user.email) ||
          (user?.displayName && s.name === user.displayName)
      ) || students[0]
    ) as any;
  }, [students, user]);

  // Real invoices for this student, loaded from the "Invoice" table (READ-ONLY).
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Marks an invoice paid the same way useFees.ts's collectFee does (Invoice
  // update + StudentRevenue record) — collectFee itself can't be reused here
  // since it reads from a useFees() instance scoped to the admin's uid, not
  // this student session.
  async function finalizeInvoicePayment(invoice: Invoice, amount: number, paymentMethod: string) {
    const newPaidAmount = (invoice.paidAmount || 0) + amount;
    const newDueAmount = Math.max(0, invoice.amount - newPaidAmount);
    const newStatus = newDueAmount === 0 ? "Paid" : "Partial";
    await smartDb.update("Invoice", invoice.id, {
      paidAmount: newPaidAmount,
      dueAmount: newDueAmount,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    await smartDb.create("StudentRevenue", {
      student: invoice.studentName,
      studentId: invoice.studentId,
      invoiceId: invoice.id,
      amount,
      category: "Tuition Fee",
      date: new Date().toISOString().split("T")[0],
      paymentMethod,
      status: "Paid",
      uid: user?.uid || "local-user",
      createdAt: new Date().toISOString(),
    });
    const paidInvoice = { ...invoice, paidAmount: newPaidAmount, dueAmount: newDueAmount, status: newStatus as Invoice["status"] };
    // Same admission/school-fee lead advance as the admin Collections flow —
    // a student self-paying one of these invoices shouldn't leave the lead stuck.
    if (newStatus === "Paid") await advanceLeadOnFeeInvoicePaid(paidInvoice, paymentMethod);
    downloadInvoiceReceiptPdf(paidInvoice);
    toast.success("Payment received — receipt downloaded");
    setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? paidInvoice : i)));
  }

  // Handle the return-trip from the real PayTabs hosted checkout page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    if (!orderId || params.get("payment") !== "1") return;
    (async () => {
      const pendingRaw = sessionStorage.getItem(`fee_pending_${orderId}`);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      window.history.replaceState({}, "", window.location.pathname);
      if (!pending) return;
      try {
        const tx = await getPaymentTransaction(orderId);
        if (tx.status !== "A") {
          toast.error(`Payment ${tx.status === "pending" ? "was not completed" : `failed (status: ${tx.status})`} — nothing was charged.`);
          sessionStorage.removeItem(`fee_pending_${orderId}`);
          return;
        }
        const inv = invoices.find((i) => i.id === pending.invoiceId);
        if (inv) await finalizeInvoicePayment(inv, pending.amount, pending.paymentMethod);
        sessionStorage.removeItem(`fee_pending_${orderId}`);
      } catch (err) {
        console.error("Failed to verify payment:", err);
        toast.error("Could not verify payment status — please contact Finance if you were charged.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices.length]);

  const payNow = async (invoice?: Invoice) => {
    const target = invoice || invoices.find((i) => getInvoiceDisplayStatus(i) !== "Paid" && getInvoiceDisplayStatus(i) !== "Upcoming");
    if (!target) {
      toast.info("No pending fees to pay right now.");
      return;
    }
    setPayingInvoiceId(target.id);
    const orderId = `FEE-${Date.now()}`;
    try {
      const returnUrl = `${window.location.origin}/student/fees?payment=1&orderId=${orderId}`;
      const { redirectUrl } = await createPaymentSession({
        amount: target.dueAmount,
        currency: "BHD",
        description: `Fee payment — ${target.invoiceNumber}`,
        customerName: student?.name,
        customerEmail: student?.email || user?.email,
        orderId,
        returnUrl,
      });
      sessionStorage.setItem(
        `fee_pending_${orderId}`,
        JSON.stringify({ invoiceId: target.id, amount: target.dueAmount, paymentMethod: "Card" })
      );
      window.location.href = redirectUrl;
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        toast.error("Online payment isn't connected yet. Ask your admin to configure a payment gateway in Finance Settings.");
      } else {
        console.error("Payment failed:", error);
        toast.error("Payment failed — please try again");
      }
    } finally {
      setPayingInvoiceId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!student?.id) return;
    setLoaded(false);
    (async () => {
      try {
        const all = await smartDb.getAll("Invoice");
        const mine = (all as any[]).filter(
          (inv) =>
            inv.studentId === student.id ||
            (student.name && inv.entity === student.name)
        );
        mine.sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
        if (!cancelled) setInvoices(mine);
      } catch {
        if (!cancelled) setInvoices([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student?.id, student?.name]);

  const hasReal = invoices.length > 0;
  const feeRows: FeeRow[] = invoices.map(invoiceToFeeRow);

  // KPIs + donut summary derive from the SAME rows the table renders, so they reconcile.
  const summary = useMemo(() => {
    const total = feeRows.reduce((a, r) => a + r.total, 0);
    const paid = feeRows.reduce((a, r) => a + r.paid, 0);
    const overdue = feeRows
      .filter((r) => r.status === "Overdue")
      .reduce((a, r) => a + r.pending, 0);
    const pending = feeRows.reduce((a, r) => a + r.pending, 0) - overdue;
    return { paid, pending, overdue, total };
  }, [feeRows]);

  const KPIS = [
    { label: "Total Fees",   value: bhd(summary.total),   action: "View Breakup",  bg: "bg-purple-50",  ic: "text-purple-600",  iconBg: "bg-purple-100",  icon: Wallet },
    { label: "Paid Fees",    value: bhd(summary.paid),    action: "View Payments", bg: "bg-amber-50",   ic: "text-amber-600",   iconBg: "bg-amber-100",   icon: CreditCard },
    { label: "Pending Fees", value: bhd(summary.pending), action: "Due Soon",      bg: "bg-emerald-50", ic: "text-emerald-600", iconBg: "bg-emerald-100", icon: Package },
    { label: "Overdue Fees", value: bhd(summary.overdue), action: "Overdue",       bg: "bg-rose-50",    ic: "text-rose-600",    iconBg: "bg-rose-100",    icon: AlertCircle },
  ];

  const upcomingDues = feeRows
    .filter((r) => r.status !== "Paid" && r.pending > 0)
    .slice(0, 4)
    .map((r) => ({ type: r.type, amount: r.pending, due: r.dueDate, invoice: r.invoice }));

  // Donut geometry
  const donutCirc = 2 * Math.PI * 40;
  const donutSegments = [
    { label: "Paid",    value: summary.paid,    color: "#10b981" },
    { label: "Pending", value: summary.pending, color: "#f59e0b" },
    { label: "Overdue", value: summary.overdue, color: "#ef4444" },
  ];
  let donutOffset = -90;

  const downloadLatestReceipt = () => {
    const paidRows = feeRows.filter((r) => r.status === "Paid");
    const latest = paidRows[paidRows.length - 1];
    if (!latest) {
      toast.info("No paid invoices yet to generate a receipt for.");
      return;
    }
    downloadReceipt(latest.invoice);
  };

  const quickActions = [
    { label: "Make a Payment",       icon: Wallet,    ic: "text-purple-600",  fn: () => payNow() },
    { label: "Download Fee Receipt", icon: Download,  ic: "text-purple-600",    fn: downloadLatestReceipt },
    { label: "Fee Structure",        icon: Layers,    ic: "text-emerald-600", fn: () => toast.info("Opening fee structure") },
    { label: "Payment Methods",      icon: CreditCard,ic: "text-amber-600",   fn: () => toast.info("Manage payment methods") },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fees</h1>
              <p className="text-sm text-slate-400 mt-0.5">Track your fee status, payments and download receipts.</p>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Academic Year</label>
            <select value={year} onChange={(e) => setYear(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-200">
              <option>2026-27</option>
              <option>2025-26</option>
              <option>2024-25</option>
            </select>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className={cn("rounded-2xl p-5 border border-slate-100 shadow-sm", k.bg)}>
              <div className="flex items-start justify-between">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", k.iconBg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <button onClick={() => toast.info(`${k.action} — ${k.label}`)}
                  className={cn("text-xs font-semibold hover:underline", k.ic)}>
                  {k.action}
                </button>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-4 leading-none">{k.value}</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* LEFT (3/4) */}
          <div className="lg:col-span-3 space-y-5">

            {/* Fee Details table */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">Fee Details</h3>
                {loaded && !hasReal && (
                  <span className="text-[11px] font-medium text-slate-400">
                    Sample data — no invoices on record yet.
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Fee Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Due Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Paid Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Pending Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {feeRows.map((r, idx) => (
                      <tr key={`${r.type}-${idx}`} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.type}</td>
                        <td className="px-4 py-3 text-slate-500">{r.dueDate}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">{bhd(r.total)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{bhd(r.paid)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{bhd(r.pending)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap", statusBadge(r.displayStatus))}>
                            {r.displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.status === "Paid" ? (
                              <button onClick={() => downloadReceipt(r.invoice)}
                                className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                                Receipt
                              </button>
                            ) : (
                              <button onClick={() => payNow(r.invoice)} disabled={payingInvoiceId === r.invoice.id}
                                className="h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors disabled:opacity-60">
                                {payingInvoiceId === r.invoice.id ? "Redirecting…" : "Pay Now"}
                              </button>
                            )}
                            {r.status === "Paid" && (
                              <button onClick={() => downloadReceipt(r.invoice)}
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">
                <p className="text-xs text-slate-500">Showing 1 to {feeRows.length} of {feeRows.length} items</p>
              </div>
            </div>

            {/* Payment History table */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm">Payment History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Payment ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Payment Method</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {feeRows.filter(r => r.status === "Paid").map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-3 text-slate-500">{r.dueDate}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">—</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.type}</td>
                        <td className="px-4 py-3 text-slate-600">—</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{bhd(r.paid)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">Success</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <button onClick={() => downloadReceipt(r.invoice)}
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {feeRows.filter(r => r.status === "Paid").length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-400">No payment history yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 flex justify-center">
                <button onClick={() => toast.info("Showing all payments")}
                  className="h-9 px-5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  View All Payments
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT (1/4) sidebar */}
          <div className="space-y-5">

            {/* Upcoming Dues */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Upcoming Dues</h3>
                <button onClick={() => toast.info("Showing all dues")}
                  className="text-xs text-purple-600 font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-3">
                {upcomingDues.length === 0 && (
                  <p className="text-xs text-slate-400 py-2">No upcoming dues.</p>
                )}
                {upcomingDues.map((d, i) => (
                  <div key={`${d.type}-${i}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{d.type}</p>
                      <p className="text-[10px] text-slate-400">Due {d.due}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-slate-900">{bhd(d.amount)}</p>
                      <button onClick={() => payNow(d.invoice)} disabled={payingInvoiceId === d.invoice.id}
                        className="mt-1 h-6 px-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-semibold transition-colors disabled:opacity-60">
                        {payingInvoiceId === d.invoice.id ? "…" : "Pay Now"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fee Summary donut */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Fee Summary</h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    {donutSegments.map((s, i) => {
                      const pct = summary.total > 0 ? s.value / summary.total : 0;
                      const dash = pct * donutCirc;
                      const seg = (
                        <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={s.color} strokeWidth="12"
                          strokeDasharray={`${dash} ${donutCirc - dash}`} transform={`rotate(${donutOffset} 50 50)`} />
                      );
                      donutOffset += pct * 360;
                      return seg;
                    })}
                    <circle cx="50" cy="50" r="30" fill="white" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold text-slate-900 leading-none">{bhd(summary.total)}</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">Total</span>
                  </div>
                </div>
                <div className="space-y-2.5 flex-1">
                  {[
                    { label: "Paid",    value: summary.paid,    dot: "bg-emerald-500" },
                    { label: "Pending", value: summary.pending, dot: "bg-amber-500" },
                    { label: "Overdue", value: summary.overdue, dot: "bg-rose-500" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", l.dot)} />
                      <span className="text-xs text-slate-600 flex-1">{l.label}</span>
                      <span className="text-xs font-semibold text-slate-800">{bhd(l.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="space-y-1">
                {quickActions.map((a, i) => (
                  <button key={i} onClick={a.fn}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                    <a.icon className={cn("h-4 w-4", a.ic)} />
                    <span className="text-xs font-medium text-slate-700 flex-1 text-left">{a.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
                  </button>
                ))}
              </div>
            </div>

            {/* Important Notes */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" /> Important Notes
              </h3>
              <ul className="space-y-2">
                {[
                  "Late payment may attract fine as per school policy.",
                  "Please ensure timely payment to avoid service interruption.",
                  "For any queries, contact the accounts office.",
                ].map((note) => (
                  <li key={note} className="flex items-start gap-2 text-xs text-slate-500 leading-snug">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
