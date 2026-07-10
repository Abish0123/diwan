import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/hooks/useClasses";
import { UserPlus, Mail, Hash, ShieldCheck } from "lucide-react";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
}

export const AddStudentDialog = ({ open, onOpenChange, classId }: AddStudentDialogProps) => {
  const { addStudents } = useStudents();
  const { addEnrollment, classes, sections } = useClasses();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    rollNo: "",
    status: "Active"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const studentId = "STD-" + Math.floor(1000 + Math.random() * 9000);
      const currentClass = classes.find(c => c.id === classId);
      const classSections = sections.filter(s => s.classId === classId);
      const targetSection = classSections[0];
      // Derive grade + section from the class so the new student is consistent with the roster.
      const grade = (currentClass as any)?.grade || "";
      const sectionName = targetSection?.name
        || String(currentClass?.name || "").match(/Section\s+([A-Z])/i)?.[1]?.toUpperCase()
        || "A";

      await addStudents([{
        ...formData,
        id: studentId,
        classId,
        grade,
        section: sectionName,
      } as any]);

      await addEnrollment({
        studentId,
        studentName: formData.name,
        classId,
        className: currentClass?.name || "Class",
        sectionId: targetSection?.id || classId,
        sectionName,
        grade,
        academicYear: currentClass?.academicYear || "2026-27",
        status: 'Active'
      } as any);

      toast.success("Student Added", {
        description: `${formData.name} has been added and enrolled in the class.`,
      });
      onOpenChange(false);
      setFormData({ name: "", email: "", rollNo: "", status: "Active" });
    } catch (error) {
      // Error handled by context
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="gradient-primary h-2 w-full" />
        <DialogHeader className="px-8 pt-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">Add Student</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Enroll a new student into this class</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name</Label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="name"
                placeholder="e.g. John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="rounded-2xl border-slate-200 h-12 pl-10 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="e.g. john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="rounded-2xl border-slate-200 h-12 pl-10 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rollNo" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Roll Number</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="rollNo"
                  placeholder="e.g. 101"
                  value={formData.rollNo}
                  onChange={(e) => setFormData({ ...formData, rollNo: e.target.value })}
                  className="rounded-2xl border-slate-200 h-12 pl-10 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="rounded-2xl border-slate-200 h-12">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <SelectValue placeholder="Select Status" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200">
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-2xl font-bold text-xs text-slate-500">
              Cancel
            </Button>
            <Button type="submit" className="rounded-2xl gradient-primary text-white font-bold text-xs px-8 shadow-lg shadow-primary/20 h-12">
              Enroll Student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
