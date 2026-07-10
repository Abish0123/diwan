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
import { toast } from "sonner";
import { FilePlus, FileText, Video, Globe } from "lucide-react";
import { DigitalResource } from "@/types/library";

interface AddResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddResource: (resource: DigitalResource) => void;
}

export function AddResourceDialog({ open, onOpenChange, onAddResource }: AddResourceDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    type: "PDF",
    size: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.size) {
      toast.error("Please fill in all fields");
      return;
    }

    const getIcon = (type: string) => {
      switch (type) {
        case "PDF": return FileText;
        case "Video": return Video;
        case "Web": return Globe;
        default: return FileText;
      }
    };

    const getColor = (type: string) => {
      switch (type) {
        case "PDF": return "text-red-500";
        case "Video": return "text-blue-500";
        case "Web": return "text-emerald-500";
        default: return "text-primary";
      }
    };

    const getBg = (type: string) => {
      switch (type) {
        case "PDF": return "bg-red-50";
        case "Video": return "bg-blue-50";
        case "Web": return "bg-emerald-50";
        default: return "bg-primary/5";
      }
    };

    const newResource: DigitalResource = {
      id: `DR${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      title: formData.title,
      type: formData.type,
      size: formData.size,
      icon: getIcon(formData.type),
      color: getColor(formData.type),
      bg: getBg(formData.type)
    };

    onAddResource(newResource);
    toast.success("Resource Added", {
      description: `${formData.title} is now available in the digital library.`
    });
    onOpenChange(false);
    setFormData({ title: "", type: "PDF", size: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl border-none shadow-2xl overflow-hidden p-0">
        <div className="bg-primary/5 p-6 border-b border-primary/10">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FilePlus className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Add Digital Resource</DialogTitle>
                <DialogDescription>
                  Upload or link a new digital resource.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Resource Title</Label>
              <Input 
                id="title" 
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                placeholder="e.g. History Encyclopedia"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="rounded-xl border-border bg-secondary/30 h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border">
                    <SelectItem value="PDF">PDF Document</SelectItem>
                    <SelectItem value="Video">Video Lecture</SelectItem>
                    <SelectItem value="Web">Web Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="size" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Size/Info</Label>
                <Input 
                  id="size" 
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  className="rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 h-11" 
                  placeholder="e.g. 12 MB or Link"
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
              Add Resource
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
