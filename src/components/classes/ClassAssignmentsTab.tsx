import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  Search,
  FileText,
  Calendar,
  Users,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
  Filter,
  Eye,
  Download
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAssignments } from "@/hooks/useAssignments";
import { Assignment } from "@/types/classes";
import { CreateAssignmentDialog } from "@/components/classes/CreateAssignmentDialog";
import { EditAssignmentDialog } from "@/components/classes/EditAssignmentDialog";
import { ViewSubmissionsDialog } from "@/components/classes/ViewSubmissionsDialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface ClassAssignmentsTabProps {
  classId: string;
  className: string;
}

export const ClassAssignmentsTab = ({ classId, className }: ClassAssignmentsTabProps) => {
  const { assignments, deleteAssignment, loading: assignmentsLoading } = useAssignments();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewSubmissionsOpen, setIsViewSubmissionsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const classAssignments = useMemo(() => {
    return assignments.filter(asg => asg.classId === classId);
  }, [assignments, classId]);

  const filteredAssignments = classAssignments.filter(asg => {
    const matchesSearch = asg.title.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleExport = () => {
    if (classAssignments.length === 0) {
      toast.error("No assignments to export");
      return;
    }

    const headers = ["ID", "Title", "Due Date", "Submissions", "Status"];
    const csvData = classAssignments.map(a => [
      a.id,
      a.title,
      a.dueDate,
      a.submissionsCount || 0,
      a.status
    ]);

    const csvContent = [headers, ...csvData].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `assignments_${className}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Assignments exported successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Assignments</h2>
          <p className="text-slate-500 font-medium text-sm">Manage assignments specifically for {className}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="rounded-xl border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
            onClick={handleExport}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button className="rounded-xl gradient-primary text-white font-bold px-6 shadow-lg shadow-primary/20" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Assignment
          </Button>
        </div>
      </div>

      <CreateAssignmentDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        classId={classId} 
      />

      {selectedAssignment && (
        <>
          <EditAssignmentDialog 
            open={isEditOpen} 
            onOpenChange={setIsEditOpen} 
            assignment={selectedAssignment} 
          />
          <ViewSubmissionsDialog
            open={isViewSubmissionsOpen}
            onOpenChange={setIsViewSubmissionsOpen}
            assignment={selectedAssignment}
          />
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Assignments</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                <Clock className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">{classAssignments.filter(a => a.status === 'Pending' || a.status === 'Active').length}</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Open for submission</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Completion Rate</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center text-green-500 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-green-600">88%</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Average completion</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden group">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pending Grading</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                <Users className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-500">
              {classAssignments.filter(a => a.status === 'Completed').length}
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Awaiting review</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-50 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-black text-slate-900">Assignment List</CardTitle>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search assignments..."
                  className="pl-9 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button variant="outline" size="icon" className="rounded-xl border-slate-100">
                  <Filter className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-8 h-12">Assignment Title</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 h-12">Due Date</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 h-12">Submissions</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 h-12">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 h-12 text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {assignmentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Assignments...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAssignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-4">
                        <div className="h-16 w-16 rounded-[2rem] bg-slate-50 flex items-center justify-center text-slate-200">
                          <FileText className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-lg font-black text-slate-900">No assignments found</p>
                          <p className="text-sm text-slate-400 font-medium">Try adjusting your search or create a new one.</p>
                        </div>
                        <Button
                          variant="outline"
                          className="rounded-xl border-slate-200 font-bold"
                          onClick={() => {
                            setSearch("");
                          }}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssignments.map((asg: Assignment, index) => (
                    <motion.tr
                      key={asg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group hover:bg-slate-50/50 border-slate-50 transition-colors"
                    >
                      <TableCell className="pl-8 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-black text-slate-900 group-hover:text-primary transition-colors">{asg.title}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{asg.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {asg.dueDate}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {asg.submissionsCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider border-none",
                            (asg.status === "Active" || asg.status === "Pending") && "bg-blue-50 text-purple-600",
                            asg.status === "Completed" && "bg-green-50 text-green-600",
                            asg.status === "Graded" && "bg-purple-50 text-purple-600",
                            asg.status === "Overdue" && "bg-red-50 text-red-600"
                          )}
                        >
                          {asg.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100">
                              <MoreVertical className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 shadow-xl p-2 min-w-[180px]">
                            <DropdownMenuItem 
                              className="rounded-xl font-bold text-slate-600 py-2.5"
                              onClick={() => {
                                setSelectedAssignment(asg);
                                setIsViewSubmissionsOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4 text-blue-500" /> View Submissions
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl font-bold text-slate-600 py-2.5"
                              onClick={() => {
                                setSelectedAssignment(asg);
                                setIsEditOpen(true);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4 text-amber-500" /> Edit Assignment
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl font-bold text-slate-600 py-2.5"
                              onClick={() => {
                                setSelectedAssignment(asg);
                                setIsViewSubmissionsOpen(true);
                              }}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> Grade Submissions
                            </DropdownMenuItem>
                            <div className="h-px bg-slate-50 my-1" />
                            <DropdownMenuItem 
                              className="rounded-xl font-bold text-red-500 py-2.5 focus:bg-red-50 focus:text-red-600"
                              onClick={() => {
                                if (asg.id.startsWith('demo-')) {
                                  toast.error("Cannot delete demo data");
                                } else {
                                  deleteAssignment(asg.id);
                                  toast.success("Assignment deleted");
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
