import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Zap, 
  Search, 
  Filter, 
  MoreVertical,
  Plus,
  Clock,
  Bell,
  Mail,
  MessageSquare,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Settings,
  Save,
  Trash2,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Timestamp } from "firebase/firestore";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { cn } from "@/lib/utils";

interface AutomationTask {
  id: string;
  name: string;
  category: string;
  frequency: string;
  nextRun: string;
  status: string;
}

interface ReminderRule {
  id: string;
  name: string;
  offsetDays: number;
  direction: "before" | "after";
  channels: string[];
  messageTemplate: string;
  status: "Active" | "Inactive";
  uid?: string;
  createdAt?: string;
}

const REMINDER_CHANNELS = ["Email", "WhatsApp", "Parent App", "Finance Alert"] as const;

function getDefaultMessageTemplate(offsetDays: number, direction: "before" | "after"): string {
  if (direction === "before") {
    if (offsetDays === 0) {
      return `Subject: Payment Due Today

Dear Parent,

This is a reminder that the {{term}} fee of QAR {{amount}} for {{grade}} ({{studentName}}) is due today, {{dueDate}}.

Please make the payment today to avoid overdue notices.

Thank you.
Finance Department`;
    }
    const urgent = offsetDays <= 5;
    return `Subject: Fee Payment Reminder – {{term}}

Dear Parent,

${urgent ? "This is an urgent reminder" : "This is a reminder"} that the {{term}} fee of QAR {{amount}} for {{grade}} ({{studentName}}) is due on {{dueDate}}.

Please make the payment before the due date to avoid overdue notices.

Thank you.
Finance Department`;
  }

  if (offsetDays >= 30) {
    return `Subject: FINAL NOTICE – Overdue Fee Payment

Dear Parent,

This is a FINAL NOTICE that the {{term}} fee of QAR {{amount}} for {{grade}} ({{studentName}}) was due on {{dueDate}} and remains unpaid ${offsetDays} days after the due date.

Immediate payment is required to avoid further action.

Thank you.
Finance Department`;
  }
  if (offsetDays >= 15) {
    return `Subject: Overdue Fee Payment – Parent Notification

Dear Parent,

The {{term}} fee of QAR {{amount}} for {{grade}} ({{studentName}}) was due on {{dueDate}} and is now ${offsetDays} days overdue.

Please settle this payment as soon as possible. This notice has also been escalated to the Finance team.

Thank you.
Finance Department`;
  }
  return `Subject: Overdue Fee Payment

Dear Parent,

The {{term}} fee of QAR {{amount}} for {{grade}} ({{studentName}}) was due on {{dueDate}} and is now ${offsetDays} day(s) overdue.

Please make the payment as soon as possible to avoid further notices.

Thank you.
Finance Department`;
}

function formatOffsetLabel(offsetDays: number, direction: "before" | "after"): string {
  if (direction === "before") {
    return offsetDays === 0 ? "Due Date" : `${offsetDays} Day${offsetDays === 1 ? "" : "s"} Before Due`;
  }
  return `${offsetDays} Day${offsetDays === 1 ? "" : "s"} Overdue`;
}

interface DefaultReminderSeed {
  name: string;
  offsetDays: number;
  direction: "before" | "after";
  channels: string[];
}

const DEFAULT_REMINDER_RULES: DefaultReminderSeed[] = [
  { name: "30 Days Before Due Date", offsetDays: 30, direction: "before", channels: ["Email", "WhatsApp", "Parent App"] },
  { name: "14 Days Before Due Date", offsetDays: 14, direction: "before", channels: ["Email", "WhatsApp"] },
  { name: "5 Days Before Due Date", offsetDays: 5, direction: "before", channels: ["Email", "WhatsApp"] },
  { name: "Due Date Reminder", offsetDays: 0, direction: "before", channels: ["Email", "Parent App"] },
  { name: "1 Day Overdue", offsetDays: 1, direction: "after", channels: ["Email", "WhatsApp"] },
  { name: "7 Days Overdue", offsetDays: 7, direction: "after", channels: ["Email", "WhatsApp"] },
  { name: "15 Days Overdue", offsetDays: 15, direction: "after", channels: ["Parent App", "Finance Alert"] },
  { name: "30 Days Overdue – Final Notice", offsetDays: 30, direction: "after", channels: ["Email", "Parent App"] },
];

interface Template {
  id: string;
  name: string;
  type: string;
  lastModified: Timestamp | Date | string | null;
  content: string;
}

const Automation = () => {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [activeTab, setActiveTab] = useState("recurring");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [templateContent, setTemplateContent] = useState("");
  
  const [recurringTasks, setRecurringTasks] = useState<AutomationTask[]>([]);
  const [reminderRules, setReminderRules] = useState<ReminderRule[]>([]);
  const [commTemplates, setCommTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderRule | null>(null);
  const [reminderForm, setReminderForm] = useState({
    name: "",
    offsetDays: 30,
    direction: "before" as "before" | "after",
    channels: [] as string[],
    messageTemplate: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  const hasSeededReminders = useRef(false);

  useEffect(() => {
    if (!user) return;

    const tasksUnsubscribe = smartDb.watch("automation_tasks", user.uid, (data) => {
      setRecurringTasks(data as AutomationTask[]);
      setIsLoading(false);
    });

    const remindersUnsubscribe = smartDb.watch("reminder_rules", user.uid, (data) => {
      const rules = data as ReminderRule[];
      setReminderRules(rules);

      if (!hasSeededReminders.current && rules.length === 0) {
        hasSeededReminders.current = true;
        const now = new Date().toISOString();
        (async () => {
          try {
            for (const seed of DEFAULT_REMINDER_RULES) {
              const created = await smartDb.create("reminder_rules", {
                name: seed.name,
                offsetDays: seed.offsetDays,
                direction: seed.direction,
                channels: seed.channels,
                messageTemplate: getDefaultMessageTemplate(seed.offsetDays, seed.direction),
                status: "Active",
                uid: user.uid,
                createdAt: now,
                updatedAt: now,
              });
              setReminderRules(prev => prev.some(r => r.id === (created as ReminderRule).id) ? prev : [...prev, created as ReminderRule]);
            }
          } catch (error) {
            console.error("Failed to seed default reminder rules:", error);
          }
        })();
      }
    });

    const templatesUnsubscribe = smartDb.watch("communication_templates", user.uid, (data) => {
      setCommTemplates(data as Template[]);
    });

    return () => {
      tasksUnsubscribe();
      remindersUnsubscribe();
      templatesUnsubscribe();
    };
  }, [user]);

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setTemplateContent(template.content);
    setIsEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate || !user) return;

    try {
      const now = new Date().toISOString();
      await smartDb.update("communication_templates", editingTemplate.id, {
        content: templateContent,
        lastModified: now,
        updatedAt: now,
      });
      setCommTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, content: templateContent, lastModified: now } : t));
      toast.success(`Template "${editingTemplate.name}" updated successfully!`);
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Failed to update template:", error);
      toast.error("Failed to update template");
    }
  };

  const handleToggleTaskStatus = async (task: AutomationTask) => {
    if (!user) return;
    const newStatus = task.status === 'Active' ? 'Inactive' : 'Active';
    setRecurringTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await smartDb.update("automation_tasks", task.id, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      toast.success(`${task.name} ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error("Failed to update task status:", error);
      setRecurringTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      toast.error("Failed to update task status");
    }
  };

  const handleToggleReminderStatus = async (reminder: ReminderRule) => {
    if (!user) return;
    const newStatus = reminder.status === 'Active' ? 'Inactive' : 'Active';
    setReminderRules(prev => prev.map(r => r.id === reminder.id ? { ...r, status: newStatus } : r));
    try {
      await smartDb.update("reminder_rules", reminder.id, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      toast.success(`${reminder.name} ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error("Failed to update reminder status:", error);
      setReminderRules(prev => prev.map(r => r.id === reminder.id ? { ...r, status: reminder.status } : r));
      toast.error("Failed to update reminder status");
    }
  };

  const handleOpenCreateReminder = () => {
    setEditingReminder(null);
    setReminderForm({
      name: "",
      offsetDays: 30,
      direction: "before",
      channels: ["Email"],
      messageTemplate: getDefaultMessageTemplate(30, "before"),
      status: "Active",
    });
    setIsReminderDialogOpen(true);
  };

  const handleOpenEditReminder = (reminder: ReminderRule) => {
    setEditingReminder(reminder);
    setReminderForm({
      name: reminder.name,
      offsetDays: reminder.offsetDays,
      direction: reminder.direction,
      channels: reminder.channels ?? [],
      messageTemplate: reminder.messageTemplate ?? "",
      status: reminder.status,
    });
    setIsReminderDialogOpen(true);
  };

  const handleReminderDirectionOrOffsetChange = (updates: Partial<{ offsetDays: number; direction: "before" | "after" }>) => {
    setReminderForm(prev => {
      const next = { ...prev, ...updates };
      // Only auto-refresh the template for brand-new rules, so edits to an
      // existing rule's custom message aren't clobbered by a field tweak.
      if (!editingReminder) {
        next.messageTemplate = getDefaultMessageTemplate(next.offsetDays, next.direction);
      }
      return next;
    });
  };

  const toggleReminderChannel = (channel: string) => {
    setReminderForm(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const handleSaveReminder = async () => {
    if (!user) return;
    if (!reminderForm.name.trim()) {
      toast.error("Please enter a name for the reminder rule");
      return;
    }
    if (reminderForm.channels.length === 0) {
      toast.error("Please select at least one channel");
      return;
    }

    setIsSavingReminder(true);
    const now = new Date().toISOString();

    try {
      if (editingReminder) {
        await smartDb.update("reminder_rules", editingReminder.id, {
          name: reminderForm.name,
          offsetDays: reminderForm.offsetDays,
          direction: reminderForm.direction,
          channels: reminderForm.channels,
          messageTemplate: reminderForm.messageTemplate,
          status: reminderForm.status,
          updatedAt: now,
        });
        setReminderRules(prev => prev.map(r => r.id === editingReminder.id ? { ...r, ...reminderForm } : r));
        toast.success(`Reminder rule "${reminderForm.name}" updated successfully!`);
      } else {
        const created = await smartDb.create("reminder_rules", {
          name: reminderForm.name,
          offsetDays: reminderForm.offsetDays,
          direction: reminderForm.direction,
          channels: reminderForm.channels,
          messageTemplate: reminderForm.messageTemplate,
          status: reminderForm.status,
          uid: user.uid,
          createdAt: now,
          updatedAt: now,
        });
        setReminderRules(prev => [...prev, created as ReminderRule]);
        toast.success("New reminder rule added!");
      }
      setIsReminderDialogOpen(false);
      setEditingReminder(null);
    } catch (error) {
      console.error("Failed to save reminder rule:", error);
      toast.error("Failed to save reminder rule");
    } finally {
      setIsSavingReminder(false);
    }
  };

  const handleNewAutomation = async () => {
    if (!user) return;

    const now = new Date().toISOString();

    if (activeTab === 'recurring') {
      try {
        const created = await smartDb.create("automation_tasks", {
          name: "New Recurring Task",
          category: "General",
          frequency: "Monthly",
          nextRun: now.split('T')[0],
          status: "Active",
          uid: user.uid,
          createdAt: now,
          updatedAt: now
        });
        setRecurringTasks(prev => [...prev, created as AutomationTask]);
        toast.success("New recurring task added!");
      } catch (error) {
        console.error("Failed to create recurring task:", error);
        toast.error("Failed to create recurring task");
      }
    } else if (activeTab === 'reminders') {
      handleOpenCreateReminder();
    } else if (activeTab === 'templates') {
      try {
        const created = await smartDb.create("communication_templates", {
          name: "New Template",
          type: "Email",
          content: "Hello {{name}}, ...",
          lastModified: now,
          uid: user.uid,
          createdAt: now,
          updatedAt: now
        });
        setCommTemplates(prev => [...prev, created as Template]);
        toast.success("New template created!");
      } catch (error) {
        console.error("Failed to create template:", error);
        toast.error("Failed to create template");
      }
    }
  };

  const formatDate = (timestamp: Timestamp | Date | string | null) => {
    if (!timestamp) return "N/A";
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate().toLocaleDateString();
    }
    return new Date(timestamp as string | Date).toLocaleDateString();
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
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Finance Automation</h1>
              <p className="text-sm text-slate-400">Automate recurring invoices, payment reminders, and financial notifications.</p>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs" onClick={handleNewAutomation}>
              <Plus className="h-4 w-4 mr-2" />
              New Automation
            </Button>
          </motion.div>
        </motion.div>

        <Tabs defaultValue="recurring" className="w-full" onValueChange={setActiveTab}>
          <motion.div variants={itemVariants}>
            <TabsList className="bg-transparent p-0 h-auto gap-1 mb-6 justify-start flex-wrap">
              <TabsTrigger value="recurring" className="flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Recurring
              </TabsTrigger>
              <TabsTrigger value="reminders" className="flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
                <Bell className="h-4 w-4 mr-2" />
                Reminders
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
                <Mail className="h-4 w-4 mr-2" />
                Templates
              </TabsTrigger>
            </TabsList>
          </motion.div>

          <TabsContent value="recurring" className="space-y-6 outline-none">
            <motion.div 
              variants={itemVariants}
              className="premium-card overflow-hidden"
            >
              <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <RefreshCcw className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold">Recurring Financial Tasks</h3>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input className="pl-10 h-10 text-xs rounded-xl border-border bg-card focus-visible:ring-primary/20 transition-all" placeholder="Search recurring..." />
                  </div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-border bg-card hover:bg-secondary transition-all">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Task Name</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Frequency</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Next Run</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {recurringTasks.length === 0 && !isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                            <div className="flex flex-col items-center justify-center">
                              <RefreshCcw className="h-10 w-10 mb-3 opacity-20" />
                              <p className="text-sm font-medium">No recurring tasks found.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        recurringTasks.map((rec, index) => (
                          <motion.tr 
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.03 }}
                            key={rec.id} 
                            className="group hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
                          >
                            <TableCell className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{rec.name}</TableCell>
                            <TableCell className="text-[12px] font-medium text-muted-foreground">{rec.category}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-bold border-none text-purple-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                {rec.frequency}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] font-mono font-medium text-muted-foreground">{rec.nextRun}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Switch 
                                  checked={rec.status === 'Active'} 
                                  onCheckedChange={() => handleToggleTaskStatus(rec)}
                                  className="data-[state=checked]:bg-primary"
                                />
                                <span className={cn(
                                  "text-[10px] font-bold uppercase tracking-wider",
                                  rec.status === 'Active' ? "text-green-600" : "text-muted-foreground"
                                )}>{rec.status}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-secondary">
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </motion.div>
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="reminders" className="space-y-6 outline-none">
            <motion.div 
              variants={itemVariants}
              className="premium-card overflow-hidden"
            >
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-bold">Automated Reminders</h3>
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button variant="outline" size="sm" className="rounded-xl h-9 text-[10px] font-bold border-border bg-card hover:bg-secondary transition-all" onClick={handleOpenCreateReminder}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Reminder
                  </Button>
                </motion.div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reminder Rule</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trigger</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Channels</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {reminderRules.length === 0 && !isLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                            <div className="flex flex-col items-center justify-center">
                              <Bell className="h-10 w-10 mb-3 opacity-20" />
                              <p className="text-sm font-medium">No reminder rules found.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        reminderRules.map((rem, index) => (
                          <motion.tr
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.03 }}
                            key={rem.id}
                            className="group hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
                          >
                            <TableCell className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{rem.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(
                                "text-[10px] font-bold border-none px-2 py-0.5 rounded-full",
                                rem.direction === 'after' ? "text-rose-600 bg-rose-50" : "text-purple-600 bg-blue-50"
                              )}>
                                {formatOffsetLabel(rem.offsetDays, rem.direction)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {(rem.channels ?? []).map((channel) => (
                                  <div key={channel} className={cn(
                                    "h-6 w-6 rounded-md flex items-center justify-center",
                                    channel === 'Email' ? "bg-blue-50 text-purple-600" :
                                    channel === 'WhatsApp' ? "bg-green-50 text-green-600" :
                                    channel === 'Parent App' ? "bg-purple-50 text-purple-600" :
                                    "bg-amber-50 text-amber-600"
                                  )} title={channel}>
                                    {channel === 'Email' ? <Mail className="h-3.5 w-3.5" /> :
                                     channel === 'WhatsApp' ? <MessageSquare className="h-3.5 w-3.5" /> :
                                     channel === 'Parent App' ? <Bell className="h-3.5 w-3.5" /> :
                                     <Zap className="h-3.5 w-3.5" />}
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={rem.status === 'Active'}
                                onCheckedChange={() => handleToggleReminderStatus(rem)}
                                className="data-[state=checked]:bg-primary"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="inline-block">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-secondary" onClick={() => handleOpenEditReminder(rem)}>
                                  <Settings className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </motion.div>
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6 outline-none">
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <AnimatePresence mode="popLayout">
                {commTemplates.map((tmp, index) => (
                  <motion.div 
                    layout
                    variants={itemVariants}
                    key={tmp.id} 
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="premium-card p-5 hover:border-primary/50 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-white/80 backdrop-blur-sm shadow-sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                        tmp.type === 'Email' ? 'bg-blue-50 text-purple-600' : 'bg-green-50 text-green-600'
                      )}>
                        {tmp.type === 'Email' ? <Mail className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">{tmp.name}</h4>
                        <p className="text-[10px] text-muted-foreground font-medium">Last modified: {formatDate(tmp.lastModified)}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-20 overflow-hidden relative">
                        <p className="text-[11px] text-muted-foreground line-clamp-3 italic leading-relaxed">
                          "{tmp.content}"
                        </p>
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
                      </div>
                      
                      <div className="flex items-center justify-between pt-2">
                        <Badge variant="secondary" className="text-[10px] font-bold bg-secondary/50 border-none px-2 py-0.5 rounded-full">
                          {tmp.type}
                        </Badge>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-[11px] font-bold text-primary px-3 rounded-lg hover:bg-primary/5 transition-all" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTemplate(tmp);
                            }}
                          >
                            Edit Template
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="premium-card p-5 border-dashed border-2 border-border/50 flex flex-col items-center justify-center text-center hover:bg-secondary/20 transition-all cursor-pointer group" 
                  onClick={handleNewAutomation}
                >
                  <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-3 transition-transform group-hover:scale-110 group-hover:bg-primary/10">
                    <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-bold text-foreground">New Template</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Create custom Email/SMS communication</p>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      <AnimatePresence>
        {isEditDialogOpen && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl rounded-2xl border-none shadow-2xl">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <DialogTitle className="text-xl font-bold text-foreground">Edit Template</DialogTitle>
                </div>
                <DialogDescription className="text-sm font-medium">
                  Modify the content of your automated <span className="text-primary font-bold">{editingTemplate?.type.toLowerCase()}</span> template.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Template Name</Label>
                  <Input id="name" defaultValue={editingTemplate?.name} className="rounded-xl h-11 border-border bg-secondary/30 focus-visible:ring-primary/20 transition-all font-bold" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="content" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message Content</Label>
                  <div className="relative">
                    <Textarea 
                      id="content" 
                      value={templateContent} 
                      onChange={(e) => setTemplateContent(e.target.value)}
                      className="min-h-[250px] rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 transition-all font-mono text-[13px] p-4 leading-relaxed" 
                      placeholder="Type your message here..."
                    />
                    <div className="absolute bottom-3 right-3">
                      <Badge variant="outline" className="bg-white/80 backdrop-blur-sm text-[10px] font-bold border-border/50">
                        {templateContent.length} chars
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                      <span className="font-bold">Pro Tip:</span> Use tags like <code className="bg-white px-1 rounded text-primary">{"{{student_name}}"}</code>, <code className="bg-white px-1 rounded text-primary">{"{{amount}}"}</code>, <code className="bg-white px-1 rounded text-primary">{"{{due_date}}"}</code> for dynamic content.
                      Current Currency: <span className="font-bold">{financialSettings.currency}</span>
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex gap-3 pt-2">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="w-full rounded-xl h-11 border-border font-bold text-xs hover:bg-secondary transition-all">
                    Cancel
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button onClick={handleSaveTemplate} className="w-full rounded-xl h-11 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </motion.div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReminderDialogOpen && (
          <Dialog open={isReminderDialogOpen} onOpenChange={setIsReminderDialogOpen}>
            <DialogContent className="max-w-2xl rounded-2xl border-none shadow-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-amber-500" />
                  </div>
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {editingReminder ? "Edit Reminder Rule" : "New Reminder Rule"}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-sm font-medium">
                  Configure when this reminder fires relative to the fee due date, and how it should be sent.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="reminder-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rule Name</Label>
                  <Input
                    id="reminder-name"
                    value={reminderForm.name}
                    onChange={(e) => setReminderForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. 14 Days Before Due Date"
                    className="rounded-xl h-11 border-border bg-secondary/30 focus-visible:ring-primary/20 transition-all font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="reminder-offset" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Offset (Days)</Label>
                    <Input
                      id="reminder-offset"
                      type="number"
                      min={0}
                      value={reminderForm.offsetDays}
                      onChange={(e) => handleReminderDirectionOrOffsetChange({ offsetDays: Math.max(0, Number(e.target.value) || 0) })}
                      className="rounded-xl h-11 border-border bg-secondary/30 focus-visible:ring-primary/20 transition-all font-bold"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Direction</Label>
                    <Select
                      value={reminderForm.direction}
                      onValueChange={(value) => handleReminderDirectionOrOffsetChange({ direction: value as "before" | "after" })}
                    >
                      <SelectTrigger className="rounded-xl h-11 border-border bg-secondary/30 font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Before Due Date</SelectItem>
                        <SelectItem value="after">After Due Date (Overdue)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Channels</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {REMINDER_CHANNELS.map((channel) => (
                      <div key={channel} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/30">
                        <Checkbox
                          id={`channel-${channel}`}
                          checked={reminderForm.channels.includes(channel)}
                          onCheckedChange={() => toggleReminderChannel(channel)}
                        />
                        <Label htmlFor={`channel-${channel}`} className="text-xs font-bold cursor-pointer">
                          {channel}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="reminder-status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                  <Select
                    value={reminderForm.status}
                    onValueChange={(value) => setReminderForm(prev => ({ ...prev, status: value as "Active" | "Inactive" }))}
                  >
                    <SelectTrigger id="reminder-status" className="rounded-xl h-11 border-border bg-secondary/30 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="reminder-template" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message Template</Label>
                  <Textarea
                    id="reminder-template"
                    value={reminderForm.messageTemplate}
                    onChange={(e) => setReminderForm(prev => ({ ...prev, messageTemplate: e.target.value }))}
                    className="min-h-[220px] rounded-xl border-border bg-secondary/30 focus-visible:ring-primary/20 transition-all font-mono text-[13px] p-4 leading-relaxed"
                    placeholder="Type your reminder message here..."
                  />
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                      <span className="font-bold">Supported tags:</span>{" "}
                      <code className="bg-white px-1 rounded text-primary">{"{{studentName}}"}</code>{" "}
                      <code className="bg-white px-1 rounded text-primary">{"{{grade}}"}</code>{" "}
                      <code className="bg-white px-1 rounded text-primary">{"{{term}}"}</code>{" "}
                      <code className="bg-white px-1 rounded text-primary">{"{{amount}}"}</code>{" "}
                      <code className="bg-white px-1 rounded text-primary">{"{{dueDate}}"}</code>
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex gap-3 pt-2">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button variant="outline" onClick={() => setIsReminderDialogOpen(false)} className="w-full rounded-xl h-11 border-border font-bold text-xs hover:bg-secondary transition-all">
                    Cancel
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button onClick={handleSaveReminder} disabled={isSavingReminder} className="w-full rounded-xl h-11 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs">
                    <Save className="h-4 w-4 mr-2" />
                    {editingReminder ? "Save Changes" : "Create Reminder"}
                  </Button>
                </motion.div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default Automation;
