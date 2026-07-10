import { useState, useRef } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  FileText, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  Clock,
  PlayCircle,
  Upload,
  Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface SubjectDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: {
    name: string;
    teacher: string;
    completion: number;
  } | null;
  type: "syllabus" | "resources";
}

export function SubjectDetailsDialog({ open, onOpenChange, subject, type }: SubjectDetailsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [syllabusItems, setSyllabusItems] = useState([
    { title: "Algebraic Expressions", status: "Completed", date: "Oct 12, 2024" },
    { title: "Quadratic Equations", status: "Completed", date: "Oct 28, 2024" },
    { title: "Trigonometry Basics", status: "In Progress", date: "Nov 15, 2024" },
    { title: "Coordinate Geometry", status: "Pending", date: "Dec 05, 2024" },
    { title: "Probability & Statistics", status: "Pending", date: "Dec 20, 2024" },
  ]);

  const [resourceItems, setResourceItems] = useState([
    { title: "Chapter 1: Introduction to Algebra", type: "PDF", size: "2.4 MB", icon: FileText },
    { title: "Video Lecture: Quadratic Equations", type: "Video", duration: "45 min", icon: PlayCircle },
    { title: "Practice Set: Trigonometry", type: "PDF", size: "1.8 MB", icon: FileText },
    { title: "Formula Sheet: Geometry", type: "PDF", size: "0.5 MB", icon: FileText },
    { title: "Interactive Quiz: Probability", type: "Link", icon: ExternalLink },
  ]);

  if (!subject) return null;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.info(`Uploading ${file.name}...`);
    
    // Simulate upload delay
    setTimeout(() => {
      if (type === 'syllabus') {
        const newItem = { 
          title: file.name.replace(/\.[^/.]+$/, ""), 
          status: "Pending", 
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '4-digit' }) 
        };
        setSyllabusItems(prev => [newItem, ...prev]);
      } else {
        const fileExt = file.name.split('.').pop()?.toUpperCase() || "FILE";
        const newItem = { 
          title: file.name.replace(/\.[^/.]+$/, ""), 
          type: fileExt, 
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`, 
          icon: FileText 
        };
        setResourceItems(prev => [newItem, ...prev]);
      }
      toast.success(`${file.name} uploaded successfully!`);
    }, 1000);
  };

  const handleDownload = (title: string) => {
    toast.success(`Downloading ${title}...`);
  };

  const handleDownloadAll = () => {
    toast.info(`Preparing all ${type === 'syllabus' ? 'syllabus chapters' : 'resources'} for download...`);
    setTimeout(() => {
      toast.success("Download started!");
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-0">
          <DialogTitle className="sr-only">{subject.name} - {type === 'syllabus' ? 'Syllabus' : 'Resources'}</DialogTitle>
          <div className={`h-32 w-full bg-gradient-to-br ${type === 'syllabus' ? 'from-purple-600 to-purple-600' : 'from-emerald-600 to-teal-600'} flex items-end p-6`}>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                {type === 'syllabus' ? <BookOpen className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
              </div>
              <div>
                <h2 className="text-xl font-black text-white leading-tight">{subject.name}</h2>
                <p className="text-white/70 text-xs font-bold uppercase tracking-wider">{type === 'syllabus' ? 'Curriculum & Syllabus' : 'Learning Resources'}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-500">Overall Progress</span>
              <span className="text-slate-900">{subject.completion}%</span>
            </div>
            <Progress value={subject.completion} className="h-2 bg-slate-100" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                {type === 'syllabus' ? 'Chapter List' : 'Available Resources'}
                <Badge variant="outline" className="text-[10px] font-bold">{type === 'syllabus' ? syllabusItems.length : resourceItems.length} Items</Badge>
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 rounded-xl gap-2 font-bold text-xs ${type === 'syllabus' ? 'text-purple-600 hover:bg-indigo-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                onClick={handleUploadClick}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange}
                accept={type === 'syllabus' ? ".pdf,.doc,.docx" : "*"}
              />
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {type === 'syllabus' ? (
                syllabusItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${
                        item.status === 'Completed' ? 'bg-emerald-100 text-emerald-600' : 
                        item.status === 'In Progress' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'
                      }`}>
                        {item.status === 'Completed' ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.title}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{item.status} • {item.date}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDownload(item.title)}
                    >
                      <Download className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                ))
              ) : (
                resourceItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-emerald-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.title}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{item.type} {item.size || item.duration ? `• ${item.size || item.duration}` : ''}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleDownload(item.title)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-2xl border-slate-200 font-bold" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button 
              className={`flex-1 rounded-2xl font-bold text-white shadow-lg ${type === 'syllabus' ? 'gradient-primary shadow-primary/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}
              onClick={handleDownloadAll}
            >
              {type === 'syllabus' ? 'Download Full Syllabus' : 'Download All Resources'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
