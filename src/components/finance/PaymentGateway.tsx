import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Lock, CheckCircle2, Loader2, ArrowLeft, Building2, Smartphone, Wallet, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createPaymentSession, GatewayNotConfiguredError } from "@/lib/paymentGateway";

interface PaymentGatewayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  // Shows a "Pay Cash at School Counter" option alongside card/bank/Apple Pay —
  // relevant for the admissions payment step (parents can pay in person),
  // off by default so existing staff-facing usage (Fees Management's own
  // Online Payments collector) is unaffected.
  allowCashOption?: boolean;
  // Where PayTabs should send the browser back to after a real card checkout.
  // Defaults to the current path. The caller is responsible for detecting the
  // `?payment=1&orderId=...` return params on mount and verifying the
  // transaction via getPaymentTransaction() — see student/parent Fees.tsx for
  // the reference implementation.
  returnPath?: string;
  // Fired with the generated orderId right before the browser redirects to
  // PayTabs, so the caller can stash whatever context (invoice id, lead id…)
  // it needs to finalize the payment when the browser comes back.
  onBeforeCardRedirect?: (orderId: string) => void;
  onSuccess?: (payment: {
    studentName?: string;
    amount: number;
    currency: string;
    invoiceNumber?: string;
    method: string;
    txnRef: string;
  }) => void;
}

type PaymentMethod = "card" | "bank" | "apple_pay" | "cash_counter" | null;
type Step = "method" | "bank" | "cash" | "redirecting" | "success";

function generateTxnRef() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `REF-${today}-${rand}`;
}

export const PaymentGateway = ({
  open,
  onOpenChange,
  studentName,
  amount = 0,
  currency = "QAR",
  invoiceNumber,
  allowCashOption = false,
  returnPath,
  onBeforeCardRedirect,
  onSuccess,
}: PaymentGatewayProps) => {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod>(null);
  const [txnRef] = useState(generateTxnRef);
  const [ibanName, setIbanName] = useState("");
  const [ibanBank, setIbanBank] = useState("");

  const formattedAmount = `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 3 })}`;

  function handleClose() {
    onOpenChange(false);
    setTimeout(() => {
      setStep("method");
      setMethod(null);
      setIbanName("");
      setIbanBank("");
    }, 300);
  }

  function handleSelectMethod(m: PaymentMethod) {
    setMethod(m);
    if (m === "card") handleCardPay();
    else if (m === "bank") setStep("bank");
    else if (m === "cash_counter") setStep("cash");
    else if (m === "apple_pay") {
      // Apple Pay — will trigger native sheet when API is wired; UI placeholder for now
      toast.info("Apple Pay integration coming soon — keys will be configured shortly.");
    }
  }

  // Cash has no online transaction to process — it's a declaration that the
  // parent will pay in person, so it skips straight to a confirmation state
  // instead of a fake "processing" delay.
  function handleCashConfirm() {
    setStep("success");
    onSuccess?.({
      studentName,
      amount,
      currency,
      invoiceNumber,
      method: "cash_counter",
      txnRef,
    });
  }

  // Real PayTabs Hosted Payment Page — no card number/CVV is ever collected
  // in-app (this used to render its own card form and fake-charge it after a
  // setTimeout, which is both dishonest and a PCI liability). The browser is
  // handed off to PayTabs' own hosted checkout, matching the pattern already
  // used by student/parent Fees.tsx.
  async function handleCardPay() {
    if (amount <= 0) {
      toast.error("No amount due — nothing to charge.");
      setStep("method");
      return;
    }
    setStep("redirecting");
    try {
      const orderId = `PMT-${Date.now()}`;
      onBeforeCardRedirect?.(orderId);
      const path = returnPath || window.location.pathname;
      const returnUrl = `${window.location.origin}${path}${path.includes("?") ? "&" : "?"}payment=1&orderId=${orderId}`;
      const { redirectUrl } = await createPaymentSession({
        amount,
        currency,
        description: invoiceNumber ? `Invoice ${invoiceNumber}` : studentName ? `Fee payment — ${studentName}` : "Fee payment",
        customerName: studentName,
        orderId,
        returnUrl,
      });
      window.location.href = redirectUrl;
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        toast.error("Online card payment isn't connected yet. Ask your admin to configure PayTabs in Finance Settings.");
      } else {
        console.error("Payment session failed:", error);
        toast.error("Could not start payment — please try again.");
      }
      setStep("method");
    }
  }

  // Bank transfer is a declared intent to pay, not a verified charge — there
  // is no real bank-transfer gateway wired up, so it goes straight to a
  // confirmation state honestly instead of a fake multi-second "processing".
  function handleBankTransfer() {
    if (!ibanName.trim()) {
      toast.error("Account holder name is required.");
      return;
    }
    setStep("success");
    onSuccess?.({
      studentName,
      amount,
      currency,
      invoiceNumber,
      method: "bank_transfer",
      txnRef,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-2xl gap-0">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#00704A]/10 via-background to-background px-6 pt-6 pb-3">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-[#00704A] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <DialogTitle className="text-base font-bold tracking-tight">
                {step === "method" && "Select Payment Method"}
                {step === "bank" && "Bank Transfer"}
                {step === "cash" && "Pay at Counter"}
                {step === "redirecting" && "Redirecting to Secure Checkout"}
                {step === "success" && "Payment Confirmed"}
              </DialogTitle>
            </div>
            {studentName && (
              <p className="text-sm text-muted-foreground pl-9">
                {studentName}
                {invoiceNumber && (
                  <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded font-mono">#{invoiceNumber}</span>
                )}
              </p>
            )}
          </DialogHeader>

          {(step === "method" || step === "bank" || step === "cash") && (
            <div className="mt-4 flex items-center justify-between bg-white/60 border border-border rounded-xl px-4 py-2.5">
              <span className="text-xs text-muted-foreground font-medium">Amount Due</span>
              <span className="text-2xl font-black text-foreground">{formattedAmount}</span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3">

          {/* ── Step: Choose Method ── */}
          {step === "method" && (
            <div className="space-y-2.5">

              {/* Card — real PayTabs Hosted Payment Page redirect */}
              <button
                onClick={() => handleSelectMethod("card")}
                className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-[#00704A]/60 hover:shadow-md hover:bg-[#00704A]/5 transition-all p-4 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#00704A]/10 flex items-center justify-center shrink-0 group-hover:bg-[#00704A]/20 transition-colors">
                    <CreditCard className="w-5 h-5 text-[#00704A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">Card Payment</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#00704A]/10 text-[#00704A]">PayTabs</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Visa · Mastercard · NAPS (domestic)</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {/* Card logos */}
                      <div className="h-5 px-1.5 rounded bg-[#1a1f71] flex items-center"><span className="text-white text-[9px] font-black tracking-tight">VISA</span></div>
                      <div className="h-5 px-1 rounded bg-white border border-border flex items-center gap-0.5">
                        <div className="w-3 h-3 rounded-full bg-[#eb001b] opacity-90" />
                        <div className="w-3 h-3 rounded-full bg-[#f79e1b] -ml-1.5 opacity-90" />
                      </div>
                      <div className="h-5 px-1.5 rounded bg-[#8b1a1a] flex items-center"><span className="text-white text-[9px] font-bold">NAPS</span></div>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Bank Transfer — manual declaration, confirmed by Finance */}
              <button
                onClick={() => handleSelectMethod("bank")}
                className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-[#00704A]/60 hover:shadow-md hover:bg-[#00704A]/5 transition-all p-4 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#00704A]/10 flex items-center justify-center shrink-0 group-hover:bg-[#00704A]/20 transition-colors">
                    <Building2 className="w-5 h-5 text-[#00704A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-sm text-foreground">Bank Transfer</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Direct bank-to-bank · All Qatar banks</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">QNB · CBQ · Doha Bank · Al Rayan</p>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Apple Pay */}
              <button
                onClick={() => handleSelectMethod("apple_pay")}
                className="w-full text-left rounded-xl border-2 border-border bg-black hover:border-white/30 hover:shadow-md transition-all p-4 group relative overflow-hidden"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {/* Apple Pay wordmark */}
                      <svg viewBox="0 0 60 24" className="h-5" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.05 3.82c-.74.87-1.93 1.56-3.1 1.46-.15-1.17.43-2.42 1.11-3.19C9.82 1.22 11.11.57 12.14.5c.13 1.21-.35 2.41-1.09 3.32zm1.08 1.71c-1.71-.1-3.17.97-3.98.97-.82 0-2.06-.92-3.41-.89-1.76.03-3.39 1.02-4.29 2.6-1.83 3.17-.48 7.87 1.3 10.45.87 1.27 1.91 2.68 3.28 2.63 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.42-.02 2.3-1.27 3.17-2.55.99-1.45 1.4-2.86 1.42-2.93-.03-.02-2.73-1.05-2.76-4.18-.03-2.61 2.13-3.86 2.23-3.93-.97-1.52-2.61-2.11-3.71-2.15zm9.51-3.41v18.24h2.83V15.1h3.91c3.57 0 6.07-2.45 6.07-5.99 0-3.54-2.45-5.99-5.97-5.99h-6.84zm2.83 2.38h3.25c2.45 0 3.85 1.3 3.85 3.62 0 2.32-1.4 3.63-3.86 3.63h-3.24V4.5zm15.08 15.97c1.77 0 3.41-.9 4.15-2.32h.06v2.18h2.62V11.1c0-2.63-2.1-4.33-5.33-4.33-3 0-5.22 1.72-5.3 4.09h2.55c.21-1.12 1.24-1.86 2.68-1.86 1.73 0 2.7.81 2.7 2.29v1l-3.53.21c-3.28.2-5.05 1.54-5.05 3.87 0 2.35 1.83 3.9 4.45 3.9zm.76-2.14c-1.51 0-2.47-.72-2.47-1.83 0-1.15.92-1.81 2.68-1.91l3.14-.19v1.02c0 1.69-1.43 2.91-3.35 2.91zm10.81 6.94c2.76 0 4.06-1.05 5.19-4.25l4.97-13.93H58.9l-3.14 10.14h-.06l-3.14-10.14h-2.98l4.81 13.33-.26.81c-.43 1.36-1.13 1.88-2.38 1.88-.22 0-.65-.02-.82-.05v2.14c.16.05.85.07 1.07.07z"/>
                      </svg>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/15 text-white/80">Touch / Face ID</span>
                    </div>
                    <p className="text-xs text-white/60 mt-0.5">Pay instantly with your Apple device</p>
                  </div>
                  <svg className="w-4 h-4 text-white/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Cash at School Counter */}
              {allowCashOption && (
                <button
                  onClick={() => handleSelectMethod("cash_counter")}
                  className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-amber-400/60 hover:shadow-md hover:bg-amber-50 transition-all p-4 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
                      <Wallet className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm text-foreground">Pay Cash at School Counter</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Visit the Admissions office and pay in person</p>
                    </div>
                    <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              )}

              {/* Security note */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Card payments secured by PayTabs · PCI DSS Level 1</span>
              </div>
            </div>
          )}

          {/* ── Step: Cash at Counter ── */}
          {step === "cash" && (
            <div className="space-y-4 mt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                <Wallet className="w-4 h-4 text-amber-700" />
                <span className="text-xs text-amber-800 font-medium">Pay in person at the school counter</span>
              </div>

              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-2.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Bring This Reference</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Reference</span>
                    <span className="font-mono font-bold text-foreground text-xs">{invoiceNumber ?? txnRef}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Amount Due</span>
                    <span className="font-bold text-foreground text-xs">{formattedAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Where</span>
                    <span className="font-semibold text-foreground text-xs">Admissions Office Counter</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-[11px] text-amber-700 font-medium">
                  Your application stays on hold until payment is received and confirmed by the Finance team at the counter.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("method")} className="flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </Button>
                <Button className="flex-1 font-semibold bg-amber-600 hover:bg-amber-700 text-white" onClick={handleCashConfirm}>
                  I'll Pay in Cash
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Bank Transfer ── */}
          {step === "bank" && (
            <div className="space-y-4 mt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#00704A]/8 border border-[#00704A]/20">
                <Building2 className="w-4 h-4 text-[#00704A]" />
                <span className="text-xs text-[#00704A] font-medium">Manual bank transfer · Qatar</span>
              </div>

              {/* School bank details (to be replaced with real details once configured) */}
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 space-y-2.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Transfer To</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Account Name</span>
                    <span className="font-semibold text-foreground text-xs">Blue Wood School</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Bank</span>
                    <span className="font-semibold text-foreground text-xs">Qatar National Bank (QNB)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">IBAN</span>
                    <span className="font-mono font-semibold text-foreground text-xs">QA — Configure in Settings</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Reference</span>
                    <span className="font-mono font-bold text-foreground text-xs">{invoiceNumber ?? txnRef}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Amount</span>
                    <span className="font-bold text-foreground text-xs">{formattedAmount}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ibanName" className="text-xs font-medium">Your Name (sender account)</Label>
                <Input
                  id="ibanName"
                  placeholder="Full name on your bank account"
                  value={ibanName}
                  onChange={(e) => setIbanName(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ibanBank" className="text-xs font-medium">Your Bank (optional)</Label>
                <Input
                  id="ibanBank"
                  placeholder="e.g. QNB, CBQ, Doha Bank"
                  value={ibanBank}
                  onChange={(e) => setIbanBank(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-[11px] text-amber-700 font-medium">
                  Transfer within 24 hours and use the reference <span className="font-mono font-bold">{invoiceNumber ?? txnRef}</span>. Payment will be confirmed once received.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("method")} className="flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </Button>
                <Button className="flex-1 font-semibold bg-[#00704A] hover:bg-[#005c3b] text-white" onClick={handleBankTransfer}>
                  Confirm Transfer
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Redirecting to PayTabs ── */}
          {step === "redirecting" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-[#00704A]/20 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#00704A] animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-base text-foreground">Opening secure checkout…</p>
                <p className="text-xs text-muted-foreground">You'll be redirected to PayTabs to enter your card details</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60">
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Secured by PayTabs · PCI DSS Level 1</span>
              </div>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center py-6 gap-4">
              <div className="w-20 h-20 rounded-full bg-[#00704A]/10 flex items-center justify-center animate-in zoom-in-50 duration-300">
                <CheckCircle2 className="w-10 h-10 text-[#00704A]" />
              </div>

              <div className="text-center">
                <h3 className="text-xl font-black text-foreground">
                  {method === "bank" ? "Transfer Registered!" : "Noted — Pay at the Counter"}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {method === "bank"
                    ? "We'll confirm once funds are received."
                    : "Bring the reference below to the school counter."}
                </p>
              </div>

              <div className="w-full rounded-xl border border-border bg-muted/40 divide-y divide-border text-sm">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground text-xs">Reference</span>
                  <span className="font-mono font-semibold text-foreground text-xs">{txnRef}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground text-xs">Amount</span>
                  <span className="font-bold text-foreground text-xs">{formattedAmount}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground text-xs">Method</span>
                  <span className="font-medium text-foreground text-xs">
                    {method === "cash_counter" ? "Cash at Counter" : "Bank Transfer"}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-muted-foreground text-xs">Student</span>
                  <span className="font-medium text-foreground text-xs">{studentName ?? "—"}</span>
                </div>
              </div>

              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => {
                    const lines = [
                      "=== PAYMENT RECEIPT ===",
                      `Reference: ${txnRef}`,
                      `Amount: ${formattedAmount}`,
                      `Student: ${studentName ?? "N/A"}`,
                      `Invoice: ${invoiceNumber ?? "N/A"}`,
                      `Method: ${method === "cash_counter" ? "Cash at Counter" : "Bank Transfer"}`,
                      `Date: ${new Date().toLocaleString()}`,
                      `Status: Pending Confirmation`,
                    ].join("\n");
                    const blob = new Blob([lines], { type: "text/plain" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `receipt-${txnRef}.txt`;
                    a.click();
                    toast.success("Receipt downloaded");
                  }}
                >
                  Download Receipt
                </Button>
                <Button className="flex-1 font-semibold bg-[#00704A] hover:bg-[#005c3b] text-white text-xs" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
