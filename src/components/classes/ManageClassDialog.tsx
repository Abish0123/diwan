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
import { useClasses } from "@/hooks/useClasses";
import { useStaff } from "@/contexts/StaffContext";
import { Class } from "@/types/classes";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Search, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ManageClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classData: Class;
}

export const ManageClassDialog = ({ open, onOpenChange, classData }: ManageClassDialogProps) => {
  const { updateClass, deleteClass } = useClasses();
  const { staff } = useStaff();
  const navigate = useNavigate();
  const [name, setName] = useState(classData.name);
  const [teacher, setTeacher] = useState(classData.teacher);
  const [grade, setGrade] = useState(classData.grade);
  const [section, setSection] = useState(classData.section);
  const [status, setStatus] = useState(classData.status);
  const [isDeleting, setIsDeleting] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");

  // Available staff to assign as class teacher (teaching roles first), filtered by search.
  const availableTeachers = (staff || []).filter((m: any) => {
    const q = teacherSearch.trim().toLowerCase();
    return !q || `${m.name || ""} ${m.role || ""} ${m.department || ""}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (open) {
      setName(classData.name);
      setTeacher(classData.teacher);
      setGrade(classData.grade);
      setSection(classData.section);
      setStatus(classData.status);
      setIsDeleting(false);
      setTeacherSearch("");
    }
  }, [open, classData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateClass(classData.id, {
        name,
        teacher,
        grade,
        section,
        status: status as 'Active' | 'Inactive'
      });
      toast.success("Class updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update class");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClass(classData.id);
      toast.success("Class deleted successfully");
      onOpenChange(false);
      navigate("/classes");
    } catch (error) {
      toast.error("Failed to delete class");
    }
  };

  if (isDeleting) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-[2rem] sm:max-w-[400px]">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl font-black">Delete Class?</DialogTitle>
            <DialogDescription className="text-center">
              This action cannot be undone. This will permanently delete the class
              <span className="font-bold text-slate-900"> {classData.name} </span>
              and all its associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button 
              variant="outline" 
              className="flex-1 rounded-xl font-bold"
              onClick={() => setIsDeleting(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1 rounded-xl font-bold"
              onClick={handleDelete}
            >
              Delete Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight">Manage Class</DialogTitle>
          <DialogDescription>
            Update class information or remove the class from the system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Class Name</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="teacher" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Assigned Teacher</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="teacher"
                  value={teacherSearch || teacher}
                  onChange={(e) => { setTeacherSearch(e.target.value); setTeacher(e.target.value); }}
                  placeholder="Search or type a teacher name…"
                  className="rounded-xl border-slate-200 h-11 pl-9"
                  required
                />
              </div>
              {/* Scrollable list of available staff */}
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                {availableTeachers.length > 0 ? (
                  availableTeachers.map((member: any) => {
                    const selected = teacher === member.name;
                    return (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => { setTeacher(member.name); setTeacherSearch(""); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${selected ? "bg-[#9810fa]/10" : "hover:bg-slate-50"}`}
                      >
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                          {member.name?.split(" ").map((n: string) => n[0] || "").join("").slice(0, 2) || "T"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${selected ? "text-[#9810fa]" : "text-slate-700"}`}>{member.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">{member.role || "Staff"}{member.department ? ` · ${member.department}` : ""}</p>
                        </div>
                        {selected && <Check className="h-4 w-4 text-[#9810fa] shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-center text-xs text-slate-400">No staff found. Type a name above.</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Grade</Label>
              <Input 
                id="grade" 
                value={grade} 
                onChange={(e) => setGrade(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Section</Label>
              <Input 
                id="section" 
                value={section} 
                onChange={(e) => setSection(e.target.value)} 
                className="rounded-xl border-slate-200 h-11"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
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
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button 
              type="button"
              variant="ghost" 
              className="text-destructive hover:text-destructive hover:bg-destructive/5 rounded-xl font-bold"
              onClick={() => setIsDeleting(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Class
            </Button>
            <div className="flex-1" />
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
