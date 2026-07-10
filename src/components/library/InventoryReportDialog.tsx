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
  FileText, 
  Download, 
  Printer, 
  PieChart, 
  BarChart3, 
  TrendingUp 
} from "lucide-react";
import { Book } from "@/types/library";

interface InventoryReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: Book[];
}

export function InventoryReportDialog({ open, onOpenChange, books }: InventoryReportDialogProps) {
  const totalBooks = books.length;
  const borrowedBooks = books.filter(b => b.status === "Borrowed").length;
  const availableBooks = totalBooks - borrowedBooks;
  
  const categories = Array.from(new Set(books.map(b => b.category)));
  const categoryStats = categories.map(cat => ({
    name: cat,
    count: books.filter(b => b.category === cat).length
  })).sort((a, b) => b.count - a.count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Inventory Report</DialogTitle>
                <DialogDescription>
                  Comprehensive summary of library assets and status.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Assets</p>
              <p className="text-2xl font-black text-primary">{totalBooks}</p>
            </div>
            <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Available</p>
              <p className="text-2xl font-black text-success">{availableBooks}</p>
            </div>
            <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">On Loan</p>
              <p className="text-2xl font-black text-orange-600">{borrowedBooks}</p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold uppercase tracking-wider">Category Breakdown</h4>
            </div>
            <div className="space-y-3">
              {categoryStats.map((stat) => (
                <div key={stat.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span>{stat.name}</span>
                    <span className="text-muted-foreground">{stat.count} Books ({Math.round((stat.count / totalBooks) * 100)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full" 
                      style={{ width: `${(stat.count / totalBooks) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trends/Insights */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-border/50 space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Growth</span>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Inventory grew by <span className="text-foreground font-bold">+12%</span> this quarter.</p>
            </div>
            <div className="p-4 rounded-2xl border border-border/50 space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Utilization</span>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Average loan duration is <span className="text-foreground font-bold">14 days</span>.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-secondary/20 border-t border-border/50 gap-2">
          <Button 
            variant="outline" 
            className="rounded-xl h-11 px-6 border-border hover:bg-secondary transition-colors font-bold gap-2"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </Button>
          <Button 
            className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20 hover:shadow-xl transition-all font-bold flex-1 gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
