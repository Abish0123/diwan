import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import {
  Search,
  GraduationCap,
  Filter,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Phone,
  Download,
  Printer,
  Loader2,
  Plus,
  Trash2,
  Eye,
  Edit2,
  FileText
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
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

interface Graduate {
  id: string;
  docId?: string;
  name: string;
  year: string;
  degree: string;
  status: string;
  email: string;
  phone: string;
  date: string;
  uid?: string;
}

const Graduates = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newGraduate, setNewGraduate] = useState({
    name: "",
    year: new Date().getFullYear().toString(),
    degree: "High School Diploma",
    status: "Pending",
    email: "",
    phone: "",
    date: new Date().toISOString().split('T')[0]
  });

  const { user } = useAuth();
  
  useEffect(() => {
    if (!user) {
      setGraduates([]);
      setIsLoading(false);
      return;
    }

    const unsubscribe = smartDb.watch("Graduate", user.uid, (data) => {
      setGraduates(data as Graduate[]);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredGraduates = graduates.filter(grad => {
    const name = grad.name || "";
    const id = grad.id || "";
    const year = grad.year || "";
    const degree = grad.degree || "";
    
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         year.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                         degree.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || grad.status === statusFilter;
    const matchesYear = yearFilter === "all" || grad.year === yearFilter;
    return matchesSearch && matchesStatus && matchesYear;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, yearFilter]);

  const totalPages = Math.ceil(filteredGraduates.length / PAGE_SIZE);
  const paginatedGraduates = filteredGraduates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleIssueTranscript = async (id: string) => {
    try {
      await smartDb.update("Graduate", id, {
        status: "Transcript Issued"
      });
      toast.success(`Transcript issued successfully`);
    } catch (error) {
       console.error("Error updating graduate:", error);
       toast.error("Failed to update record");
    }
  };

  const handleDeleteGraduate = async (id: string) => {
    try {
      await smartDb.delete("Graduate", id);
      toast.success("Graduate record deleted");
    } catch (error) {
       console.error("Error deleting graduate:", error);
       toast.error("Failed to delete record");
    }
  };

  const handleAddGraduate = async () => {
    if (!newGraduate.name || !newGraduate.email) {
       toast.error("Please fill in required fields");
       return;
    }
    
    if (!user) {
       toast.error("You must be logged in to add records");
       return;
    }

    try {
      const id = `GRD${(graduates.length + 1).toString().padStart(3, '0')}`;
      await smartDb.create("Graduate", {
        id,
        ...newGraduate,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      
      setIsAddDialogOpen(false);
      setNewGraduate({
        name: "",
        year: new Date().getFullYear().toString(),
        degree: "High School Diploma",
        status: "Pending",
        email: "",
        phone: "",
        date: new Date().toISOString().split('T')[0]
      });
      toast.success("New graduate record added");
    } catch (error) {
       console.error("Error adding graduate:", error);
       toast.error("Failed to add record");
    }
  };

  const escapeCsvCell = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportAlumni = () => {
    const headers = ["ID", "Name", "Year", "Degree", "Status", "Email", "Phone"];
    const csvContent = [
      headers.join(","),
      ...graduates.map(g => [
        escapeCsvCell(g.id),
        escapeCsvCell(g.name),
        escapeCsvCell(g.year),
        escapeCsvCell(g.degree),
        escapeCsvCell(g.status),
        escapeCsvCell(g.email),
        escapeCsvCell(g.phone)
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "alumni_records.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Alumni database exported as CSV");
  };

  const handlePrintCertificates = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Preparing certificates for printing...',
        success: 'Certificates sent to printer queue',
        error: 'Failed to connect to printer',
      }
    );
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
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Graduates & Alumni</h1>
              <p className="text-sm text-slate-400">Manage alumni records, graduation ceremonies, and transcripts.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl h-10 hover:bg-secondary/50 transition-colors"
              onClick={handlePrintCertificates}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Certificates
            </Button>
            <Button onClick={handleExportAlumni} className="rounded-xl h-10 bg-[#9810fa] hover:bg-[#8710dc] text-white shadow-lg shadow-primary/20">
              <Download className="h-4 w-4 mr-2" />
              Export Alumni
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl h-10 bg-black text-white hover:bg-black/90 shadow-lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Graduate
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Graduate</DialogTitle>
                  <DialogDescription>
                    Manually add a graduate record to the alumni database.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input 
                      id="name" 
                      className="col-span-3" 
                      value={newGraduate.name}
                      onChange={(e) => setNewGraduate({...newGraduate, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">Email</Label>
                    <Input 
                      id="email" 
                      className="col-span-3" 
                      value={newGraduate.email}
                      onChange={(e) => setNewGraduate({...newGraduate, email: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="year" className="text-right">Year</Label>
                    <Select 
                      value={newGraduate.year} 
                      onValueChange={(v) => setNewGraduate({...newGraduate, year: v})}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="degree" className="text-right">Degree</Label>
                    <Input 
                      id="degree" 
                      className="col-span-3" 
                      value={newGraduate.degree}
                      onChange={(e) => setNewGraduate({...newGraduate, degree: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button className="gradient-primary" onClick={handleAddGraduate}>Add Record</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Alumni</p>
              <p className="text-lg font-bold">{graduates.length}</p>
            </div>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pending Transcripts</p>
              <p className="text-lg font-bold">{graduates.filter(g => g.status === "Pending").length}</p>
            </div>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="premium-card p-4 flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Class of 2025</p>
              <p className="text-lg font-bold">{graduates.filter(g => g.year === "2025").length}</p>
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
              placeholder="Search by name or graduate ID..."
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
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setStatusFilter("all")} className={cn(statusFilter === "all" && "bg-accent")}>
                All Statuses
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Transcript Issued")} className={cn(statusFilter === "Transcript Issued" && "bg-accent")}>
                Transcript Issued
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Pending")} className={cn(statusFilter === "Pending" && "bg-accent")}>
                Pending Only
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by Year</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setYearFilter("all")} className={cn(yearFilter === "all" && "bg-accent")}>
                All Years
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYearFilter("2024")} className={cn(yearFilter === "2024" && "bg-accent")}>
                Class of 2024
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYearFilter("2025")} className={cn(yearFilter === "2025" && "bg-accent")}>
                Class of 2025
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
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Graduate</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Year</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Degree</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Status</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {paginatedGraduates.map((grad) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={grad.id} 
                    className="hover:bg-secondary/30 transition-colors group border-b border-border/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border-2 border-white shadow-sm transition-transform group-hover:scale-110">
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${grad.name}`} />
                          <AvatarFallback>{getInitials(grad.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">{grad.name}</span>
                          <span className="text-[11px] text-muted-foreground">{grad.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{grad.year}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{grad.degree}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "border-none font-medium rounded-lg px-2 py-0.5 text-[10px] uppercase tracking-tighter",
                          grad.status === "Transcript Issued" ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600"
                        )}
                      >
                        {grad.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {grad.status === "Pending" && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-[11px] font-black uppercase tracking-tighter text-primary hover:text-primary hover:bg-primary/5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            onClick={() => handleIssueTranscript(grad.id)}
                          >
                            Issue Transcript
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toast.info(`Viewing details for ${grad.name}`)}>
                              <Eye className="h-4 w-4 mr-2" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast.info(`Editing record ${grad.id}`)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit Record
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast.info(`Sending email to ${grad.email}`)}>
                              <Mail className="h-4 w-4 mr-2" /> Contact Alumni
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteGraduate(grad.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">Loading records...</p>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredGraduates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <p className="text-sm text-muted-foreground">No graduate records found.</p>
                    </TableCell>
                  </TableRow>
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
              <p className="text-xs text-slate-500 font-medium">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredGraduates.length)} of {filteredGraduates.length} graduates
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
      </motion.div>
    </DashboardLayout>
  );
};

export default Graduates;
