import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  ShieldAlert, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Clock, 
  MapPin, 
  User,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Trash2,
  Edit,
  Shield,
  FileText,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface InvestigationNote {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

interface SecurityIncident {
  id: string;
  title: string;
  category: string;
  location: string;
  date: string;
  time: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "In Progress" | "Resolved";
  reporter: string;
  description: string;
  actionTaken?: string;
  notes?: InvestigationNote[];
  resolvedAt?: string;
  resolvedBy?: string;
  involvedMemberName?: string;
  involvedMemberType?: string;
  involvedMemberId?: string;
}

export default function SecurityIncidents() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<SecurityIncident | null>(null);

  // Db members (students and staff combined) for autocomplete
  const [members, setMembers] = useState<{ id: string; name: string; type: string; image?: string }[]>([]);
  const [searchMemberQuery, setSearchMemberQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; type: string; image?: string } | null>(null);

  const [newIncident, setNewIncident] = useState({
    title: "",
    category: "Intrusion",
    location: "",
    severity: "Low" as const,
    description: "",
    reporter: "",
    involvedMemberName: "",
    involvedMemberType: "",
    involvedMemberId: ""
  });

  const [updateStatusData, setUpdateStatusData] = useState<{ status: SecurityIncident["status"]; newNote: string }>({
    status: "Open",
    newNote: ""
  });

  // Load Incidents from smartDb
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setLoading(true);
        // No mock seeding — the incident register starts empty rather than
        // fabricated "Officer Ahmad" demo incidents.
        const data = await smartDb.getAll("SecurityIncident");
        if (!active) return;
        setIncidents((data as SecurityIncident[]) || []);

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
      } catch (err) {
        console.error("Failed to load security incidents:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [user]);

  // Statistics
  const stats = useMemo(() => {
    const total = incidents.length;
    const critical = incidents.filter(i => i.severity === "Critical" || i.severity === "High").length;
    const open = incidents.filter(i => i.status === "Open" || i.status === "In Progress").length;
    const resolved = incidents.filter(i => i.status === "Resolved").length;
    return { total, critical, open, resolved };
  }, [incidents]);

  // Filtered Incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      const matchesSearch = 
        i.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.reporter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.involvedMemberName && i.involvedMemberName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesSeverity = filterSeverity === "all" || i.severity === filterSeverity;
      const matchesStatus = filterStatus === "all" || i.status === filterStatus;

      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [incidents, searchTerm, filterSeverity, filterStatus]);

  // Filtered members for autocomplete
  const filteredMembers = useMemo(() => {
    if (!searchMemberQuery) return [];
    return members.filter(m => 
      m.name.toLowerCase().includes(searchMemberQuery.toLowerCase()) ||
      m.type.toLowerCase().includes(searchMemberQuery.toLowerCase())
    ).slice(0, 5);
  }, [members, searchMemberQuery]);

  const handleSelectMember = (member: typeof members[0]) => {
    setSelectedMember(member);
    setNewIncident(prev => ({
      ...prev,
      involvedMemberName: member.name,
      involvedMemberType: member.type,
      involvedMemberId: member.id
    }));
    setSearchMemberQuery("");
  };

  const handleClearSelectedMember = () => {
    setSelectedMember(null);
    setNewIncident(prev => ({
      ...prev,
      involvedMemberName: "",
      involvedMemberType: "",
      involvedMemberId: ""
    }));
  };

  const handleReportIncident = async () => {
    if (!newIncident.title || !newIncident.location || !newIncident.description || !newIncident.reporter) {
      toast.error("Please fill in all required fields");
      return;
    }

    const nextIdNum = incidents.length > 0 
      ? Math.max(...incidents.map(i => parseInt(i.id.split("-")[1]) || 0)) + 1 
      : 1;
    
    const incidentId = `INC-${String(nextIdNum).padStart(3, '0')}`;
    const now = new Date();

    const incident: SecurityIncident = {
      id: incidentId,
      title: newIncident.title,
      category: newIncident.category,
      location: newIncident.location,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      severity: newIncident.severity,
      status: "Open",
      reporter: newIncident.reporter,
      description: newIncident.description,
      actionTaken: "",
      involvedMemberName: newIncident.involvedMemberName || undefined,
      involvedMemberType: newIncident.involvedMemberType || undefined,
      involvedMemberId: newIncident.involvedMemberId || undefined
    };

    try {
      await smartDb.create("SecurityIncident", { 
        ...incident, 
        uid: user?.uid || "admin-uid", 
        createdAt: now.toISOString() 
      }, incident.id);
      
      setIncidents([incident, ...incidents]);
      setIsReportDialogOpen(false);
      setNewIncident({
        title: "",
        category: "Intrusion",
        location: "",
        severity: "Low",
        description: "",
        reporter: "",
        involvedMemberName: "",
        involvedMemberType: "",
        involvedMemberId: ""
      });
      setSelectedMember(null);
      toast.success(`Incident ${incidentId} reported successfully`);
    } catch (err) {
      console.error("Failed to report incident:", err);
      toast.error("Database error while reporting incident");
    }
  };

  const handleOpenUpdateStatus = (incident: SecurityIncident) => {
    setSelectedIncident(incident);
    setUpdateStatusData({
      status: incident.status,
      newNote: ""
    });
    setIsUpdateDialogOpen(true);
  };

  const handleSaveUpdateStatus = async () => {
    if (!selectedIncident) return;

    try {
      const existingNotes = selectedIncident.notes || [];
      const trimmedNote = updateStatusData.newNote.trim();
      const notes = trimmedNote
        ? [...existingNotes, {
            id: `NOTE-${Date.now()}`,
            text: trimmedNote,
            author: user?.name || user?.email || "Security Officer",
            timestamp: new Date().toISOString(),
          }]
        : existingNotes;

      const justResolved = updateStatusData.status === "Resolved" && selectedIncident.status !== "Resolved";
      const updatedFields: Partial<SecurityIncident> = {
        status: updateStatusData.status,
        notes,
        ...(justResolved ? {
          resolvedAt: new Date().toISOString(),
          resolvedBy: user?.name || user?.email || "Security Officer",
        } : {}),
      };

      await smartDb.update("SecurityIncident", selectedIncident.id, updatedFields as Record<string, unknown>);

      setIncidents(incidents.map(i =>
        i.id === selectedIncident.id
          ? { ...i, ...updatedFields }
          : i
      ));

      setIsUpdateDialogOpen(false);
      toast.success(`Incident ${selectedIncident.id} updated`);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Database error while updating status");
    }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!window.confirm(`Permanently delete incident record ${id}?`)) return;

    try {
      await smartDb.delete("SecurityIncident", id);
      setIncidents(incidents.filter(i => i.id !== id));
      toast.success(`Incident ${id} deleted successfully`);
    } catch (err) {
      console.error("Failed to delete incident:", err);
      toast.error("Database error while deleting incident");
    }
  };

  const handleOpenDetails = (incident: SecurityIncident) => {
    setSelectedIncident(incident);
    setIsDetailsDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Security Incidents</h1>
              <p className="text-sm text-slate-400">Log and track campus safety incidents, actions, and security status.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary">
                  <Plus className="mr-2 h-4 w-4" /> Log Security Incident
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Log Security Incident</DialogTitle>
                  <DialogDescription>
                    Fill in incident details to log a security/safety record.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Incident Title</Label>
                    <Input 
                      id="title" 
                      placeholder="e.g. Broken lock on science gate" 
                      value={newIncident.title}
                      onChange={(e) => setNewIncident({...newIncident, title: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select 
                        value={newIncident.category}
                        onValueChange={(value) => setNewIncident({...newIncident, category: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Intrusion">Intrusion/Trespassing</SelectItem>
                          <SelectItem value="Facility">Facility/Infrastructure</SelectItem>
                          <SelectItem value="Theft/Loss">Theft / Lost Property</SelectItem>
                          <SelectItem value="Medical">Medical Emergency</SelectItem>
                          <SelectItem value="Vandalism">Vandalism</SelectItem>
                          <SelectItem value="Disciplinary">Disciplinary Case</SelectItem>
                          <SelectItem value="Other">Other Safety Hazard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Severity</Label>
                      <Select 
                        value={newIncident.severity}
                        onValueChange={(value: any) => setNewIncident({...newIncident, severity: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="location">Location</Label>
                      <Input 
                        id="location" 
                        placeholder="e.g. Main Gate, Science Lab" 
                        value={newIncident.location}
                        onChange={(e) => setNewIncident({...newIncident, location: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="reporter">Reporting Guard/Officer</Label>
                      <Input 
                        id="reporter" 
                        placeholder="e.g. Guard Salim" 
                        value={newIncident.reporter}
                        onChange={(e) => setNewIncident({...newIncident, reporter: e.target.value})}
                      />
                    </div>
                  </div>
                  {/* Auto-select involved member */}
                  <div className="grid gap-2 relative">
                    <Label htmlFor="member-search">Involved Member (Optional - Student/Staff)</Label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between p-2 rounded-lg border bg-slate-50 border-slate-200 text-xs">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={selectedMember.image} />
                            <AvatarFallback className="text-[8px] font-bold">{(selectedMember.name || "ST").split(' ').map(n => n[0] || "").join('')}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-bold text-slate-800">{selectedMember.name}</span>
                            <span className="ml-1.5 text-[9px] text-muted-foreground font-semibold uppercase">{selectedMember.type} ({selectedMember.id})</span>
                          </div>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-1.5 text-rose-500 hover:text-rose-700 font-bold text-xs" 
                          onClick={handleClearSelectedMember}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input 
                            id="member-search" 
                            placeholder="Type to search students or staff..." 
                            className="pl-9 h-9 text-xs"
                            value={searchMemberQuery}
                            onChange={(e) => setSearchMemberQuery(e.target.value)}
                          />
                        </div>
                        {filteredMembers.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover text-popover-foreground shadow-md p-1 space-y-0.5 max-h-40 overflow-y-auto">
                            {filteredMembers.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-xs flex items-center justify-between group transition-colors"
                                onClick={() => handleSelectMember(m)}
                              >
                                <span className="font-bold text-slate-700">{m.name}</span>
                                <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-wider group-hover:bg-primary group-hover:text-white">
                                  {m.type}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Incident Description</Label>
                    <Textarea 
                      id="description" 
                      placeholder="Describe what occurred, who was involved, and immediate actions..." 
                      className="h-24"
                      value={newIncident.description}
                      onChange={(e) => setNewIncident({...newIncident, description: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleReportIncident} className="gradient-primary">Log Incident</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Incidents</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-[10px] text-muted-foreground font-semibold mt-1">Logged in database</p>
            </CardContent>
          </Card>
          <Card className="premium-card bg-rose-500/5">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-500">Critical / High</CardTitle>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{stats.critical}</div>
              <p className="text-[10px] text-rose-500 font-semibold mt-1">Require supervision</p>
            </CardContent>
          </Card>
          <Card className="premium-card bg-amber-500/5">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-500">Pending / Open</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.open}</div>
              <p className="text-[10px] text-amber-500 font-semibold mt-1">Actively investigating</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-500">Resolved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.resolved}</div>
              <p className="text-[10px] text-emerald-500 font-semibold mt-1">Successfully closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar */}
        <Card className="premium-card">
          <CardHeader className="pb-3 border-b border-sidebar-border/50 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Incidents Register
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full md:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search incidents..."
                    className="pl-9 h-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="w-32 h-9 bg-background">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-32 h-9 bg-background">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground font-medium">Loading security incidents from database...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-sidebar-border/50">
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-[110px]">Incident ID</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-[32%]">Incident details</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Location</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-[110px]">Severity</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Reported By</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider w-[120px]">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncidents.map((incident) => (
                    <TableRow key={incident.id} className="border-sidebar-border/50 group">
                      <TableCell className="font-bold text-sm text-primary">{incident.id}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">{incident.title}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wide px-1.5 h-4 border-none bg-slate-100 text-slate-600">
                              {incident.category}
                            </Badge>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                              <Clock className="h-3 w-3 shrink-0" />
                              {format(new Date(incident.date), "d MMM")} · {incident.time}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" /> {incident.location}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={cn(
                            "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none",
                            incident.severity === "Critical" ? "bg-rose-600 text-white" :
                            incident.severity === "High" ? "bg-red-500/10 text-red-600" :
                            incident.severity === "Medium" ? "bg-amber-500/10 text-amber-600" :
                            "bg-blue-500/10 text-purple-600"
                          )}
                          variant="outline"
                        >
                          {incident.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-slate-700">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-muted-foreground" /> {incident.reporter}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={cn(
                            "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border",
                            incident.status === "Resolved" ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                            incident.status === "In Progress" ? "bg-blue-500/5 text-purple-600 border-blue-500/20" :
                            "bg-rose-500/5 text-rose-600 border-rose-500/20"
                          )}
                          variant="outline"
                        >
                          {incident.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenDetails(incident)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenUpdateStatus(incident)}>
                              <Edit className="mr-2 h-4 w-4" /> Update Status &amp; Action
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-500" onClick={() => handleDeleteIncident(incident.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredIncidents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No incidents registered matching current filter parameters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Incident Details File
            </DialogTitle>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4 py-3">
              <div>
                <h3 className="text-lg font-bold">{selectedIncident.title}</h3>
                <p className="text-xs text-muted-foreground font-semibold uppercase">{selectedIncident.id} · {selectedIncident.category}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-sidebar-border/50">
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Location</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedIncident.location}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Time logged</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedIncident.date} at {selectedIncident.time}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Severity</p>
                  <Badge 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none mt-0.5",
                      selectedIncident.severity === "Critical" ? "bg-rose-600 text-white" :
                      selectedIncident.severity === "High" ? "bg-red-500/10 text-red-600" :
                      selectedIncident.severity === "Medium" ? "bg-amber-500/10 text-amber-600" :
                      "bg-blue-500/10 text-purple-600"
                    )}
                    variant="outline"
                  >
                    {selectedIncident.severity}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Current Status</p>
                  <Badge 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border mt-0.5",
                      selectedIncident.status === "Resolved" ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                      selectedIncident.status === "In Progress" ? "bg-blue-500/5 text-purple-600 border-blue-500/20" :
                      "bg-rose-500/5 text-rose-600 border-rose-500/20"
                    )}
                    variant="outline"
                  >
                    {selectedIncident.status}
                  </Badge>
                </div>
              </div>
              {selectedIncident.involvedMemberName && (
                <div className="pt-3 border-t border-sidebar-border/50">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Involved Member</p>
                  <div className="flex items-center gap-2 mt-1 p-2 rounded-lg border bg-slate-50">
                    <span className="text-sm font-bold text-slate-800">{selectedIncident.involvedMemberName}</span>
                    <Badge variant="outline" className="text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5">
                      {selectedIncident.involvedMemberType} ({selectedIncident.involvedMemberId})
                    </Badge>
                  </div>
                </div>
              )}
              <div className="pt-3 border-t border-sidebar-border/50">
                <p className="text-xs font-bold uppercase text-muted-foreground">Description</p>
                <p className="text-sm font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border mt-1 leading-relaxed">
                  {selectedIncident.description}
                </p>
              </div>
              <div className="pt-3 border-t border-sidebar-border/50">
                <p className="text-xs font-bold uppercase text-muted-foreground">Investigation Notes</p>
                {(!selectedIncident.actionTaken && (!selectedIncident.notes || selectedIncident.notes.length === 0)) ? (
                  <p className="text-sm font-medium text-slate-500 bg-slate-50 p-2.5 rounded-lg border mt-1 italic">
                    Investigation in progress. No notes logged yet.
                  </p>
                ) : (
                  <div className="space-y-2 mt-1">
                    {selectedIncident.actionTaken && (
                      <div className="text-sm bg-slate-50 p-2.5 rounded-lg border">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">{selectedIncident.reporter} · Initial report</p>
                        <p className="text-slate-700 mt-0.5">{selectedIncident.actionTaken}</p>
                      </div>
                    )}
                    {(selectedIncident.notes || []).map(note => (
                      <div key={note.id} className="text-sm bg-slate-50 p-2.5 rounded-lg border">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">{note.author} · {format(new Date(note.timestamp), "dd MMM yyyy, HH:mm")}</p>
                        <p className="text-slate-700 mt-0.5">{note.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedIncident.status === "Resolved" && selectedIncident.resolvedAt && (
                <div className="pt-3 border-t border-sidebar-border/50 flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-700 font-semibold">
                    Resolved by {selectedIncident.resolvedBy} on {format(new Date(selectedIncident.resolvedAt), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailsDialogOpen(false)}>Close details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Incident Status</DialogTitle>
            <DialogDescription>
              Change investigation status and add a dated investigation note — prior notes are preserved as a case history.
            </DialogDescription>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4 py-3">
              <div className="grid gap-2">
                <Label>Investigation Status</Label>
                <Select
                  value={updateStatusData.status}
                  onValueChange={(value: SecurityIncident["status"]) => setUpdateStatusData({ ...updateStatusData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(selectedIncident.notes && selectedIncident.notes.length > 0) || selectedIncident.actionTaken ? (
                <div className="grid gap-1.5">
                  <Label>Investigation Notes so far</Label>
                  <div className="max-h-32 overflow-y-auto space-y-2 rounded-lg border bg-slate-50 p-2.5">
                    {selectedIncident.actionTaken && (
                      <div className="text-xs">
                        <span className="font-bold text-slate-700">{selectedIncident.reporter}</span>
                        <span className="text-muted-foreground"> · initial report</span>
                        <p className="text-slate-600 mt-0.5">{selectedIncident.actionTaken}</p>
                      </div>
                    )}
                    {(selectedIncident.notes || []).map(note => (
                      <div key={note.id} className="text-xs border-t border-slate-200 pt-2 first:border-0 first:pt-0">
                        <span className="font-bold text-slate-700">{note.author}</span>
                        <span className="text-muted-foreground"> · {format(new Date(note.timestamp), "dd MMM, HH:mm")}</span>
                        <p className="text-slate-600 mt-0.5">{note.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="newNote">Add Investigation Note</Label>
                <Textarea
                  id="newNote"
                  placeholder="Record the latest action taken, authorities contacted, or resolution update..."
                  className="h-24"
                  value={updateStatusData.newNote}
                  onChange={(e) => setUpdateStatusData({ ...updateStatusData, newNote: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUpdateStatus} className="gradient-primary">Save Updates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
