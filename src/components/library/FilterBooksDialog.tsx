import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Filter, RotateCcw } from "lucide-react";
import { LibraryFilters } from "@/types/library";

interface FilterBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: LibraryFilters) => void;
  currentFilters: LibraryFilters;
}

export function FilterBooksDialog({ open, onOpenChange, onApplyFilters, currentFilters }: FilterBooksDialogProps) {
  const handleReset = () => {
    onApplyFilters({ category: "All", status: "All" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Filter className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Filter Books</DialogTitle>
                <DialogDescription>
                  Refine the book inventory list.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Category</Label>
              <Select 
                value={currentFilters.category} 
                onValueChange={(value) => onApplyFilters({ ...currentFilters, category: value })}
              >
                <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  <SelectItem value="All">All Categories</SelectItem>
                  <SelectItem value="Fiction">Fiction</SelectItem>
                  <SelectItem value="Fantasy">Fantasy</SelectItem>
                  <SelectItem value="Science">Science</SelectItem>
                  <SelectItem value="History">History</SelectItem>
                  <SelectItem value="Reference">Reference</SelectItem>
                  <SelectItem value="Classic">Classic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Availability Status</Label>
              <Select 
                value={currentFilters.status} 
                onValueChange={(value) => onApplyFilters({ ...currentFilters, status: value })}
              >
                <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border">
                  <SelectItem value="All">All Statuses</SelectItem>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Borrowed">Borrowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4 gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              className="rounded-xl h-11 px-6 border-border hover:bg-secondary transition-colors font-bold gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button 
              type="button" 
              onClick={() => onOpenChange(false)}
              className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 hover:shadow-xl transition-all font-bold flex-1"
            >
              Apply Filters
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
