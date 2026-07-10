import { useState } from "react";
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
import { useAchievements } from "@/hooks/useAchievements";
import { toast } from "sonner";

interface IssueCertificateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const IssueCertificateDialog = ({ open, onOpenChange }: IssueCertificateDialogProps) => {
  const { students } = useStudents();
  const { addAchievement } = useAchievements();
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'Issued' | 'Pending' | 'Verified'>('Issued');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !type || !issuedDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    setLoading(true);
    try {
      await addAchievement({
        studentId,
        studentName: student.name,
        type,
        issuedDate,
        grade: student.classId, // Using classId as grade for now
        status,
        image: `https://i.pravatar.cc/150?u=${student.id}`
      });
      toast.success("Certificate issued successfully");
      onOpenChange(false);
      setStudentId("");
      setType("");
    } catch (error) {
      toast.error("Failed to issue certificate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Issue Certificate</DialogTitle>
          <DialogDescription>
            Generate a new achievement certificate for a student.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name} ({student.rollNo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Achievement Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="Academic Excellence">Academic Excellence</SelectItem>
                  <SelectItem value="Sports Achievement">Sports Achievement</SelectItem>
                  <SelectItem value="Community Service">Community Service</SelectItem>
                  <SelectItem value="Leadership Award">Leadership Award</SelectItem>
                  <SelectItem value="Artistic Achievement">Artistic Achievement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuedDate" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Issue Date</Label>
              <Input 
                id="issuedDate" 
                type="date" 
                value={issuedDate} 
                onChange={(e) => setIssuedDate(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Initial Status</Label>
              <Select value={status} onValueChange={(v: 'Issued' | 'Pending' | 'Verified') => setStatus(v)}>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="Issued">Issued</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Verified">Verified</SelectItem>
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
              disabled={loading}
            >
              {loading ? "Issuing..." : "Issue Certificate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
