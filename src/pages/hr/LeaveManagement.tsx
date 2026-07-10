import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  MoreVertical,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Check,
  X,
  Eye,
  Trash2,
  AlertCircle,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CalendarDays
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaff } from "@/contexts/StaffContext";
import { useLeave } from "@/contexts/LeaveContext";
import { useAuth } from "@/hooks/useAuth";
import { useHRSettings } from "@/contexts/HRSettingsContext";
import { resolveRoleId } from "@/lib/roles";
import { LeaveRequest, LeaveType } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortField = 'staffName' | 'type' | 'days' | 'status' | 'startDate';
type SortOrder = 'asc' | 'desc';

const LeaveManagement = () => {
  const { staff } = useStaff();
  const { leaves, loading, canSeeAllLeaves, applyForLeave, approveLeaveStep, rejectLeave, deleteLeaveRequest } = useLeave();
  const { role } = useAuth();
  const resolvedRole = resolveRoleId(role);
  const hrSettings = useHRSettings();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [leaveToDelete, setLeaveToDelete] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState("");

  const [sortConfig, setSortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: 'startDate',
    order: 'desc'
  });

  const [formData, setFormData] = useState({
    staffId: "",
    type: "Annual Leave" as LeaveType,
    startDate: "",
    endDate: "",
    reason: ""
  });

  // Can the current logged-in user act on the active approval step of this leave?
  const canActOnCurrentStep = (leave: LeaveRequest): boolean => {
    if (resolvedRole === 'admin' || resolvedRole === 'super_admin' || resolvedRole === 'school_owner') return true;
    if (!leave.approvalChain || leave.approvalChain.length === 0) return canSeeAllLeaves;
    const stepIdx = leave.currentStep ?? 0;
    const step = leave.approvalChain[stepIdx];
    if (!step || step.status !== 'Pending') return false;
    return resolvedRole === step.roleId;
  };

  const stats = useMemo(() => ({
    total: leaves.length,
    pending: leaves.filter(l => l.status === "Pending").length,
    approved: leaves.filter(l => l.status === "Approved").length,
    rejected: leaves.filter(l => l.status === "Rejected").length,
  }), [leaves]);

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleApprove = async (leave: LeaveRequest) => {
    await approveLeaveStep(leave.id, remarkInput);
    setRemarkInput("");
    if (selectedLeave?.id === leave.id) setIsDetailsOpen(false);
  };

  const handleReject = async (leave: LeaveRequest) => {
    await rejectLeave(leave.id, remarkInput);
    setRemarkInput("");
    if (selectedLeave?.id === leave.id) setIsDetailsOpen(false);
  };

  const handleDelete = async () => {
    if (!leaveToDelete) return;
    await deleteLeaveRequest(leaveToDelete);
    setIsDeleteOpen(false);
    setLeaveToDelete(null);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedStaff = staff.find(s => s.id === formData.staffId);
    if (!selectedStaff) { toast.error("Please select a staff member"); return; }

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (end < start) { toast.error("End date cannot be before start date"); return; }

    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    await applyForLeave({
      staffId: selectedStaff.id,
      staffName: selectedStaff.name,
      type: formData.type,
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason,
      days: diffDays,
      category: "staff",
    });
    setIsApplyOpen(false);
    setFormData({ staffId: "", type: "Annual Leave", startDate: "", endDate: "", reason: "" });
  };

  const filteredLeaves = useMemo(() => {
    const result = leaves.filter(l => {
      const matchesSearch =
        (l.staffName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (l.id?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      const matchesTab = activeTab === "all" || (l.status?.toLowerCase() || "") === activeTab;
      return matchesSearch && matchesTab;
    });

    result.sort((a, b) => {
      const field = sortConfig.field;
      const order = sortConfig.order === 'asc' ? 1 : -1;
      if (a[field] < b[field]) return -1 * order;
      if (a[field] > b[field]) return 1 * order;
      return 0;
    });

    return result;
  }, [leaves, searchTerm, activeTab, sortConfig]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };
  const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortConfig.order === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  // Label for the current pending approver in a request's chain.
  const pendingApproverLabel = (leave: LeaveRequest): string | null => {
    if (leave.status !== 'Pending') return null;
    const chain = leave.approvalChain;
    if (!chain || chain.length === 0) return null;
    const step = chain[leave.currentStep ?? 0];
    return step?.label ?? null;
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
            <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
              <p className="text-sm text-slate-400">Track and manage staff leave requests and approvals.</p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={() => setIsApplyOpen(true)} className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 mr-2" />
              Apply for Leave
            </Button>
          </motion.div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: stats.total, icon: FileText, color: "text-purple-600", bg: "bg-blue-50", sub: "All records" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-orange-600", bg: "bg-orange-50", sub: "Awaiting action" },
            { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", sub: "Processed" },
            { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-600", bg: "bg-red-50", sub: "Denied" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.02, y: -5 }}
              className="premium-card p-4 flex items-center gap-4"
            >
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", stat.bg)}>
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{stat.label}</p>
                <p className="text-xl font-black">{stat.value}</p>
                <p className="text-[9px] font-medium text-muted-foreground">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* HR Settings policy strip */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border bg-indigo-50 border-indigo-100 text-sm">
          <span className="font-semibold text-indigo-800">Policy (from HR Settings):</span>
          <span className="text-indigo-700">Approval: <b>{hrSettings.approvalLevelsLabel}</b></span>
          <span className="text-indigo-400">·</span>
          <span className="text-indigo-700">Leave types: <b>{hrSettings.leaveTypes.map(lt => lt.name).join(', ')}</b></span>
          {hrSettings.autoReject && (
            <>
              <span className="text-indigo-400">·</span>
              <span className="text-indigo-700">Auto-reject if unapproved after <b>5 days</b></span>
            </>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
              <TabsTrigger value="all" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">All</TabsTrigger>
              <TabsTrigger value="pending" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Pending</TabsTrigger>
              <TabsTrigger value="approved" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Approved</TabsTrigger>
              <TabsTrigger value="rejected" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-md w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              className="pl-10 h-11 rounded-xl border-border bg-card focus-visible:ring-primary/20 transition-all"
              placeholder="Search by staff name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="premium-card overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('staffName')}>
                  <div className="flex items-center">Staff Member <SortIcon field="staffName" /></div>
                </TableHead>
                <TableHead className="font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('type')}>
                  <div className="flex items-center">Leave Type <SortIcon field="type" /></div>
                </TableHead>
                <TableHead className="font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('startDate')}>
                  <div className="flex items-center">Duration <SortIcon field="startDate" /></div>
                </TableHead>
                <TableHead className="font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon field="status" /></div>
                </TableHead>
                <TableHead className="font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground font-medium">Loading leave requests...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLeaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-8 w-8 opacity-20" />
                        <p className="font-medium">No leave requests found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeaves.map((l, idx) => (
                    <motion.tr
                      key={l.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-secondary/30 transition-colors group border-b border-border/50 last:border-0"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border-2 border-primary/10 group-hover:border-primary/30 transition-colors">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${l.staffName}`} />
                            <AvatarFallback>{(l.staffName || "?").substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{l.staffName}</span>
                            <span className="text-[11px] text-muted-foreground font-medium capitalize">{l.category ?? 'staff'}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px] font-bold border-primary/20 text-primary bg-primary/5">
                          {l.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{l.days} Days</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{l.startDate} → {l.endDate}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "border-none font-bold text-[10px] uppercase tracking-wider w-fit",
                              l.status === "Approved" ? "bg-green-100 text-green-600" :
                              l.status === "Pending" ? "bg-orange-100 text-orange-600" :
                              "bg-red-100 text-red-600"
                            )}
                          >
                            {l.status}
                          </Badge>
                          {pendingApproverLabel(l) && (
                            <span className="text-[10px] text-muted-foreground">Awaiting: {pendingApproverLabel(l)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl"
                            onClick={() => { setSelectedLeave(l); setRemarkInput(""); setIsDetailsOpen(true); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-secondary/50 rounded-xl">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl border-border">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {l.status === "Pending" && canActOnCurrentStep(l) && (
                                <>
                                  <DropdownMenuItem onClick={() => handleApprove(l)} className="rounded-lg gap-2 text-green-600 focus:text-green-600 cursor-pointer">
                                    <Check className="h-4 w-4" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleReject(l)} className="rounded-lg gap-2 text-destructive focus:text-destructive cursor-pointer">
                                    <X className="h-4 w-4" />
                                    Reject
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem
                                className="rounded-lg gap-2 text-destructive focus:text-destructive cursor-pointer"
                                onClick={() => { setLeaveToDelete(l.id); setIsDeleteOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete Request
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </motion.div>

        {/* Apply for Leave Dialog */}
        <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
          <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent p-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Apply for Leave</DialogTitle>
                <DialogDescription>Submit a new leave request for approval.</DialogDescription>
              </DialogHeader>
            </div>

            <form onSubmit={handleApply} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staff">Staff Member</Label>
                <Select value={formData.staffId} onValueChange={(v) => setFormData({...formData, staffId: v})}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Select Staff Member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Leave Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v as LeaveType})}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Select Leave Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {hrSettings.leaveTypes.map(lt => (
                      <SelectItem key={lt.name} value={lt.name as LeaveType}>
                        {lt.name}{lt.days !== 'No limit' ? ` (${lt.days} days)` : ''} — {lt.paid ? 'Paid' : 'Unpaid'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" required className="rounded-xl h-11" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" required className="rounded-xl h-11" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason for Leave</Label>
                <Textarea required className="rounded-xl min-h-[100px]" placeholder="Please provide a brief reason..." value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} />
              </div>

              <DialogFooter className="pt-4 gap-2">
                <Button type="button" variant="outline" className="rounded-xl h-11 px-8 border-border flex-1" onClick={() => setIsApplyOpen(false)}>Cancel</Button>
                <Button type="submit" className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 flex-1">Submit Application</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Details + Approval Dialog */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
            {selectedLeave && (
              <>
                <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border-none font-bold text-[10px] uppercase tracking-wider",
                        selectedLeave.status === "Approved" ? "bg-green-100 text-green-600" :
                        selectedLeave.status === "Pending" ? "bg-orange-100 text-orange-600" :
                        "bg-red-100 text-red-600"
                      )}
                    >
                      {selectedLeave.status}
                    </Badge>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {selectedLeave.category === 'student' ? 'Student Leave' : 'Staff Leave'}
                    </span>
                  </div>
                  <DialogHeader>
                    <div className="flex items-center gap-4 mb-2">
                      <Avatar className="h-14 w-14 border-4 border-white shadow-lg">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedLeave.staffName}`} />
                        <AvatarFallback>{(selectedLeave.staffName || "?").substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <DialogTitle className="text-xl font-bold">{selectedLeave.staffName}</DialogTitle>
                        <p className="text-sm text-muted-foreground font-medium">{selectedLeave.type}</p>
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-secondary/10 border border-border/50">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Duration</p>
                      <p className="text-lg font-black">{selectedLeave.days} Days</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-secondary/10 border border-border/50">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Applied On</p>
                      <p className="text-lg font-black">{selectedLeave.appliedOn || "—"}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted-foreground">Leave Dates</p>
                        <p className="text-sm font-bold">{selectedLeave.startDate} → {selectedLeave.endDate}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted-foreground">Reason</p>
                        <p className="text-sm font-medium leading-relaxed">{selectedLeave.reason}</p>
                      </div>
                    </div>
                  </div>

                  {/* Approval Chain Stepper */}
                  {selectedLeave.approvalChain && selectedLeave.approvalChain.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Approval Chain</p>
                      <div className="flex items-start gap-2 flex-wrap">
                        {selectedLeave.approvalChain.map((step, i) => {
                          const isActive = i === (selectedLeave.currentStep ?? 0) && selectedLeave.status === 'Pending';
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className="flex flex-col items-center gap-1">
                                <div className={cn(
                                  "h-9 w-9 rounded-full flex items-center justify-center border-2 font-bold text-sm",
                                  step.status === 'Approved' && "border-green-500 bg-green-50 text-green-700",
                                  step.status === 'Rejected' && "border-red-500 bg-red-50 text-red-700",
                                  step.status === 'Pending' && isActive && "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-200",
                                  step.status === 'Pending' && !isActive && "border-gray-200 bg-gray-50 text-gray-400",
                                )}>
                                  {step.status === 'Approved' ? <Check className="h-4 w-4" /> :
                                   step.status === 'Rejected' ? <X className="h-4 w-4" /> : i + 1}
                                </div>
                                <span className="text-[10px] font-bold text-center max-w-[64px] leading-tight text-muted-foreground">
                                  {step.label}
                                </span>
                                {step.remark && (
                                  <span className="text-[9px] text-muted-foreground max-w-[64px] text-center italic">
                                    "{step.remark}"
                                  </span>
                                )}
                                {step.actedAt && (
                                  <span className="text-[9px] text-muted-foreground">{step.actedAt.slice(0, 10)}</span>
                                )}
                              </div>
                              {i < selectedLeave.approvalChain!.length - 1 && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground mb-4 flex-shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Prior approver remark */}
                  {selectedLeave.approverRemark && selectedLeave.status !== 'Pending' && (
                    <div className="p-3 rounded-xl bg-secondary/20 border border-border/50">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Approver Remark</p>
                      <p className="text-sm font-medium">{selectedLeave.approverRemark}</p>
                    </div>
                  )}

                  {/* Action area */}
                  {selectedLeave.status === "Pending" && canActOnCurrentStep(selectedLeave) ? (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          Remark (optional)
                        </Label>
                        <Textarea
                          value={remarkInput}
                          onChange={e => setRemarkInput(e.target.value)}
                          placeholder="Add a note for the applicant..."
                          className="rounded-xl min-h-[72px] text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 rounded-xl h-11 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200"
                          onClick={() => handleApprove(selectedLeave)}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 rounded-xl h-11 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleReject(selectedLeave)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : selectedLeave.status === "Pending" ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Awaiting approval from: <strong>{pendingApproverLabel(selectedLeave) ?? "next approver"}</strong>
                    </p>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full rounded-xl h-11 border-border"
                      onClick={() => setIsDetailsOpen(false)}
                    >
                      Close
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold">Delete Leave Request?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The leave request will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-xl h-11 border-border">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="rounded-xl h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Request
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
};

export default LeaveManagement;
