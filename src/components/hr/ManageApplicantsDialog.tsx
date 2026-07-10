import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { JobOpening } from "@/types/hr";
import { useRecruitment } from "@/contexts/RecruitmentContext";
import { JobApplicationsList } from "./JobApplicationsList";

interface ManageApplicantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobOpening | null;
}

export const ManageApplicantsDialog: React.FC<ManageApplicantsDialogProps> = ({
  open,
  onOpenChange,
  job,
}) => {
  const { applications } = useRecruitment();

  if (!job) return null;

  const jobApplications = applications.filter(app => app.jobId === job.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] rounded-3xl p-0 overflow-hidden flex flex-col h-[85vh] border-none shadow-2xl">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary border-none">
                {job.department}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-slate-200 text-slate-500">
                {job.type}
              </Badge>
            </div>
            <DialogTitle className="text-3xl font-black tracking-tight">{job.title}</DialogTitle>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {jobApplications.length} Total Applicants
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <JobApplicationsList job={job} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
