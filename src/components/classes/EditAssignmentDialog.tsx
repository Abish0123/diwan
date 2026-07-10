import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useAssignments } from "@/hooks/useAssignments";
import { Assignment } from "@/types/classes";
import { toast } from "sonner";

interface EditAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment;
}

export const EditAssignmentDialog = ({ open, onOpenChange, assignment }: EditAssignmentDialogProps) => {
  const { updateAssignment } = useAssignments();
  const [title, setTitle] = useState(assignment.title);
  const [dueDate, setDueDate] = useState(assignment.dueDate);
  const [status, setStatus] = useState(assignment.status);

  useEffect(() => {
    if (open) {
      setTitle(assignment.title);
      setDueDate(assignment.dueDate);
      setStatus(assignment.status);
    }
  }, [open, assignment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAssignment(assignment.id, {
        title,
        dueDate,
        status: status as 'Pending' | 'Completed' | 'Overdue' | 'Graded'
      });
      toast.success("Assignment updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update assignment");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Edit Assignment</DialogTitle>
          <DialogDescription>
            Update assignment details and status.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Title</Label>
              <Input 
                id="title" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Due Date</Label>
              <Input 
                id="dueDate" 
                type="date" 
                value={dueDate} 
                onChange={(e) => setDueDate(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Status</Label>
              <Select value={status} onValueChange={(v: string) => setStatus(v)}>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                  <SelectItem value="Graded">Graded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button 
              type="button"
              variant="outline" 
              className="rounded-xl font-bold"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="rounded-xl gradient-primary text-white font-bold px-8 shadow-lg shadow-primary/20"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
