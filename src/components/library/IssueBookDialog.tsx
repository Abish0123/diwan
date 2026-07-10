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
import { BookMarked, Calendar, User } from "lucide-react";
import { useStudents } from "@/contexts/StudentContext";
import { Book, IssueData } from "@/types/library";

interface IssueBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onIssueBook: (bookId: string, issueData: IssueData) => void;
}

export function IssueBookDialog({ open, onOpenChange, book, onIssueBook }: IssueBookDialogProps) {
  const { students } = useStudents();
  const [formData, setFormData] = useState({
    studentId: "",
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentId || !book) {
      toast.error("Please select a student");
      return;
    }

    onIssueBook(book.id, formData);
    toast.success("Book Issued", {
      description: `${book.title} has been issued successfully.`
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
                <BookMarked className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Issue Book</DialogTitle>
                <DialogDescription>
                  Loan a physical book to a student or staff member.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <BookMarked className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Book Selected</p>
                <p className="text-sm font-bold text-foreground">{book?.title || "No book selected"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Select Student</Label>
              <Select 
                value={formData.studentId} 
                onValueChange={(value) => setFormData({ ...formData, studentId: value })}
              >
                <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                  <SelectValue placeholder="Search student..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name} ({student.rollNumber})
                    </SelectItem>
                  ))}
                  {students.length === 0 && (
                    <SelectItem value="none" disabled>No students found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issueDate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Issue Date</Label>
                <Input 
                  id="issueDate" 
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Due Date</Label>
                <Input 
                  id="dueDate" 
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                />
              </div>
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
              Issue Book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
