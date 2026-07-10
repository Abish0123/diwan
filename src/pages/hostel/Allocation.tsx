import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Plus, 
  Search, 
  User, 
  Home, 
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
  UserPlus,
  Download,
  Filter,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { createHostelFeeInvoice } from "@/hooks/useFees";
import { useAuth } from "@/hooks/useAuth";

interface Allocation {
  id: string;
  studentName: string;
  studentId: string;
  room: string;
  block: string;
  startDate: string;
  endDate: string;
  status: string;
  type: string;
}

interface Room {
  id: string;
  block: string;
  type: string;
  capacity: number;
  status: string;
}

const Allocation = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomFilter = searchParams.get("room");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(roomFilter || "");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<Allocation | null>(null);
  const [filterHostel, setFilterHostel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [formData, setFormData] = useState<Allocation>({
    id: "",
    studentName: "",
    studentId: "",
    room: "",
    block: "A-Block",
    startDate: "",
    endDate: "",
    status: "Active",
    type: "Single Room"
  });

  useEffect(() => {
    fetchAllocations();
  }, []);

  const fetchAllocations = async () => {
    try {
      setIsLoading(true);
      const [data, roomData] = await Promise.all([
        smartDb.getAll("HostelAllocation"),
        smartDb.getAll("HostelRoom"),
      ]);
      setAllocations(data);
      setRooms(roomData as unknown as Room[]);
    } catch (error) {
      console.error("Error fetching allocations:", error);
      toast.error("Failed to load allocations");
    } finally {
      setIsLoading(false);
    }
  };

  // Active allocations currently occupying a room (optionally excluding the one being edited)
  const roomOccupancy = (roomId: string, excludeId?: string) =>
    allocations.filter(a =>
      a.room === roomId &&
      a.id !== excludeId &&
      (a.status === "Active" || a.status === "Expiring Soon")
    ).length;

  const filteredAllocations = allocations.filter(alc => {
    const matchesSearch =
      (alc.studentName?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (alc.studentId?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (alc.room?.toLowerCase() || "").includes((searchQuery || "").toLowerCase());

    const matchesHostel =
      filterHostel === "all" ||
      (() => {
        const h = filterHostel.toLowerCase();
        const block = (alc.block?.toLowerCase() || "");
        if (h === "boys hostel") return block.includes("boys") || block.includes("a-block") || block.includes("b-block");
        if (h === "girls hostel") return block.includes("girls") || block.includes("c-block");
        if (h === "staff quarters") return block.includes("staff") || block.includes("d-block");
        return true;
      })();

    const matchesStatus =
      filterStatus === "all" ||
      (() => {
        const s = filterStatus.toLowerCase();
        const as_ = (alc.status?.toLowerCase() || "");
        if (s === "occupied") return as_ === "active";
        if (s === "vacant") return as_ === "terminated" || as_ === "inactive";
        if (s === "reserved") return as_ === "expiring soon" || as_ === "pending";
        return true;
      })();

    return matchesSearch && matchesHostel && matchesStatus;
  });

  const handleAllocate = () => {
    setEditingAllocation(null);
    setFormData({
      id: `ALC-${Math.floor(100 + Math.random() * 900)}`,
      studentName: "",
      studentId: "",
      room: "",
      block: "A-Block",
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      status: "Active",
      type: "Single Room"
    });
    setIsDialogOpen(true);
  };

  const handleEditAllocation = (alc: Allocation) => {
    setEditingAllocation(alc);
    setFormData({ ...alc });
    setIsDialogOpen(true);
  };

  const handleTerminate = async (id: string) => {
    try {
      await smartDb.delete("HostelAllocation", id);
      setAllocations(allocations.filter(a => a.id !== id));
      toast.success("Stay terminated successfully");
    } catch (error) {
      console.error("Error terminating stay:", error);
      toast.error("Failed to terminate stay");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.room) {
      toast.error("Please select a room");
      return;
    }
    // Capacity check — block over-allocation
    const targetRoom = rooms.find(r => r.id === formData.room);
    if (targetRoom && (formData.status === "Active" || formData.status === "Expiring Soon")) {
      const occupied = roomOccupancy(targetRoom.id, editingAllocation?.id);
      if (occupied >= targetRoom.capacity) {
        toast.error(`Room ${targetRoom.id} is at ${occupied}/${targetRoom.capacity} capacity`);
        return;
      }
    }
    // Only bill on the transition INTO Active — editing an already-Active
    // stay (e.g. extending the end date) must never re-invoice.
    const wasActive = editingAllocation?.status === "Active";
    try {
      if (editingAllocation) {
        await smartDb.update("HostelAllocation", editingAllocation.id, formData as unknown as Record<string, unknown>);
        setAllocations(allocations.map(a => a.id === editingAllocation.id ? formData : a));
        toast.success("Allocation updated successfully");
      } else {
        await smartDb.create("HostelAllocation", formData as unknown as Record<string, unknown>, formData.id);
        setAllocations([...allocations, formData]);
        toast.success("Room allocated successfully");
      }
      if (formData.status === "Active" && !wasActive) {
        const invoice = await createHostelFeeInvoice({
          uid: user?.uid || "",
          studentId: formData.studentId || formData.id,
          studentName: formData.studentName,
          classId: formData.block,
          className: formData.block,
          roomType: formData.type,
        }).catch(() => null);
        if (invoice) {
          toast.success(`Hostel invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated`);
          const notifId = `notif_${Date.now()}_admin_hostel_${formData.id}`;
          await smartDb.create("Notification", {
            id: notifId, uid: user?.uid, audienceRole: "admin", category: "finance",
            type: "invoice_generated", title: "Hostel Fee Invoice Generated",
            message: `${formData.studentName} was allocated room ${formData.room} — invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated, awaiting payment.`,
            createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          }, notifId).catch(() => {});
        } else {
          const notifId = `notif_${Date.now()}_admin_hostel_needed_${formData.id}`;
          await smartDb.create("Notification", {
            id: notifId, uid: user?.uid, audienceRole: "admin", category: "finance",
            type: "hostel_invoice_needed", priority: "high", title: "Hostel Allocated — Fee Invoice Needed",
            message: `${formData.studentName} was allocated room ${formData.room}, but no Active Hostel Fee structure exists yet — create one in Fees Management, then generate the invoice manually.`,
            createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          }, notifId).catch(() => {});
        }
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving allocation:", error);
      toast.error("Failed to save allocation");
    }
  };

  const activeStays = allocations.filter(a => a.status === "Active").length;
  const expiringSoon = allocations.filter(a => a.status === "Expiring Soon").length;
  const pendingRequests = allocations.filter(a => a.status === "Pending").length;
  const todayStr = new Date().toISOString().split('T')[0];
  const allocatedToday = allocations.filter(a => a.startDate === todayStr).length;

  const handleExport = () => {
    if (allocations.length === 0) {
      toast.error("No allocation data to export");
      return;
    }

    const headers = ["ID", "Student Name", "Student ID", "Room", "Block", "Type", "Start Date", "End Date", "Status"];
    const csvContent = [
      headers.join(","),
      ...allocations.map(alc => [
        alc.id,
        `"${alc.studentName}"`,
        alc.studentId,
        alc.room,
        alc.block,
        `"${alc.type}"`,
        alc.startDate,
        alc.endDate,
        alc.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `hostel_allocations_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Allocations exported successfully");
  };

  const handleExtendStay = async (alc: Allocation) => {
    const currentEnd = new Date(alc.endDate);
    const newEnd = new Date(currentEnd);
    newEnd.setMonth(newEnd.getMonth() + 6);
    const newEndDate = newEnd.toISOString().split('T')[0];

    try {
      const updated = { ...alc, endDate: newEndDate };
      await smartDb.update("HostelAllocation", alc.id, updated as unknown as Record<string, unknown>);
      setAllocations(allocations.map(a => a.id === alc.id ? updated : a));
      toast.success(`Stay extended to ${newEndDate}`);
    } catch (error) {
      console.error("Error extending stay:", error);
      toast.error("Failed to extend stay");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 rounded-xl border-slate-200 shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Home className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Room Allocation</h1>
              <p className="text-sm text-slate-400">Manage student room assignments and hostel stays.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-10 border-slate-200" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button className="gradient-primary shadow-lg shadow-purple-200 h-10" onClick={handleAllocate}>
              <UserPlus className="mr-2 h-4 w-4" /> Allocate Room
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-purple-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                    <Users className="h-6 w-6" />
                  </div>
                  <Badge className="bg-purple-50 text-purple-600 border-none font-bold">Current</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Stays</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{activeStays}</span>
                  <span className="text-xs text-slate-400 font-medium">Students</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-amber-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                    <Clock className="h-6 w-6" />
                  </div>
                  <Badge className="bg-amber-50 text-amber-600 border-none font-bold">Action Required</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending Requests</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{pendingRequests}</span>
                  <span className="text-xs text-slate-400 font-medium">Waitlisted</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-blue-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <Badge className="bg-blue-50 text-purple-600 border-none font-bold">30 Days</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Vacating Soon</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{expiringSoon}</span>
                  <span className="text-xs text-slate-400 font-medium">Approaching End</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-emerald-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-600 border-none font-bold">Verified</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Allocated Today</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{allocatedToday}</span>
                  <span className="text-xs text-slate-400 font-medium">New Assignments</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="border-none shadow-sm bg-white overflow-hidden flex flex-col max-h-[calc(100vh-450px)]">
          <div className="p-6 border-b border-slate-100 flex-shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Search by Student Name, ID or Room..." 
                    className="pl-10 h-11 bg-slate-50 border-none focus-visible:ring-purple-500 rounded-xl" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 px-5 border-slate-200 rounded-xl">
                      <Filter className="mr-2 h-4 w-4 text-slate-500" /> Filters
                      {(filterHostel !== "all" || filterStatus !== "all") && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-4 rounded-xl" align="end">
                    <div className="space-y-4">
                      <h4 className="font-bold text-sm">Filter Allocations</h4>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hostel</Label>
                        <Select value={filterHostel} onValueChange={setFilterHostel}>
                          <SelectTrigger className="h-9 rounded-lg text-sm">
                            <SelectValue placeholder="All Hostels" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Hostels</SelectItem>
                            <SelectItem value="Boys Hostel">Boys Hostel</SelectItem>
                            <SelectItem value="Girls Hostel">Girls Hostel</SelectItem>
                            <SelectItem value="Staff Quarters">Staff Quarters</SelectItem>
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
                            <SelectItem value="Occupied">Occupied</SelectItem>
                            <SelectItem value="Vacant">Vacant</SelectItem>
                            <SelectItem value="Reserved">Reserved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(filterHostel !== "all" || filterStatus !== "all") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => { setFilterHostel("all"); setFilterStatus("all"); }}
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-slate-100 text-slate-600 border-none px-3 py-1.5 rounded-lg font-bold">
                  Total: {allocations.length} Allocations
                </Badge>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground font-medium">Loading allocations...</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="font-bold text-slate-700 h-12">Student Info</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Room / Block</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Duration</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-700 h-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAllocations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="h-8 w-8 text-slate-200" />
                          <p className="text-slate-500 font-medium">
                            {allocations.length === 0
                              ? "No room allocations yet. Click \"Allocate Room\" to assign a student."
                              : "No allocations found matching your search."}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAllocations.map((alc) => (
                      <TableRow key={alc.id} className="hover:bg-slate-50/50 border-slate-100 group">
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                              <User className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{alc.studentName}</p>
                              <p className="text-xs text-slate-500 font-medium">{alc.studentId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-purple-600">
                                <Home className="h-4 w-4" />
                              </div>
                              <p className="font-bold text-slate-700">{alc.room}</p>
                            </div>
                            <p className="text-xs text-slate-500 font-medium pl-9">{alc.block} • {alc.type}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              {alc.startDate} <ArrowRight className="h-3 w-3 mx-1" /> {alc.endDate}
                            </div>
                            <div className="h-1 w-32 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 w-2/3" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={cn(
                              "px-3 py-1 rounded-lg font-bold border-none",
                              alc.status === "Active" 
                                ? "bg-emerald-50 text-emerald-600" 
                                : "bg-amber-50 text-amber-600"
                            )}
                          >
                            {alc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-100">
                                <MoreVertical className="h-5 w-5 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl border-slate-100 shadow-xl">
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer" onClick={() => handleEditAllocation(alc)}>
                                <Edit className="mr-3 h-4 w-4 text-slate-400" /> 
                                <span className="font-medium">Edit Allocation</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer" onClick={() => handleExtendStay(alc)}>
                                <Calendar className="mr-3 h-4 w-4 text-slate-400" /> 
                                <span className="font-medium">Extend Stay</span>
                              </DropdownMenuItem>
                              <div className="h-px bg-slate-100 my-1" />
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => handleTerminate(alc.id)}>
                                <Trash2 className="mr-3 h-4 w-4" /> 
                                <span className="font-medium">Terminate Stay</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50/30">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 font-medium">Showing {filteredAllocations.length} of {allocations.length} allocations</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-lg border-slate-200 h-9" disabled>Previous</Button>
                <Button variant="outline" size="sm" className="rounded-lg border-slate-200 h-9" disabled>Next</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Allocate Room Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingAllocation ? "Edit Allocation" : "Allocate Room"}</DialogTitle>
            <DialogDescription>
              {editingAllocation ? "Update the allocation details for this student." : "Assign a room to a student."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="studentName">Student Name</Label>
              <Input 
                id="studentName" 
                value={formData.studentName} 
                onChange={(e) => setFormData({...formData, studentName: e.target.value})}
                placeholder="Enter student name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input 
                id="studentId" 
                value={formData.studentId} 
                onChange={(e) => setFormData({...formData, studentId: e.target.value})}
                placeholder="STU-1234"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="room">Room</Label>
                <Select
                  value={formData.room}
                  onValueChange={(value) => {
                    const room = rooms.find(r => r.id === value);
                    setFormData({
                      ...formData,
                      room: value,
                      block: room?.block ?? formData.block,
                      type: room?.type ?? formData.type,
                    });
                  }}
                >
                  <SelectTrigger id="room">
                    <SelectValue placeholder="Select Room" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.length === 0 ? (
                      <SelectItem value="__no_rooms" disabled>No rooms available — add rooms first</SelectItem>
                    ) : (
                      rooms.map(r => {
                        const occupied = roomOccupancy(r.id, editingAllocation?.id);
                        const remaining = Math.max(0, r.capacity - occupied);
                        return (
                          <SelectItem
                            key={r.id}
                            value={r.id}
                            disabled={remaining === 0 && formData.room !== r.id}
                          >
                            {r.id} — {remaining}/{r.capacity} beds free
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="block">Block</Label>
                <Select 
                  value={formData.block} 
                  onValueChange={(value) => setFormData({...formData, block: value})}
                >
                  <SelectTrigger id="block">
                    <SelectValue placeholder="Select Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A-Block">A-Block</SelectItem>
                    <SelectItem value="B-Block">B-Block</SelectItem>
                    <SelectItem value="C-Block">C-Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input 
                  id="startDate" 
                  type="date"
                  value={formData.startDate} 
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input 
                  id="endDate" 
                  type="date"
                  value={formData.endDate} 
                  onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({...formData, status: value})}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Expiring Soon">Expiring Soon</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-primary">{editingAllocation ? "Update Allocation" : "Allocate Room"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Allocation;
