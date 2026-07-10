import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobOpening } from "@/types/hr";
import { 
  Briefcase, 
  Building2, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Globe,
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface JobDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobOpening | null;
}

export const JobDetailsDialog: React.FC<JobDetailsDialogProps> = ({
  open,
  onOpenChange,
  job,
}) => {
  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl overflow-hidden p-0 border-none shadow-2xl">
        <div className="h-40 bg-slate-50 flex items-end p-8 border-b border-slate-100">
          <div className="flex items-start gap-6 w-full">
            <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
              <Building2 className="h-10 w-10" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border-none">
                  {job.department}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 text-[10px] font-bold uppercase tracking-widest bg-slate-200 text-slate-600 border-none">
                  {job.workplaceType}
                </Badge>
              </div>
              <DialogTitle className="text-3xl font-black tracking-tight">{job.title}</DialogTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground font-bold uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {job.company || "Blue Wood School"}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto p-8 space-y-8">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Job Type</p>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold">{job.type}</p>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Posted On</p>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold">{formatDate(job.createdAt)}</p>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full", job.status === "Open" ? "bg-green-500 animate-pulse" : "bg-slate-400")} />
                <p className="text-sm font-bold">{job.status}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <div className="h-1 w-4 bg-primary rounded-full" />
              About the role
            </h4>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-slate-50/50 p-6 rounded-2xl border border-slate-100 italic">
              {job.description}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <div className="h-1 w-4 bg-primary rounded-full" />
              Requirements
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {job.requirements.map((req, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm group hover:border-primary/30 transition-all">
                  <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">{req}</p>
                </div>
              ))}
            </div>
          </div>

          {job.screeningQuestions && job.screeningQuestions.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <div className="h-1 w-4 bg-primary rounded-full" />
                Screening Questions
              </h4>
              <div className="space-y-3">
                {job.screeningQuestions.map((q) => (
                  <div key={q.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-4">
                    <div className="h-8 w-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{q.question}</p>
                        {q.isEssential && (
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest text-orange-600 border-orange-200 bg-orange-50">Essential</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Ideal Answer: <span className="font-bold text-primary">{q.idealAnswer}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="rounded-xl h-12 px-8 text-xs font-bold uppercase tracking-widest border-slate-200"
          >
            Close
          </Button>
          <Button 
            className="rounded-xl h-12 px-12 text-xs font-bold uppercase tracking-widest gradient-primary shadow-lg shadow-primary/20"
            onClick={() => {
              onOpenChange(false);
              // We'll trigger the apply dialog from the parent
              window.dispatchEvent(new CustomEvent('open-apply-dialog', { detail: job }));
            }}
          >
            Apply Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
