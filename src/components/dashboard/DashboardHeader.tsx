import { useState, useEffect } from "react";
import { Bell, Plus, Settings, ChevronDown, LogOut, LogIn, UserPlus, FileText, Calendar, CreditCard, Package, DollarSign, TrendingUp, ChevronRight, Home, Cloud, Database, Sparkles, GraduationCap, Banknote, Trash2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel, getRole } from "@/lib/roles";
import { RoleSwitcher } from "@/components/dashboard/RoleSwitcher";
import { isFirestoreWorking } from "@/lib/firebase";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { resolveNotificationRoute } from "@/lib/notificationRouting";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DashboardHeader() {
  const { user, role, login, logout } = useAuth();
  const { t } = useTranslation();
  const { settings, updateCurrency } = useFinancialSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, markAllRead, markRead } = useNotificationsContext();

  // Real backend DB mode: "mysql" (remote cPanel) or "sqlite" (local). Only
  // consulted when Firestore isn't the active store.
  const [dbInfo, setDbInfo] = useState<{ dbMode?: string; dbHost?: string | null }>({});
  useEffect(() => {
    if (isFirestoreWorking) return;
    let active = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => { if (active) setDbInfo(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const pathnames = location.pathname.split("/").filter((x) => x);

  const currencies = [
    { value: "$", label: "$ (USD)" },
    { value: "€", label: "€ (EUR)" },
    { value: "£", label: "£ (GBP)" },
    { value: "₦", label: "₦ (NGN)" },
    { value: "₹", label: "₹ (INR)" },
    { value: "BHD", label: "BHD (Bahraini Dinar)" },
    { value: "SAR", label: "SAR (Saudi Riyal)" },
    { value: "AED", label: "AED (UAE Dirham)" },
    { value: "KWD", label: "KWD (Kuwaiti Dinar)" },
    { value: "OMR", label: "OMR (Omani Rial)" },
    { value: "QAR", label: "QAR (Qatari Riyal)" },
    { value: "GHS", label: "GH₵ (GHS)" },
    { value: "KES", label: "KSh (KES)" },
    { value: "ZAR", label: "R (ZAR)" },
  ];

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'student':
        navigate('/students');
        toast.info("Navigate to Students to add a new one");
        break;
      case 'teacher':
        navigate('/teachers');
        toast.info("Navigate to Teachers to add a new one");
        break;
      case 'expense':
        navigate('/finance/expenses');
        toast.info("Navigate to Expenses to record a new one");
        break;
      case 'inventory':
        navigate('/finance/setup');
        toast.info("Navigate to Setup & Inventory to add a new item");
        break;
      case 'event':
        toast.info("Opening event calendar...");
        break;
      default:
        toast.success("Quick Action triggered!");
    }
  };

  const handleSettings = () => {
    toast("Settings", {
      description: "System settings are currently being updated.",
    });
  };

  return (
    <header className="h-16 flex items-center justify-between border-b border-[#E5E7EB] dark:border-white/10 bg-white dark:bg-[#0F1424] sticky top-0 z-30 px-4 shrink-0 shadow-sm print:hidden">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors" />
        
        <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
          <Link to="/" className="hover:text-primary transition-colors flex items-center gap-1">
            <Home className="h-3 w-3" />
            <span>{t('header.home')}</span>
          </Link>
          {pathnames.length > 0 && <ChevronRight className="h-3 w-3" />}
          {pathnames.map((name, index) => {
            const routeTo = `/${pathnames.slice(0, index + 1).join("/")}`;
            const isLast = index === pathnames.length - 1;
            const formattedName = name.replace(/-/g, " ");
            
            return (
              <div key={name} className="flex items-center gap-2">
                {isLast ? (
                  <span className="text-primary font-black">{formattedName}</span>
                ) : (
                  <Link to={routeTo} className="hover:text-primary transition-colors">
                    {formattedName}
                  </Link>
                )}
                {!isLast && <ChevronRight className="h-3 w-3" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <RoleSwitcher />
        <LanguageSwitcher />
        {/* Database Status Indicator — three real states */}
        {(() => {
          const isCloudMysql = !isFirestoreWorking && dbInfo.dbMode === "mysql";
          const isLive = isFirestoreWorking || isCloudMysql;
          const title = isFirestoreWorking
            ? "Connected to Cloud Firestore"
            : isCloudMysql
            ? `Connected to Cloud MySQL (${dbInfo.dbHost})`
            : "Using Local SQLite Database (offline fallback)";
          const label = isFirestoreWorking ? "Cloud Active" : isCloudMysql ? "Cloud MySQL" : "Local Mode";
          return (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-all cursor-help group"
              title={title}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-[10px] font-black text-muted-foreground/80 flex items-center gap-1.5 uppercase tracking-wider">
                {isLive ? (
                  <Cloud className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Database className="h-3 w-3 text-amber-500" />
                )}{" "}
                {label}
              </span>
            </div>
          );
        })()}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              size="sm" 
              className="gradient-primary text-primary-foreground hover:opacity-90 gap-2 h-9 text-xs font-bold rounded-xl px-4 shadow-lg shadow-primary/20 border-none"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('header.quickAction')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>{t('header.quickActions')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleQuickAction('student')} className="rounded-lg cursor-pointer">
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Add Student</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/users')} className="rounded-lg cursor-pointer">
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Invite User</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleQuickAction('teacher')} className="rounded-lg cursor-pointer">
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Add Teacher</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleQuickAction('expense')} className="rounded-lg cursor-pointer">
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Record Expense</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleQuickAction('inventory')} className="rounded-lg cursor-pointer">
              <Package className="mr-2 h-4 w-4" />
              <span>Add Inventory Item</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleQuickAction('event')} className="rounded-lg cursor-pointer">
              <Calendar className="mr-2 h-4 w-4" />
              <span>Create Event</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Select value={settings.currency || "$"} onValueChange={updateCurrency}>
            <SelectTrigger className="h-9 w-[75px] sm:w-[100px] rounded-xl border border-border/50 bg-card/50 hover:bg-secondary hover:border-primary/20 transition-all duration-200 text-[11px] font-bold shadow-sm px-2">
              <div className="flex items-center gap-1.5 truncate">
                <DollarSign className="h-3.5 w-3.5 text-primary hidden sm:block shrink-0" />
                <SelectValue placeholder="Currency" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-none shadow-xl">
              {currencies.map((c) => (
                <SelectItem key={c.value} value={c.value} className="rounded-lg text-xs font-medium">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative h-9 w-9 rounded-xl border border-border/50 bg-card/50 flex items-center justify-center hover:bg-secondary hover:border-primary/20 transition-all duration-200 group">
              <Bell className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-[3px] rounded-full gradient-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center border-2 border-card animate-pulse leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl p-0 overflow-hidden border-none shadow-2xl">
            <div className="p-4 bg-gradient-to-br from-primary/5 to-transparent border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold">Notifications</h4>
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-none">{unreadCount} New</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/5 px-2"
                  onClick={(e) => { e.stopPropagation(); markAllRead(); toast.success("All notifications marked as read"); }}
                >
                  Mark all as read
                </Button>
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications yet</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Live updates appear here as you use the app</p>
                </div>
              ) : notifications.map((n) => {
                const iconMap = {
                  student: { icon: GraduationCap, color: "text-indigo-500", bg: "bg-indigo-50" },
                  staff: { icon: UserPlus, color: "text-blue-500", bg: "bg-blue-50" },
                  finance: { icon: Banknote, color: "text-emerald-500", bg: "bg-emerald-50" },
                  admission: { icon: FileText, color: "text-violet-500", bg: "bg-violet-50" },
                  general: { icon: Sparkles, color: "text-amber-500", bg: "bg-amber-50" },
                };
                const style = iconMap[n.category] || iconMap.general;
                const Icon = n.type === "delete" ? Trash2 : style.icon;
                const timeAgo = (() => {
                  const diff = Date.now() - new Date(n.time).getTime();
                  if (diff < 60000) return "Just now";
                  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                  return `${Math.floor(diff / 3600000)}h ago`;
                })();
                return (
                  <div
                    key={n.id}
                    className={`p-4 hover:bg-secondary/50 transition-colors cursor-pointer flex items-start gap-3 border-b border-border/30 last:border-0 ${!n.read ? "bg-primary/2" : ""}`}
                    onClick={() => {
                      markRead(n.id);
                      navigate(resolveNotificationRoute(n, role));
                    }}
                  >
                    <div className={`h-8 w-8 rounded-lg ${n.type === "delete" ? "bg-rose-50" : style.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${n.type === "delete" ? "text-rose-500" : style.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-foreground leading-tight truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
                    </div>
                    {!n.read && <div className="h-2 w-2 rounded-full bg-primary mt-1 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="p-2 bg-secondary/20 text-center">
              <button 
                className="text-[10px] font-bold text-primary hover:underline" 
                onClick={() => {
                  const userRole = getRole(role);
                  const notificationsRoute = userRole.layout === "teacher"
                    ? "/teacher/notifications"
                    : userRole.layout === "student"
                    ? "/student/notifications"
                    : userRole.layout === "parent"
                    ? "/parent/notifications"
                    : "/communication/notifications";
                  navigate(notificationsRoute);
                }}
              >
                View All Notifications
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />

        <button
          onClick={handleSettings}
          className="h-9 w-9 rounded-xl border border-border/50 bg-card/50 flex items-center justify-center hover:bg-secondary hover:border-primary/20 transition-all duration-200"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="h-6 w-px bg-border mx-1" />

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 hover:bg-secondary/80 rounded-xl px-2 py-1.5 transition-all duration-200 outline-none border border-transparent hover:border-border/50">
                <Avatar className="h-8 w-8 border-2 border-primary/20 shadow-sm">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="gradient-primary text-[10px] font-bold text-primary-foreground">
                    {user.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-[12px] font-bold text-foreground leading-none">{user.displayName || 'User'}</p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{roleLabel(role)}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 hidden md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSettings} className="rounded-lg cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="rounded-lg cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={login}
            className="h-8 text-xs font-semibold rounded-lg px-3 gap-1.5"
          >
            <LogIn className="h-3.5 w-3.5" />
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
