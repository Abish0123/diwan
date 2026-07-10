import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Loader2
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
import { useStaff } from "@/contexts/StaffContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Staff = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { staff, addStaff, updateStaff, loading } = useStaff();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewStaff, setViewStaff] = useState<typeof staff[number] | null>(null);
  const [editStaff, setEditStaff] = useState<typeof staff[number] | null>(null);
  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "",
    department: "",
    status: "Active",
    email: "",
    phone: "",
    joinDate: new Date().toISOString().split('T')[0]
  });

  const filteredStaff = staff.filter(s => {
    const matchesSearch =
      (s.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (s.id?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (s.department?.toLowerCase() || "").includes(searchTerm.toLowerCase());

    const matchesDept =
      filterDept === "all" ||
      (s.department?.toLowerCase() || "") === filterDept.toLowerCase();

    const matchesStatus =
      filterStatus === "all" ||
      (s.status?.toLowerCase() || "") === filterStatus.toLowerCase();

    return matchesSearch && matchesDept && matchesStatus;
  });

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.email || !newStaff.role) {
      toast.error("Please fill in all required fields");
      return;
    }
    await addStaff(newStaff);
    setIsAddDialogOpen(false);
    setNewStaff({
      name: "",
      role: "",
      department: "",
      status: "Active",
      email: "",
      phone: "",
      joinDate: new Date().toISOString().split('T')[0]
    });
    toast.success("Staff member added successfully");
  };

  const handleMarkOnLeave = async (s: typeof staff[number]) => {
    await updateStaff(s.id, { status: "On Leave" });
    toast.success(s.name + " marked as On Leave");
  };

  const handleDeactivate = async (s: typeof staff[number]) => {
    await updateStaff(s.id, { status: "Inactive" });
    toast.error(s.name + " has been deactivated");
  };

  const handleSaveEdit = async () => {
    if (!editStaff) return;
    if (!editStaff.name || !editStaff.email || !editStaff.role) {
      toast.error("Please fill in all required fields");
      return;
    }
    await updateStaff(editStaff.id, {
      name: editStaff.name,
      role: editStaff.role,
      department: editStaff.department,
      email: editStaff.email,
      phone: editStaff.phone,
      status: editStaff.status,
    });
    setEditStaff(null);
    toast.success("Staff member updated successfully");
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
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <DashboardLayout>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
              <p className="text-sm text-slate-400">Manage teacher and administrative staff profiles, payroll, and attendance.</p>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Staff Member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Staff Member</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} placeholder="Dr. Robert Smith" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={newStaff.email} onChange={(e) => setNewStaff({...newStaff, email: e.target.value})} placeholder="r.smith@school.edu" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Input id="role" value={newStaff.role} onChange={(e) => setNewStaff({...newStaff, role: e.target.value})} placeholder="Principal" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dept">Department</Label>
                    <Input id="dept" value={newStaff.department} onChange={(e) => setNewStaff({...newStaff, department: e.target.value})} placeholder="Administration" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddStaff} className="rounded-xl gradient-primary font-bold">Save Staff Member</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Staff', count: staff.length, icon: Briefcase, color: 'blue' },
            { label: 'Present Today', count: Math.floor(staff.length * 0.9), icon: CheckCircle2, color: 'green' },
            { label: 'On Leave', count: staff.filter(s => s.status !== 'Active').length, icon: Calendar, color: 'orange' },
            { label: 'Payroll Processed', count: '100%', icon: DollarSign, color: 'purple' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              whileHover={{ y: -5, scale: 1.02 }}
              className="premium-card p-5 flex items-center gap-4 group transition-all"
            >
              <div className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-6",
                stat.color === 'blue' && "bg-blue-50 text-purple-600",
                stat.color === 'green' && "bg-green-50 text-green-600",
                stat.color === 'orange' && "bg-orange-50 text-orange-600",
                stat.color === 'purple' && "bg-purple-50 text-purple-600"
              )}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{stat.label}</p>
                <p className="text-2xl font-black">{stat.count}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              className="pl-10 h-11 rounded-xl border-border bg-card/50 focus:bg-card transition-all"
              placeholder="Search by name, ID, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl px-4 gap-2 w-full sm:w-auto border-border bg-card/50 font-bold text-xs hover:bg-secondary"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                  {(filterDept !== "all" || filterStatus !== "all") && (
                    <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4 rounded-xl" align="end">
                <div className="space-y-4">
                  <h4 className="font-bold text-sm">Filter Staff</h4>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
                    <Select value={filterDept} onValueChange={setFilterDept}>
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        <SelectItem value="Teaching">Teaching</SelectItem>
                        <SelectItem value="Administration">Administration</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Support">Support</SelectItem>
                        <SelectItem value="Hostel">Hostel</SelectItem>
                        <SelectItem value="Security">Security</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-9 rounded-lg text-sm">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="On Leave">On Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(filterDept !== "all" || filterStatus !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => { setFilterDept("all"); setFilterStatus("all"); }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        </motion.div>

        <motion.div variants={itemVariants} className="premium-card overflow-hidden border-none shadow-xl bg-white/80 backdrop-blur-md min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Loading staff directory...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Staff Member</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Role & Dept</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredStaff.length > 0 ? (
                      filteredStaff.map((s, index) => (
                        <motion.tr
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: index * 0.03 }}
                          key={s.id}
                          className="group hover:bg-secondary/30 transition-colors border-border/30"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 border-2 border-primary/10 shadow-sm transition-transform group-hover:scale-105">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                                <AvatarFallback className="bg-primary/5 text-[10px] font-bold text-primary">
                                  {getInitials(s.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-foreground leading-tight">{s.name}</span>
                                <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{s.id}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-[12px] font-bold text-foreground">{s.role}</span>
                              <span className="text-[10px] text-muted-foreground font-medium">{s.department}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                                <Mail className="h-3 w-3 text-primary/60" />
                                {s.email}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                                <Phone className="h-3 w-3 text-primary/60" />
                                {s.phone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "border-none font-bold text-[10px] px-2 py-0.5 rounded-full",
                                s.status === "Active" ? "bg-success/10 text-success" : "bg-orange-500/10 text-orange-600"
                              )}
                            >
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <motion.button
                                  whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
                                  whileTap={{ scale: 0.9 }}
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </motion.button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
                                <DropdownMenuItem
                                  className="rounded-lg py-2 cursor-pointer"
                                  onClick={() => setViewStaff(s)}
                                >
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="rounded-lg py-2 cursor-pointer"
                                  onClick={() => setEditStaff(s)}
                                >
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="rounded-lg py-2 cursor-pointer"
                                  onClick={() => toast.success("Message sent to " + s.name)}
                                >
                                  Send Message
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="rounded-lg py-2 cursor-pointer"
                                  onClick={() => handleMarkOnLeave(s)}
                                >
                                  Mark On Leave
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="rounded-lg py-2 cursor-pointer text-destructive focus:text-destructive"
                                  onClick={() => handleDeactivate(s)}
                                >
                                  Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No staff members found.
                        </TableCell>
                      </TableRow>
                    )}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>

        <Dialog open={!!viewStaff} onOpenChange={(o) => !o && setViewStaff(null)}>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>Staff Profile</DialogTitle>
            </DialogHeader>
            {viewStaff && (
              <div className="flex flex-col gap-4 py-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border-2 border-primary/10 shadow-sm">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${viewStaff.name}`} />
                    <AvatarFallback className="bg-primary/5 text-xs font-bold text-primary">
                      {getInitials(viewStaff.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-base font-bold">{viewStaff.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{viewStaff.id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</p>
                    <p className="font-medium">{viewStaff.role}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Department</p>
                    <p className="font-medium">{viewStaff.department}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email</p>
                    <p className="font-medium break-all">{viewStaff.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Phone</p>
                    <p className="font-medium">{viewStaff.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className="font-medium">{viewStaff.status}</p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!editStaff} onOpenChange={(o) => !o && setEditStaff(null)}>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Staff Member</DialogTitle>
            </DialogHeader>
            {editStaff && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input id="edit-name" value={editStaff.name || ""} onChange={(e) => setEditStaff({ ...editStaff, name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" value={editStaff.email || ""} onChange={(e) => setEditStaff({ ...editStaff, email: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" value={editStaff.phone || ""} onChange={(e) => setEditStaff({ ...editStaff, phone: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Input id="edit-role" value={editStaff.role || ""} onChange={(e) => setEditStaff({ ...editStaff, role: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-dept">Department</Label>
                  <Input id="edit-dept" value={editStaff.department || ""} onChange={(e) => setEditStaff({ ...editStaff, department: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={editStaff.status} onValueChange={(v) => setEditStaff({ ...editStaff, status: v })}>
                    <SelectTrigger id="edit-status" className="h-9 rounded-lg text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleSaveEdit} className="rounded-xl gradient-primary font-bold">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </DashboardLayout>
  );
};

export default Staff;
