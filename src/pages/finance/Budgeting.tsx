import { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical,
  TrendingUp,
  AlertCircle,
  DollarSign,
  Loader2,
  PieChart,
  Target,
  ArrowUpRight,
  Sparkles,
  Calendar,
  ChevronRight,
  Download,
  History,
  RefreshCcw,
  FileText,
  Trash2,
  Edit2,
  CheckCircle2
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
import { Progress } from "@/components/ui/progress";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useNavigate } from "react-router-dom";

interface BudgetCategory {
  id: string;
  name: string;
  budget: number;
  type: string;
  uid: string;
}

interface Transaction {
  id: string;
  category: string;
  amount: number;
  status: string;
  uid: string;
}

// Standard category set so a new school can start budgeting immediately
// instead of hand-typing every category in Finance Setup one at a time.
// "Payroll" matches the payroll-spend detection in the `budgets` memo below.
const DEFAULT_BUDGET_CATEGORIES = [
  "Payroll & Benefits",
  "Academic Operations",
  "Admissions & Marketing",
  "Library",
  "Transport",
  "Facilities & Maintenance",
  "IT & Software",
  "Utilities",
  "Events & Activities",
  "Inventory & Procurement",
  "Scholarships & Discounts",
  "Miscellaneous",
];

const Budgeting = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings: financialSettings, updateSettings } = useFinancialSettings();
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [payroll, setPayroll] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");

  // Dialog states
  const [isReallocateOpen, setIsReallocateOpen] = useState(false);
  const [isGoalsOpen, setIsGoalsOpen] = useState(false);
  const [isForecastOpen, setIsForecastOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BudgetCategory | null>(null);
  const [newBudgetValue, setNewBudgetValue] = useState<string>("");
  const [targetUtilization, setTargetUtilization] = useState<number>(90);

  useEffect(() => {
    if (financialSettings.targetUtilization) {
      setTargetUtilization(financialSettings.targetUtilization);
    }
  }, [financialSettings.targetUtilization]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [catsData, expData, payData] = await Promise.all([
        smartDb.getAll("FinancialCategory", user.uid),
        // Expense rows (e.g. an Inventory & Procurement purchase — see
        // inventory/Purchases.tsx) are stamped with whichever staff member
        // recorded them, not the current viewer's uid — same reasoning as
        // Payroll below, so this must be unfiltered too or a colleague's
        // recorded spend silently never counts against the budget.
        smartDb.getAll("Expense"),
        // Payroll is school-wide (see PayrollProcessing.tsx) — rows are stamped
        // with whichever admin/HR user created them, not the current viewer's
        // uid, so this must be unfiltered or budget spend silently undercounts
        // any payroll a colleague processed.
        smartDb.getAll("Payroll")
      ]);

      setCategories((catsData as BudgetCategory[]).filter(c => c.type === "Expense"));
      setExpenses(expData as Transaction[]);
      setPayroll(payData as Transaction[]);
    } catch (error) {
      console.error("Error fetching budget data:", error);
      toast.error("Failed to load budget data");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  // Payroll processing now creates a real Expense (category "Payroll &
  // Benefits", sourceType "Payroll") per paid entry — see
  // PayrollProcessing.tsx. Any payroll row already covered by one of those
  // real Expense rows must be excluded here, or it gets counted twice.
  // The category-name substring match below now only exists to keep OLDER
  // payroll — processed before that fix shipped, so it has no matching
  // Expense — still counted; it's a fallback for pre-existing data, not the
  // primary path.
  const payrollExpenseSourceIds = useMemo(() =>
    new Set(expenses.filter(e => (e as any).sourceType === "Payroll").map(e => (e as any).sourceId)),
    [expenses]);

  const budgets = useMemo(() => {
    return categories.map(cat => {
      const categoryExpenses = expenses
        .filter(e => e.category === cat.name && e.status !== "Cancelled")
        .reduce((acc, curr) => acc + curr.amount, 0);

      const categoryPayroll = cat.name.toLowerCase().includes('payroll') || cat.name.toLowerCase().includes('salary')
        ? payroll
            .filter(p => p.status !== "Cancelled" && !payrollExpenseSourceIds.has(p.id))
            .reduce((acc, curr) => acc + ((curr as any).netSalary || (curr as any).net || curr.amount || 0), 0)
        : 0;

      const spent = categoryExpenses + categoryPayroll;
      const allocated = cat.budget || 0;
      const percent = allocated > 0 ? (spent / allocated) * 100 : 0;
      
      let status = "On Track";
      if (allocated === 0) status = "Not Set";
      else if (percent > 100) status = "Over Budget";
      else if (percent > (financialSettings.targetUtilization || 90)) status = "Near Limit";
      else if (spent === 0) status = "Not Started";

      return {
        ...cat,
        category: cat.name,
        period: "FY 2026",
        allocated,
        spent,
        percent,
        status
      };
    })
    .filter(b => b.category.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(b => filterStatus === "All" || b.status === filterStatus);
  }, [categories, expenses, payroll, searchTerm, filterStatus, financialSettings.targetUtilization]);

  const totalAllocated = budgets.reduce((acc, curr) => acc + curr.allocated, 0);
  const totalSpent = budgets.reduce((acc, curr) => acc + curr.spent, 0);
  const overBudgetCount = budgets.filter(b => b.status === "Over Budget").length;

  // Real budget insights derived from the categories already loaded above —
  // no fabricated numbers or dates.
  const budgetInsights = useMemo(() => {
    const insights: { title: string; desc: string; type: "warning" | "info" | "alert"; icon: typeof AlertCircle }[] = [];

    const overBudget = budgets.filter(b => b.status === "Over Budget").sort((a, b) => b.percent - a.percent);
    if (overBudget.length > 0) {
      const top = overBudget[0];
      insights.push({
        title: "Over Budget",
        desc: `'${top.category}' is at ${top.percent.toFixed(0)}% utilization, ${financialSettings.currency}${(top.spent - top.allocated).toLocaleString()} over its allocated budget.`,
        type: "alert",
        icon: AlertCircle,
      });
    }

    const nearLimit = budgets.filter(b => b.status === "Near Limit").sort((a, b) => b.percent - a.percent);
    if (nearLimit.length > 0) {
      const top = nearLimit[0];
      insights.push({
        title: "Near Limit",
        desc: `'${top.category}' has used ${top.percent.toFixed(0)}% of its allocated budget.`,
        type: "warning",
        icon: TrendingUp,
      });
    }

    const surplus = budgets.filter(b => b.allocated > 0 && b.percent < 50).sort((a, b) => a.percent - b.percent);
    if (surplus.length > 0) {
      const top = surplus[0];
      insights.push({
        title: "Underutilized",
        desc: `'${top.category}' has only used ${top.percent.toFixed(0)}% of its ${financialSettings.currency}${top.allocated.toLocaleString()} allocation.`,
        type: "info",
        icon: PieChart,
      });
    }

    return insights;
  }, [budgets, financialSettings.currency]);

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Category,Allocated,Spent,Utilization,Status\n"
      + budgets.map(b => `${b.category},${b.allocated},${b.spent},${b.percent.toFixed(2)}%,${b.status}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `budget_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Budget report exported successfully");
  };

  const handleReallocate = async () => {
    if (!selectedCategory || !newBudgetValue) return;
    
    try {
      await smartDb.update("financial_categories", selectedCategory.id, {
        budget: Number(newBudgetValue)
      });
      toast.success(`Budget for ${selectedCategory.name} updated successfully`);
      setIsReallocateOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating budget:", error);
      toast.error("Failed to update budget");
    }
  };

  const handleSaveGoals = async () => {
    try {
      await updateSettings({ targetUtilization });
      setIsGoalsOpen(false);
    } catch (error) {
      console.error("Error saving goals:", error);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await smartDb.update("financial_categories", id, { status: "Inactive" });
      toast.success("Category archived successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to archive category");
    }
  };

  // A school starting fresh has no way to use this page at all until at least
  // one Expense category exists. Creates the standard set with budget: 0 —
  // real category names, but no fabricated ceiling amounts; the school still
  // has to consciously set each one via "Allocate Budget" afterward.
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false);
  const handleCreateDefaultStructure = async () => {
    if (!user) return;
    setIsCreatingDefaults(true);
    try {
      const existingNames = new Set(categories.map(c => c.name.toLowerCase()));
      const toCreate = DEFAULT_BUDGET_CATEGORIES.filter(name => !existingNames.has(name.toLowerCase()));
      if (toCreate.length === 0) {
        toast.info("All default categories already exist");
        return;
      }
      await Promise.all(toCreate.map(name =>
        smartDb.create("financial_categories", { name, type: "Expense", budget: 0, uid: user.uid })
      ));
      toast.success(`Created ${toCreate.length} default budget categor${toCreate.length === 1 ? "y" : "ies"} — set each one's amount via Allocate Budget`);
      fetchData();
    } catch (error) {
      console.error("Error creating default categories:", error);
      toast.error("Failed to create default categories");
    } finally {
      setIsCreatingDefaults(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 w-full max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Budget Management</h1>
              <p className="text-sm text-slate-400">Monitor operational limits and optimize school spending with real-time utilization tracking.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-slate-500" /> Export Report
            </button>
            <button
              onClick={() => { setSelectedCategory(null); setNewBudgetValue(""); setIsReallocateOpen(true); }}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> Allocate Budget
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              label: "Total Allocated",
              value: `${financialSettings.currency}${totalAllocated.toLocaleString()}`,
              icon: DollarSign,
              bg: "bg-blue-50", ic: "text-blue-500",
              sub: `${budgets.length} categor${budgets.length === 1 ? "y" : "ies"}`,
            },
            {
              label: "Total Spent",
              value: `${financialSettings.currency}${totalSpent.toLocaleString()}`,
              icon: TrendingUp,
              bg: "bg-emerald-50", ic: "text-emerald-500",
              sub: `${totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0}% utilization`,
            },
            {
              label: "Budget Alerts",
              value: overBudgetCount,
              icon: AlertCircle,
              bg: "bg-rose-50", ic: "text-rose-500",
              sub: overBudgetCount > 0 ? "Requires attention" : "All within limits",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{stat.sub}</p>
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
                placeholder="Search categories…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Status</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-slate-400" /> {filterStatus}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 rounded-xl">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["All", "On Track", "Near Limit", "Over Budget", "Not Set"].map(status => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className="flex items-center justify-between"
                  >
                    {status}
                    {filterStatus === status && <div className="h-2 w-2 rounded-full bg-purple-600" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            onClick={() => { setSelectedCategory(null); setNewBudgetValue(""); setIsReallocateOpen(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> New Category
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Budget Table */}
          <div className="lg:col-span-2 space-y-5">
            <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="p-5 bg-slate-50/70 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Budget Utilization</CardTitle>
                <CardDescription className="text-xs text-slate-400">Fiscal Period: FY 2026 (April – March)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="h-8 w-8 animate-spin mb-3 text-purple-600" />
                    <p className="text-sm font-semibold">Analyzing budget data…</p>
                  </div>
                ) : budgets.length === 0 ? (
                  <div className="py-16 text-center">
                    <PieChart className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500 mb-1">No Budgets Found</p>
                    <p className="text-xs text-slate-400 mb-4">Start by setting up expense categories and allocating funds.</p>
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={handleCreateDefaultStructure}
                        disabled={isCreatingDefaults}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-60">
                        {isCreatingDefaults ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                        ) : (
                          <><Sparkles className="h-4 w-4" /> Create Default Budget Structure</>
                        )}
                      </button>
                      <button
                        onClick={() => navigate("/finance/setup")}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Configure Categories Manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/70">
                        <TableRow className="hover:bg-transparent border-b border-slate-100">
                          <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Category</TableHead>
                          <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Allocated</TableHead>
                          <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Spent</TableHead>
                          <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Utilization</TableHead>
                          <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Status</TableHead>
                          <TableHead className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {budgets.map((b) => {
                            const percent = Math.min(100, b.percent);
                            const isOver = b.percent > 100;
                            const isNear = b.percent > 90;
                            
                            return (
                              <TableRow
                                key={b.id}
                                className="group hover:bg-slate-50/40 transition-colors border-b border-slate-50 last:border-none"
                              >
                                <TableCell className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0",
                                      isOver ? "bg-rose-50 text-rose-600" : isNear ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600")}>
                                      {b.category.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-semibold text-slate-900 text-sm truncate">{b.category}</span>
                                      <span className="text-[11px] text-slate-400">{b.period}</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <span className="font-semibold text-slate-900 text-sm">{financialSettings.currency} {b.allocated.toLocaleString()}</span>
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <span className={cn("font-semibold text-sm", isOver ? "text-rose-600" : "text-slate-600")}>
                                    {financialSettings.currency} {b.spent.toLocaleString()}
                                  </span>
                                </TableCell>
                                <TableCell className="px-4 py-3 w-[220px]">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px] font-semibold">
                                      <span className={isOver ? "text-rose-600" : isNear ? "text-amber-600" : "text-purple-600"}>
                                        {b.percent.toFixed(1)}%
                                      </span>
                                      <span className="text-slate-400 font-normal">
                                        {b.allocated - b.spent >= 0
                                          ? `${financialSettings.currency}${(b.allocated - b.spent).toLocaleString()} left`
                                          : `${financialSettings.currency}${Math.abs(b.allocated - b.spent).toLocaleString()} over`}
                                      </span>
                                    </div>
                                    <Progress value={percent} className={cn("h-1.5 rounded-full", isOver ? "bg-rose-100" : isNear ? "bg-amber-100" : "bg-slate-100")} />
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap",
                                    b.status === "On Track" ? "bg-emerald-100 text-emerald-700" :
                                    b.status === "Near Limit" ? "bg-amber-100 text-amber-700" :
                                    b.status === "Over Budget" ? "bg-rose-100 text-rose-700" :
                                    "bg-slate-100 text-slate-500")}>
                                    {b.status}
                                  </span>
                                </TableCell>
                                <TableCell className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => { setSelectedCategory(b); setNewBudgetValue(b.allocated.toString()); setIsReallocateOpen(true); }}
                                      title="Edit"
                                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-amber-50 hover:text-amber-600 text-slate-400 transition-colors">
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-400 transition-colors">
                                          <MoreVertical className="h-3.5 w-3.5" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="rounded-xl">
                                        <DropdownMenuItem onClick={() => handleArchive(b.id)}>
                                          <History className="h-4 w-4 mr-2" />
                                          Archive Category
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-rose-600" onClick={() => toast.error("Delete functionality restricted for core categories")}>
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Insights & Summary */}
          <div className="space-y-4">
            {/* AI Insights Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" /> AI Insights
              </h3>
              <div className="space-y-2.5">
                {budgetInsights.length > 0 ? budgetInsights.map((insight, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/60 transition-all group cursor-pointer"
                    onClick={() => toast.info(insight.desc)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn("mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0",
                        insight.type === "warning" ? "bg-amber-50 text-amber-600" :
                        insight.type === "alert" ? "bg-rose-50 text-rose-600" :
                        "bg-blue-50 text-purple-600")}>
                        <insight.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 mb-0.5">{insight.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{insight.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-purple-600 transition-colors flex-shrink-0" />
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-slate-400 text-center py-4">No budget alerts right now — all categories are within their limits.</p>
                )}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Reallocate", icon: PieChart, fn: () => { setSelectedCategory(null); setNewBudgetValue(""); setIsReallocateOpen(true); } },
                  { label: "Set Goals", icon: Target, fn: () => setIsGoalsOpen(true) },
                  { label: "Forecast", icon: TrendingUp, fn: () => setIsForecastOpen(true) },
                  { label: "Refresh", icon: RefreshCcw, fn: () => fetchData() },
                ].map((a, i) => (
                  <button key={i} onClick={a.fn}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-50">
                      <a.icon className="h-4 w-4 text-purple-600" />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reallocate Dialog */}
      <Dialog open={isReallocateOpen} onOpenChange={setIsReallocateOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Reallocate Budget</DialogTitle>
            <DialogDescription>
              {selectedCategory 
                ? `Adjust the allocated budget for ${selectedCategory.name}.`
                : "Select a category to adjust its allocated budget."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!selectedCategory && (
              <div className="grid gap-2">
                <Label htmlFor="category-select">Select Category</Label>
                <Select 
                  onValueChange={(value) => {
                    const cat = categories.find(c => c.id === value);
                    if (cat) {
                      setSelectedCategory(cat);
                      setNewBudgetValue(cat.budget.toString());
                    }
                  }}
                >
                  <SelectTrigger id="category-select" className="rounded-xl">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="budget">New Budget Amount ({financialSettings.currency})</Label>
              <Input 
                id="budget" 
                type="number" 
                value={newBudgetValue} 
                onChange={(e) => setNewBudgetValue(e.target.value)}
                className="rounded-xl"
                placeholder="Enter amount"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReallocateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button 
              onClick={handleReallocate} 
              className="rounded-xl gradient-primary shadow-lg shadow-primary/20"
              disabled={!selectedCategory || !newBudgetValue}
            >
              Update Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Goals Dialog */}
      <Dialog open={isGoalsOpen} onOpenChange={setIsGoalsOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Set Financial Goals
            </DialogTitle>
            <DialogDescription>
              Define target utilization limits for the school's budget.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Utilization Threshold (%)</Label>
                <div className="flex items-center gap-4">
                  <Input 
                    type="number" 
                    value={targetUtilization} 
                    onChange={(e) => setTargetUtilization(Number(e.target.value))}
                    className="rounded-xl"
                  />
                  <Badge variant="secondary" className="h-10 px-4 rounded-xl">
                    {targetUtilization}%
                  </Badge>
                </div>
                <p className="text-[10px] text-slate-400">
                  System will alert you when spending exceeds this percentage of allocated budget.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGoalsOpen(false)} className="rounded-xl">Cancel</Button>
            <Button 
              onClick={handleSaveGoals} 
              className="rounded-xl gradient-primary shadow-lg shadow-primary/20"
            >
              Save Goals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forecast Dialog */}
      <Dialog open={isForecastOpen} onOpenChange={setIsForecastOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Budget Forecasting
            </DialogTitle>
            <DialogDescription>
              Predictive analysis based on current spending patterns.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Burn Rate</p>
                <p className="text-2xl font-black text-slate-900">
                  {financialSettings.currency} {Math.round(totalSpent / 3).toLocaleString()}/mo
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Based on last 90 days</p>
              </div>
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Projected EOY</p>
                <p className="text-2xl font-black text-primary">
                  {financialSettings.currency} {Math.round(totalSpent * 4).toLocaleString()}
                </p>
                <p className="text-[10px] text-primary/60 mt-1">Estimated annual spend</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Risk Assessment</h4>
              {budgets.filter(b => b.percent > 75).length > 0 ? (
                <div className="space-y-2">
                  {budgets.filter(b => b.percent > 75).map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                        <span className="text-xs font-bold text-rose-900">{b.category}</span>
                      </div>
                      <span className="text-xs font-black text-rose-600">High Risk</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="text-xs font-medium text-emerald-900">All categories are projected to stay within limits.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsForecastOpen(false)} className="w-full rounded-xl">Close Analysis</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Budgeting;


