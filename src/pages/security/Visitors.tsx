import { useState, useEffect, useMemo } from "react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Clock, 
  MapPin, 
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  LogOut,
  Ban,
  Printer
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
import { printVisitorPassPdf } from "@/lib/securityPassPdf";
import { isToday, isYesterday, formatMinutes } from "@/lib/dateScope";

interface BlacklistEntry {
  id: string;
  name: string;
  phone?: string;
  reason: string;
  blacklistedAt: string;
}

interface Visitor {
  id: string;
  name: string;
  purpose: string;
  host: string;
  checkIn: string;
  checkOut: string;
  status: string;
  image: string;
  phone?: string;
  email?: string;
  checkInAt?: string;   // ISO — real check-in timestamp for day/duration math
  checkOutAt?: string;  // ISO — real check-out timestamp
  createdAt?: string;
}

export default function Visitors() {
  const { user } = useAuth();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);

  const [newVisitor, setNewVisitor] = useState({
    name: "",
    purpose: "",
    host: "",
    phone: "",
    email: ""
  });

  // Load visitors from smartDb
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setLoading(true);
        // No mock seeding — a fresh school starts with a genuinely empty log
        // rather than fabricated "John Smith / Sarah Williams" visitors.
        const data = await smartDb.getAll("Visitor");
        if (!active) return;
        setVisitors((data as Visitor[]) || []);
      } catch (err) {
        console.error("Failed to load visitors:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    smartDb.getAll("VisitorBlacklist").then(data => {
      if (active) setBlacklist(data as BlacklistEntry[]);
    }).catch(err => console.error("Failed to load visitor blacklist:", err));
    return () => { active = false; };
  }, []);

  const matchBlacklist = (name: string, phone: string): BlacklistEntry | undefined => {
    const n = name.trim().toLowerCase();
    const p = phone.trim();
    return blacklist.find(b =>
      b.name.trim().toLowerCase() === n ||
      (p && b.phone && b.phone.trim() === p)
    );
  };

  const filteredVisitors = useMemo(() => {
    return visitors.filter(v => 
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.purpose.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [visitors, searchTerm]);

  const stats = useMemo(() => {
    // "Today" now genuinely means today (by real check-in/created timestamp),
    // not a lifetime count of every visitor ever logged.
    const today = visitors.filter(v => isToday(v.checkInAt || v.createdAt)).length;
    const yesterday = visitors.filter(v => isYesterday(v.checkInAt || v.createdAt)).length;
    const currentlyIn = visitors.filter(v => v.status === "Checked In").length;
    const waiting = visitors.filter(v => v.status === "Waiting").length;
    // Real average visit duration from checked-out visitors that carry both
    // timestamps — replaces the hardcoded "45m".
    const durations = visitors
      .filter(v => v.checkInAt && v.checkOutAt)
      .map(v => (new Date(v.checkOutAt as string).getTime() - new Date(v.checkInAt as string).getTime()) / 60000)
      .filter(m => Number.isFinite(m) && m >= 0);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    return { today, yesterday, currentlyIn, waiting, avgDuration };
  }, [visitors]);

  const handleLogVisitor = async () => {
    if (!newVisitor.name || !newVisitor.purpose || !newVisitor.host) {
      toast.error("Please fill in all required fields");
      return;
    }

    const blocked = matchBlacklist(newVisitor.name, newVisitor.phone);
    if (blocked) {
      toast.error(`${newVisitor.name} is blacklisted (${blocked.reason}) — entry denied. Contact security to review.`);
      return;
    }

    const nextIdNum = visitors.length > 0
      ? Math.max(...visitors.map(v => parseInt(v.id.split("-")[1]) || 0)) + 1 
      : 1;

    const visitorId = `VST-${String(nextIdNum).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();
    const visitor: Visitor = {
      id: visitorId,
      name: newVisitor.name,
      purpose: newVisitor.purpose,
      host: newVisitor.host,
      phone: newVisitor.phone || undefined,
      email: newVisitor.email || undefined,
      checkIn: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkInAt: nowIso,
      checkOut: "-",
      status: "Checked In",
      createdAt: nowIso,
      image: `https://i.pravatar.cc/150?u=${(newVisitor.name || "person").split(' ')[0]?.toLowerCase() || "person"}`
    };

    try {
      await smartDb.create("Visitor", { 
        ...visitor, 
        uid: user?.uid || "admin-uid", 
        createdAt: new Date().toISOString() 
      }, visitor.id);

      setVisitors([visitor, ...visitors]);
      setNewVisitor({ name: "", purpose: "", host: "", phone: "", email: "" });
      setIsLogDialogOpen(false);
      toast.success("Visitor logged successfully");
    } catch (err) {
      console.error("Failed to log visitor:", err);
      toast.error("Database error while logging visitor");
    }
  };

  const handleCheckOut = async (id: string) => {
    const nowIso = new Date().toISOString();
    const checkOutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      await smartDb.update("Visitor", id, {
        status: "Checked Out",
        checkOut: checkOutTime,
        checkOutAt: nowIso,
      });

      setVisitors(visitors.map(v =>
        v.id === id
          ? {
              ...v,
              status: "Checked Out",
              checkOut: checkOutTime,
              checkOutAt: nowIso,
            }
          : v
      ));
      toast.success("Visitor checked out");
    } catch (err) {
      console.error("Failed to check out visitor:", err);
      toast.error("Database error while checking out visitor");
    }
  };

  const handleBlacklist = async (visitor: Visitor) => {
    const reason = window.prompt(`Reason for blacklisting ${visitor.name}?`, "Security concern");
    if (reason === null) return; // cancelled
    const id = `BL-${Date.now()}`;
    try {
      const entry: BlacklistEntry = {
        id,
        name: visitor.name,
        phone: visitor.phone,
        reason: reason || "No reason given",
        blacklistedAt: new Date().toISOString(),
      };
      await smartDb.create("VisitorBlacklist", { ...entry, uid: user?.uid }, id);
      setBlacklist(prev => [entry, ...prev]);
      toast.warning(`${visitor.name} has been added to the blacklist — future check-ins will be blocked`);
    } catch (err) {
      console.error("Failed to blacklist visitor:", err);
      toast.error("Database error while blacklisting visitor");
    }
  };

  const printPass = (visitor: Visitor) => {
    printVisitorPassPdf(visitor);
  };

  const viewDetails = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setIsDetailsDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Visitor Management</h1>
              <p className="text-sm text-slate-400">Track and manage all campus visitors in real-time.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary">
                  <UserPlus className="mr-2 h-4 w-4" /> Log New Visitor
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Log New Visitor</DialogTitle>
                  <DialogDescription>
                    Enter visitor details to check them into the campus.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      placeholder="John Doe" 
                      value={newVisitor.name}
                      onChange={(e) => setNewVisitor({...newVisitor, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input 
                        id="phone" 
                        placeholder="+1..." 
                        value={newVisitor.phone}
                        onChange={(e) => setNewVisitor({...newVisitor, phone: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email (Optional)</Label>
                      <Input 
                        id="email" 
                        placeholder="john@example.com" 
                        value={newVisitor.email}
                        onChange={(e) => setNewVisitor({...newVisitor, email: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="purpose">Purpose of Visit</Label>
                    <Select onValueChange={(value) => setNewVisitor({...newVisitor, purpose: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Parent Meeting">Parent Meeting</SelectItem>
                        <SelectItem value="Vendor Visit">Vendor Visit</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Interview">Interview</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="host">Host (Staff/Student)</Label>
                    <Input 
                      id="host" 
                      placeholder="Enter host name" 
                      value={newVisitor.host}
                      onChange={(e) => setNewVisitor({...newVisitor, host: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsLogDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleLogVisitor} className="gradient-primary">Log Visitor</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">{stats.yesterday} yesterday</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Currently In</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.currentlyIn}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Active visitors on campus</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Waiting</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.waiting}</div>
              <p className="text-[10px] text-amber-500 font-bold mt-1">Awaiting host approval</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avg. Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMinutes(stats.avgDuration)}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Average visit time (checked-out)</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card overflow-hidden">
          <CardHeader className="border-b border-sidebar-border/50 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold">Visitor Log</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search visitors..."
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
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Visitor</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Purpose</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Host</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Check In</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Check Out</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisitors.map((visitor) => (
                  <TableRow key={visitor.id} className="border-sidebar-border/50 group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-primary/10">
                          <AvatarImage src={visitor.image} />
                          <AvatarFallback className="text-[10px] font-bold">{(visitor.name || "VS").split(' ').map(n => n[0] || "").join('')}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold group-hover:text-primary transition-colors">{visitor.name}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{visitor.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{visitor.purpose}</TableCell>
                    <TableCell className="text-sm font-medium">{visitor.host}</TableCell>
                    <TableCell className="text-sm font-medium">{visitor.checkIn}</TableCell>
                    <TableCell className="text-sm font-medium">{visitor.checkOut}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none",
                          visitor.status === "Checked In" ? "bg-emerald-500/10 text-emerald-500" :
                          visitor.status === "Waiting" ? "bg-amber-500/10 text-amber-500" :
                          "bg-slate-500/10 text-slate-500"
                        )}
                      >
                        {visitor.status}
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
                          <DropdownMenuItem onClick={() => viewDetails(visitor)}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printPass(visitor)}>
                            <Printer className="mr-2 h-4 w-4" /> Print Pass
                          </DropdownMenuItem>
                          {visitor.status !== "Checked Out" && (
                            <DropdownMenuItem onClick={() => handleCheckOut(visitor.id)}>
                              <LogOut className="mr-2 h-4 w-4" /> Check Out
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-rose-500" onClick={() => handleBlacklist(visitor)}>
                            <Ban className="mr-2 h-4 w-4" /> Blacklist
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredVisitors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No visitors found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Visitor Details</DialogTitle>
          </DialogHeader>
          {selectedVisitor && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/20">
                  <AvatarImage src={selectedVisitor.image} />
                  <AvatarFallback className="text-xl font-bold">{(selectedVisitor.name || "VS").split(' ').map((n) => n[0] || "").join('')}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-bold">{selectedVisitor.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedVisitor.id}</p>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none mt-1",
                      selectedVisitor.status === "Checked In" ? "bg-emerald-500/10 text-emerald-500" :
                      selectedVisitor.status === "Waiting" ? "bg-amber-500/10 text-amber-500" :
                      "bg-slate-500/10 text-slate-500"
                    )}
                  >
                    {selectedVisitor.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-sidebar-border/50">
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{selectedVisitor.phone || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Email</p>
                  <p className="text-sm font-medium truncate">{selectedVisitor.email || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Purpose</p>
                  <p className="text-sm font-medium">{selectedVisitor.purpose}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Host</p>
                  <p className="text-sm font-medium">{selectedVisitor.host}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Check In</p>
                  <p className="text-sm font-medium">{selectedVisitor.checkIn}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground">Check Out</p>
                  <p className="text-sm font-medium">{selectedVisitor.checkOut}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedVisitor && (
              <Button variant="outline" onClick={() => printPass(selectedVisitor)}>
                <Printer className="mr-2 h-4 w-4" /> Print Pass
              </Button>
            )}
            <Button onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

