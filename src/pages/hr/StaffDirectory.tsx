import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { 
  Search, 
  UserPlus, 
  Filter, 
  MoreVertical,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  DollarSign,
  CheckCircle2,
  FileText,
  Download,
  Eye,
  Edit,
  Trash2,
  X,
  CreditCard,
  Building2,
  Settings
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { db } from "@/firebase";
import { PayrollRecord } from "@/types/hr";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import { useStaff } from "@/contexts/StaffContext";
import { useLeave } from "@/contexts/LeaveContext";
import { Staff } from "@/types";

// Annual leave entitlement per school policy — used to compute remaining balance
// from real approved leave requests (mirrors the policy used in TeacherLeave.tsx).
const ANNUAL_LEAVE_ENTITLEMENT_DAYS = 12 + 10 + 21 + 3 + 5; // Casual + Sick + Annual + Emergency + Duty

const StaffDirectory = () => {
  const { staff, addStaff, updateStaff, deleteStaff, loading } = useStaff();
  const { leaves } = useLeave();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [staffToEdit, setStaffToEdit] = useState<Staff | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Staff; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    department: "",
    status: "Active",
    joinDate: new Date().toISOString().split('T')[0],
    salary: 0,
    bankName: "",
    accountNumber: ""
  });

  const [payrollHistory, setPayrollHistory] = useState<PayrollRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Real document upload: small files are stored inline as data-URLs on the
  // staff record's documents array; larger files keep metadata only.
  const MAX_INLINE_DOC_BYTES = 500 * 1024;
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedStaff) return;
    let url: string | undefined;
    if (file.size <= MAX_INLINE_DOC_BYTES) {
      url = await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
    }
    const doc = {
      name: file.name,
      size: file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      date: new Date().toISOString().split("T")[0],
      type: (file.name.split(".").pop() || "file").toLowerCase(),
      ...(url ? { url } : {}),
    };
    const updatedDocs = [...(selectedStaff.documents || []), doc];
    try {
      await updateStaff(selectedStaff.id, { documents: updatedDocs });
      setSelectedStaff({ ...selectedStaff, documents: updatedDocs });
      toast.success(
        url
          ? `${file.name} uploaded to ${selectedStaff.name}'s file`
          : `${file.name} recorded — file exceeds 500 KB, metadata only`
      );
    } catch {
      toast.error("Failed to save the document");
    }
  };

  const downloadStaffDocument = (doc: { name: string; url?: string }) => {
    if (!doc.url) return;
    const a = document.createElement("a");
    a.href = doc.url;
    a.download = doc.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Fetch payroll history when a staff member is selected
  useEffect(() => {
    const fetchPayrollHistory = async () => {
      if (!selectedStaff) return;
      setLoadingHistory(true);
      try {
        const q = query(
          collection(db, "payroll"),
          where("staffId", "==", selectedStaff.id),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        const snapshot = await getDocs(q);
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PayrollRecord[];
        setPayrollHistory(history);
      } catch (error) {
        console.error("Error fetching payroll history:", error);
      } finally {
        setLoadingHistory(false);
      }
    };

    if (isViewOpen && selectedStaff) {
      fetchPayrollHistory();
    }
  }, [isViewOpen, selectedStaff]);

  // Real leave balance for the selected staff member, derived from their actual
  // approved leave_requests (matched by staffId) against the school's annual
  // leave entitlement — no fabricated numbers.
  const selectedStaffLeave = useMemo(() => {
    if (!selectedStaff) return null;
    const staffLeaves = leaves.filter(l => l.staffId === selectedStaff.id);
    const approvedDaysUsed = staffLeaves
      .filter(l => l.status === "Approved")
      .reduce((sum, l) => sum + (l.days || 0), 0);
    const hasAnyRecord = staffLeaves.length > 0;
    return {
      hasAnyRecord,
      approvedDaysUsed,
      remaining: Math.max(0, ANNUAL_LEAVE_ENTITLEMENT_DAYS - approvedDaysUsed),
    };
  }, [leaves, selectedStaff]);

  const stats = useMemo(() => {
    return {
      total: staff.length,
      active: staff.filter(s => s.status === "Active").length,
      onLeave: staff.filter(s => s.status === "On Leave").length,
      departments: new Set(staff.map(s => s.department)).size
    };
  }, [staff]);

  const departments = useMemo(() => {
    const depts = new Set(staff.map(s => s.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const result = staff.filter(s => {
      const matchesSearch = 
        (s.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (s.id?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (s.department?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (s.role?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesDept = deptFilter === "all" || s.department === deptFilter;
      
      return matchesSearch && matchesStatus && matchesDept;
    });

    // Sorting
    result.sort((a, b) => {
      const aValue = a[sortConfig.key] || "";
      const bValue = b[sortConfig.key] || "";
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [staff, searchTerm, statusFilter, deptFilter, sortConfig]);

  const handleSort = (key: keyof Staff) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return false;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Valid email is required");
      return false;
    }
    if (!formData.role.trim()) {
      toast.error("Role is required");
      return false;
    }
    if (!formData.department) {
      toast.error("Department is required");
      return false;
    }
    return true;
  };

  const handleAddEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      if (staffToEdit) {
        await updateStaff(staffToEdit.id, formData);
        toast.success("Staff member updated successfully");
      } else {
        await addStaff(formData);
        toast.success("Staff member added successfully");
      }
      setIsAddEditOpen(false);
      setStaffToEdit(null);
      resetForm();
    } catch (error) {
      toast.error("Failed to save staff member");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      role: "",
      department: "",
      status: "Active",
      joinDate: new Date().toISOString().split('T')[0],
      salary: 0,
      bankName: "",
      accountNumber: ""
    });
  };

  const openEdit = (s: Staff) => {
    setStaffToEdit(s);
    setFormData({
      name: s.name,
      email: s.email,
      phone: s.phone || "",
      role: s.role,
      department: s.department,
      status: s.status,
      joinDate: s.joinDate || new Date().toISOString().split('T')[0],
      salary: s.salary || 0,
      bankName: s.bankName || "",
      accountNumber: s.accountNumber || ""
    });
    setIsAddEditOpen(true);
  };

  const handleDelete = async () => {
    if (!staffToDelete) return;
    try {
      await deleteStaff(staffToDelete.id);
      toast.success("Staff member deleted successfully");
      setIsDeleteOpen(false);
      setStaffToDelete(null);
    } catch (error) {
      toast.error("Failed to delete staff member");
    }
  };

  const exportCSV = () => {
    const headers = ["ID", "Name", "Email", "Phone", "Role", "Department", "Status", "Join Date"];
    const rows = filteredStaff.map(s => [
      s.id,
      s.name,
      s.email,
      s.phone || "",
      s.role,
      s.department,
      s.status,
      s.joinDate || ""
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "staff_directory.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exporting CSV...");
  };

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

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-5"
      >
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Staff Directory</h1>
              <p className="text-sm text-slate-400">Manage comprehensive staff profiles, contracts, and documents.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                variant="outline" 
                className="rounded-xl h-10 border-border bg-card shadow-sm"
                onClick={exportCSV}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={() => navigate('/hr/settings')} 
                variant="outline"
                className="rounded-xl h-10 border-border bg-card shadow-sm"
              >
                <Settings className="h-4 w-4 mr-2" />
                Staff Settings
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={() => navigate('/hr/onboarding')} 
                className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Staff Member
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: "Total Staff", value: stats.total, icon: Briefcase, color: "text-purple-600", bg: "bg-blue-50" },
            { label: "Active", value: stats.active, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
            { label: "On Leave", value: stats.onLeave, icon: Calendar, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Departments", value: stats.departments, icon: Filter, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              whileHover={{ y: -4 }}
              className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm flex items-center gap-4"
            >
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", stat.bg)}>
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-xl font-black">{stat.value}</p>
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
              placeholder="Search by name, ID, or department..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl border-border bg-card w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Leave">On Leave</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-11 rounded-xl border-border bg-card w-[160px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(statusFilter !== "all" || deptFilter !== "all" || searchTerm !== "") && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-11 w-11 rounded-xl text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setStatusFilter("all");
                  setDeptFilter("all");
                  setSearchTerm("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="premium-card overflow-hidden"
        >
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground font-medium">Loading staff members...</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-secondary/50 flex items-center justify-center">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold">No staff members found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters.</p>
              </div>
              <Button variant="outline" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setDeptFilter("all"); }}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <>
            {/* Mobile card view */}
            <div className="block md:hidden divide-y divide-border/50">
              {filteredStaff.map((s) => (
                <div 
                  key={s.id} 
                  className="p-4 space-y-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => { setSelectedStaff(s); setIsViewOpen(true); }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 border-2 border-primary/10">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                      <AvatarFallback className="text-xs font-bold">{getInitials(s.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.role} · {s.department}</p>
                    </div>
                    <Badge variant="secondary" className={cn("text-[10px] font-bold border-none uppercase shrink-0", s.status === "Active" ? "bg-green-100 text-green-600" : s.status === "On Leave" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-600")}>
                      {s.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{s.phone || "N/A"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl" onClick={() => { setSelectedStaff(s); setIsViewOpen(true); }}>
                      <Eye className="h-3 w-3 mr-1.5" /> View
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl" onClick={(e) => { e.stopPropagation(); navigate(`/hr/onboarding?edit=${s.id}`); }}>
                      <Edit className="h-3 w-3 mr-1.5" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table view */}
            <Table className="hidden md:table">
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead 
                    className="font-bold cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                      Staff Member
                      {sortConfig.key === 'name' && (
                        <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="font-bold cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleSort('role')}
                  >
                    <div className="flex items-center gap-2">
                      Role & Dept
                      {sortConfig.key === 'role' && (
                        <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="font-bold">Contact</TableHead>
                  <TableHead 
                    className="font-bold cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      {sortConfig.key === 'status' && (
                        <span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredStaff.map((s, idx) => (
                    <motion.tr
                      key={s.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-secondary/30 transition-colors group border-b border-border/50 last:border-0 cursor-pointer"
                      onClick={() => { setSelectedStaff(s); setIsViewOpen(true); }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-primary/10 group-hover:border-primary/30 transition-colors">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                            <AvatarFallback>{getInitials(s.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s.name}</span>
                            <span className="text-[11px] text-muted-foreground font-medium">{s.id}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{s.role}</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{s.department}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                            <Mail className="h-3 w-3" />
                            {s.email}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                            <Phone className="h-3 w-3" />
                            {s.phone || "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={cn(
                            "border-none font-bold text-[10px] uppercase tracking-wider",
                            s.status === "Active" ? "bg-green-100 text-green-600" : 
                            s.status === "On Leave" ? "bg-orange-100 text-orange-600" :
                            "bg-slate-100 text-slate-600"
                          )}
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStaff(s);
                              setIsViewOpen(true);
                            }}
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
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/hr/onboarding?edit=${s.id}`); }} className="rounded-lg gap-2">
                                <Edit className="h-4 w-4" />
                                Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStaffToDelete(s);
                                  setIsDeleteOpen(true);
                                }} 
                                className="rounded-lg gap-2 text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
            </>
          )}
        </motion.div>

        {/* View Dialog */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl rounded-3xl overflow-hidden p-0 border-none shadow-2xl">
            {selectedStaff && (
              <>
                <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent p-6 pb-0">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Staff Profile</DialogTitle>
                    <DialogDescription>Detailed information for {selectedStaff.name}</DialogDescription>
                  </DialogHeader>
                </div>
                
                <div className="p-6 pt-4">
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="bg-secondary/30 p-1 rounded-2xl h-12 mb-6 w-full justify-start">
                      <TabsTrigger value="overview" className="rounded-xl px-6 h-10 data-[state=active]:bg-white data-[state=active]:shadow-md transition-all">Overview</TabsTrigger>
                      <TabsTrigger value="finance" className="rounded-xl px-6 h-10 data-[state=active]:bg-white data-[state=active]:shadow-md transition-all">Finance & Payroll</TabsTrigger>
                      <TabsTrigger value="documents" className="rounded-xl px-6 h-10 data-[state=active]:bg-white data-[state=active]:shadow-md transition-all">Documents</TabsTrigger>
                    </TabsList>
                    
                    <AnimatePresence mode="wait">
                      <TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-6 p-6 rounded-3xl bg-secondary/10 border border-border/50"
                        >
                          <Avatar className="h-24 w-24 border-4 border-white shadow-xl">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedStaff.name}`} />
                            <AvatarFallback>{getInitials(selectedStaff.name)}</AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <h3 className="text-2xl font-black">{selectedStaff.name}</h3>
                            <p className="text-sm font-bold text-primary uppercase tracking-widest">{selectedStaff.role}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Briefcase className="h-3 w-3" />
                                {selectedStaff.department}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Joined {selectedStaff.joinDate || "N/A"}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Leave Balance</p>
                            {selectedStaffLeave?.hasAnyRecord ? (
                              <>
                                <p className="text-2xl font-black">{selectedStaffLeave.remaining} Days</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-1">
                                  {selectedStaffLeave.approvedDaysUsed} used of {ANNUAL_LEAVE_ENTITLEMENT_DAYS} annual entitlement
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-2xl font-black text-muted-foreground">Not set</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-1">No leave requests on file for this staff member</p>
                              </>
                            )}
                          </div>
                          <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Attendance Rate</p>
                            <p className="text-2xl font-black text-muted-foreground">Not set</p>
                            <p className="text-[10px] text-muted-foreground font-medium mt-1">No attendance record linked to this staff member</p>
                          </div>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="finance" className="space-y-6 focus-visible:outline-none">
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Monthly Base Salary</Label>
                                <DollarSign className="h-3 w-3 text-primary" />
                              </div>
                              <p className={cn("text-2xl font-black mt-1", !selectedStaff.salary && "text-muted-foreground")}>
                                {selectedStaff.salary ? `QAR ${selectedStaff.salary.toLocaleString()}` : "Not set"}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-[9px] border-green-200 text-green-600 bg-green-50">Tax Deducted</Badge>
                                <Badge variant="outline" className="text-[9px] border-blue-200 text-purple-600 bg-blue-50">Full Time</Badge>
                              </div>
                            </div>
                            <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bank Details</Label>
                                <CreditCard className="h-3 w-3 text-primary" />
                              </div>
                              <p className="text-sm font-bold mt-2">{selectedStaff.bankName || "Not on file"}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                Acc: {selectedStaff.accountNumber ? `**** ${selectedStaff.accountNumber.slice(-4)}` : "Not on file"}
                              </p>
                              {selectedStaff.accountNumber && (
                                <p className="text-[10px] text-muted-foreground mt-1 italic">Verified on {selectedStaff.joinDate || "N/A"}</p>
                              )}
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent Payroll History</Label>
                            <div className="mt-4 space-y-3">
                              {loadingHistory ? (
                                <div className="flex items-center justify-center p-8">
                                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : payrollHistory.length > 0 ? (
                                payrollHistory.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between text-xs p-3 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors">
                                    <div className="flex flex-col">
                                      <span className="font-bold">{item.period}</span>
                                      <span className="text-[10px] text-muted-foreground">${item.netSalary.toLocaleString()} Net</span>
                                    </div>
                                    <Badge className={cn(
                                      "border-none text-[9px] font-bold",
                                      item.status === "Paid" ? "bg-green-100 text-green-600" : 
                                      item.status === "Processed" ? "bg-blue-100 text-purple-600" : "bg-orange-100 text-orange-600"
                                    )}>
                                      {item.status}
                                    </Badge>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center p-8">
                                  <p className="text-[10px] text-muted-foreground">No payroll records found.</p>
                                </div>
                              )}
                            </div>
                            <Button variant="link" className="w-full text-[10px] text-primary mt-2 h-auto p-0"
                              onClick={() => { setIsViewOpen(false); navigate("/hr/payroll"); }}>View All Payslips</Button>
                          </div>
                        </motion.div>
                      </TabsContent>
                      
                      <TabsContent value="documents" className="space-y-4 focus-visible:outline-none">
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold">Required Documents</h4>
                            <input ref={docInputRef} type="file" className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleDocumentUpload} />
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1"
                              onClick={() => docInputRef.current?.click()}>
                              <UserPlus className="h-3 w-3" />
                              Upload New
                            </Button>
                          </div>
                          {selectedStaff.documents && selectedStaff.documents.length > 0 ? (
                            selectedStaff.documents.map((doc) => (
                              <div
                                key={doc.name}
                                className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50 hover:bg-secondary/10 transition-all group/doc hover:shadow-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                                    doc.type === "pdf" ? "bg-red-50 group-hover/doc:bg-red-100" : "bg-blue-50 group-hover/doc:bg-blue-100"
                                  )}>
                                    <FileText className={cn(
                                      "h-5 w-5",
                                      doc.type === "pdf" ? "text-red-600" : "text-purple-600"
                                    )} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold group-hover/doc:text-primary transition-colors">{doc.name}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium">{doc.size} • Uploaded {doc.date}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {doc.url ? (
                                    <>
                                      <Button variant="ghost" size="icon" title="View"
                                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                                        onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" title="Download"
                                        className="h-8 w-8 rounded-lg hover:bg-blue-50 hover:text-purple-600"
                                        onClick={() => downloadStaffDocument(doc)}>
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  ) : (
                                    // Legacy/oversized entries have no stored file content — nothing to view or download.
                                    <span className="text-[9px] text-muted-foreground font-medium pr-1">Metadata only</span>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center p-8 rounded-2xl bg-card border border-border/50 border-dashed">
                              <p className="text-sm text-muted-foreground font-medium">No documents on file</p>
                            </div>
                          )}
                        </motion.div>
                      </TabsContent>
                    </AnimatePresence>
                  </Tabs>
                  
                  <DialogFooter className="mt-6 gap-2">
                    <Button 
                      variant="outline" 
                      className="rounded-xl h-11 px-8 border-border flex-1 sm:flex-none"
                      onClick={() => {
                        setIsViewOpen(false);
                        navigate(`/hr/onboarding?edit=${selectedStaff.id}`);
                      }}
                    >
                      Edit Profile
                    </Button>
                    <Button 
                      className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 flex-1 sm:flex-none"
                      onClick={() => setIsViewOpen(false)}
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit Dialog */}
        <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
          <DialogContent className="max-w-2xl rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent p-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {staffToEdit ? "Edit Staff Member" : "Add New Staff Member"}
                </DialogTitle>
                <DialogDescription>
                  {staffToEdit ? "Update information for existing staff member." : "Register a new staff member to the system."}
                </DialogDescription>
              </DialogHeader>
            </div>
            
            <form onSubmit={handleAddEdit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    required 
                    className="rounded-xl h-11" 
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    required 
                    className="rounded-xl h-11" 
                    placeholder="e.g. john@school.edu"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    className="rounded-xl h-11" 
                    placeholder="e.g. +1 234 567 890"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Job Role</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(v) => setFormData({...formData, role: v})}
                  >
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Teacher">Teacher</SelectItem>
                      <SelectItem value="Senior Teacher">Senior Teacher</SelectItem>
                      <SelectItem value="Head of Department">Head of Department</SelectItem>
                      <SelectItem value="Administrator">Administrator</SelectItem>
                      <SelectItem value="Librarian">Librarian</SelectItem>
                      <SelectItem value="Support Staff">Support Staff</SelectItem>
                      <SelectItem value="IT Specialist">IT Specialist</SelectItem>
                      <SelectItem value="Sports Coach">Sports Coach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Select 
                    value={formData.department} 
                    onValueChange={(v) => setFormData({...formData, department: v})}
                  >
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administration">Administration</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                      <SelectItem value="Humanities">Humanities</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Library">Library</SelectItem>
                      <SelectItem value="Sports">Sports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(v) => setFormData({...formData, status: v})}
                  >
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary">Monthly Base Salary</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="salary" 
                      type="number" 
                      className="rounded-xl h-11 pl-10" 
                      placeholder="e.g. 10000"
                      value={formData.salary}
                      onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="bankName" 
                      className="rounded-xl h-11 pl-10" 
                      placeholder="e.g. Global Trust Bank"
                      value={formData.bankName}
                      onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="accountNumber" 
                      className="rounded-xl h-11 pl-10" 
                      placeholder="e.g. 1234567890"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="joinDate">Join Date</Label>
                  <Input 
                    id="joinDate" 
                    type="date" 
                    className="rounded-xl h-11"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({...formData, joinDate: e.target.value})}
                  />
                </div>
              </div>
              
              <DialogFooter className="pt-4 gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="rounded-xl h-11 px-8 border-border flex-1 sm:flex-none"
                  onClick={() => setIsAddEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 flex-1 sm:flex-none"
                >
                  {staffToEdit ? "Update Staff" : "Add Staff"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold">Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete <strong>{staffToDelete?.name}</strong> and remove their data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-xl h-11 border-border">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="rounded-xl h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
};

export default StaffDirectory;
