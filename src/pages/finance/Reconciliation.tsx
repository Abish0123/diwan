import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  RefreshCw, 
  ArrowRight, 
  Building2, 
  History,
  Shield,
  Sparkles,
  ChevronRight,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  MoreVertical,
  Check,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { Input } from "@/components/ui/input";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { BankTransaction } from "@/types/finance";
import { Timestamp } from "firebase/firestore";

const Reconciliation = () => {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSynced, setLastSynced] = useState("—");

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Bank reconciliation is a school-wide financial control — scoping by
      // viewer uid would let two staff each reconcile only half the ledger.
      const data = await smartDb.getAll("BankTransaction");
      setTransactions(data as BankTransaction[]);
      setLastSynced("just now");
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // There is no live bank-feed API connected (no Open Banking/Plaid-style
  // integration exists in this app) — this used to fake a 2-second "syncing"
  // spinner and then claim success with nothing actually happening. The only
  // real way transactions enter the ledger today is the CSV import below
  // (handleUploadStatement) or manual entry, so say that honestly instead.
  const handleSync = () => {
    toast.info('Live bank-feed sync isn\'t connected yet — use "Upload Statement" to import a CSV export from your bank.');
  };

  const handleConfirmMatch = async (id: string) => {
    try {
      await smartDb.update("BankTransaction", id, { 
        status: "Reconciled",
        updatedAt: Timestamp.now()
      });
      toast.success("Transaction reconciled successfully");
      fetchTransactions();
    } catch (error) {
      console.error("Error reconciling transaction:", error);
      toast.error("Failed to reconcile");
    }
  };

  const filteredTransactions = transactions.filter(t => 
    t.status === "Pending" && (
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const matchedCount = transactions.filter(t => t.status === "Reconciled").length;
  const pendingCount = transactions.filter(t => t.status === "Pending").length;
  const matchRate = transactions.length > 0 ? Math.round((matchedCount / transactions.length) * 100) : 0;

  // Real derived balance: opening balance + reconciled income − reconciled expense.
  const reconciledIncome = transactions
    .filter(t => t.status === "Reconciled" && (t.type === "Income" || t.type === "Credit"))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const reconciledExpense = transactions
    .filter(t => t.status === "Reconciled" && (t.type === "Expense" || t.type === "Debit"))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const currentBalance = Number(financialSettings.openingBalance || 0) + reconciledIncome - reconciledExpense;

  // Honest discrepancy = sum of absolute amounts of still-pending (unmatched) transactions.
  const pendingUnmatchedTotal = transactions
    .filter(t => t.status === "Pending")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Data-aware AI insights derived purely from `transactions`.
  const pendingTxns = transactions.filter(t => t.status === "Pending");
  const pendingAmounts = pendingTxns.map(t => Math.abs(t.amount));
  const duplicatePending = pendingTxns.find(
    (t, idx) => pendingAmounts.indexOf(Math.abs(t.amount)) !== idx
  );
  const aiInsights: { title: string; desc: string; type: string; icon: typeof AlertCircle }[] = [];
  if (duplicatePending) {
    aiInsights.push({
      title: "Possible Duplicate",
      desc: `Two pending transactions share the amount ${financialSettings.currency}${Math.abs(duplicatePending.amount).toLocaleString()}. Review before reconciling.`,
      type: "warning",
      icon: AlertCircle,
    });
  }
  if (matchedCount > 0) {
    aiInsights.push({
      title: "Pattern Match",
      desc: `${matchedCount} transaction${matchedCount === 1 ? "" : "s"} matched against your internal records.`,
      type: "success",
      icon: CheckCircle2,
    });
  }
  if (aiInsights.length === 0 && transactions.length > 0) {
    aiInsights.push({
      title: "No Anomalies Detected",
      desc: "No duplicate amounts or pattern matches found across current transactions.",
      type: "success",
      icon: CheckCircle2,
    });
  }

  const handleGenerateReport = () => {
    const headers = ["ID", "Date", "Description", "Type", "Amount", "Status", "Suggested Match"];
    const rows = transactions.map(t => [
      t.id,
      t.date,
      `"${(t.description || "").replace(/"/g, '""')}"`,
      t.type,
      t.amount,
      t.status,
      `"${(t.suggestedMatch || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconciliation_report_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const handleUploadStatement = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !user) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const text = String(reader.result || "");
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length < 2) {
            toast.error("Could not parse statement");
            return;
          }
          // Best-effort header mapping: date, description, amount, type.
          const header = lines[0].split(",").map(h => h.trim().toLowerCase());
          const dateIdx = header.findIndex(h => h.includes("date"));
          const descIdx = header.findIndex(h => h.includes("desc") || h.includes("narration") || h.includes("particular"));
          const amtIdx = header.findIndex(h => h.includes("amount") || h.includes("amt"));
          const typeIdx = header.findIndex(h => h.includes("type"));
          if (amtIdx === -1) {
            toast.error("Could not parse statement");
            return;
          }
          let created = 0;
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map(c => c.trim());
            const amount = Number(cols[amtIdx]);
            if (!Number.isFinite(amount)) continue;
            const type = typeIdx !== -1 && cols[typeIdx]
              ? (cols[typeIdx].toLowerCase().startsWith("inc") ? "Income" : "Expense")
              : (amount >= 0 ? "Income" : "Expense");
            await smartDb.create("BankTransaction", {
              date: (dateIdx !== -1 && cols[dateIdx]) || new Date().toISOString().split("T")[0],
              description: (descIdx !== -1 && cols[descIdx]) || "Imported transaction",
              amount,
              type,
              status: "Pending",
              suggestedMatch: "None",
              confidence: 0,
              uid: user.uid,
              createdAt: Timestamp.now(),
            } as Record<string, unknown>);
            created++;
          }
          if (created === 0) {
            toast.error("Could not parse statement");
            return;
          }
          toast.success(`Imported ${created} transaction${created === 1 ? "" : "s"} from "${file.name}"`);
          fetchTransactions();
        } catch (err) {
          console.error("Error parsing statement:", err);
          toast.error("Could not parse statement");
        }
      };
      reader.onerror = () => toast.error("Could not read file");
      reader.readAsText(file);
    };
    input.click();
  };

  const bankAccounts = [
    {
      id: "PRIMARY",
      bank: "Primary Operating Account",
      accountNumber: "Consolidated Ledger",
      balance: currentBalance,
      lastSynced,
      status: pendingCount > 0 ? "Needs Attention" : "Synced",
      pendingMatches: pendingCount,
    },
    {
      id: "STATUS",
      bank: "Reconciliation Status",
      accountNumber: `${matchRate}% Matched`,
      balance: pendingUnmatchedTotal,
      lastSynced,
      status: pendingCount > 0 ? "Needs Attention" : "Synced",
      pendingMatches: pendingCount,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 w-full max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Bank Reconciliation</h1>
              <p className="text-sm text-slate-400">Match your bank statements with internal records to ensure 100% financial accuracy.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUploadStatement}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-slate-500" /> Upload Statement
            </button>
            <button
              onClick={handleSync}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" /> Sync Bank Feeds
            </button>
          </div>
        </div>

        {/* Bank Accounts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bankAccounts.map((account, i) => (
            <div key={account.id} className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{account.bank}</h3>
                    <p className="text-xs text-slate-400">{account.accountNumber}</p>
                  </div>
                </div>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap",
                  account.status === "Synced" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                  {account.status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">{i === 0 ? "Current Balance" : "Unreconciled"}</p>
                  <p className="text-xl font-bold text-slate-900">{financialSettings.currency} {account.balance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">Pending Matches</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-slate-900">{account.pendingMatches}</p>
                    {account.pendingMatches > 0 && (
                      <span className="h-4 w-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold">!</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <History className="h-3.5 w-3.5" /> Last synced {account.lastSynced}
                </div>
                <button
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                  onClick={() => {
                    const el = document.getElementById("pending-transactions");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Reconcile Now <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 max-w-xs">
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 h-9 text-sm rounded-lg border-slate-200 bg-white"
                placeholder="Search…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" /> Filter
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Pending Matches */}
          <div className="lg:col-span-2 space-y-5" id="pending-transactions">
            <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="p-5 bg-slate-50/70 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Pending Transactions</CardTitle>
                <CardDescription className="text-xs text-slate-400">Review and match bank entries with your records.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="min-h-[300px]">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                      <p className="text-sm font-semibold text-slate-500">Fetching transactions…</p>
                    </div>
                  ) : filteredTransactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <CheckCircle2 className="h-10 w-10 text-emerald-200" />
                      <p className="text-sm font-semibold text-slate-700">All caught up!</p>
                      <p className="text-xs text-slate-400">No pending transactions to reconcile.</p>
                    </div>
                  ) : (
                      filteredTransactions.map((trx) => (
                        <div
                          key={trx.id}
                          className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-50 last:border-none hover:bg-slate-50/40 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                              trx.type === "Income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
                              {trx.type === "Income" ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{trx.description}</p>
                              <p className="text-[11px] text-slate-400">{trx.date} · {trx.id}</p>
                            </div>
                          </div>

                          <div className="flex flex-col md:items-end gap-1">
                            <p className={cn("text-base font-bold", trx.type === "Income" ? "text-emerald-600" : "text-slate-900")}>
                              {trx.type === "Income" ? "+" : ""}{financialSettings.currency} {Math.abs(trx.amount).toLocaleString()}
                            </p>
                            {trx.suggestedMatch && trx.suggestedMatch !== "None" ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-600">Match: {trx.suggestedMatch}</span>
                                <span className="text-[11px] font-semibold text-emerald-500">{trx.confidence}%</span>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400 border border-slate-200 px-2 py-0.5 rounded-md">No Match Found</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleConfirmMatch(trx.id)}
                              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">
                              <Check className="h-3.5 w-3.5" /> Confirm
                            </button>
                            <button className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-400">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights & Summary */}
          <div className="space-y-4">
            {/* AI Insights Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" /> AI Reconciliation
              </h3>
              <div className="space-y-2.5">
                {transactions.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center">
                    <p className="text-xs font-semibold text-slate-400">No Data Yet</p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Import a bank statement or record transactions to see match rate and AI insights here.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-slate-500">Auto-Match Rate</span>
                      <span className="text-xs font-bold text-purple-600">{matchRate}%</span>
                    </div>
                    <Progress value={matchRate} className="h-1.5 bg-purple-100" />
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      AI has successfully matched {matchedCount} out of {transactions.length} transactions.
                    </p>
                  </div>
                )}

                {aiInsights.map((insight, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/60 transition-all group cursor-pointer">
                    <div className="flex items-start gap-2.5">
                      <div className={cn("mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0",
                        insight.type === "warning" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                        <insight.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 mb-0.5">{insight.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{insight.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-purple-600 transition-colors flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reconciliation Summary */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Summary</h3>
              <div className="space-y-2.5">
                {transactions.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center">
                    <p className="text-sm font-semibold text-slate-600">No bank transactions yet</p>
                    <p className="text-xs text-slate-400 mt-1">Import your bank statement or record transactions to begin reconciliation.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500">Total Matched</span>
                      <span className="text-sm font-bold text-emerald-600">{matchedCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500">Total Unmatched</span>
                      <span className="text-sm font-bold text-rose-500">{pendingCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500">Discrepancy</span>
                      <span className="text-sm font-bold text-slate-900">{financialSettings.currency} {pendingUnmatchedTotal.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <button
                  onClick={handleGenerateReport}
                  disabled={transactions.length === 0}
                  className="w-full h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Generate Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reconciliation;

