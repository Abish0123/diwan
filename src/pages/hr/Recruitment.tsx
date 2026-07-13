import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical,
  Briefcase,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Building2,
  Globe,
  ArrowUpRight,
  FileText,
  Loader2,
  Share2,
  Linkedin,
  Twitter,
  Facebook,
  Copy
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useRecruitment } from "@/contexts/RecruitmentContext";
import { useHRSettings } from "@/contexts/HRSettingsContext";
import { JobOpeningDialog } from "@/components/hr/JobOpeningDialog";
import { JobDetailsDialog } from "@/components/hr/JobDetailsDialog";
import { ManageApplicantsDialog } from "@/components/hr/ManageApplicantsDialog";
import { ApplyJobDialog } from "@/components/hr/ApplyJobDialog";
import { JobOpening } from "@/types/hr";
import { useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const JOB_STATUS_LABEL_KEYS: Record<string, string> = {
  Open: 'admin.hr.recruitment.jobStatusOpen',
  Closed: 'admin.hr.recruitment.jobStatusClosed',
};

const STATUS_FILTER_LABEL_KEYS: Record<string, string> = {
  All: 'admin.hr.recruitment.statusFilterAll',
  Open: 'admin.hr.recruitment.statusFilterOpen',
  Closed: 'admin.hr.recruitment.statusFilterClosed',
};

const Recruitment = () => {
  const { t } = useTranslation();
  const { jobs, applications, loading } = useRecruitment();
  const hrSettings = useHRSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOpening | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  useEffect(() => {
    const handleOpenApply = (e: Event) => {
      const customEvent = e as CustomEvent<JobOpening>;
      setSelectedJob(customEvent.detail);
      setIsApplyDialogOpen(true);
    };
    window.addEventListener('open-apply-dialog', handleOpenApply);
    return () => window.removeEventListener('open-apply-dialog', handleOpenApply);
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      const matchesSearch = (j.title?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                           (j.department?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "All" || j.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const active = jobs.filter(j => j.status === "Open").length;
    const totalApps = applications.length;
    const hired = applications.filter(a => a.status === "Hired").length;
    const interviews = applications.filter(a => a.status === "Interview").length;

    return [
      { label: t('admin.hr.recruitment.statActiveOpenings'), value: active.toString(), icon: Briefcase, color: "blue", sub: t('admin.hr.recruitment.statCurrentlyHiring') },
      { label: t('admin.hr.recruitment.statTotalApplicants'), value: totalApps.toString(), icon: Users, color: "purple", sub: t('admin.hr.recruitment.statAcrossAllRoles') },
      { label: t('admin.hr.recruitment.statInterviewsToday'), value: interviews.toString(), icon: Calendar, color: "orange", sub: t('admin.hr.recruitment.statScheduled') },
      { label: t('admin.hr.recruitment.statHiredThisMonth'), value: hired.toString(), icon: CheckCircle2, color: "green", sub: t('admin.hr.recruitment.statOnboarding') },
    ];
  }, [jobs, applications, t]);

  const handleViewDetails = (job: JobOpening) => {
    setSelectedJob(job);
    setIsDetailsDialogOpen(true);
  };

  const handleManageApplicants = (job: JobOpening) => {
    setSelectedJob(job);
    setIsManageDialogOpen(true);
  };

  const handleShare = (job: JobOpening, platform?: string) => {
    const shareUrl = window.location.href; // In real app, this would be a public link
    const text = t('admin.hr.recruitment.shareMessage', { title: job.title, department: job.department, url: shareUrl });

    if (!platform) {
      navigator.clipboard.writeText(shareUrl);
      toast.success(t('admin.hr.recruitment.linkCopiedToast'));
      return;
    }

    let url = "";
    switch (platform) {
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
    }
    window.open(url, '_blank', 'width=600,height=400');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.hr.recruitment.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.hr.recruitment.pageSubtitle')}</p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={() => setIsJobDialogOpen(true)} className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 me-2" />
              {t('admin.hr.recruitment.postNewJob')}
            </Button>
          </motion.div>
        </motion.div>

        {/* HR Settings recruitment policy strip */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-100 text-sm">
          <span className="font-semibold text-amber-800">{t('admin.hr.recruitment.configStripTitle')}</span>
          <span className="text-amber-700">{t('admin.hr.recruitment.offerExpiryLabel')} <b>{t('admin.hr.recruitment.daysValue', { count: hrSettings.offerExpiry })}</b></span>
          <span className="text-amber-400">·</span>
          <span className="text-amber-700">{t('admin.hr.recruitment.probationLabel')} <b>{t('admin.hr.recruitment.monthsValue', { count: hrSettings.probation })}</b></span>
          <span className="text-amber-400">·</span>
          <span className="text-amber-700">{t('admin.hr.recruitment.mandatoryDemoLabel')} <b>{hrSettings.mandatoryDemo ? t('admin.hr.recruitment.yes') : t('admin.hr.recruitment.no')}</b></span>
          <span className="text-amber-400">·</span>
          <span className="text-amber-700">{t('admin.hr.recruitment.autoPublishLabel')} <b>{hrSettings.autoPublish ? t('admin.hr.recruitment.on') : t('admin.hr.recruitment.off')}</b></span>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.02, y: -5 }}
              className="premium-card p-6 flex items-center gap-5"
            >
              <div className={`h-12 w-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center`}>
                <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <div className="relative flex-1 w-full group">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              className="ps-10 h-11 rounded-xl border-border bg-card focus-visible:ring-primary/20 transition-all"
              placeholder={t('admin.hr.recruitment.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {["All", "Open", "Closed"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "rounded-xl h-11 px-4 text-xs font-bold uppercase tracking-widest",
                  statusFilter === status ? "gradient-primary border-none" : "hover:bg-primary/5"
                )}
              >
                {t(STATUS_FILTER_LABEL_KEYS[status] || status)}
              </Button>
            ))}
          </div>
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {filteredJobs.length > 0 ? (
              filteredJobs.map((job, idx) => {
                const jobApps = applications.filter(a => a.jobId === job.id);
                return (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ y: -5 }}
                    className="premium-card p-6 space-y-4 group hover:border-primary/50 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <Badge variant="secondary" className="rounded-full px-3 text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border-none">
                          {job.department}
                        </Badge>
                        <h3 className="text-xl font-black group-hover:text-primary transition-colors">{job.title}</h3>
                      </div>
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "border-none font-bold text-[10px] uppercase tracking-wider",
                          job.status === "Open" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {t(JOB_STATUS_LABEL_KEYS[job.status] || job.status)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {job.type}
                      </div>
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {job.workplaceType}
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.location}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="flex -space-x-2">
                        {jobApps.slice(0, 3).map((app, i) => (
                          <motion.div 
                            key={app.id} 
                            whileHover={{ y: -5, zIndex: 10 }}
                            className="h-8 w-8 rounded-full border-2 border-white bg-primary/10 flex items-center justify-center text-[10px] font-bold cursor-pointer text-primary"
                            title={app.applicantName}
                          >
                            {app.applicantName.charAt(0)}
                          </motion.div>
                        ))}
                        {jobApps.length > 3 && (
                          <div className="h-8 w-8 rounded-full border-2 border-white bg-secondary flex items-center justify-center text-[10px] font-bold">
                            +{jobApps.length - 3}
                          </div>
                        )}
                        {jobApps.length === 0 && (
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{t('admin.hr.recruitment.noApplicantsYet')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 rounded-xl hover:bg-slate-100 text-muted-foreground"
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-2xl p-2 border-slate-100 shadow-xl min-w-[180px]">
                            <DropdownMenuItem onClick={() => handleShare(job)} className="rounded-xl p-3 cursor-pointer gap-2">
                              <Copy className="h-4 w-4 text-slate-500" />
                              <span className="font-bold text-xs uppercase tracking-widest">{t('admin.hr.recruitment.copyLink')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(job, 'linkedin')} className="rounded-xl p-3 cursor-pointer gap-2">
                              <Linkedin className="h-4 w-4 text-purple-600" />
                              <span className="font-bold text-xs uppercase tracking-widest">{t('admin.hr.recruitment.linkedin')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(job, 'twitter')} className="rounded-xl p-3 cursor-pointer gap-2">
                              <Twitter className="h-4 w-4 text-sky-500" />
                              <span className="font-bold text-xs uppercase tracking-widest">{t('admin.hr.recruitment.twitter')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(job, 'facebook')} className="rounded-xl p-3 cursor-pointer gap-2">
                              <Facebook className="h-4 w-4 text-blue-700" />
                              <span className="font-bold text-xs uppercase tracking-widest">{t('admin.hr.recruitment.facebook')}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="rounded-xl h-9 text-xs font-bold"
                            onClick={() => handleViewDetails(job)}
                          >
                            {t('admin.hr.recruitment.viewDetails')}
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-9 text-xs font-bold border-slate-200"
                            onClick={() => {
                              setSelectedJob(job);
                              setIsApplyDialogOpen(true);
                            }}
                          >
                            {t('admin.hr.recruitment.apply')}
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            size="sm"
                            className="rounded-xl h-9 text-xs font-bold gradient-primary shadow-lg shadow-primary/20"
                            onClick={() => handleManageApplicants(job)}
                          >
                            {t('admin.hr.recruitment.manageApplicants')}
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                <div className="h-20 w-20 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Briefcase className="h-10 w-10 opacity-20" />
                </div>
                <div className="text-center">
                  <p className="font-bold tracking-widest uppercase text-xs">{t('admin.hr.recruitment.noJobOpeningsFound')}</p>
                  <p className="text-sm">{t('admin.hr.recruitment.noJobOpeningsHint')}</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <JobOpeningDialog 
        open={isJobDialogOpen} 
        onOpenChange={setIsJobDialogOpen} 
      />
      
      <JobDetailsDialog 
        open={isDetailsDialogOpen} 
        onOpenChange={setIsDetailsDialogOpen} 
        job={selectedJob} 
      />

      <ManageApplicantsDialog 
        open={isManageDialogOpen} 
        onOpenChange={setIsManageDialogOpen} 
        job={selectedJob} 
      />

      <ApplyJobDialog
        open={isApplyDialogOpen}
        onOpenChange={setIsApplyDialogOpen}
        job={selectedJob}
      />
    </DashboardLayout>
  );
};

export default Recruitment;
