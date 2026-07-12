import { useState } from "react";
import { useTranslation } from "react-i18next";
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
const CATEGORY_META: Record<AppNotification["category"], { icon: typeof User; labelKey: string }> = {
  student: { icon: GraduationCap, labelKey: "shared.notifications.category.student" },
  staff: { icon: Users, labelKey: "shared.notifications.category.staff" },
  finance: { icon: DollarSign, labelKey: "shared.notifications.category.finance" },
  admission: { icon: User, labelKey: "shared.notifications.category.admission" },
  general: { icon: Bell, labelKey: "shared.notifications.category.general" },
};

// The live feed's `type` isn't limited to create/update/delete in practice —
// it also carries app-specific event names (assignment_graded,
// resubmission_required, etc.), so this maps the known ones and falls back
// to a neutral style for anything else instead of crashing.
const TYPE_META: Record<string, { icon: typeof PlusCircle; style: string; labelKey: string }> = {
  create: { icon: PlusCircle, style: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", labelKey: "shared.notifications.type.created" },
  update: { icon: Pencil, style: "bg-blue-500/10 text-purple-600 border-blue-500/20", labelKey: "shared.notifications.type.updated" },
  delete: { icon: XCircle, style: "bg-destructive/10 text-destructive border-destructive/20", labelKey: "shared.notifications.type.deleted" },
  assignment_graded: { icon: CheckCheck, style: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", labelKey: "shared.notifications.type.graded" },
  assignment_new: { icon: PlusCircle, style: "bg-blue-500/10 text-purple-600 border-blue-500/20", labelKey: "shared.notifications.type.newAssignment" },
  resubmission_required: { icon: Pencil, style: "bg-amber-500/10 text-amber-600 border-amber-500/20", labelKey: "shared.notifications.type.resubmission" },
};
const DEFAULT_TYPE_META = { icon: Bell, style: "bg-slate-500/10 text-slate-600 border-slate-500/20", labelKey: "shared.notifications.type.default" };
const typeMetaOf = (type: string) => TYPE_META[type] || DEFAULT_TYPE_META;

// t is passed in from the component (module-level helpers can't call hooks).
function timeAgo(t: (key: string, opts?: Record<string, unknown>) => string, iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return t("shared.notifications.time.justNow");
  if (diff < 3600000) return t("shared.notifications.time.minutesAgo", { count: Math.floor(diff / 60000) });
  if (diff < 86400000) return t("shared.notifications.time.hoursAgo", { count: Math.floor(diff / 3600000) });
  return t("shared.notifications.time.daysAgo", { count: Math.floor(diff / 86400000) });
}

// Build a readable summary: prefer the stored message field, fall back to
// synthesising one from entity+type so existing socket events still look ok.
// t is passed in from the component (module-level helpers can't call hooks).
function describe(t: (key: string, opts?: Record<string, unknown>) => string, n: AppNotification): string {
  if (n.message) return n.message;
  const recipient = n.recipientName ? t("shared.notifications.describe.forRecipient", { name: n.recipientName }) : "";
  const key = n.type === "create" ? "shared.notifications.describe.added" : n.type === "delete" ? "shared.notifications.describe.removed" : "shared.notifications.describe.updated";
  return t(key, { entity: n.entity, recipient });
}

const Notifications = () => {
  const { t } = useTranslation();
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

  const markAllAsRead = () => { markAllRead(); toast.success(t("shared.notifications.toastMarkAllRead")); };
  const deleteOne = (id: string) => {
    deleteNotification(id);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    toast.success(t("shared.notifications.toastNotificationDeleted"));
  };
  const deleteAll = () => {
    const ids = notifications.map(n => n.id);
    deleteNotifications(ids);
    setSelectedIds(new Set());
    setConfirmDeleteAll(false);
    toast.success(t("shared.notifications.toastAllDeleted"));
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
              <h1 className="text-2xl font-bold text-slate-900">{t("shared.notifications.pageTitle")}</h1>
              <p className="text-sm text-slate-400">{t("shared.notifications.pageSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="text-xs font-bold">
              <CheckCheck className="h-4 w-4 me-2" />
              {t("shared.notifications.markAllAsReadButton")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={notifications.length === 0}
              className="text-xs font-bold text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 me-2" />
              {t("shared.notifications.deleteAllButton")}
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
                  <TabsTrigger value="all" className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("shared.notifications.tabAll")}</TabsTrigger>
                  <TabsTrigger value="unread" className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
                    {t("shared.notifications.tabUnread")}
                    {unreadCount > 0 && (
                      <Badge className="ms-2 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                        {unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  {(Object.keys(CATEGORY_META) as AppNotification["category"][]).map(cat => (
                    <TabsTrigger key={cat} value={cat} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t(CATEGORY_META[cat].labelKey)}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("shared.notifications.searchPlaceholder")}
                    className="ps-9 h-9 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 w-[130px] text-xs">
                    <Filter className="h-3.5 w-3.5 me-2" />
                    <SelectValue placeholder={t("shared.notifications.filterTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("shared.notifications.filterAllTypes")}</SelectItem>
                    <SelectItem value="create">{t("shared.notifications.type.created")}</SelectItem>
                    <SelectItem value="update">{t("shared.notifications.type.updated")}</SelectItem>
                    <SelectItem value="delete">{t("shared.notifications.type.deleted")}</SelectItem>
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
                  {selectedIds.size > 0 ? t("shared.notifications.selectedCount", { count: selectedIds.size }) : t("shared.notifications.selectAllLabel")}
                </label>
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs font-bold h-8"
                    onClick={() => setConfirmDeleteIds(Array.from(selectedIds))}
                  >
                    <Trash2 className="h-3.5 w-3.5 me-2" />
                    {t("shared.notifications.deleteSelectedButton", { count: selectedIds.size })}
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
                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{timeAgo(t, n.time)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{describe(t, n)}</p>
                          <div className="flex items-center gap-2 pt-1">
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider h-4 px-1.5">
                              {CATEGORY_META[n.category] ? t(CATEGORY_META[n.category].labelKey) : n.category}
                            </Badge>
                            <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wider h-4 px-1.5", typeMeta.style)}>
                              {t(typeMeta.labelKey)}
                            </Badge>
                            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => toggleRead(n)} title={n.read ? t("shared.notifications.markAsUnread") : t("shared.notifications.markAsRead")}>
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
                                {n.read ? t("shared.notifications.markAsUnread") : t("shared.notifications.markAsRead")}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => viewDetails(n)}>
                                {t("shared.notifications.viewDetailsLabel")}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs text-destructive focus:text-destructive" onClick={() => deleteOne(n.id)}>
                                <Trash2 className="h-3.5 w-3.5 me-2" /> {t("shared.notifications.deleteLabel")}
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
                    <h3 className="text-lg font-bold">{t("shared.notifications.emptyStateTitle")}</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      {t("shared.notifications.emptyStateDescription")}
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
                    {selected && (CATEGORY_META[selected.category] ? t(CATEGORY_META[selected.category].labelKey) : selected.category)} • {selected && timeAgo(t, selected.time)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm leading-relaxed text-foreground">{selected && describe(t, selected)}</p>
              <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  {t("shared.notifications.additionalInfoTitle")}
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("shared.notifications.notificationIdLabel")}</span>
                    <span className="font-mono text-[10px]">{selected?.id}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("shared.notifications.statusLabel")}</span>
                    <Badge variant={selected?.read ? "outline" : "default"} className="h-4 text-[9px] px-1.5">
                      {selected?.read ? t("shared.notifications.statusRead") : t("shared.notifications.statusUnread")}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("shared.notifications.typeLabel")}</span>
                    <span className={cn("font-bold capitalize", selected?.type === "delete" ? "text-destructive" : "text-primary")}>
                      {selected && t(typeMetaOf(selected.type).labelKey)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>{t("shared.notifications.closeButton")}</Button>
              {selected?.entity === "PurchaseOrder" && (
                <Button onClick={() => { setSelected(null); navigate("/inventory/orders"); }} className="gradient-primary">
                  {t("shared.notifications.reviewApproveButton")}
                </Button>
              )}
              <Button onClick={() => { if (selected) deleteOne(selected.id); setSelected(null); }} variant="destructive">{t("shared.notifications.deleteNotificationButton")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Notification Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{t("shared.notifications.settingsTitle")}</DialogTitle>
              <DialogDescription>
                {t("shared.notifications.settingsDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">{t("shared.notifications.channelsHeading")}</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.inAppLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.inAppDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.emailLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.emailDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.pushLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.pushDescription")}</p>
                  </div>
                  <Switch />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">{t("shared.notifications.digestHeading")}</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.dailyDigestLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.dailyDigestDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.weeklyHrLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.weeklyHrDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold border-b pb-2">{t("shared.notifications.categoriesHeading")}</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.academicUpdatesLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.academicUpdatesDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.financialAlertsLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.financialAlertsDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">{t("shared.notifications.systemAnnouncementsLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("shared.notifications.systemAnnouncementsDescription")}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>{t("shared.notifications.cancelButton")}</Button>
              <Button onClick={() => {
                setIsSettingsOpen(false);
                toast.success(t("shared.notifications.toastSettingsSaved"));
              }}>{t("shared.notifications.saveChangesButton")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirmDeleteIds}
          onOpenChange={(open) => { if (!open) setConfirmDeleteIds(null); }}
          title={t("shared.notifications.confirmDeleteSelectedTitle", { count: confirmDeleteIds?.length ?? 0 })}
          description={t("shared.notifications.confirmDeleteSelectedDescription")}
          confirmText={t("shared.notifications.deleteLabel")}
          variant="destructive"
          onConfirm={() => { if (confirmDeleteIds) deleteNotifications(confirmDeleteIds); setSelectedIds(new Set()); setConfirmDeleteIds(null); toast.success(t("shared.notifications.toastSelectedDeleted", { count: confirmDeleteIds?.length ?? 0 })); }}
        />

        <ConfirmDialog
          open={confirmDeleteAll}
          onOpenChange={setConfirmDeleteAll}
          title={t("shared.notifications.confirmDeleteAllTitle")}
          description={t("shared.notifications.confirmDeleteAllDescription")}
          confirmText={t("shared.notifications.deleteAllButton")}
          variant="destructive"
          onConfirm={deleteAll}
        />
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
