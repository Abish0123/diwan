import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  GraduationCap,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Briefcase,
  Mail,
  Phone,
  ExternalLink,
  Award,
  Calendar,
  Loader2
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

interface Alumnus {
  id: string;
  docId?: string;
  name: string;
  class: string;
  occupation: string;
  company: string;
  location: string;
  status: string;
  image: string;
  email: string;
  uid?: string;
}

export default function Alumni() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [isLoading, setIsLoading] = useState(true);
  const [alumniList, setAlumniList] = useState<Alumnus[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAlumnus, setNewAlumnus] = useState({
    name: "",
    class: "",
    occupation: "",
    company: "",
    location: "",
    status: "Active Member",
    email: ""
  });

  const { user } = useAuth();
  
  const fetchAlumni = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await smartDb.getAll("Alumnus", user.uid) as Alumnus[];
      setAlumniList(data);
    } catch (error) {
      console.error("Error fetching alumni:", error);
      toast.error("Failed to load alumni records");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAlumniList([]);
      setIsLoading(false);
      return;
    }

    const unsubscribe = smartDb.watch("Alumnus", user.uid, (data) => {
      setAlumniList(data as Alumnus[]);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddAlumni = async () => {
    if (!newAlumnus.name || !newAlumnus.class || !newAlumnus.email) {
      toast.error("Please fill in the required fields (Name, Class, Email)");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to add alumni");
      return;
    }

    try {
      const id = `ALM-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const image = `https://api.dicebear.com/7.x/avataaars/svg?seed=${newAlumnus.name.toLowerCase().replace(/\s/g, '')}`;
      
      await smartDb.create("Alumnus", {
        ...newAlumnus,
        id,
        image,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });

      setIsAddDialogOpen(false);
      setNewAlumnus({
        name: "",
        class: "",
        occupation: "",
        company: "",
        location: "",
        status: "Active Member",
        email: ""
      });
      toast.success("Alumnus added successfully!");
    } catch (error) {
      console.error("Error adding alumnus:", error);
      toast.error("Failed to add alumnus");
    }
  };

  const handleDeleteAlumnus = async (id: string) => {
    try {
      await smartDb.delete("Alumnus", id);
      toast.success("Alumnus removed from directory");
    } catch (error) {
      console.error("Error deleting alumnus:", error);
      toast.error("Failed to remove alumnus");
    }
  };

  const filteredAlumni = alumniList.filter(person => {
    const matchesSearch = (person.name?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
                         (person.id?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
                         (person.company?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
                         (person.occupation?.toLowerCase() || "").includes((searchTerm || "").toLowerCase()) ||
                         (person.class?.toLowerCase() || "").includes((searchTerm || "").toLowerCase());
    const matchesStatus = statusFilter === "all" || person.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredAlumni.length / PAGE_SIZE);
  const paginatedAlumni = filteredAlumni.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Alumni Network</h1>
              <p className="text-muted-foreground">Stay connected with our global community of graduates.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#9810fa] hover:bg-[#8710dc] text-white">
                  <Plus className="mr-2 h-4 w-4" /> Add Alumni
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Alumnus</DialogTitle>
                  <DialogDescription>
                    Enter the details of the graduate to add them to the network.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input 
                      id="name" 
                      className="col-span-3" 
                      value={newAlumnus.name}
                      onChange={(e) => setNewAlumnus({...newAlumnus, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="batch" className="text-right">Batch</Label>
                    <Input 
                      id="batch" 
                      placeholder="Class of 2024"
                      className="col-span-3" 
                      value={newAlumnus.class}
                      onChange={(e) => setNewAlumnus({...newAlumnus, class: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">Email</Label>
                    <Input 
                      id="email" 
                      type="email"
                      className="col-span-3" 
                      value={newAlumnus.email}
                      onChange={(e) => setNewAlumnus({...newAlumnus, email: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="occupation" className="text-right">Occupation</Label>
                    <Input 
                      id="occupation" 
                      className="col-span-3" 
                      value={newAlumnus.occupation}
                      onChange={(e) => setNewAlumnus({...newAlumnus, occupation: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="company" className="text-right">Company</Label>
                    <Input 
                      id="company" 
                      className="col-span-3" 
                      value={newAlumnus.company}
                      onChange={(e) => setNewAlumnus({...newAlumnus, company: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="location" className="text-right">Location</Label>
                    <Input 
                      id="location" 
                      className="col-span-3" 
                      value={newAlumnus.location}
                      onChange={(e) => setNewAlumnus({...newAlumnus, location: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="status" className="text-right">Status</Label>
                    <Select 
                      value={newAlumnus.status} 
                      onValueChange={(v) => setNewAlumnus({...newAlumnus, status: v})}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active Member">Active Member</SelectItem>
                        <SelectItem value="Donor">Donor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button className="gradient-primary" onClick={handleAddAlumni}>Save Alumnus</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Alumni</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{alumniList.length}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Graduates in directory</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">
                {alumniList.filter(a => a.status === "Active Member").length}
              </div>
              <p className="text-[10px] text-emerald-500 font-bold mt-1">Engaged in community</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Donors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {alumniList.filter(a => a.status === "Donor").length}
              </div>
              <p className="text-[10px] text-primary font-bold mt-1">Scholarship fund contributors</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Chapters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Global alumni chapters</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card overflow-hidden">
          <CardHeader className="border-b border-sidebar-border/50 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold">Alumni Directory</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search alumni..."
                    className="pl-9 h-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setStatusFilter("all")} className={cn(statusFilter === "all" && "bg-accent")}>
                      All Alumni
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("Active Member")} className={cn(statusFilter === "Active Member" && "bg-accent")}>
                      Active Members
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("Donor")} className={cn(statusFilter === "Donor" && "bg-accent")}>
                      Donors
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-sidebar-border/50">
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Alumnus</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Batch</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Occupation</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Company/Org</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Location</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAlumni.map((person) => (
                  <TableRow key={person.id} className="border-sidebar-border/50 group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-primary/10">
                          <AvatarImage src={person.image} />
                          <AvatarFallback className="text-[10px] font-bold">{(person.name || "AL").split(' ').map(n => n[0] || "").join('')}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold group-hover:text-primary transition-colors">{person.name}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{person.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-bold">{person.class}</TableCell>
                    <TableCell className="text-sm font-medium">{person.occupation}</TableCell>
                    <TableCell className="text-sm font-medium">{person.company}</TableCell>
                    <TableCell className="text-sm font-medium">{person.location}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none",
                          person.status === "Donor" ? "bg-emerald-500/10 text-emerald-500" :
                          "bg-blue-500/10 text-blue-500"
                        )}
                      >
                        {person.status}
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
                          <DropdownMenuItem
                            onClick={() => navigate("/communication/messages", {
                              state: { recipientName: person.name, recipientEmail: person.email },
                            })}
                          >
                            <Mail className="mr-2 h-4 w-4" /> Send Message
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info(`Viewing awards for ${person.name}`)}>
                            <Award className="mr-2 h-4 w-4" /> View Awards
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open('https://linkedin.com', '_blank')}>
                            <ExternalLink className="mr-2 h-4 w-4" /> LinkedIn Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteAlumnus(person.id)}
                          >
                            Remove Alumnus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">Loading directory...</p>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredAlumni.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">No alumni found.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 font-medium">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAlumni.length)} of {filteredAlumni.length} alumni
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
