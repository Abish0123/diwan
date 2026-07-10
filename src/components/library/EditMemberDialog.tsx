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
import { toast } from "sonner";
import { UserCircle } from "lucide-react";
import { LibraryMember } from "@/types/library";

interface EditMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: LibraryMember | null;
  onUpdateMember: (member: LibraryMember) => void;
}

export function EditMemberDialog({ open, onOpenChange, member, onUpdateMember }: EditMemberDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    role: "Student",
    grade: "",
    status: "Active" as "Active" | "Inactive" | "Suspended"
  });

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name,
        role: member.role,
        grade: member.grade,
        status: member.status
      });
    }
  }, [member]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.grade || !member) {
      toast.error("Please fill in all required fields");
      return;
    }

    onUpdateMember({
      ...member,
      ...formData
    });
    
    toast.success("Member Updated", {
      description: `${formData.name}'s profile has been updated.`
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <UserCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Edit Member</DialogTitle>
                <DialogDescription>
                  Update library membership details.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Full Name</Label>
              <Input 
                id="name" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                placeholder="Enter member name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Role</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border">
                    <SelectItem value="Student">Student</SelectItem>
                    <SelectItem value="Staff">Staff</SelectItem>
                    <SelectItem value="Faculty">Faculty</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Grade/Dept</Label>
                <Input 
                  id="grade" 
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                  placeholder="e.g. 10th or Science"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Membership Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: "Active" | "Inactive" | "Suspended") => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4 gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="rounded-xl h-11 px-6 border-border hover:bg-secondary transition-colors font-bold"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 hover:shadow-xl transition-all font-bold flex-1"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
