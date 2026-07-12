import { useState, useEffect, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudents } from "@/contexts/StudentContext";
import {
  Search,
  ShieldAlert,
  Filter,
  MoreVertical,
  AlertTriangle,
  Award,
  Info,
  User,
  Calendar,
  Loader2,
  Trash2,
  Eye,
  Edit2,
  ChevronDown
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
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

interface Incident {
  id: string;
  docId?: string;
  studentName: string;
  studentId: string;
  type: string;
  category: string;
  description: string;
  severity: string;
  date: string;
  uid?: string;
  createdAt?: string;
}

const Behavior = () => {
  const { students, updateStudent } = useStudents();
  const [searchTerm, setSearchTerm] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [viewingIncident, setViewingIncident] = useState<Incident | null>(null);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [newIncident, setNewIncident] = useState({
    studentName: "",
    studentId: "",
    type: "Demerit",
    category: "Conduct",
    description: "",
    severity: "Medium",
    date: new Date().toISOString().split('T')[0]
  });
  const studentInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();

  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery) return students.slice(0, 40);
    const lower = studentSearchQuery.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower)
    ).slice(0, 40);
  }, [students, studentSearchQuery]);

  useEffect(() => {
    if (!user) {
      setIncidents([]);
      setIsLoading(false);
      return;
    }

    const unsubscribe = smartDb.watch("BehaviorIncident", user.uid, (data) => {
      setIncidents(data as Incident[]);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Set of valid student IDs — only populated once students have loaded
  const validStudentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);

  // Resolve student name from directory so it always matches the real name
  const resolveStudentName = (inc: Incident): string => {
    const dir = students.find(s => s.id === inc.studentId);
    return dir?.name || inc.studentName || "";
  };

  // Filter incidents to only those belonging to the school's real students.
  // Skip incidents whose studentId is not in the student directory (orphaned records).
  const filteredIncidents = useMemo(() => incidents.filter(inc => {
    if (students.length > 0 && inc.studentId && !validStudentIds.has(inc.studentId)) return false;
    const name = resolveStudentName(inc).toLowerCase();
    const matchesSearch = name.includes((searchTerm || "").toLowerCase()) ||
      (inc.id?.toLowerCase() || "").includes((searchTerm || "").toLowerCase());
    const matchesType = selectedType === "all" || inc.type === selectedType;
    const matchesSeverity = selectedSeverity === "all" || inc.severity === selectedSeverity;
    return matchesSearch && matchesType && matchesSeverity;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [incidents, students, validStudentIds, searchTerm, selectedType, selectedSeverity]);

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE);
  const paginatedIncidents = filteredIncidents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedSeverity]);

  const handleAddIncident = async () => {
    if (!newIncident.studentId || !newIncident.studentName) {
      toast.error("Please select a student");
      return;
    }
    if (!newIncident.description.trim()) {
      toast.error("Please enter a description");
      return;
    }
    if (!user) {
      toast.error("You must be logged in to report incidents");
      return;
    }

    try {
      const id = `BHV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const record: Incident = {
        id,
        ...newIncident,
        uid: user.uid,
        createdAt: new Date().toISOString(),
      } as Incident;

      // Count current demerits for this student before adding this new one
      const studentId = newIncident.studentId;
      const currentStudentDemerits = incidents.filter(i => i.studentId === studentId && i.type === "Demerit").length;
      const totalDemeritsAfterThis = currentStudentDemerits + (newIncident.type === "Demerit" ? 1 : 0);

      // Optimistic update — show immediately without waiting for watch poll
      setIncidents(prev => [record, ...prev]);

      await smartDb.create("BehaviorIncident", record as unknown as Record<string, unknown>, id);

      setIsAddDialogOpen(false);
      setNewIncident({
        studentName: "",
        studentId: "",
        type: "Demerit",
        category: "Conduct",
        description: "",
        severity: "Medium",
        date: new Date().toISOString().split('T')[0],
      });
      setStudentSearchQuery("");
      
      toast.success("Behavior incident reported successfully");

      // Behavior Threshold Rules Engine — each tier now fires a real
      // Notification to the parent (private, studentId-scoped) and admin,
      // instead of only a local toast the acting staff member happened to
      // be looking at. Previously the toast text claimed "an automated
      // notice has been sent to parent and registrar" while nothing was
      // ever actually sent.
      if (record.type === "Demerit") {
        const now = new Date().toISOString();
        const fireThresholdNotification = async (tier: string, title: string, message: string) => {
          const notifId = `notif-behavior-${tier}-${id}`;
          await smartDb.create("Notification", {
            id: notifId, uid: user?.uid, audienceRole: "parent", studentId,
            category: "behavior", type: "behavior_threshold", title, message,
            createdAt: now, time: now, read: false,
          }, notifId).catch(() => {});
          await smartDb.create("Notification", {
            id: `${notifId}-admin`, uid: user?.uid, audienceRole: "admin",
            category: "behavior", type: "behavior_threshold", title, message,
            createdAt: now, time: now, read: false,
          }, `${notifId}-admin`).catch(() => {});
        };

        if (totalDemeritsAfterThis >= 10) {
          toast.warning(`🚨 CRITICAL THRESHOLD REACHED: ${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits. Escalating to Principal & Scheduling Suspension Review.`, {
            duration: 10000,
            description: "A notification has been sent to parent and admin."
          });
          await fireThresholdNotification(
            "critical", "🚨 Critical Behavior Threshold Reached",
            `${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits — escalating to Principal, suspension review being scheduled.`
          );
          try {
            await updateStudent(studentId, { riskScore: 95, performance: "Poor" });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        } else if (totalDemeritsAfterThis >= 5) {
          toast.warning(`⚠️ Parent-Teacher Conference Triggered: ${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits. Status updated to At-Risk.`, {
            duration: 8000,
            description: "A notification has been sent to parent and admin."
          });
          await fireThresholdNotification(
            "ptc", "⚠️ Parent-Teacher Conference Recommended",
            `${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits — student is now At-Risk, a PTC is recommended.`
          );
          try {
            await updateStudent(studentId, { riskScore: 75, performance: "Below Average" });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        } else if (totalDemeritsAfterThis >= 3) {
          toast.info(`ℹ️ Behavior Alert: ${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits. Warning notification dispatched.`, {
            duration: 6000
          });
          await fireThresholdNotification(
            "warning", "Behavior Alert",
            `${record.studentName} has accumulated ${totalDemeritsAfterThis} demerits.`
          );
          try {
            await updateStudent(studentId, { riskScore: 50 });
          } catch (e) {
            console.error("Failed to update student risk score:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error adding incident:", error);
      toast.error("Failed to report incident");
    }
  };

  const handleDeleteIncident = async (id: string) => {
    // Optimistic update — remove immediately
    setIncidents(prev => prev.filter(i => i.id !== id));
    try {
      await smartDb.delete("BehaviorIncident", id);
      toast.success("Incident record deleted");
    } catch (error) {
      console.error("Error deleting incident:", error);
      toast.error("Failed to delete record");
      // Revert not needed — watch will re-sync on next poll
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
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
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Student Behavior</h1>
              <p className="text-sm text-slate-400">Track student conduct, discipline records, and merit awards.</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl h-10 bg-[#9810fa] hover:bg-[#8710dc] text-white shadow-lg shadow-primary/20">
                <ShieldAlert className="h-4 w-4 mr-2" />
                Report Incident
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Report Behavior Incident</DialogTitle>
                <DialogDescription>
                  Record a new merit or demerit for a student.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="student" className="text-right pt-2">Student</Label>
                  <div className="col-span-3 relative">
                    <button
                      type="button"
                      onClick={() => setStudentSearchOpen(!studentSearchOpen)}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 flex items-center justify-between text-sm text-left hover:border-blue-300 transition-colors"
                    >
                      <span className={newIncident.studentName ? "text-slate-900 font-semibold" : "text-slate-400"}>
                        {newIncident.studentName ? `${newIncident.studentName} (${newIncident.studentId})` : "Search and select student…"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>
                    {studentSearchOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <Input
                            ref={studentInputRef}
                            autoFocus
                            placeholder="Search by name or ID…"
                            value={studentSearchQuery}
                            onChange={(e) => setStudentSearchQuery(e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {filteredStudents.length === 0 ? (
                            <div className="py-6 text-center text-slate-400 text-sm">No students found</div>
                          ) : filteredStudents.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setNewIncident({...newIncident, studentName: s.name, studentId: s.id});
                                setStudentSearchOpen(false);
                                setStudentSearchQuery("");
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left text-sm"
                            >
                              <div>
                                <p className="font-semibold text-slate-800">{s.name}</p>
                                <p className="text-xs text-slate-400">{s.id} · {s.classId}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Type</Label>
                  <Select value={newIncident.type} onValueChange={(v) => setNewIncident({...newIncident, type: v})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Merit">Merit</SelectItem>
                      <SelectItem value="Demerit">Demerit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Category</Label>
                  <Select value={newIncident.category} onValueChange={(v) => setNewIncident({...newIncident, category: v})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Conduct","Academic Integrity","Attendance","Leadership","Participation"].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Severity</Label>
                  <Select value={newIncident.severity} onValueChange={(v) => setNewIncident({...newIncident, severity: v})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Date</Label>
                  <Input
                    type="date"
                    className="col-span-3"
                    value={newIncident.date}
                    onChange={(e) => setNewIncident({...newIncident, date: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">Description</Label>
                  <Textarea
                    id="description"
                    className="col-span-3"
                    placeholder="Describe the incident..."
                    value={newIncident.description}
                    onChange={(e) => setNewIncident({...newIncident, description: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button className="gradient-primary" onClick={handleAddIncident}>Save Incident</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
              <Award className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Merits</p>
              <p className="text-lg font-bold">{filteredIncidents.filter(i => i.type === "Merit").length}</p>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-destructive/5 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Demerits</p>
              <p className="text-lg font-bold">{filteredIncidents.filter(i => i.type === "Demerit").length}</p>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Info className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">High Severity</p>
              <p className="text-lg font-bold">{filteredIncidents.filter(i => i.severity === "High").length}</p>
            </div>
          </motion.div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              className="pl-10 h-11 rounded-xl border-border bg-card focus-visible:ring-primary/20 transition-all"
              placeholder="Search by student name or record ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="h-11 rounded-xl px-4 gap-2 w-full sm:w-auto hover:bg-secondary/50 transition-all active:scale-95"
              >
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSelectedType("all")} className={cn(selectedType === "all" && "bg-accent")}>
                All Types
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("Merit")} className={cn(selectedType === "Merit" && "bg-accent")}>
                Merits Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedType("Demerit")} className={cn(selectedType === "Demerit" && "bg-accent")}>
                Demerits Only
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by Severity</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSelectedSeverity("all")} className={cn(selectedSeverity === "all" && "bg-accent")}>
                All Severities
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSeverity("Low")} className={cn(selectedSeverity === "Low" && "bg-accent")}>
                Low Severity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSeverity("Medium")} className={cn(selectedSeverity === "Medium" && "bg-accent")}>
                Medium Severity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSeverity("High")} className={cn(selectedSeverity === "High" && "bg-accent")}>
                High Severity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="premium-card overflow-hidden"
        >
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Student</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Type</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Description</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Severity</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Date</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {paginatedIncidents.map((inc) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={inc.id} 
                    className="hover:bg-secondary/30 transition-colors group border-b border-border/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground">
                          <User className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">{resolveStudentName(inc)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "border-none font-medium rounded-lg px-2 py-0.5 text-[10px] uppercase tracking-tighter",
                          inc.type === "Merit" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {inc.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{inc.description}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "border-border font-medium rounded-lg px-2 py-0.5 text-[10px] uppercase tracking-tighter",
                          inc.severity === "High" && "border-destructive text-destructive bg-destructive/5",
                          inc.severity === "Medium" && "border-orange-500 text-orange-600 bg-orange-500/5",
                          inc.severity === "Low" && "border-blue-500 text-purple-600 bg-blue-500/5"
                        )}
                      >
                        {inc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {inc.date}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingIncident(inc)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingIncident(inc)}>
                            <Edit2 className="h-4 w-4 mr-2" /> Edit Record
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteIncident(inc.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </motion.tr>
                ))}
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">Loading records...</p>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredIncidents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">No behavior incidents found.</p>
                    </TableCell>
                  </TableRow>
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
              <p className="text-xs text-slate-500 font-medium">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredIncidents.length)} of {filteredIncidents.length} records
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  Previous
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const page = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                  return (
                    <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0 text-xs rounded-lg" onClick={() => setCurrentPage(page)}>
                      {page}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* View Details Dialog */}
        {viewingIncident && (
          <Dialog open={!!viewingIncident} onOpenChange={() => setViewingIncident(null)}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Incident Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-bold text-slate-500">Student</Label>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{viewingIncident.studentName} ({viewingIncident.studentId})</p>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-500">Type</Label>
                  <Badge className={`mt-1 ${viewingIncident.type === "Merit" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                    {viewingIncident.type}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-500">Severity</Label>
                  <Badge variant="outline" className={`mt-1 ${
                    viewingIncident.severity === "High" ? "border-destructive text-destructive" :
                    viewingIncident.severity === "Medium" ? "border-orange-500 text-orange-600" :
                    "border-blue-500 text-purple-600"
                  }`}>
                    {viewingIncident.severity}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-500">Date</Label>
                  <p className="text-sm text-slate-700 mt-1">{viewingIncident.date}</p>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-500">Description</Label>
                  <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{viewingIncident.description}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewingIncident(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Record Dialog */}
        {editingIncident && (
          <Dialog open={!!editingIncident} onOpenChange={() => setEditingIncident(null)}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Incident Record</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-500 mb-2 block">Type</Label>
                    <Select value={editingIncident.type} onValueChange={(v) => setEditingIncident({...editingIncident, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Merit">Merit</SelectItem>
                        <SelectItem value="Demerit">Demerit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500 mb-2 block">Severity</Label>
                    <Select value={editingIncident.severity} onValueChange={(v) => setEditingIncident({...editingIncident, severity: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-500 mb-2 block">Category</Label>
                    <Select value={editingIncident.category || "Conduct"} onValueChange={(v) => setEditingIncident({...editingIncident, category: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Conduct","Academic Integrity","Attendance","Leadership","Participation"].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500 mb-2 block">Date</Label>
                    <Input
                      type="date"
                      value={editingIncident.date}
                      onChange={(e) => setEditingIncident({...editingIncident, date: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-500 mb-2 block">Description</Label>
                  <Textarea
                    value={editingIncident.description}
                    onChange={(e) => setEditingIncident({...editingIncident, description: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingIncident(null)}>Cancel</Button>
                <Button onClick={async () => {
                  // Optimistic update
                  setIncidents(prev => prev.map(i => i.id === editingIncident.id ? editingIncident : i));
                  setEditingIncident(null);
                  try {
                    await smartDb.update("BehaviorIncident", editingIncident.id, {
                      type: editingIncident.type,
                      category: editingIncident.category,
                      severity: editingIncident.severity,
                      description: editingIncident.description,
                      date: editingIncident.date,
                    });
                    toast.success("Incident updated successfully");
                  } catch (error) {
                    toast.error("Failed to update incident");
                  }
                }}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default Behavior;
