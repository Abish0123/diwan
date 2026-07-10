import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStudents } from "@/contexts/StudentContext";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { Student } from "@/types";

interface DeleteStudentDialogProps {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteStudentDialog({ student, open, onOpenChange }: DeleteStudentDialogProps) {
  const { deleteStudent } = useStudents();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!student) return;

    setIsDeleting(true);
    try {
      await deleteStudent(student.id);

      // Cascade: remove student and parent user accounts by matching email
      if (student.email) {
        const usersRes = await fetch("/api/data/users").catch(() => null);
        if (usersRes?.ok) {
          const allUsers: any[] = await usersRes.json().catch(() => []);
          const studentEmail = student.email.toLowerCase();
          const parentEmail = `parent.${studentEmail}`;
          const toDelete = allUsers.filter(u => {
            const ue = (u.email || u.data?.email || "").toLowerCase();
            return ue === studentEmail || ue === parentEmail;
          });
          await Promise.all(
            toDelete.map(u =>
              fetch(`/api/data/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }).catch(() => {})
            )
          );
        }
      }

      toast.success(`Student ${student.name} deleted successfully`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting student:", error);
      toast.error("Failed to delete student");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Delete Student</DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground">
                This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-xs font-medium text-amber-800 leading-relaxed">
              Are you sure you want to delete the record for <span className="font-bold underline">{student.name}</span> ({student.id})? All associated data will be permanently removed, including their student and parent login credentials.
            </p>
          </div>
        </div>

        <DialogFooter className="p-6 pt-0 flex items-center justify-end gap-3">
          <Button 
            type="button"
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="h-10 px-6 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-secondary/50"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button 
            type="button"
            variant="destructive"
            className="h-10 px-8 font-bold text-xs uppercase tracking-wider shadow-lg shadow-destructive/20 rounded-xl"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
