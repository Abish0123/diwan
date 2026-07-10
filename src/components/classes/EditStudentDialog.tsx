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
import { useStudents } from "@/contexts/StudentContext";
import { Student } from "@/types/classes";
import { toast } from "sonner";

interface EditStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student;
}

export const EditStudentDialog = ({ open, onOpenChange, student }: EditStudentDialogProps) => {
  const { updateStudent } = useStudents();
  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email);
  const [status, setStatus] = useState(student.status);

  useEffect(() => {
    if (open) {
      setName(student.name);
      setEmail(student.email);
      setStatus(student.status);
    }
  }, [open, student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateStudent(student.id, {
        name,
        email,
        status: status as 'Active' | 'Inactive'
      });
      toast.success("Student updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update student");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Edit Student</DialogTitle>
          <DialogDescription>
            Update student profile information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Full Name</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Email Address</Label>
              <Input 
                id="email" 
                type="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
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
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
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
