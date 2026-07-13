import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  User,
  Users,
  Building2,
  MoreVertical,
  Loader2,
  Calendar,
  DollarSign,
  Plus,
  HelpCircle,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { RecordRevenueDialog } from "@/components/finance/RecordRevenueDialog";
import { RecordExpenseDialog } from "@/components/finance/RecordExpenseDialog";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { smartDb } from "@/lib/localDb";
import { useTranslation } from "react-i18next";

interface Transaction {
  id: string;
  date: string;
  entity: string;
  category: string;
  type: 'Income' | 'Expense';
  amount: number;
  status: string;
  sourceCollection: string;
  timestamp: { seconds: number; nanoseconds: number } | null;
}

interface FinancialCategory {
  id: string;
  name: string;
  type: string;
  budget?: number;
  status: string;
  subcategories: number;
  uid: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  Pending: 'admin.finance.transactions.statusPending',
  Completed: 'admin.finance.transactions.statusCompleted',
  Cancelled: 'admin.finance.transactions.statusCancelled',
  Refunded: 'admin.finance.transactions.statusRefunded',
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  Income: 'admin.finance.transactions.typeIncome',
  Expense: 'admin.finance.transactions.typeExpense',
  Transfer: 'admin.finance.transactions.typeTransfer',
};

const Transactions = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, isMockSession } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [revenueType, setRevenueType] = useState<"student" | "entity">("student");
  const [expenseType, setExpenseType] = useState<"expenses" | "payroll" | "assets">("expenses");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<{ id: string; collection: string } | null>(null);

  // Pagination / show-all for Recent Activity
  const [showAll, setShowAll] = useState(false);

  // Filter state for Detailed Ledger
  const [filterType, setFilterType] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("all");

  const handleDeleteTransaction = async (id: string, collection: string) => {
    setTransactionToDelete({ id, collection });
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;

    try {
      await smartDb.delete(transactionToDelete.collection, transactionToDelete.id);
      setTransactions(prev => prev.filter(t => t.id !== transactionToDelete.id));
      toast.success(t('admin.finance.transactions.toastDeleteSuccess'));
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      toast.error(t('admin.finance.transactions.toastDeleteError'));
    } finally {
      setIsDeleteDialogOpen(false);
      setTransactionToDelete(null);
    }
  };

  const openEditDialog = (txn: Transaction) => {
    setEditingTransaction(txn);
    setEditDescription(txn.category || "");
    setEditStatus(txn.status || "Completed"); // logic default kept in English; UI label handled via STATUS_LABEL_KEYS
    setEditNotes("");
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;

    const { id, sourceCollection } = editingTransaction;
    const updatedFields = {
      category: editDescription,
      status: editStatus,
      notes: editNotes,
      updatedAt: new Date().toISOString(),
    };

    try {
      await smartDb.update(sourceCollection, id, updatedFields);
      setTransactions(prev =>
        prev.map(t =>
          t.id === id ? { ...t, category: editDescription, status: editStatus } : t
        )
      );
      toast.success(t('admin.finance.transactions.toastUpdateSuccess'));
      setEditingTransaction(null);
    } catch (error) {
      console.error("Failed to update transaction:", error);
      toast.error(t('admin.finance.transactions.toastUpdateError'));
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;

    setLoading(true);
    const uid = user.uid;

    const unsubscribes: (() => void)[] = [];

    const collections = [
      { name: 'StudentRevenue', type: 'Income', entityKey: 'studentName' },
      { name: 'EntityRevenue', type: 'Income', entityKey: 'entityName' },
      { name: 'Expense', type: 'Expense', entityKey: 'entity' },
      { name: 'Payroll', type: 'Expense', entityKey: 'staff' },
      { name: 'AssetRecord', type: 'Expense', entityKey: 'entity' }
    ];

    // Also watch paid admission/school fee payments from admissions pipeline
    const unsubAdm = smartDb.watch("FinancePendingPayment", uid, (data: any[]) => {
      const paid = data.filter(d => d.status === 'Paid');
      const mappedAdm = paid.map(d => ({
        id: `adm-${d.id}`,
        date: d.paidAt ? d.paidAt.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : 'N/A'),
        entity: d.studentName || 'Student',
        category: d.type === 'school_fee' ? 'School Fee' : 'Admission Fee',
        type: 'Income' as 'Income' | 'Expense',
        amount: Number(d.amount) || 0,
        status: 'Completed',
        sourceCollection: 'FinancePendingPayment',
        timestamp: d.paidAt || d.createdAt,
      }));
      setTransactions(prev => {
        const others = prev.filter(t => t.sourceCollection !== 'FinancePendingPayment');
        return [...others, ...mappedAdm].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      });
    });
    unsubscribes.push(unsubAdm);

    collections.forEach(col => {
      // Payroll is a school-wide HR resource (see PayrollProcessing.tsx) — its
      // rows are stamped with whichever admin/HR user created them, not the
      // current viewer's uid. Scoping this watch to `uid` silently hid every
      // payroll entry a colleague created, the same way FeeStructure lookups
      // used to hide records created under a different uid.
      const isPayroll = col.name === 'Payroll';
      const unsub = smartDb.watch(col.name, isPayroll ? undefined : uid, (data: any[]) => {
        const mappedData = data.map(docData => ({
          id: docData.id,
          date: docData.date || (docData.createdAt && typeof docData.createdAt === 'string' ? docData.createdAt.split('T')[0] : 'N/A'),
          entity: docData[col.entityKey] || docData.entity || docData.name || docData.staff || docData.staffName || 'Unknown',
          category: docData.category || (col.name === 'Payroll' ? 'Payroll' : 'General'),
          type: col.type as 'Income' | 'Expense',
          // Payroll rows store netSalary/baseSalary, not a generic `amount` —
          // without this fallback every payroll line shows as QAR 0 here.
          amount: Number(docData.amount ?? docData.netSalary ?? docData.baseSalary) || 0,
          status: docData.status || 'Completed',
          sourceCollection: col.name,
          timestamp: docData.createdAt
        }));

        setTransactions(prev => {
          const others = prev.filter(t => t.sourceCollection !== col.name);
          const combined = [...others, ...mappedData].sort((a, b) => {
            const dateA = new Date(a.date || 0).getTime();
            const dateB = new Date(b.date || 0).getTime();
            return dateB - dateA;
          });
          return combined;
        });
        setLoading(false);
      });
      unsubscribes.push(unsub);
    });

    const unsubCats = smartDb.watch("FinancialCategory", uid, (data: any[]) => {
      setCategories(data);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
      unsubCats();
    };
  }, [user, authLoading, isMockSession]);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const matchesSearch =
        (t.entity?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (t.category?.toLowerCase() || "").includes(searchTerm.toLowerCase());

      const matchesType =
        filterType === "all" ||
        t.type.toLowerCase() === filterType.toLowerCase();

      const matchesDate = (() => {
        if (filterDateRange === "all") return true;
        const txDate = new Date(t.date);
        if (isNaN(txDate.getTime())) return true;
        const diffDays = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
        if (filterDateRange === "7") return diffDays <= 7;
        if (filterDateRange === "30") return diffDays <= 30;
        if (filterDateRange === "90") return diffDays <= 90;
        return true;
      })();

      return matchesSearch && matchesType && matchesDate;
    });
  }, [transactions, searchTerm, filterType, filterDateRange]);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);

    // Real month-over-month trend: this calendar month vs last calendar month,
    // derived from the actual dated transaction records already loaded above.
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;

    const sumForMonth = (type: 'Income' | 'Expense', monthKey: string) =>
      transactions
        .filter(t => t.type === type && t.date)
        .filter(t => {
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return false;
          return `${d.getFullYear()}-${d.getMonth()}` === monthKey;
        })
        .reduce((acc, t) => acc + t.amount, 0);

    const pctChange = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return ((curr - prev) / prev) * 100;
    };

    const incomeThisMonth = sumForMonth('Income', thisMonthKey);
    const incomeLastMonth = sumForMonth('Income', lastMonthKey);
    const expenseThisMonth = sumForMonth('Expense', thisMonthKey);
    const expenseLastMonth = sumForMonth('Expense', lastMonthKey);

    return {
      income,
      expense,
      count: transactions.length,
      incomeChangePct: pctChange(incomeThisMonth, incomeLastMonth),
      expenseChangePct: pctChange(expenseThisMonth, expenseLastMonth),
    };
  }, [transactions]);

  const formatTrendBadge = (pct: number | null) => pct === null ? t('admin.finance.transactions.trendNew') : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;

  const chartData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayTxns = transactions.filter(t => t.date === date);
      return {
        date: date.split('-').slice(1).join('/'),
        income: dayTxns.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0),
        expense: dayTxns.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0),
      };
    });
  }, [transactions]);

  const recentActivityList = showAll ? transactions : transactions.slice(0, 10);

  const handleExport = () => {
    const rows = filteredTransactions;
    if (rows.length === 0) {
      toast.info(t('admin.finance.transactions.toastNoDataToExport'));
      return;
    }

    const escapeCsv = (value: unknown) => {
      const str = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const headers = [
      t('admin.finance.transactions.csvHeaderDate'),
      t('admin.finance.transactions.csvHeaderEntity'),
      t('admin.finance.transactions.csvHeaderCategory'),
      t('admin.finance.transactions.csvHeaderType'),
      t('admin.finance.transactions.csvHeaderAmount'),
      t('admin.finance.transactions.csvHeaderStatus'),
    ];
    const lines = rows.map(row =>
      [row.date, row.entity, row.category, row.type, row.amount, row.status].map(escapeCsv).join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `day-book-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      rows.length === 1
        ? t('admin.finance.transactions.toastExportSuccessSingular', { count: rows.length })
        : t('admin.finance.transactions.toastExportSuccessPlural', { count: rows.length })
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.finance.transactions.pageTitle')}</h1>
              <p className="text-sm text-slate-400 flex items-center gap-2">
                {t('admin.finance.transactions.pageSubtitle')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-3 rounded-xl">
                      <p className="text-xs leading-relaxed">
                        {t('admin.finance.transactions.pageTooltip')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </p>
            </div>
          </motion.div>

          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl h-11 px-6 bg-white shadow-sm hover:bg-secondary/50 transition-all" onClick={handleExport}>
              <Download className="h-4 w-4 me-2" />
              {t('admin.finance.transactions.exportButton')}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-xl h-11 px-6 gradient-primary shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                  <Plus className="h-4 w-4 me-2" />
                  {t('admin.finance.transactions.newTransactionButton')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 shadow-xl border-none">
                <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setRevenueType("student"); setRevenueDialogOpen(true); }}>
                  <TrendingUp className="h-4 w-4 me-2 text-green-600" />
                  {t('admin.finance.transactions.menuStudentRevenue')}
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setRevenueType("entity"); setRevenueDialogOpen(true); }}>
                  <TrendingUp className="h-4 w-4 me-2 text-emerald-600" />
                  {t('admin.finance.transactions.menuEntityRevenue')}
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setExpenseType("expenses"); setExpenseDialogOpen(true); }}>
                  <TrendingDown className="h-4 w-4 me-2 text-red-600" />
                  {t('admin.finance.transactions.menuOperationalExpense')}
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setExpenseType("payroll"); setExpenseDialogOpen(true); }}>
                  <Users className="h-4 w-4 me-2 text-purple-600" />
                  {t('admin.finance.transactions.menuStaffPayroll')}
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg py-2 cursor-pointer" onClick={() => { setExpenseType("assets"); setExpenseDialogOpen(true); }}>
                  <Building2 className="h-4 w-4 me-2 text-amber-600" />
                  {t('admin.finance.transactions.menuAssetPurchase')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: t('admin.finance.transactions.statTotalIncome'), value: `${financialSettings.currency}${stats.income.toLocaleString()}`, icon: TrendingUp, color: 'green', trend: formatTrendBadge(stats.incomeChangePct) },
            { label: t('admin.finance.transactions.statTotalExpense'), value: `${financialSettings.currency}${stats.expense.toLocaleString()}`, icon: TrendingDown, color: 'red', trend: formatTrendBadge(stats.expenseChangePct) },
            { label: t('admin.finance.transactions.statTransactionCount'), value: stats.count, icon: Activity, color: 'blue', trend: t('admin.finance.transactions.trendActive') }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="premium-card p-6 flex items-center gap-5 hover:scale-[1.02] transition-transform cursor-default group"
            >
              <div className={`h-14 w-14 rounded-2xl bg-${stat.color}-50 flex items-center justify-center group-hover:rotate-6 transition-transform`}>
                <stat.icon className={`h-7 w-7 text-${stat.color}-600`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-black">{stat.value}</p>
                  <Badge variant="secondary" className={`bg-${stat.color}-50 text-${stat.color}-700 border-none text-[10px] font-bold`}>{stat.trend}</Badge>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="lg:col-span-2 premium-card p-6 bg-white/80 backdrop-blur-md"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold">{t('admin.finance.transactions.financialSnapshotTitle')}</h3>
              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  {t('admin.finance.transactions.legendIncome')}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  {t('admin.finance.transactions.legendExpense')}
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => `${financialSettings.currency}${val}`} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={3} />
                  <Area type="monotone" dataKey="expense" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="premium-card p-6 bg-white/80 backdrop-blur-md"
          >
            <h3 className="text-lg font-bold mb-6">{t('admin.finance.transactions.recentActivityTitle')}</h3>
            <div className="space-y-4">
              {recentActivityList.map((txn, idx) => (
                <motion.div
                  key={txn.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/20 hover:bg-secondary/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${txn.type === 'Income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {txn.type === 'Income' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold truncate max-w-[140px] tracking-tight">{txn.entity}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{txn.category}</p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className={`text-sm font-black ${txn.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                      {txn.type === 'Income' ? '+' : '-'}{financialSettings.currency} {txn.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-medium text-muted-foreground">{txn.date}</p>
                  </div>
                </motion.div>
              ))}
              {transactions.length === 0 && (
                <div className="py-12 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground font-medium">{t('admin.finance.transactions.noRecentActivity')}</p>
                </div>
              )}
            </div>
            {transactions.length > 10 && (
              <Button
                variant="ghost"
                className="w-full mt-6 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl"
                onClick={() => setShowAll(prev => !prev)}
              >
                {showAll ? t('admin.finance.transactions.showLessButton') : t('admin.finance.transactions.viewAllButton')}
              </Button>
            )}
            {transactions.length <= 10 && transactions.length > 0 && (
              <Button
                variant="ghost"
                className="w-full mt-6 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl"
                disabled
              >
                {t('admin.finance.transactions.allTransactionsShown')}
              </Button>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="premium-card p-6 bg-white/80 backdrop-blur-md"
          >
            <h3 className="text-lg font-bold mb-6">{t('admin.finance.transactions.budgetVsActualTitle')}</h3>
            <div className="space-y-6">
              {categories.slice(0, 5).map((cat, i) => {
                const actual = transactions.filter(t => t.category === cat.name).reduce((acc, t) => acc + t.amount, 0);
                const budget = cat.budget || 1000;
                const percentage = Math.min((actual / budget) * 100, 100);
                const color = cat.type === 'Revenue' ? 'green' : 'red';

                return (
                  <div key={cat.id} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className={actual > budget && cat.type === 'Expense' ? 'text-red-600' : 'text-primary'}>
                        {financialSettings.currency} {actual.toLocaleString()} / {financialSettings.currency} {budget.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ delay: 0.5 + (i * 0.1), duration: 1 }}
                        className={`h-full bg-${color === 'green' ? 'emerald' : 'rose'}-500 rounded-full`}
                      />
                    </div>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <div className="text-center py-10 text-muted-foreground italic text-sm">
                  {t('admin.finance.transactions.noCategoriesDefined')}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="premium-card overflow-hidden border-none shadow-xl bg-white/80 backdrop-blur-md"
        >
          <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-secondary/10">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold">{t('admin.finance.transactions.detailedLedgerTitle')}</h3>
              <Badge variant="secondary" className="rounded-full px-3">{filteredTransactions.length}</Badge>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  className="ps-10 h-10 text-sm rounded-xl border-none bg-white shadow-sm"
                  placeholder={t('admin.finance.transactions.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl bg-white border-none shadow-sm relative"
                  >
                    <Filter className="h-4 w-4" />
                    {(filterType !== "all" || filterDateRange !== "all") && (
                      <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4 rounded-xl" align="end">
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm">{t('admin.finance.transactions.filterPopoverTitle')}</h4>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.filterTypeLabel')}</Label>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="h-9 rounded-lg text-sm">
                          <SelectValue placeholder={t('admin.finance.transactions.filterAllTypes')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('admin.finance.transactions.filterAllTypes')}</SelectItem>
                          <SelectItem value="Income">{t(TYPE_LABEL_KEYS.Income)}</SelectItem>
                          <SelectItem value="Expense">{t(TYPE_LABEL_KEYS.Expense)}</SelectItem>
                          <SelectItem value="Transfer">{t(TYPE_LABEL_KEYS.Transfer)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.filterDateRangeLabel')}</Label>
                      <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                        <SelectTrigger className="h-9 rounded-lg text-sm">
                          <SelectValue placeholder={t('admin.finance.transactions.filterAllTime')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('admin.finance.transactions.filterAllTime')}</SelectItem>
                          <SelectItem value="7">{t('admin.finance.transactions.filterLast7Days')}</SelectItem>
                          <SelectItem value="30">{t('admin.finance.transactions.filterLast30Days')}</SelectItem>
                          <SelectItem value="90">{t('admin.finance.transactions.filterLast90Days')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(filterType !== "all" || filterDateRange !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => { setFilterType("all"); setFilterDateRange("all"); }}
                      >
                        {t('admin.finance.transactions.clearFiltersButton')}
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {loading ? (
            <div className="p-24 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
              <p className="text-sm font-medium animate-pulse">{t('admin.finance.transactions.synchronizingLedger')}</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-20 text-center space-y-4">
              <div className="h-20 w-20 bg-secondary/30 rounded-full flex items-center justify-center mx-auto">
                <Activity className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <div className="max-w-xs mx-auto">
                <h4 className="font-bold text-lg">{t('admin.finance.transactions.noRecordsFoundTitle')}</h4>
                <p className="text-sm text-muted-foreground">{t('admin.finance.transactions.noRecordsFoundSubtitle')}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderDate')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderEntity')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderCategory')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderType')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderAmount')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t('admin.finance.transactions.tableHeaderStatus')}</TableHead>
                    <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-end">{t('admin.finance.transactions.tableHeaderActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredTransactions.map((txn, idx) => (
                      <motion.tr
                        key={txn.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.02 }}
                        className="group hover:bg-primary/5 transition-colors border-b border-border/30 last:border-none"
                      >
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {txn.date}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-secondary/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {txn.entity.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-bold text-sm tracking-tight">{txn.entity}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-lg">{txn.category}</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border-none shadow-sm ${
                            txn.type === 'Income' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                          }`}>
                            {t(TYPE_LABEL_KEYS[txn.type] || txn.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <span className={`text-sm font-black ${txn.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                            {txn.type === 'Income' ? '+' : '-'}{financialSettings.currency} {txn.amount.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="secondary" className="rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter border-none shadow-sm bg-blue-500/10 text-purple-600">
                            {t(STATUS_LABEL_KEYS[txn.status] || txn.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white shadow-sm"
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem onClick={() => openEditDialog(txn)}>
                                {t('admin.finance.transactions.editTransactionMenuItem')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-rose-600"
                                onClick={() => handleDeleteTransaction(txn.id, txn.sourceCollection)}
                              >
                                {t('admin.finance.transactions.deleteTransactionMenuItem')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>
      </div>

      <RecordRevenueDialog
        open={revenueDialogOpen}
        onOpenChange={setRevenueDialogOpen}
        type={revenueType}
      />

      <RecordExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        type={expenseType}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.finance.transactions.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.finance.transactions.deleteDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl">{t('admin.finance.transactions.cancelButton')}</Button>
            <Button variant="destructive" onClick={confirmDelete} className="rounded-xl">{t('admin.finance.transactions.deleteButton')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editingTransaction} onOpenChange={(open) => { if (!open) setEditingTransaction(null); }}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t('admin.finance.transactions.editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('admin.finance.transactions.editDialogDescription')}</DialogDescription>
          </DialogHeader>
          {editingTransaction && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldTransactionId')}</Label>
                  <Input value={editingTransaction.id} readOnly className="bg-secondary/30 text-xs font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldAmount')}</Label>
                  <Input value={`${financialSettings.currency}${editingTransaction.amount.toLocaleString()}`} readOnly className="bg-secondary/30 font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldDate')}</Label>
                <Input value={editingTransaction.date} readOnly className="bg-secondary/30" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldDescription')}</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t('admin.finance.transactions.descriptionPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldStatus')}</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder={t('admin.finance.transactions.statusSelectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">{t(STATUS_LABEL_KEYS.Pending)}</SelectItem>
                    <SelectItem value="Completed">{t(STATUS_LABEL_KEYS.Completed)}</SelectItem>
                    <SelectItem value="Cancelled">{t(STATUS_LABEL_KEYS.Cancelled)}</SelectItem>
                    <SelectItem value="Refunded">{t(STATUS_LABEL_KEYS.Refunded)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.finance.transactions.fieldNotes')}</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={t('admin.finance.transactions.notesPlaceholder')}
                  className="rounded-xl resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingTransaction(null)} className="rounded-xl">{t('admin.finance.transactions.cancelButton')}</Button>
            <Button onClick={handleSaveEdit} className="rounded-xl gradient-primary">{t('admin.finance.transactions.saveChangesButton')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Transactions;
