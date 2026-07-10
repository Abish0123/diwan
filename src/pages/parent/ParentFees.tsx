import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CreditCard, CheckCircle, AlertTriangle, Download, Receipt, Wifi, Users2 } from "lucide-react";
import { Invoice, getInvoiceDisplayStatus, advanceLeadOnFeeInvoicePaid } from "@/hooks/useFees";
import { downloadInvoiceReceiptPdf } from "@/lib/invoiceReceiptPdf";
import { createPaymentSession, getPaymentTransaction, GatewayNotConfiguredError } from "@/lib/paymentGateway";
import { useAuth } from "@/hooks/useAuth";

interface FeeRecord {
  id: string; term: string; feeType: string; amount: number;
  dueDate: string; paidDate?: string;
  status: "Paid" | "Unpaid" | "Overdue" | "Partial";
  displayStatus: ReturnType<typeof getInvoiceDisplayStatus>;
  receipt?: string; invoiceNo: string;
  invoice: Invoice;
}

function statusMeta(s: string) {
  switch (s) {
    case "Paid":     return { cls:"bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "Unpaid":   return { cls:"bg-amber-50 text-amber-700 border-amber-200" };
    case "Overdue":  return { cls:"bg-rose-50 text-rose-700 border-rose-200" };
    case "Partial":  return { cls:"bg-blue-50 text-blue-700 border-blue-200" };
    case "Upcoming": return { cls:"bg-slate-100 text-slate-600 border-slate-200" };
    default:         return { cls:"bg-slate-100 text-slate-600 border-slate-200" };
  }
}

function mapInvoiceStatus(s: string): FeeRecord["status"] {
  if (!s) return "Unpaid";
  const low = s.toLowerCase();
  if (low === "paid") return "Paid";
  if (low === "overdue") return "Overdue";
  if (low === "partial") return "Partial";
  return "Unpaid";
}

function mapInvoice(inv: any): FeeRecord {
  return {
    id: inv.id,
    term: inv.term || inv.period || inv.category || "General",
    feeType: inv.description || inv.feeType || inv.category || inv.type || "Fee",
    amount: Number(inv.amount || inv.total || 0),
    dueDate: inv.dueDate || "—",
    paidDate: inv.paidAt || inv.paidDate || (inv.status?.toLowerCase() === "paid" ? inv.updatedAt : undefined),
    status: mapInvoiceStatus(inv.status),
    displayStatus: getInvoiceDisplayStatus(inv),
    invoiceNo: inv.invoiceNumber || inv.invoiceNo || inv.id,
    invoice: inv as Invoice,
  };
}

export default function ParentFees() {
  const { user } = useAuth();
  const { selected, loading } = useParentChildren();
  const [liveData, setLiveData] = useState<FeeRecord[] | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Fetch real invoices from DB — same table the admin Finance module writes to
  useEffect(() => {
    setLiveData(null);
    if (!selected) return;
    smartDb.getAll("Invoice").then((all: any[]) => {
      const mine = (all || []).filter((inv: any) =>
        inv.studentId === selected.id ||
        (selected.name && inv.entity === selected.name)
      );
      setLiveData(mine.map(mapInvoice));
    }).catch(() => {});
  }, [selected?.id, selected?.name]);

  const fees = liveData ?? [];

  const totalPaid = fees.filter(f=>f.status==="Paid").reduce((a,f)=>a+f.amount,0);
  const totalOwed = fees.filter(f=>f.status!=="Paid").reduce((a,f)=>a+f.amount,0);
  const overdue   = fees.filter(f=>f.status==="Overdue").length;

  // Marks the invoice paid the same way useFees.ts's collectFee does — that
  // hook isn't reusable here since it's scoped to a useFees() instance keyed
  // by the admin's uid, not this parent session.
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
    // a parent self-paying one of these invoices shouldn't leave the lead stuck.
    if (newStatus === "Paid") await advanceLeadOnFeeInvoicePaid(paidInvoice, paymentMethod);
    downloadInvoiceReceiptPdf(paidInvoice);
    toast.success("Payment received — receipt downloaded");
    setLiveData((prev) => prev?.map((f) => (f.id === invoice.id ? mapInvoice(paidInvoice) : f)) ?? prev);
  }

  // Handle the return-trip from the real PayTabs hosted checkout page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    if (!orderId || params.get("payment") !== "1" || !liveData) return;
    (async () => {
      const pendingRaw = sessionStorage.getItem(`parent_fee_pending_${orderId}`);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      window.history.replaceState({}, "", window.location.pathname);
      if (!pending) return;
      try {
        const tx = await getPaymentTransaction(orderId);
        if (tx.status !== "A") {
          toast.error(`Payment ${tx.status === "pending" ? "was not completed" : `failed (status: ${tx.status})`} — nothing was charged.`);
          sessionStorage.removeItem(`parent_fee_pending_${orderId}`);
          return;
        }
        const rec = liveData.find((f) => f.id === pending.invoiceId);
        if (rec) await finalizeInvoicePayment(rec.invoice, pending.amount, pending.paymentMethod);
        sessionStorage.removeItem(`parent_fee_pending_${orderId}`);
      } catch (err) {
        console.error("Failed to verify payment:", err);
        toast.error("Could not verify payment status — please contact Finance if you were charged.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData !== null]);

  const handlePay = async (f: FeeRecord) => {
    setPayingId(f.id);
    const orderId = `PFEE-${Date.now()}`;
    try {
      const returnUrl = `${window.location.origin}/parent/fees?payment=1&orderId=${orderId}`;
      const { redirectUrl } = await createPaymentSession({
        amount: f.amount,
        currency: "QAR",
        description: `Fee payment — ${f.invoiceNo}`,
        customerName: selected?.name,
        customerEmail: user?.email,
        orderId,
        returnUrl,
      });
      sessionStorage.setItem(
        `parent_fee_pending_${orderId}`,
        JSON.stringify({ invoiceId: f.id, amount: f.amount, paymentMethod: "Card" })
      );
      window.location.href = redirectUrl;
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        toast.error("Online payment isn't connected yet. Ask the school to configure a payment gateway in Finance Settings.");
      } else {
        console.error("Payment failed:", error);
        toast.error("Payment failed — please try again");
      }
    } finally {
      setPayingId(null);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fees &amp; Finance</h1>
              <p className="text-sm text-slate-400">{selected.name} — Payment history and outstanding dues</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Total Paid",     value:`QAR ${totalPaid.toLocaleString()}`, icon: CheckCircle,    color:"text-emerald-600 bg-emerald-50" },
            { label:"Outstanding",    value:`QAR ${totalOwed.toLocaleString()}`, icon: CreditCard,     color: totalOwed>0?"text-rose-600 bg-rose-50":"text-emerald-600 bg-emerald-50" },
            { label:"Overdue Items",  value: overdue,                            icon: AlertTriangle,  color: overdue>0?"text-rose-600 bg-rose-50":"text-emerald-600 bg-emerald-50" },
            { label:"Total Invoices", value: fees.length,                        icon: Receipt,        color:"text-purple-600 bg-violet-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-xs border",
          fees.length > 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-amber-50 border-amber-200 text-amber-700")}>
          {fees.length > 0 ? <Wifi className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
          {fees.length > 0
            ? "Live fee data from school finance system. Pay Now redirects to secure payment gateway."
            : "No invoices found yet for this student."}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Fee Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Invoice</th>
                  <th className="px-4 py-3 text-left">Term</th>
                  <th className="px-4 py-3 text-left">Fee Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Due Date</th>
                  <th className="px-4 py-3 text-center">Paid Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fees.length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-slate-400">No invoices found.</td></tr>
                )}
                {fees.map(f => {
                  const meta = statusMeta(f.displayStatus);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.invoiceNo}</td>
                      <td className="px-4 py-3 text-slate-700">{f.term}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{f.feeType}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">QAR {f.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">{f.dueDate}</td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">{f.paidDate || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", meta.cls)}>{f.displayStatus}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {f.status === "Paid" ? (
                          <button onClick={() => {
                            downloadInvoiceReceiptPdf(f.invoice);
                            toast.success(`Receipt downloaded — ${f.invoiceNo}`);
                          }}
                            className="text-xs text-purple-600 hover:underline flex items-center gap-1 mx-auto">
                            <Download className="w-3.5 h-3.5" /> Receipt
                          </button>
                        ) : (
                          <button onClick={() => handlePay(f)} disabled={payingId === f.id}
                            className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                            {payingId === f.id ? "Redirecting…" : "Pay Now"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={3} className="px-4 py-3 font-bold text-slate-900 text-right">Total Outstanding:</td>
                  <td className="px-4 py-3 text-right font-black text-rose-600">QAR {totalOwed.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
