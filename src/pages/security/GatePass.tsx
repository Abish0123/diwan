import { useState, useEffect, useMemo } from "react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Shield, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Clock, 
  MapPin, 
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  QrCode,
  Printer,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { printGatePassPdf } from "@/lib/securityPassPdf";
import { isToday, formatTime12h } from "@/lib/dateScope";

interface GatePassItem {
  id: string;
  name: string;
  type: string;
  reason: string;
  outTime: string;
  expectedIn: string;
  status: string;
  image: string;
  memberId?: string;
  outTimestamp?: string;    // ISO — real timestamp for sorting/overdue math
  expectedReturn?: string;  // ISO — today's date + expected return time
  parentNotified?: boolean;
  createdAt?: string;
}

// "Early Dismissal" is listed first since it's the most common student pass
// category (parent pickup mid-day) and schools want it quick to select.
const GATE_PASS_REASONS = [
  "Early Dismissal",
  "Medical Appointment",
  "Personal Work",
  "Official Duty",
  "Family Emergency",
];

// Only leadership/warden may approve a student leaving campus — a guard or
// receptionist can issue the request but cannot self-approve it, mirroring
// the Finance-approval gate on Purchase Orders.
const APPROVER_ROLES = ["admin", "super_admin", "school_owner", "principal", "vice_principal", "hostel_warden"];

// A student's expected-return time (HH:MM) resolved to an ISO timestamp on
// today's date, so overdue can be computed by real comparison instead of the
// old broken string compare against a "12:00 PM" literal.
function buildExpectedReturn(timeStr: string): string | undefined {
  if (!timeStr) return undefined;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function isOverdue(p: GatePassItem): boolean {
  return p.status === "Active" && !!p.expectedReturn && new Date(p.expectedReturn).getTime() < Date.now();
}

interface StudentContacts { fatherEmail?: string; motherEmail?: string; guardianEmail?: string; }

export default function GatePass() {
  const { user, role } = useAuth();
  const canApprove = APPROVER_ROLES.includes(role || "");
  const [gatePasses, setGatePasses] = useState<GatePassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [selectedPass, setSelectedPass] = useState<GatePassItem | null>(null);

  // Db members (students and staff combined) for autocomplete
  const [members, setMembers] = useState<{ id: string; name: string; type: string; image?: string }[]>([]);
  // Parent contacts keyed by student id, so an approved student pass can
  // notify the parents that their child has left campus.
  const [studentContacts, setStudentContacts] = useState<Record<string, StudentContacts>>({});
  const [searchMemberQuery, setSearchMemberQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; type: string; image?: string } | null>(null);

  const [newPass, setNewPass] = useState({
    name: "",
    type: "Student",
    reason: "",
    expectedIn: ""
  });

  // Load passes and members from smartDb
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setLoading(true);
        // No mock seeding — the registry starts empty on a fresh deployment
        // instead of fabricated "Robert Wilson / Alice Johnson" passes.
        const passesData = await smartDb.getAll("GatePass");
        if (!active) return;
        setGatePasses((passesData as GatePassItem[]) || []);

        // Load Student and Staff databases for autocomplete
        const [studentsList, staffList] = await Promise.all([
          smartDb.getAll("Student"),
          smartDb.getAll("Staff")
        ]);
        if (!active) return;

        const combinedMembers = [
          ...studentsList.map((s: any) => ({
            id: s.id,
            name: s.name,
            type: "Student",
            image: s.image
          })),
          ...staffList.map((st: any) => ({
            id: st.id,
            name: st.name,
            type: "Staff",
            image: st.image
          }))
        ];
        setMembers(combinedMembers);

        const contacts: Record<string, StudentContacts> = {};
        studentsList.forEach((s: any) => {
          contacts[s.id] = {
            fatherEmail: s.fatherEmail,
            motherEmail: s.motherEmail,
            guardianEmail: s.guardianEmail,
          };
        });
        setStudentContacts(contacts);
      } catch (err) {
        console.error("Failed to load gate pass or member data:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [user]);

  const filteredPasses = useMemo(() => {
    return gatePasses.filter(p => 
      (p.name?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
      (p.id?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
      (p.reason?.toLowerCase() || "").includes((searchTerm || "").toLowerCase())
    );
  }, [gatePasses, searchTerm]);

  const stats = useMemo(() => {
    const active = gatePasses.filter(p => p.status === "Active").length;
    const pending = gatePasses.filter(p => p.status === "Pending").length;
    // Real overdue: Active passes whose expected-return timestamp is in the
    // past. Replaces the old broken `... || 1` string-compare that always
    // reported at least one overdue even when nobody was out.
    const overdue = gatePasses.filter(isOverdue).length;
    // "Today" scoped by real timestamp instead of a lifetime pass count.
    const total = gatePasses.filter(p => isToday(p.outTimestamp || p.createdAt)).length;
    return { active, pending, overdue, total };
  }, [gatePasses]);

  // Autocomplete filtered list
  const filteredMembers = useMemo(() => {
    if (!searchMemberQuery) return [];
    return members.filter(m => 
      m.name.toLowerCase().includes(searchMemberQuery.toLowerCase()) ||
      m.type.toLowerCase().includes(searchMemberQuery.toLowerCase())
    ).slice(0, 5);
  }, [members, searchMemberQuery]);

  const handleSelectMember = (member: typeof members[0]) => {
    setSelectedMember(member);
    setNewPass(prev => ({
      ...prev,
      name: member.name,
      type: member.type
    }));
    setSearchMemberQuery("");
  };

  const handleClearSelectedMember = () => {
    setSelectedMember(null);
    setNewPass(prev => ({
      ...prev,
      name: "",
      type: "Student"
    }));
  };

  // Notify a student's parents (father/mother/guardian email) that their child
  // has been cleared to leave campus. Targeted by recipientUid = parent email,
  // exactly how fee reminders reach the parent portal.
  const notifyParents = async (pass: GatePassItem) => {
    const contacts = pass.memberId ? studentContacts[pass.memberId] : undefined;
    const emails = contacts
      ? [contacts.fatherEmail, contacts.motherEmail, contacts.guardianEmail].filter(Boolean) as string[]
      : [];
    if (emails.length === 0) return false;
    const stamp = Date.now();
    await Promise.allSettled(
      emails.map((email, i) =>
        smartDb.create("Notification", {
          id: `gp_notif_${stamp}_${i}`,
          recipientUid: email,
          category: "student",
          entity: "GatePass",
          type: "gate_pass_issued",
          title: "Your child has been given a gate pass",
          message: `${pass.name} has been permitted to leave campus. Reason: ${pass.reason}. Expected return: ${formatTime12h(pass.expectedIn)}.`,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
          redirectUrl: "/parent/attendance",
        }, `gp_notif_${stamp}_${i}`)
      )
    );
    return true;
  };

  const handleIssuePass = async () => {
    if (!newPass.name || !newPass.reason || !newPass.expectedIn) {
      toast.error("Please fill in all required fields");
      return;
    }

    const nextIdNum = gatePasses.length > 0
      ? Math.max(...gatePasses.map(p => parseInt(p.id.split("-")[2]) || 0)) + 1
      : 1;

    const passId = `GP-2024-${String(nextIdNum).padStart(3, '0')}`;
    // A student leaving campus needs warden/admin sign-off first → "Pending".
    // Staff and workers sign themselves out → issued as "Active" directly.
    const isStudent = newPass.type === "Student";
    const pass: GatePassItem = {
      id: passId,
      ...newPass,
      memberId: selectedMember?.id,
      outTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outTimestamp: new Date().toISOString(),
      expectedReturn: buildExpectedReturn(newPass.expectedIn),
      status: isStudent ? "Pending" : "Active",
      image: selectedMember?.image || `https://i.pravatar.cc/150?u=${(newPass.name || "person").split(' ')[0]?.toLowerCase() || "person"}`
    };

    try {
      await smartDb.create("GatePass", {
        ...pass,
        uid: user?.uid || "admin-uid",
        createdAt: new Date().toISOString()
      }, pass.id);

      setGatePasses([pass, ...gatePasses]);
      setNewPass({ name: "", type: "Student", reason: "", expectedIn: "" });
      setSelectedMember(null);
      setIsIssueDialogOpen(false);
      toast.success(isStudent
        ? "Gate pass request created — awaiting warden/admin approval"
        : "Gate pass issued successfully");
    } catch (err) {
      console.error("Failed to issue gate pass:", err);
      toast.error("Database error while issuing pass");
    }
  };

  // RBAC-enforced approval. Approving a student pass is the moment parents are
  // notified their child is leaving. The role check lives here (not just in
  // button visibility) so it can't be bypassed by calling the handler directly.
  const handleApprove = async (pass: GatePassItem) => {
    if (!canApprove) {
      toast.error("Only an administrator or warden can approve gate passes.");
      return;
    }
    try {
      await smartDb.update("GatePass", pass.id, { status: "Active", parentNotified: pass.type === "Student" });
      setGatePasses(gatePasses.map(p => p.id === pass.id ? { ...p, status: "Active", parentNotified: pass.type === "Student" } : p));
      if (pass.type === "Student") {
        const notified = await notifyParents(pass);
        toast.success(notified
          ? `Pass approved — parents of ${pass.name} notified`
          : "Pass approved (no parent contact on file to notify)");
      } else {
        toast.success("Pass approved");
      }
    } catch (err) {
      console.error("Failed to approve pass:", err);
      toast.error("Database error while approving pass");
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await smartDb.update("GatePass", id, { status: newStatus });
      setGatePasses(gatePasses.map(p =>
        p.id === id ? { ...p, status: newStatus } : p
      ));
      toast.success(`Pass status updated to ${newStatus}`);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Database error updating status");
    }
  };

  const viewQr = (pass: GatePassItem) => {
    setSelectedPass(pass);
    setIsQrDialogOpen(true);
  };

  const printPass = (pass: GatePassItem) => {
    printGatePassPdf(pass);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Gate Pass Management</h1>
              <p className="text-sm text-slate-400">Issue and track entry/exit passes for students and staff.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary">
                  <Plus className="mr-2 h-4 w-4" /> Issue Gate Pass
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Issue New Gate Pass</DialogTitle>
                  <DialogDescription>
                    Create a temporary exit pass for a student or staff member.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  
                  {/* Auto-select Search Field from DB */}
                  <div className="grid gap-2 relative">
                    <Label htmlFor="person-search">Search Organization Member (Student/Staff)</Label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 border-slate-200">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={selectedMember.image} />
                            <AvatarFallback className="text-[9px] font-bold">{(selectedMember.name || "ST").split(' ').map(n => n[0] || "").join('')}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{selectedMember.name}</p>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase">{selectedMember.type} ({selectedMember.id})</p>
                          </div>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-rose-500 hover:text-rose-700 font-bold text-xs" 
                          onClick={handleClearSelectedMember}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="person-search" 
                            placeholder="Type to search students or staff..." 
                            className="pl-9"
                            value={searchMemberQuery}
                            onChange={(e) => setSearchMemberQuery(e.target.value)}
                          />
                        </div>
                        {filteredMembers.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover text-popover-foreground shadow-md p-1 space-y-0.5 max-h-48 overflow-y-auto">
                            {filteredMembers.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-accent text-sm flex items-center justify-between group transition-colors"
                                onClick={() => handleSelectMember(m)}
                              >
                                <span className="font-bold text-slate-700">{m.name}</span>
                                <Badge variant="secondary" className="text-[10px] font-black uppercase tracking-wider group-hover:bg-primary group-hover:text-white">
                                  {m.type}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchMemberQuery && filteredMembers.length === 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover p-3 text-center text-xs text-muted-foreground shadow-md">
                            No matching students or staff found. Or type custom name below:
                            <Input 
                              className="mt-2 text-xs h-8"
                              placeholder="Type custom guest/worker name..." 
                              value={newPass.name}
                              onChange={(e) => setNewPass({...newPass, name: e.target.value, type: "Worker"})}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="type">Pass Holder Type</Label>
                      <Select 
                        value={newPass.type} 
                        onValueChange={(value) => setNewPass({...newPass, type: value})}
                        disabled={!!selectedMember}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Student">Student</SelectItem>
                          <SelectItem value="Staff">Staff</SelectItem>
                          <SelectItem value="Worker">Worker</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="expected-in">Expected Return Time</Label>
                      <Input 
                        id="expected-in" 
                        type="time" 
                        value={newPass.expectedIn}
                        onChange={(e) => setNewPass({...newPass, expectedIn: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason-category">Reason for Exit</Label>
                    <Select
                      value={GATE_PASS_REASONS.includes(newPass.reason) ? newPass.reason : (newPass.reason ? "Other" : "")}
                      onValueChange={(value) => setNewPass({ ...newPass, reason: value === "Other" ? "" : value })}
                    >
                      <SelectTrigger id="reason-category">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {GATE_PASS_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        <SelectItem value="Other">Other (specify)</SelectItem>
                      </SelectContent>
                    </Select>
                    {!GATE_PASS_REASONS.includes(newPass.reason) && (
                      <Input
                        placeholder="Specify reason"
                        className="mt-1"
                        value={newPass.reason}
                        onChange={(e) => setNewPass({ ...newPass, reason: e.target.value })}
                      />
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsIssueDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleIssuePass} className="gradient-primary">Issue Pass</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Passes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
              <p className="text-[10px] text-emerald-500 font-bold mt-1">Currently outside campus</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-[10px] text-amber-500 font-bold mt-1">Awaiting warden/admin sign-off</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-500">{stats.overdue}</div>
              <p className="text-[10px] text-rose-500 font-bold mt-1">Passed expected return time</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Total passes issued today</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card overflow-hidden">
          <CardHeader className="border-b border-sidebar-border/50 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold">Pass Registry</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search passes..."
                    className="pl-9 h-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-sidebar-border/50">
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Person</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Type</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Reason</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Out Time</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Exp. In</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPasses.map((pass) => (
                  <TableRow key={pass.id} className="border-sidebar-border/50 group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-primary/10">
                          <AvatarImage src={pass.image} />
                          <AvatarFallback className="text-[10px] font-bold">{(pass.name || "ST").split(' ').map(n => n[0] || "").join('')}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold group-hover:text-primary transition-colors">{pass.name}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{pass.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] font-bold bg-muted/50 text-muted-foreground border-none">
                        {pass.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {pass.reason === "Early Dismissal" ? (
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none bg-violet-500/10 text-purple-600">
                          {pass.reason}
                        </Badge>
                      ) : pass.reason}
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{pass.outTime}</TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{formatTime12h(pass.expectedIn)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none",
                            pass.status === "Active" ? "bg-emerald-500/10 text-emerald-500" :
                            pass.status === "Pending" ? "bg-amber-500/10 text-amber-500" :
                            "bg-slate-500/10 text-slate-500"
                          )}
                        >
                          {pass.status}
                        </Badge>
                        {isOverdue(pass) && (
                          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none bg-rose-500/10 text-rose-600 animate-pulse">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => viewQr(pass)}>
                            <QrCode className="mr-2 h-4 w-4" /> View QR
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printPass(pass)}>
                            <Printer className="mr-2 h-4 w-4" /> Print Pass
                          </DropdownMenuItem>
                          {pass.status === "Pending" && (
                            canApprove ? (
                              <DropdownMenuItem onClick={() => handleApprove(pass)}>
                                <Check className="mr-2 h-4 w-4 text-emerald-500" /> Approve
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled className="text-amber-600">
                                <AlertCircle className="mr-2 h-4 w-4" /> Awaiting warden/admin approval
                              </DropdownMenuItem>
                            )
                          )}
                          {pass.status === "Active" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(pass.id, "Returned")}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" /> Mark Returned
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-rose-500" onClick={() => handleStatusChange(pass.id, "Cancelled")}>
                            <X className="mr-2 h-4 w-4" /> Cancel Pass
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPasses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No gate passes found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-center">Gate Pass QR</DialogTitle>
          </DialogHeader>
          {selectedPass && (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="p-4 bg-white rounded-xl border-2 border-primary/10">
                <QrCode className="h-32 w-32 text-slate-900" />
              </div>
              <div className="text-center">
                <p className="font-bold">{selectedPass.name}</p>
                <p className="text-xs text-muted-foreground">{selectedPass.id}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={() => printPass(selectedPass)}>
                <Printer className="mr-2 h-4 w-4" /> Print Pass
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
