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
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { BookPlus } from "lucide-react";
import { Book } from "@/types/library";

interface AddBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddBook: (book: Book) => void;
}

export function AddBookDialog({ open, onOpenChange, onAddBook }: AddBookDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    author: "",
    category: "Fiction",
    isbn: "",
    quantity: 1,
    description: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.author) {
      toast.error("Please fill in required fields");
      return;
    }

    const newBook: Book = {
      id: `BK${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      title: formData.title,
      author: formData.author,
      category: formData.category,
      status: "Available",
      isbn: formData.isbn || "N/A",
      addedDate: new Date().toISOString().split('T')[0],
      description: formData.description,
      quantity: formData.quantity
    };

    onAddBook(newBook);
    toast.success("Book Added", {
      description: `${formData.title} has been added to the library.`
    });
    onOpenChange(false);
    setFormData({
      title: "",
      author: "",
      category: "Fiction",
      isbn: "",
      quantity: 1,
      description: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookPlus className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Add New Book</DialogTitle>
                <DialogDescription>
                  Register a new physical book in the library inventory.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Book Title</Label>
              <Input 
                id="title" 
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                placeholder="e.g. The Great Gatsby"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="author" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Author</Label>
                <Input 
                  id="author" 
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                  placeholder="Author Name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Category</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border">
                    <SelectItem value="Fiction">Fiction</SelectItem>
                    <SelectItem value="Fantasy">Fantasy</SelectItem>
                    <SelectItem value="Science">Science</SelectItem>
                    <SelectItem value="History">History</SelectItem>
                    <SelectItem value="Reference">Reference</SelectItem>
                    <SelectItem value="Classic">Classic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="isbn" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">ISBN</Label>
                <Input 
                  id="isbn" 
                  value={formData.isbn}
                  onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                  placeholder="978-..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Quantity</Label>
                <Input 
                  id="quantity" 
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Description</Label>
              <Textarea 
                id="description" 
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 min-h-[100px] resize-none" 
                placeholder="Brief summary of the book..."
              />
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
              Add to Inventory
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
