import React, { useState } from "react";
import { JobOpening, JobApplication } from "@/types/hr";
import { useRecruitment } from "@/contexts/RecruitmentContext";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  Phone, 
  FileText, 
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { provisionUserAccount } from "@/lib/staffAccounts";

interface JobApplicationsListProps {
  job: JobOpening;
}

export const JobApplicationsList: React.FC<JobApplicationsListProps> = ({ job }) => {
  const { applications, updateApplication } = useRecruitment();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const jobApplications = applications.filter(app => app.jobId === job.id);
  
  const filteredApplications = jobApplications.filter(app => {
    const matchesSearch = app.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         app.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: JobApplication["status"]) => {
    switch (status) {
      case "Pending":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "Reviewing":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1"><Search className="h-3 w-3" /> Reviewing</Badge>;
      case "Interview":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 gap-1"><Calendar className="h-3 w-3" /> Interview</Badge>;
      case "Hired":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Hired</Badge>;
      case "Rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: JobApplication["status"]) => {
    await updateApplication(id, { status: newStatus });
    if (newStatus === "Hired") {
      const app = applications.find(a => a.id === id);
      if (app) await onboardHiredApplicant(app);
    }
  };

  // Hiring is not just a status flip — it must produce a real Staff record and a
  // login account so the new hire actually exists in the system.
  const onboardHiredApplicant = async (app: JobApplication) => {
    const today = new Date().toISOString().split("T")[0];
    // Staff record (skip if this applicant was already hired once before)
    try {
      const existingStaff = (await smartDb.getAll("Staff", undefined)) as { email?: string }[];
      const dup = (existingStaff || []).some(
        s => String(s.email ?? "").trim().toLowerCase() === app.email.trim().toLowerCase()
      );
      if (!dup) {
        await smartDb.create("Staff", {
          id: `staff-${Date.now()}`,
          name: app.applicantName,
          email: app.email,
          phone: app.phone,
          role: job.title,
          department: job.department || "General",
          status: "Active",
          joinDate: today,
          uid: app.uid,
          createdAt: new Date().toISOString(),
        });
        toast.success(`Staff record created for ${app.applicantName}`);
      } else {
        toast.info(`${app.applicantName} already has a staff record — skipped`);
      }
    } catch {
      toast.error("Failed to create staff record for the new hire");
    }
    // Login account (same shape the User & Role console creates)
    try {
      const isTeaching = /teacher/i.test(job.title);
      const result = await provisionUserAccount({
        name: app.applicantName,
        email: app.email,
        role: isTeaching ? "teacher" : "staff",
      });
      if (result.alreadyExisted) {
        toast.info(`A login account for ${app.email} already exists — skipped account creation`);
      } else if (result.credentials) {
        toast.success(
          `Login account created for ${app.applicantName} — Username: ${result.credentials.username} · Password: ${result.credentials.password}`,
          { duration: 12000 }
        );
      }
    } catch {
      toast.error("Failed to create login account for the new hire");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search applicants..." 
            className="pl-10 rounded-xl border-slate-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          {["all", "Pending", "Reviewing", "Interview", "Hired", "Rejected"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className={cn(
                "rounded-xl text-[10px] font-bold uppercase tracking-widest h-8",
                statusFilter === status ? "gradient-primary border-none shadow-sm" : "border-slate-200 text-muted-foreground"
              )}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredApplications.map((app) => (
            <motion.div
              key={app.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300"
            >
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-primary/5 group-hover:border-primary/10 transition-colors">
                  <User className="h-7 w-7 text-slate-400 group-hover:text-primary transition-colors" />
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black tracking-tight">{app.applicantName}</h3>
                    {getStatusBadge(app.status)}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      {app.email}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      {app.phone}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      Applied {format(new Date(app.appliedDate), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl h-9 border-slate-200 gap-2 text-[10px] font-bold uppercase tracking-widest" asChild>
                      <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-3 w-3" /> Resume
                      </a>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-slate-50">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-xl">
                        <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, "Reviewing")} className="text-xs font-bold uppercase tracking-widest p-3">
                          Mark as Reviewing
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, "Interview")} className="text-xs font-bold uppercase tracking-widest p-3">
                          Schedule Interview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, "Hired")} className="text-xs font-bold uppercase tracking-widest p-3 text-green-600">
                          Mark as Hired
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusUpdate(app.id, "Rejected")} className="text-xs font-bold uppercase tracking-widest p-3 text-destructive">
                          Reject Application
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {app.answers && (app.answers || []).length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(app.answers || []).map((ans, idx) => (
                    <div key={idx} className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{ans?.question}</p>
                      <p className="text-xs font-medium">{ans?.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredApplications.length === 0 && (
          <div className="text-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
            <div className="h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-slate-200" />
            </div>
            <h3 className="text-lg font-black tracking-tight mb-1">No applications found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
};
