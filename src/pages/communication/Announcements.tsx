import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Megaphone, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Calendar as CalendarIcon,
  User,
  Eye,
  Trash2,
  Edit,
  CheckCircle2,
  Clock,
  AlertCircle,
  GraduationCap
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useNotices, Notice } from "@/contexts/NoticeContext";
import { useClasses } from "@/contexts/ClassContext";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useParentChildren } from "@/hooks/useParentChildren";
import { audienceGroupForRole, filterAnnouncementsForViewer, ViewerClass } from "@/lib/announcementAudience";

const Announcements = () => {
  const { t } = useTranslation();
  const { notices, addNotice, updateNotice, deleteNotice, loading: noticesLoading } = useNotices();
  const { classes } = useClasses();
  const { role, user } = useAuth();
  const { students } = useStudents();
  const { children: parentChildren } = useParentChildren();
  const audienceGroup = audienceGroupForRole(role);
  const isStudent = audienceGroup === 'student';
  // Only admin/staff manage announcements; students and parents are read-only viewers.
  const canManage = audienceGroup === 'admin' || audienceGroup === 'staff';
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<Notice>>({
    title: "",
    content: "",
    category: "General",
    priority: "Medium",
    status: "Published",
    targetAudience: "All",
    targetClass: ""
  });

  // The viewer's own class (student) or their children's classes (parent) —
  // used to enforce targetClass scoping. Staff/admin don't need one.
  const viewerClasses = useMemo<ViewerClass[]>(() => {
    if (audienceGroup === "student") {
      const me = students.find((s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
      ) || students[0];
      return me ? [{ grade: me.grade, section: me.section }] : [];
    }
    if (audienceGroup === "parent") {
      return parentChildren.map((c) => ({ grade: c.grade, section: c.section }));
    }
    return [];
  }, [audienceGroup, students, parentChildren, user]);

  // Real ids this viewer may see private, per-family notices for (e.g. a fee
  // invoice reminder) — themselves (student) or their real children (parent).
  const viewerStudentIds = useMemo<string[]>(() => {
    if (audienceGroup === "student") {
      const me = students.find((s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
      ) || students[0];
      return me ? [me.id] : [];
    }
    if (audienceGroup === "parent") return parentChildren.map((c) => c.id);
    return [];
  }, [audienceGroup, students, parentChildren, user]);

  // Enforce audience targeting: admin (management console) sees everything;
  // everyone else only sees Published announcements addressed to their group
  // and — for students/parents — their class.
  const visibleNotices = useMemo(
    () => filterAnnouncementsForViewer(notices, role, viewerClasses, viewerStudentIds),
    [notices, role, viewerClasses, viewerStudentIds]
  );

  const filteredAnnouncements = visibleNotices.filter(announcement => {
    const matchesSearch = (announcement.title?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
                         (announcement.content?.toLowerCase() || "").includes((searchQuery || "").toLowerCase());
    const matchesTab = activeTab === "all" || announcement.status?.toLowerCase() === (activeTab || "").toLowerCase();
    const matchesCategory = categoryFilter === "all" || announcement.category === categoryFilter;
    return matchesSearch && matchesTab && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Urgent": return "bg-destructive/10 text-destructive border-destructive/20";
      case "Academic": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "Finance": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Event": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Published": return <CheckCircle2 className="h-3 w-3 me-1" />;
      case "Draft": return <Edit className="h-3 w-3 me-1" />;
      case "Scheduled": return <Clock className="h-3 w-3 me-1" />;
      default: return null;
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.title || !formData.content) {
      toast.error(t('shared.announcements.toastFillRequired'));
      return;
    }

    try {
      if (isEditing && selectedNotice) {
        await updateNotice(selectedNotice.id, formData);
        toast.success(t('shared.announcements.toastUpdated'));
      } else {
        await addNotice(formData as Omit<Notice, "id" | "uid" | "createdAt" | "views" | "date" | "postedBy">);
        toast.success(t('shared.announcements.toastBroadcasted'));
      }
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(t('shared.announcements.toastSaveFailed'));
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      category: "General",
      priority: "Medium",
      status: "Published",
      targetAudience: "All",
      targetClass: ""
    });
    setIsEditing(false);
    setSelectedNotice(null);
  };

  const handleEdit = (notice: Notice) => {
    setSelectedNotice(notice);
    setFormData({
      title: notice.title,
      content: notice.content,
      category: notice.category,
      priority: notice.priority,
      status: notice.status,
      targetAudience: notice.targetAudience,
      targetClass: notice.targetClass || ""
    });
    setIsEditing(true);
    setIsCreateDialogOpen(true);
  };

  const handleView = (notice: Notice) => {
    setSelectedNotice(notice);
    setIsViewDialogOpen(true);
    // Increment view count
    updateNotice(notice.id, { views: (notice.views || 0) + 1 });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('shared.announcements.confirmDelete'))) {
      await deleteNotice(id);
      toast.success(t('shared.announcements.toastDeleted'));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Megaphone className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('shared.announcements.pageTitle')}</h1>
              <p className="text-sm text-slate-400">
                {canManage
                  ? t('shared.announcements.subtitleManage')
                  : t('shared.announcements.subtitleViewer')}
              </p>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) resetForm();
          }}>
            {canManage && (
              <DialogTrigger asChild>
                <Button className="gradient-primary shadow-lg shadow-primary/20">
                  <Plus className="h-4 w-4 me-2" />
                  {t('shared.announcements.newAnnouncement')}
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{isEditing ? t('shared.announcements.editAnnouncement') : t('shared.announcements.createAnnouncement')}</DialogTitle>
                <DialogDescription>
                  {t('shared.announcements.dialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">{t('shared.announcements.labelTitle')}</label>
                  <Input
                    placeholder={t('shared.announcements.placeholderTitle')}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('shared.announcements.labelCategory')}</label>
                    <Select
                      value={formData.category}
                      onValueChange={(value: Notice["category"]) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('shared.announcements.placeholderCategory')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">{t('shared.announcements.categoryGeneral')}</SelectItem>
                        <SelectItem value="Academic">{t('shared.announcements.categoryAcademic')}</SelectItem>
                        <SelectItem value="Finance">{t('shared.announcements.categoryFinance')}</SelectItem>
                        <SelectItem value="Event">{t('shared.announcements.categoryEvent')}</SelectItem>
                        <SelectItem value="Urgent">{t('shared.announcements.categoryUrgent')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('shared.announcements.labelPriority')}</label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: Notice["priority"]) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('shared.announcements.placeholderPriority')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">{t('shared.announcements.priorityLow')}</SelectItem>
                        <SelectItem value="Medium">{t('shared.announcements.priorityMedium')}</SelectItem>
                        <SelectItem value="High">{t('shared.announcements.priorityHigh')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">{t('shared.announcements.labelContent')}</label>
                  <Textarea
                    placeholder={t('shared.announcements.placeholderContent')}
                    className="min-h-[150px]"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('shared.announcements.labelTargetAudience')}</label>
                    <Select
                      value={formData.targetAudience}
                      onValueChange={(value: Notice["targetAudience"]) => setFormData({ ...formData, targetAudience: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('shared.announcements.placeholderAudience')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">{t('shared.announcements.audienceAll')}</SelectItem>
                        <SelectItem value="Students">{t('shared.announcements.audienceStudents')}</SelectItem>
                        <SelectItem value="Staff">{t('shared.announcements.audienceStaff')}</SelectItem>
                        <SelectItem value="Parents">{t('shared.announcements.audienceParents')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('shared.announcements.labelTargetClass')}</label>
                    <Select
                      value={formData.targetClass || "none"}
                      onValueChange={(value) => setFormData({ ...formData, targetClass: value === "none" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('shared.announcements.placeholderClass')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('shared.announcements.classNoneSchoolWide')}</SelectItem>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">{t('shared.announcements.labelPublishStatus')}</label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: Notice["status"]) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('shared.announcements.placeholderStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Published">{t('shared.announcements.statusPublishNow')}</SelectItem>
                      <SelectItem value="Scheduled">{t('shared.announcements.statusScheduleLater')}</SelectItem>
                      <SelectItem value="Draft">{t('shared.announcements.statusSaveDraft')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>{t('shared.announcements.cancel')}</Button>
                <Button onClick={handleCreateOrUpdate}>
                  {isEditing ? t('shared.announcements.updateAnnouncement') : t('shared.announcements.broadcastAnnouncement')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            {selectedNotice && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", getCategoryColor(selectedNotice.category))}>
                      {selectedNotice.category}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider flex items-center">
                      {getStatusIcon(selectedNotice.status)}
                      {selectedNotice.status}
                    </Badge>
                  </div>
                  <DialogTitle className="text-2xl">{selectedNotice.title}</DialogTitle>
                  <DialogDescription className="flex items-center gap-4 pt-2">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {selectedNotice.postedBy}</span>
                    <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {selectedNotice.date}</span>
                    {selectedNotice.targetClass && (
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <GraduationCap className="h-3 w-3" /> {selectedNotice.targetClass}
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-6 border-y border-border my-4">
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {selectedNotice.content}
                  </p>
                </div>
                <DialogFooter className="sm:justify-between items-center">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {t('shared.announcements.viewsCount', { count: selectedNotice.views })}
                  </div>
                  <Button onClick={() => setIsViewDialogOpen(false)}>{t('shared.announcements.close')}</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Stats & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('shared.announcements.statTotalBroadcasts')}</p>
                  <h3 className="text-2xl font-bold mt-1">{visibleNotices.length}</h3>
                </div>
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Megaphone className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('shared.announcements.statTotalViews')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {visibleNotices.reduce((acc, curr) => acc + (curr.views || 0), 0)}
                  </h3>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('shared.announcements.statActiveUrgent')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {visibleNotices.filter(n => n.category === "Urgent" && n.status === "Published").length}
                  </h3>
                </div>
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('shared.announcements.statScheduled')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {visibleNotices.filter(n => n.status === "Scheduled").length}
                  </h3>
                </div>
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="premium-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setActiveTab}>
                <TabsList className="bg-secondary/50 p-1">
                  <TabsTrigger value="all" className="text-xs px-4">{t('shared.announcements.tabAll')}</TabsTrigger>
                  <TabsTrigger value="published" className="text-xs px-4">{t('shared.announcements.tabPublished')}</TabsTrigger>
                  {audienceGroup === "admin" && (
                    <>
                      <TabsTrigger value="scheduled" className="text-xs px-4">{t('shared.announcements.tabScheduled')}</TabsTrigger>
                      <TabsTrigger value="draft" className="text-xs px-4">{t('shared.announcements.tabDrafts')}</TabsTrigger>
                    </>
                  )}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('shared.announcements.searchPlaceholder')}
                    className="ps-9 h-9 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("h-9 w-9", categoryFilter !== "all" && "border-primary text-primary bg-primary/5")}>
                      <Filter className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('shared.announcements.filterByCategory')}</div>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("all")}>
                      {t('shared.announcements.allCategories')} {categoryFilter === "all" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("General")}>
                      {t('shared.announcements.categoryGeneral')} {categoryFilter === "General" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Academic")}>
                      {t('shared.announcements.categoryAcademic')} {categoryFilter === "Academic" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Finance")}>
                      {t('shared.announcements.categoryFinance')} {categoryFilter === "Finance" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Event")}>
                      {t('shared.announcements.categoryEvent')} {categoryFilter === "Event" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Urgent")}>
                      {t('shared.announcements.categoryUrgent')} {categoryFilter === "Urgent" && <CheckCircle2 className="h-3 w-3 ms-auto text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {noticesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredAnnouncements.length > 0 ? (
                    filteredAnnouncements.map((announcement) => (
                      <motion.div
                        key={announcement.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group relative flex flex-col md:flex-row gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", getCategoryColor(announcement.category))}>
                              {announcement.category}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider flex items-center">
                              {getStatusIcon(announcement.status)}
                              {announcement.status}
                            </Badge>
                            {announcement.priority === "High" && (
                              <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold uppercase tracking-wider">
                                {t('shared.announcements.highPriority')}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-sky-500/30 text-sky-600">
                              <User className="h-3 w-3 me-1" /> {announcement.targetAudience || t('shared.announcements.audienceAll')}
                            </Badge>
                            {announcement.targetClass && (
                              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-primary/30 text-primary">
                                <GraduationCap className="h-3 w-3 me-1" /> {announcement.targetClass}
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors cursor-pointer" onClick={() => handleView(announcement)}>
                            {announcement.title}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {announcement.content}
                          </p>
                          <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground font-medium">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              {announcement.postedBy}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {announcement.date}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Eye className="h-3.5 w-3.5" />
                              {t('shared.announcements.viewsCount', { count: announcement.views })}
                            </div>
                          </div>
                        </div>
                        <div className="flex md:flex-col justify-between items-end gap-2">
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem className="text-xs" onClick={() => handleEdit(announcement)}>
                                  <Edit className="h-3.5 w-3.5 me-2" /> {t('shared.announcements.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs" onClick={() => handleView(announcement)}>
                                  <Eye className="h-3.5 w-3.5 me-2" /> {t('shared.announcements.viewDetails')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(announcement.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 me-2" /> {t('shared.announcements.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-bold"
                            onClick={() => handleView(announcement)}
                          >
                            {t('shared.announcements.viewFull')}
                          </Button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-bold">{t('shared.announcements.emptyTitle')}</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        {t('shared.announcements.emptySubtitle')}
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Announcements;
