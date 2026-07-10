import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Users, Clock, BookOpen, Calendar, Trash2 } from "lucide-react";
import { useClasses } from "@/hooks/useClasses";
import { Class } from "@/contexts/ClassContext";
import { toast } from "sonner";

interface ViewClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classData: Class | null;
}

export const ViewClassDialog = ({ open, onOpenChange, classData }: ViewClassDialogProps) => {
  const { deleteClass } = useClasses();

  if (!classData) return null;

  const handleDelete = async () => {
    try {
      await deleteClass(classData.id);
      toast.success("Class Deleted", {
        description: `${classData.name} has been removed from the directory.`,
      });
      onOpenChange(false);
    } catch (error) {
      // Error is handled by handleFirestoreError in ClassContext
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl overflow-hidden p-0 border-none">
        <div className="h-24 gradient-primary flex items-end p-6">
          <DialogTitle className="text-2xl font-bold text-white mb-0">{classData.name}</DialogTitle>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-none flex items-center gap-1 px-3 py-1">
              <BookOpen className="h-3 w-3" />
              {classData.subject}
            </Badge>
            <Badge variant="secondary" className="bg-secondary text-foreground border-none flex items-center gap-1 px-3 py-1">
              <Clock className="h-3 w-3" />
              {classData.time}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned Teacher</p>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold">{classData.teacher}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Students</p>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold">{classData.students} enrolled</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Class Description</p>
            <p className="text-sm text-foreground leading-relaxed">
              {classData.description || "No description provided for this class."}
            </p>
          </div>

          <div className="pt-4 flex items-center justify-between gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl flex-1 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Class
            </Button>
            <Button className="rounded-xl flex-1 gradient-primary" onClick={() => onOpenChange(false)}>
              Close Details
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
