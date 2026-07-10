import { useMemo, useState } from "react";
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

  // Enforce audience targeting: admin (management console) sees everything;
  // everyone else only sees Published announcements addressed to their group
  // and — for students/parents — their class.
  const visibleNotices = useMemo(
    () => filterAnnouncementsForViewer(notices, role, viewerClasses),
    [notices, role, viewerClasses]
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
      case "Published": return <CheckCircle2 className="h-3 w-3 mr-1" />;
      case "Draft": return <Edit className="h-3 w-3 mr-1" />;
      case "Scheduled": return <Clock className="h-3 w-3 mr-1" />;
      default: return null;
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      if (isEditing && selectedNotice) {
        await updateNotice(selectedNotice.id, formData);
        toast.success("Announcement updated successfully");
      } else {
        await addNotice(formData as Omit<Notice, "id" | "uid" | "createdAt" | "views" | "date" | "postedBy">);
        toast.success("Announcement broadcasted successfully");
      }
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to save announcement");
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
    if (window.confirm("Are you sure you want to delete this announcement?")) {
      await deleteNotice(id);
      toast.success("Announcement deleted successfully");
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
              <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
              <p className="text-sm text-slate-400">
                {canManage
                  ? "Manage and broadcast school-wide communications."
                  : "Stay updated with school, grade and section announcements."}
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
                  <Plus className="h-4 w-4 mr-2" />
                  New Announcement
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Announcement" : "Create Announcement"}</DialogTitle>
                <DialogDescription>
                  Fill in the details below to broadcast a new announcement.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input 
                    placeholder="Enter announcement title..." 
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select 
                      value={formData.category} 
                      onValueChange={(value: Notice["category"]) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Academic">Academic</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Event">Event</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Priority</label>
                    <Select 
                      value={formData.priority} 
                      onValueChange={(value: Notice["priority"]) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Content</label>
                  <Textarea 
                    placeholder="Write your announcement message here..." 
                    className="min-h-[150px]"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Target Audience</label>
                    <Select 
                      value={formData.targetAudience} 
                      onValueChange={(value: Notice["targetAudience"]) => setFormData({ ...formData, targetAudience: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Users</SelectItem>
                        <SelectItem value="Students">Students Only</SelectItem>
                        <SelectItem value="Staff">Staff Only</SelectItem>
                        <SelectItem value="Parents">Parents Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Target Class (Optional)</label>
                    <Select 
                      value={formData.targetClass || "none"} 
                      onValueChange={(value) => setFormData({ ...formData, targetClass: value === "none" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (School-wide)</SelectItem>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Publish Status</label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value: Notice["status"]) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Published">Publish Now</SelectItem>
                      <SelectItem value="Scheduled">Schedule for Later</SelectItem>
                      <SelectItem value="Draft">Save as Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateOrUpdate}>
                  {isEditing ? "Update Announcement" : "Broadcast Announcement"}
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
                    <Eye className="h-3 w-3" /> {selectedNotice.views} views
                  </div>
                  <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
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
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Broadcasts</p>
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
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Views</p>
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
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Urgent</p>
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
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Scheduled</p>
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
                  <TabsTrigger value="all" className="text-xs px-4">All</TabsTrigger>
                  <TabsTrigger value="published" className="text-xs px-4">Published</TabsTrigger>
                  {audienceGroup === "admin" && (
                    <>
                      <TabsTrigger value="scheduled" className="text-xs px-4">Scheduled</TabsTrigger>
                      <TabsTrigger value="draft" className="text-xs px-4">Drafts</TabsTrigger>
                    </>
                  )}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search announcements..." 
                    className="pl-9 h-9 text-sm"
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
                    <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Filter by Category</div>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("all")}>
                      All Categories {categoryFilter === "all" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("General")}>
                      General {categoryFilter === "General" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Academic")}>
                      Academic {categoryFilter === "Academic" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Finance")}>
                      Finance {categoryFilter === "Finance" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Event")}>
                      Event {categoryFilter === "Event" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => setCategoryFilter("Urgent")}>
                      Urgent {categoryFilter === "Urgent" && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
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
                                High Priority
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-sky-500/30 text-sky-600">
                              <User className="h-3 w-3 mr-1" /> {announcement.targetAudience || "All"}
                            </Badge>
                            {announcement.targetClass && (
                              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider border-primary/30 text-primary">
                                <GraduationCap className="h-3 w-3 mr-1" /> {announcement.targetClass}
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
                              {announcement.views} views
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
                                  <Edit className="h-3.5 w-3.5 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs" onClick={() => handleView(announcement)}>
                                  <Eye className="h-3.5 w-3.5 mr-2" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(announcement.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
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
                            View Full
                          </Button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-bold">No announcements found</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Try adjusting your search or filters to find what you're looking for.
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
