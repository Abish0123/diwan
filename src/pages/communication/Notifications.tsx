import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNotificationsContext, type AppNotification } from "@/contexts/NotificationsContext";
import { useAuth } from "@/hooks/useAuth";
import { getRole } from "@/lib/roles";
import { Navigate, useNavigate } from "react-router-dom";
import { resolveNotificationRoute } from "@/lib/notificationRouting";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCheck,
  Trash2,
  MoreVertical,
  Info,
  Settings,
  Filter,
  Search,
  User,
  Users,
  DollarSign,
  GraduationCap,
  PlusCircle,
  Pencil,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// Category → icon/label — mirrors the real AppNotification.category values
// produced by the live feed (student/staff/finance/admission/general).
const CATEGORY_META: Record<AppNotification["category"], { icon: typeof User; label: string }> = {
  student: { icon: GraduationCap, label: "Student" },
  staff: { icon: Users, label: "Staff" },
  finance: { icon: DollarSign, label: "Finance" },
  admission: { icon: User, label: "Admission" },
  general: { icon: Bell, label: "General" },
};

// The live feed's `type` isn't limited to create/update/delete in practice —
// it also carries app-specific event names (assignment_graded,
// resubmission_required, etc.), so this maps the known ones and falls back
// to a neutral style for anything else instead of crashing.
const TYPE_META: Record<string, { icon: typeof PlusCircle; style: string; label: string }> = {
  create: { icon: PlusCircle, style: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: "Created" },
  update: { icon: Pencil, style: "bg-blue-500/10 text-purple-600 border-blue-500/20", label: "Updated" },
  delete: { icon: XCircle, style: "bg-destructive/10 text-destructive border-destructive/20", label: "Deleted" },
  assignment_graded: { icon: CheckCheck, style: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: "Graded" },
  assignment_new: { icon: PlusCircle, style: "bg-blue-500/10 text-purple-600 border-blue-500/20", label: "New Assignment" },
  resubmission_required: { icon: Pencil, style: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Resubmission" },
};
const DEFAULT_TYPE_META = { icon: Bell, style: "bg-slate-500/10 text-slate-600 border-slate-500/20", label: "Update" };
const typeMetaOf = (type: string) => TYPE_META[type] || DEFAULT_TYPE_META;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Build a readable summary: prefer the stored message field, fall back to
// synthesising one from entity+type so existing socket events still look ok.
function describe(n: AppNotification): string {
  if (n.message) return n.message;
  const action = n.type === "create" ? "added" : n.type === "delete" ? "removed" : "updated";
  return `${n.entity} record ${action}${n.recipientName ? ` for ${n.recipientName}` : ""}.`;
}

const Notifications = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, markRead, deleteNotification, deleteNotifications } = useNotificationsContext();

  // Restrict access to admin layout only
  const userRole = getRole(role);
  if (userRole.layout !== "admin") {
    if (userRole.layout === "teacher") {
      return <Navigate to="/teacher/notifications" replace />;
    } else if (userRole.layout === "student") {
      return <Navigate to="/student/notifications" replace />;
    } else if (userRole.layout === "parent") {
      return <Navigate to="/parent/notifications" replace />;
    }
  }

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filterType, setFilterType] = useState("all");
  // Which rows are checked for bulk delete — real DB deletes, not a local hide.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const filtered = notifications.filter(n => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.entity.toLowerCase().includes(q);
    const matchesTab = activeTab === "all" ? true : activeTab === "unread" ? !n.read : n.category === activeTab;
    const matchesType = filterType === "all" ? true : n.type === filterType;
    return matchesSearch && matchesTab && matchesType;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(n => selectedIds.has(n.id));
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach(n => next.add(n.id));
      return next;
    });
  };
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markAllAsRead = () => { markAllRead(); toast.success("All notifications marked as read"); };
  const deleteOne = (id: string) => {
    deleteNotification(id);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    toast.success("Notification deleted");
  };
  const deleteAll = () => {
    const ids = notifications.map(n => n.id);
    deleteNotifications(ids);
    setSelectedIds(new Set());
    setConfirmDeleteAll(false);
    toast.success("All notifications deleted");
  };
  const toggleRead = (n: AppNotification) => markRead(n.id, !n.read);
  const viewDetails = (n: AppNotification) => { setSelected(n); if (!n.read) markRead(n.id); };
  const openNotification = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    navigate(resolveNotificationRoute(n, role));
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
              <p className="text-sm text-slate-400">Live activity across the school — updates as they happen.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="text-xs font-bold">
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={notifications.length === 0}
              className="text-xs font-bold text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete all
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>



        <Card className="premium-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setActiveTab}>
                <TabsList className="bg-transparent p-0 h-auto gap-1 flex-wrap justify-start">
                  <TabsTrigger value="all" className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">All</TabsTrigger>
                  <TabsTrigger value="unread" className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
                    Unread
                    {unreadCount > 0 && (
                      <Badge className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                        {unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  {(Object.keys(CATEGORY_META) as AppNotification["category"][]).map(cat => (
                    <TabsTrigger key={cat} value={cat} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{CATEGORY_META[cat].label}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search notifications..."
                    className="pl-9 h-9 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 w-[130px] text-xs">
                    <Filter className="h-3.5 w-3.5 mr-2" />
                    <SelectValue placeholder="Filter Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="create">Created</SelectItem>
                    <SelectItem value="update">Updated</SelectItem>
                    <SelectItem value="delete">Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between pb-3 mb-1 border-b border-border/60">
                <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                </label>
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs font-bold h-8"
                    onClick={() => setConfirmDeleteIds(Array.from(selectedIds))}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete Selected ({selectedIds.size})
                  </Button>
                )}
              </div>
            )}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filtered.length > 0 ? (
                  filtered.map((n) => {
                    const CatIcon = CATEGORY_META[n.category]?.icon || Bell;
                    const typeMeta = typeMetaOf(n.type);
                    return (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => openNotification(n)}
                        className={cn(
                          "group relative flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                          n.read
                            ? "bg-card border-border hover:bg-muted/50"
                            : "bg-primary/5 border-primary/20 hover:bg-primary/10 shadow-sm"
                        )}
                      >
                        <div onClick={(e) => e.stopPropagation()} className="pt-1.5 shrink-0">
                          <Checkbox checked={selectedIds.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} />
                        </div>
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm", typeMeta.style)}>
                          <CatIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className={cn("text-sm font-bold truncate", !n.read && "text-primary")}>{n.title}</h3>
                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{timeAgo(n.time)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{describe(n)}</p>
                          <div className="flex items-center gap-2 pt-1">
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider h-4 px-1.5">
                              {CATEGORY_META[n.category]?.label || n.category}
                            </Badge>
                            <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wider h-4 px-1.5", typeMeta.style)}>
                              {typeMeta.label}
                            </Badge>
                            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => toggleRead(n)} title={n.read ? "Mark as unread" : "Mark as read"}>
                            <CheckCheck className={cn("h-4 w-4", n.read ? "text-primary" : "text-muted-foreground")} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem className="text-xs" onClick={() => toggleRead(n)}>
                                {n.read ? "Mark as unread" : "Mark as read"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => viewDetails(n)}>
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs text-destructive focus:text-destructive" onClick={() => deleteOne(n.id)}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <Bell className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                    <h3 className="text-lg font-bold">All caught up!</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      You have no new notifications to review at this time.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        {/* Notification Details Dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                {selected && (() => {
                  const CatIcon = CATEGORY_META[selected.category]?.icon || Bell;
                  return (
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm", typeMetaOf(selected.type).style)}>
                      <CatIcon className="h-5 w-5" />
                    </div>
                  );
                })()}
                <div>
                  <DialogTitle className="text-xl font-bold">{selected?.title}</DialogTitle>
                  <DialogDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {selected && (CATEGORY_META[selected.category]?.label || selected.category)} • {selected && timeAgo(selected.time)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm leading-relaxed text-foreground">{selected && describe(selected)}</p>
              <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  Additional Information
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Notification ID:</span>
                    <span className="font-mono text-[10px]">{selected?.id}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={selected?.read ? "outline" : "default"} className="h-4 text-[9px] px-1.5">
                      {selected?.read ? "Read" : "Unread"}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Type:</span>
                    <span className={cn("font-bold capitalize", selected?.type === "delete" ? "text-destructive" : "text-primary")}>
                      {selected && typeMetaOf(selected.type).label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              {selected?.entity === "PurchaseOrder" && (
                <Button onClick={() => { setSelected(null); navigate("/inventory/orders"); }} className="gradient-primary">
                  Review &amp; Approve
                </Button>
              )}
              <Button onClick={() => { if (selected) deleteOne(selected.id); setSelected(null); }} variant="destructive">Delete Notification</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Notification Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Notification Settings</DialogTitle>
              <DialogDescription>
                Customize how you receive alerts and updates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">Channels</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">In-App Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts within the dashboard.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Get updates delivered to your inbox.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Push Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive alerts on your mobile device.</p>
                  </div>
                  <Switch />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">Digest & Summaries</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Daily Attendance Digest</Label>
                    <p className="text-xs text-muted-foreground">Sent to Principal each morning.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Weekly HR Summary Report</Label>
                    <p className="text-xs text-muted-foreground">Sent every Monday to HR Manager.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">Categories</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Academic Updates</Label>
                    <p className="text-xs text-muted-foreground">Admissions, exams, and results.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Financial Alerts</Label>
                    <p className="text-xs text-muted-foreground">Payments, fees, and payroll.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">System Announcements</Label>
                    <p className="text-xs text-muted-foreground">Maintenance and platform updates.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                setIsSettingsOpen(false);
                toast.success("Settings saved successfully");
              }}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirmDeleteIds}
          onOpenChange={(open) => { if (!open) setConfirmDeleteIds(null); }}
          title={`Delete ${confirmDeleteIds?.length ?? 0} notification${(confirmDeleteIds?.length ?? 0) === 1 ? "" : "s"}?`}
          description="This permanently removes them from the shared notification feed for everyone — this can't be undone."
          confirmText="Delete"
          variant="destructive"
          onConfirm={() => { if (confirmDeleteIds) deleteNotifications(confirmDeleteIds); setSelectedIds(new Set()); setConfirmDeleteIds(null); toast.success(`${confirmDeleteIds?.length ?? 0} notification${(confirmDeleteIds?.length ?? 0) === 1 ? "" : "s"} deleted`); }}
        />

        <ConfirmDialog
          open={confirmDeleteAll}
          onOpenChange={setConfirmDeleteAll}
          title="Delete all notifications?"
          description="This permanently removes every notification currently loaded from the shared feed for everyone — this can't be undone."
          confirmText="Delete all"
          variant="destructive"
          onConfirm={deleteAll}
        />
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
