import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useStudents } from "@/contexts/StudentContext";
import { useSubmissions } from "@/hooks/useSubmissions";
import { Assignment } from "@/types/classes";
import { CheckCircle2, XCircle, Clock, MoreHorizontal, Check, AlertCircle } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ViewSubmissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
}

export const ViewSubmissionsDialog = ({ open, onOpenChange, assignment }: ViewSubmissionsDialogProps) => {
  const { students } = useStudents();
  const { submissions, updateSubmission, addSubmission } = useSubmissions();
  
  if (!assignment) return null;

  const classStudents = students.filter(s => s.classId === assignment.classId);
  const assignmentSubmissions = submissions.filter(s => s.assignmentId === assignment.id);

  const getSubmissionForStudent = (studentId: string) => {
    return assignmentSubmissions.find(s => s.studentId === studentId);
  };

  const handleStatusChange = async (studentId: string, newStatus: 'Submitted' | 'Pending' | 'Late') => {
    const existingSubmission = getSubmissionForStudent(studentId);
    
    try {
      if (existingSubmission) {
        await updateSubmission(existingSubmission.id, { status: newStatus });
      } else {
        await addSubmission({
          assignmentId: assignment.id,
          studentId,
          status: newStatus,
          submissionDate: new Date().toISOString().split('T')[0]
        });
      }
      toast.success("Submission status updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-[2rem] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Submissions: {assignment.title}</DialogTitle>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Due Date: {assignment.dueDate} | Total Students: {classStudents.length}
          </p>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-10">Student Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-10 text-center">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-10 text-center">Submission Date</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classStudents.map((student) => {
                  const submission = getSubmissionForStudent(student.id);
                  const status = submission?.status || 'Pending';
                  return (
                    <TableRow key={student.id} className="hover:bg-slate-50/30 border-slate-50 transition-colors">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-black">
                            {student.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{student.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border-none ${
                          status === 'Submitted' 
                            ? 'bg-emerald-50 text-emerald-600' 
                            : status === 'Late'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-slate-50 text-slate-400'
                        }`}>
                          {status === 'Submitted' && <CheckCircle2 className="h-3 w-3 mr-1 inline" />}
                          {status === 'Late' && <Clock className="h-3 w-3 mr-1 inline" />}
                          {status === 'Pending' && <XCircle className="h-3 w-3 mr-1 inline" />}
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-[10px] font-medium text-slate-400">
                        {submission?.submissionDate || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                              <MoreHorizontal className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl border-slate-100 p-1">
                            <DropdownMenuItem 
                              className="rounded-lg text-[11px] font-bold text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700"
                              onClick={() => handleStatusChange(student.id, 'Submitted')}
                            >
                              <Check className="mr-2 h-3 w-3" /> Mark Submitted
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-lg text-[11px] font-bold text-amber-600 focus:bg-amber-50 focus:text-amber-700"
                              onClick={() => handleStatusChange(student.id, 'Late')}
                            >
                              <Clock className="mr-2 h-3 w-3" /> Mark Late
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-lg text-[11px] font-bold text-slate-500 focus:bg-slate-50 focus:text-slate-600"
                              onClick={() => handleStatusChange(student.id, 'Pending')}
                            >
                              <AlertCircle className="mr-2 h-3 w-3" /> Mark Pending
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
