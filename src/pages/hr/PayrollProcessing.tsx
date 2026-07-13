import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Search,
  Filter,
  MoreVertical,
  Calendar,
  DollarSign,
  CheckCircle2,
  FileText,
  Download,
  ArrowUpRight,
  History,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Trash2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { handleFirestoreError, OperationType } from "@/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useHRSettings } from "@/contexts/HRSettingsContext";
import { PayrollSlipDialog } from "@/components/finance/PayrollSlipDialog";
import { PayrollRecord } from "@/types/hr";
import { smartDb } from "@/lib/localDb";

const PayrollProcessing = () => {
  const { user } = useAuth();
  const hrSettings = useHRSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [isSlipOpen, setIsSlipOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    // Payroll is a school-wide HR resource (the page is admin-RBAC-gated already).
    // PayrollRecord.uid stamps whichever admin created the row, so scoping the
    // watch to the viewer's own uid hid every colleague-created entry.
    const unsubscribe = smartDb.watch("payroll", undefined, (data) => {
      setPayroll(data as PayrollRecord[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Real Staff Attendance -> Payroll link — previously staff attendance was
  // a genuine log with zero downstream effect on payroll. Computes real
  // absence counts per staff member for their payroll period, from the
  // same real "attendance" entity Attendance.tsx writes to (rows carry
  // entityType "staff"/"student" and entityId, not a staffId field).
  const [attendanceRows, setAttendanceRows] = useState<{ entityType?: string; entityId?: string; status?: string; date?: string }[]>([]);
  useEffect(() => {
    smartDb.getAll("attendance", undefined).then((rows) => {
      setAttendanceRows((rows as typeof attendanceRows).filter(r => r.entityType === "staff"));
    }).catch(() => setAttendanceRows([]));
  }, []);

  // "July 2026" -> [start, end] of that real month, matching the exact
  // format StaffOnboarding.tsx stamps onto every payroll record's period.
  const periodBounds = (period: string): [Date, Date] | null => {
    const parsed = new Date(`1 ${period}`);
    if (isNaN(parsed.getTime())) return null;
    const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
    return [start, end];
  };
  const absentDaysFor = (p: PayrollRecord): number | null => {
    const staffId = (p as any).staffId;
    if (!staffId) return null;
    const bounds = periodBounds(p.period);
    if (!bounds) return null;
    const [start, end] = bounds;
    return attendanceRows.filter(r => {
      if (r.entityId !== staffId || r.status !== "Absent" || !r.date) return false;
      const d = new Date(r.date);
      return d >= start && d <= end;
    }).length;
  };

  // Processing payroll used to only flip the record's own status to "Paid" —
  // the actual payout never created a real Expense/ledger entry, so Finance
  // only ever saw it via Budgeting.tsx fuzzy-matching category names like
  // "Payroll & Benefits" against the raw payroll records. That broke the
  // moment a category got renamed, and never produced anything reconcilable
  // in the Expense ledger itself. Every processed entry now also creates a
  // real Expense (category "Payroll & Benefits", sourceType "Payroll") —
  // deterministic id keeps this idempotent if a payroll row is ever
  // re-processed.
  const recordPayrollExpense = async (p: PayrollRecord, paidDate: string) => {
    const expenseId = `expense-payroll-${p.id}`;
    await smartDb.create("Expense", {
      category: "Payroll & Benefits",
      amount: p.netSalary ?? p.amount ?? 0,
      status: "Paid",
      date: paidDate.split("T")[0],
      description: `Payroll — ${p.staffName || p.staff || p.staffId} — ${p.period}`,
      sourceType: "Payroll",
      sourceId: p.id,
      uid: user?.uid,
      createdAt: paidDate,
    }, expenseId).catch(() => {});
  };

  const handleProcessAll = async () => {
    const pending = payroll.filter(p => p.status === "Pending");
    if (pending.length === 0) {
      toast.info("No pending payroll entries to process");
      return;
    }

    setIsProcessing(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        pending.map(p =>
          smartDb.update("payroll", p.id, {
            status: "Paid",
            paidDate: now,
            paymentDate: now.split("T")[0],
          })
        )
      );
      await Promise.all(pending.map(p => recordPayrollExpense(p, now)));
      toast.success(`Successfully processed ${pending.length} payroll entries`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "payroll");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessSingle = async (id: string) => {
    try {
      const now = new Date().toISOString();
      const record = payroll.find(p => p.id === id);
      await smartDb.update("payroll", id, {
        status: "Paid",
        paidDate: now,
        paymentDate: now.split("T")[0],
      });
      if (record) await recordPayrollExpense(record, now);
      toast.success("Payroll entry processed successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "payroll");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await smartDb.delete("payroll", id);
      toast.success("Payroll entry deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "payroll");
    }
  };

  const filteredPayroll = payroll.filter(p => {
    const matchesSearch = (p.staffName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.id || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = useMemo(() => {
    const totalNet = payroll.reduce((acc, curr) => acc + (curr.netSalary || curr.amount || 0), 0);
    const totalAllowances = payroll.reduce((acc, curr) => acc + (curr.totalAllowances || 0), 0);
    const totalDeductions = payroll.reduce((acc, curr) => acc + (curr.totalDeductions || 0), 0);
    const paidCount = payroll.filter(p => p.status === "Paid").length;
    
    return {
      totalNet,
      totalAllowances,
      totalDeductions,
      paidCount,
      totalCount: payroll.length
    };
  }, [payroll]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  const handleExportCSV = () => {
    const headers = ["Staff Name", "Role", "Period", "Base Salary", "Allowances", "Deductions", "Net Salary", "Status", "Payment Date"];
    const rows = filteredPayroll.map(p => [
      p.staffName || p.staff || "Unknown",
      p.role || "N/A",
      p.period,
      p.baseSalary || p.amount || 0,
      p.totalAllowances || 0,
      p.totalDeductions || 0,
      p.netSalary || p.amount || 0,
      p.status,
      p.paymentDate || "N/A"
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exporting payroll data...");
  };

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payroll Processing</h1>
              <p className="text-sm text-slate-400">Manage salary structures, deductions, and monthly disbursements.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={handleExportCSV}
                variant="outline"
                className="rounded-xl h-10 border-border bg-card shadow-sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={handleProcessAll} 
                disabled={isProcessing || payroll.filter(p => p.status === "Pending").length === 0}
                variant="outline"
                className="rounded-xl h-10 border-primary text-primary hover:bg-primary/5"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Process All Pending
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* HR Settings payroll policy strip */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border bg-emerald-50 border-emerald-100 text-sm">
          <span className="font-semibold text-emerald-800">Payroll Config (from HR Settings):</span>
          <span className="text-emerald-700">Cycle: <b>{hrSettings.payFrequencyLabel}</b></span>
          <span className="text-emerald-400">·</span>
          <span className="text-emerald-700">Pay Date: <b>Day {hrSettings.payDate} of each month</b></span>
          <span className="text-emerald-400">·</span>
          <span className="text-emerald-700">Components: <b>{hrSettings.salaryComponents.map(c => `${c.name} (${c.pct})`).join(', ')}</b></span>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { label: "Total Net Salary", value: `QAR ${stats.totalNet.toLocaleString()}`, icon: DollarSign, color: "purple", sub: "Current Period" },
            { label: "Total Allowances", value: `QAR ${stats.totalAllowances.toLocaleString()}`, icon: TrendingUp, color: "green", sub: "Bonuses & Perks" },
            { label: "Total Deductions", value: `QAR ${stats.totalDeductions.toLocaleString()}`, icon: CreditCard, color: "red", sub: "Tax & Insurance" },
            { label: "Staff Paid", value: `${stats.paidCount}/${stats.totalCount}`, icon: CheckCircle2, color: "blue", sub: "Completion Rate" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.02, y: -5 }}
              className="premium-card p-6 flex items-center gap-5"
            >
              <div className={`h-12 w-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center`}>
                <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              className="pl-10 h-11 rounded-xl border-border bg-card focus-visible:ring-primary/20 transition-all" 
              placeholder="Search by staff name or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-11 rounded-xl bg-card border-border shadow-sm">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="premium-card overflow-hidden"
        >
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="font-bold">Staff Member</TableHead>
                <TableHead className="font-bold">Attendance</TableHead>
                <TableHead className="font-bold">Base Salary</TableHead>
                <TableHead className="font-bold">Allowances</TableHead>
                <TableHead className="font-bold">Deductions</TableHead>
                <TableHead className="font-bold">Net Salary</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading payroll data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPayroll.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {payroll.length === 0
                      ? "No payroll records yet — they're created automatically when a staff member is onboarded with a Basic Salary set."
                      : "No payroll records match your search/filter."}
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {filteredPayroll.map((p, idx) => (
                    <motion.tr 
                      key={p.id} 
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-secondary/30 transition-colors group border-b border-border/50 last:border-0"
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{p.staffName || p.staff || "Unknown"}</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{p.role || "N/A"} • {p.period}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const absent = absentDaysFor(p);
                          return absent == null ? (
                            <span className="text-[10px] text-muted-foreground italic">No data</span>
                          ) : (
                            <span className={cn("text-xs font-bold", absent > 0 ? "text-orange-600" : "text-green-600")}>
                              {absent} day{absent === 1 ? "" : "s"} absent
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-bold">QAR {(p.baseSalary || p.amount || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-bold text-green-600">+QAR {(p.totalAllowances || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-bold text-red-600">-QAR {(p.totalDeductions || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-black text-primary">QAR {(p.netSalary || p.amount || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={cn(
                            "border-none font-bold text-[10px] uppercase tracking-wider",
                            p.status === "Paid" || p.status === "Processed" ? "bg-green-100 text-green-600" : 
                            p.status === "Pending" ? "bg-orange-100 text-orange-600" : 
                            "bg-slate-100 text-slate-600"
                          )}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl"
                              onClick={() => {
                                setSelectedPayroll(p);
                                setIsSlipOpen(true);
                              }}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </motion.div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-secondary/50 rounded-xl">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {p.status === "Pending" && (
                                <DropdownMenuItem onClick={() => handleProcessSingle(p.id)} className="gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  Process Payment
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => {
                                setSelectedPayroll(p);
                                setIsSlipOpen(true);
                              }} className="gap-2">
                                <Download className="h-4 w-4" />
                                Download Slip
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDelete(p.id)} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" />
                                Delete Record
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </motion.div>
      </motion.div>

      <PayrollSlipDialog 
        open={isSlipOpen} 
        onOpenChange={setIsSlipOpen} 
        payroll={selectedPayroll ? {
          id: selectedPayroll.id,
          staff: selectedPayroll.staffName || selectedPayroll.staff || "Unknown",
          role: selectedPayroll.role,
          period: selectedPayroll.period,
          baseSalary: selectedPayroll.baseSalary || selectedPayroll.amount || 0,
          amount: selectedPayroll.netSalary || selectedPayroll.amount || 0,
          status: selectedPayroll.status,
          totalAllowances: selectedPayroll.totalAllowances || 0,
          totalDeductions: selectedPayroll.totalDeductions || 0,
          netSalary: selectedPayroll.netSalary || selectedPayroll.amount || 0,
          createdAt: selectedPayroll.createdAt
        } : null} 
      />
    </DashboardLayout>
  );
};

export default PayrollProcessing;
