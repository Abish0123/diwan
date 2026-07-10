import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { WhatsAppBlast } from "@/components/communication/WhatsAppBlast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, 
  MessageSquare, 
  Phone, 
  Send, 
  Users, 
  Filter, 
  Search, 
  Plus, 
  History, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Smartphone,
  Globe,
  FileText,
  ChevronRight,
  BarChart3,
  Trash2,
  Eye,
  Copy,
  Sparkles,
  Layout,
  Calendar as CalendarIcon,
  AtSign,
  Type
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { GoogleGenAI } from "@google/genai";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function apiSendEmail(payload: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; accepted?: string[]; rejected?: string[]; error?: string }> {
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function textToHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</div>`;
}

interface Campaign {
  id: string;
  name: string;
  subject?: string;
  content: string;
  type: "Email" | "SMS" | "WhatsApp";
  status: "Sent" | "Scheduled" | "Draft" | "Failed";
  recipients: number;
  targetAudience: string;
  date: string;
  openRate?: string;
  deliveryRate: string;
}

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    name: "Monthly Newsletter - March",
    subject: "March School Updates & Events",
    content: "Dear parents, here are the updates for March...",
    type: "Email",
    status: "Sent",
    recipients: 1250,
    targetAudience: "All Students",
    date: "2026-03-20",
    openRate: "68%",
    deliveryRate: "99.2%"
  },
  {
    id: "2",
    name: "Urgent Fee Reminder",
    content: "Reminder: Please clear your outstanding fees by Friday.",
    type: "SMS",
    status: "Sent",
    recipients: 450,
    targetAudience: "Fee Defaulters",
    date: "2026-03-22",
    deliveryRate: "98.5%"
  },
  {
    id: "3",
    name: "Sports Day Registration",
    content: "Registration for Sports Day is now open! Click here to join.",
    type: "WhatsApp",
    status: "Scheduled",
    recipients: 1200,
    targetAudience: "All Students",
    date: "2026-03-26",
    deliveryRate: "0%"
  },
  {
    id: "4",
    name: "Staff Meeting Update",
    subject: "Emergency Staff Meeting",
    content: "There will be a meeting at 4 PM today in the staff room.",
    type: "Email",
    status: "Draft",
    recipients: 85,
    targetAudience: "All Staff",
    date: "2026-03-24",
    deliveryRate: "0%"
  }
];

const TEMPLATES = {
  Email: [
    { title: "Monthly Newsletter", content: "Dear Parents,\n\nWelcome to our monthly newsletter. This month we have several exciting events planned...\n\nBest regards,\nSchool Administration" },
    { title: "Exam Schedule", content: "Dear Students,\n\nThe final exam schedule for the upcoming term has been released. Please find the details attached...\n\nGood luck!" }
  ],
  SMS: [
    { title: "Attendance Alert", content: "Alert: {name} was marked absent today, {date}. Please contact the office if this is an error." },
    { title: "Holiday Notice", content: "School will remain closed on {date} due to {reason}. Classes will resume on {resume_date}." }
  ],
  WhatsApp: [
    { title: "Event Invitation", content: "Hi! You're invited to our Annual Science Fair on {date}. We'd love to see you there! 🚀" },
    { title: "Quick Reminder", content: "Just a quick reminder about the parent-teacher meeting tomorrow at {time}. See you soon! 👋" }
  ]
};

// Map a persisted OutreachCampaign record back to the UI Campaign shape.
// Records carry contract fields (channels/audience/message/recipientCount/sentAt)
// while older/mock rows may carry the original UI fields — handle both.
const toCampaign = (row: Record<string, unknown>): Campaign => {
  const channels = row.channels as string[] | undefined;
  return {
    id: String(row.id),
    name: (row.name as string) || "",
    subject: row.subject as string | undefined,
    content: (row.message as string) ?? (row.content as string) ?? "",
    type: ((row.type as string) || channels?.[0] || "Email") as Campaign["type"],
    status: ((row.status as string) || "Sent") as Campaign["status"],
    recipients: (row.recipientCount as number) ?? (row.recipients as number) ?? 0,
    targetAudience: (row.audience as string) ?? (row.targetAudience as string) ?? "",
    date:
      (row.sentAt as string)?.split?.("T")?.[0] ??
      (row.date as string) ??
      format(new Date(), "yyyy-MM-dd"),
    openRate: row.openRate as string | undefined,
    deliveryRate: (row.deliveryRate as string) || "0%",
  };
};

const Outreach = () => {
  const { user } = useAuth();
  const uid = user?.uid;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [outreachType, setOutreachType] = useState<"Email" | "SMS" | "WhatsApp">("Email");
  
  // Form State
  const [campaignName, setCampaignName] = useState("");
  const [targetAudience, setTargetAudience] = useState("all-students");
  const [subject, setSubject] = useState("");
  const [messageContent, setMessageContent] = useState("");
  
  // SMTP
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpUser, setSmtpUser] = useState<string>("");

  // UI State
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
  const [isScheduled, setIsScheduled] = useState(false);

  // Seed-on-empty + hydrate persisted campaigns from the DB.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let rows = await smartDb.getAll("OutreachCampaign", uid);

      if (!rows || rows.length === 0) {
        for (const c of MOCK_CAMPAIGNS) {
          // id in the body too so the local API upserts (idempotent re-seed).
          await smartDb.create(
            "OutreachCampaign",
            {
              id: c.id,
              name: c.name,
              subject: c.subject,
              channels: [c.type],
              audience: c.targetAudience,
              message: c.content,
              status: c.status,
              recipientCount: c.recipients,
              deliveryRate: c.deliveryRate,
              openRate: c.openRate,
              sentAt: c.date,
              uid,
              createdAt: new Date().toISOString(),
            },
            c.id
          );
        }
        rows = await smartDb.getAll("OutreachCampaign", uid);
      }

      if (cancelled) return;
      // Newest first (mirrors the original prepend behaviour).
      const mapped = rows.map(toCampaign).sort((a, b) => (a.date < b.date ? 1 : -1));
      setCampaigns(mapped);
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    fetch("/api/smtp-status")
      .then(r => r.json())
      .then(d => { setSmtpConfigured(!!d.configured); setSmtpUser(d.user || ""); })
      .catch(() => setSmtpConfigured(false));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Sent": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Scheduled": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "Draft": return "bg-secondary text-secondary-foreground";
      case "Failed": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Email": return <Mail className="h-4 w-4" />;
      case "SMS": return <Smartphone className="h-4 w-4" />;
      case "WhatsApp": return <MessageSquare className="h-4 w-4" />;
      default: return null;
    }
  };

  const audienceCount = (audience: string) =>
    audience === "all-students" ? 1250 :
    audience === "all-parents" ? 1100 :
    audience === "all-staff" ? 120 :
    audience === "grade-10" ? 150 : 45;

  const handleLaunchCampaign = async () => {
    if (!campaignName || !messageContent) {
      toast.error("Please fill in the campaign name and message content.");
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const recipientCount = audienceCount(targetAudience);
    const campaignStatus: Campaign["status"] = isScheduled ? "Scheduled" : "Sent";
    const date = isScheduled ? scheduledDate.split('T')[0] : format(new Date(), "yyyy-MM-dd");

    const newCampaign: Campaign = {
      id,
      name: campaignName,
      subject: outreachType === "Email" ? subject : undefined,
      content: messageContent,
      type: outreachType,
      status: campaignStatus,
      recipients: recipientCount,
      targetAudience,
      date,
      deliveryRate: isScheduled ? "0%" : "100%",
    };

    setCampaigns([newCampaign, ...campaigns]);
    resetForm();

    // ── Real Email delivery via SMTP ──────────────────────────────────────────
    if (outreachType === "Email" && !isScheduled) {
      if (!smtpConfigured) {
        toast.warning(
          "Campaign recorded locally. Add SMTP credentials in .env (SMTP_USER + SMTP_PASS) to enable real delivery.",
          { duration: 6000 }
        );
      } else {
        // Gather recipient email addresses from the DB
        let toAddresses: string[] = [];
        try {
          const [studentsData, staffData] = await Promise.all([
            fetch("/api/data/students").then(r => r.json()).catch(() => []),
            fetch("/api/data/staff").then(r => r.json()).catch(() => []),
          ]);
          const students = Array.isArray(studentsData) ? studentsData as Array<Record<string,unknown>> : [];
          const staff    = Array.isArray(staffData)    ? staffData    as Array<Record<string,unknown>> : [];

          if (targetAudience === "all-students" || targetAudience === "grade-10" || targetAudience === "fee-defaulters") {
            toAddresses = students.map(s => (s.email || s.parentEmail || s.parent_email) as string).filter(Boolean);
          } else if (targetAudience === "all-staff") {
            toAddresses = staff.map(s => (s.email) as string).filter(Boolean);
          } else if (targetAudience === "all-parents") {
            toAddresses = students.map(s => (s.parentEmail || s.parent_email || s.email) as string).filter(Boolean);
          }
        } catch { /* ignore */ }

        // Fall back to sending the admin a preview if no emails in DB
        if (toAddresses.length === 0) {
          toAddresses = [smtpUser];
        }

        const emailSubject = subject || campaignName;
        const emailHtml = textToHtml(messageContent);

        toast.promise(
          apiSendEmail({ to: toAddresses, subject: emailSubject, html: emailHtml, text: messageContent }),
          {
            loading: `Sending to ${toAddresses.length} recipient(s)…`,
            success: (d) =>
              d.error
                ? `Sent with issues: ${d.error}`
                : `Email delivered to ${(d.accepted?.length ?? toAddresses.length)} recipient(s)!`,
            error: (e) => `Email failed: ${e.message}`,
          }
        );
      }
    } else if (outreachType === "Email" && isScheduled) {
      toast.success(`Email campaign scheduled for ${scheduledDate}.`);
    } else {
      toast.success(`${outreachType} campaign recorded. Connect SMS/WhatsApp provider to enable delivery.`);
    }

    await smartDb.create(
      "OutreachCampaign",
      {
        id,
        name: newCampaign.name,
        subject: newCampaign.subject,
        channels: [outreachType],
        audience: targetAudience,
        message: messageContent,
        status: campaignStatus,
        recipientCount,
        deliveryRate: newCampaign.deliveryRate,
        sentAt: isScheduled ? scheduledDate : new Date().toISOString(),
        uid,
        createdAt: new Date().toISOString(),
      },
      id
    );
  };

  const handleSaveDraft = async () => {
    if (!campaignName) {
      toast.error("Please enter a campaign name to save as draft.");
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const draftCampaign: Campaign = {
      id,
      name: campaignName,
      subject: outreachType === "Email" ? subject : undefined,
      content: messageContent,
      type: outreachType,
      status: "Draft",
      recipients: 0,
      targetAudience: targetAudience,
      date: format(new Date(), "yyyy-MM-dd"),
      deliveryRate: "0%"
    };

    setCampaigns([draftCampaign, ...campaigns]);
    toast.info("Campaign saved as draft.");
    resetForm();

    await smartDb.create(
      "OutreachCampaign",
      {
        id,
        name: draftCampaign.name,
        subject: draftCampaign.subject,
        channels: [outreachType],
        audience: targetAudience,
        message: messageContent,
        status: "Draft",
        recipientCount: 0,
        deliveryRate: "0%",
        sentAt: new Date().toISOString(),
        uid,
        createdAt: new Date().toISOString(),
      },
      id
    );
  };

  const handleSendTest = async () => {
    if (!testRecipient) {
      toast.error("Please enter a test recipient.");
      return;
    }

    if (outreachType !== "Email") {
      toast.info("Test send for SMS/WhatsApp requires a connected provider. Email only for now.");
      setIsTestDialogOpen(false);
      return;
    }

    if (!smtpConfigured) {
      toast.warning("SMTP not configured. Add SMTP_USER + SMTP_PASS to .env to enable sending.");
      setIsTestDialogOpen(false);
      return;
    }

    setIsTestDialogOpen(false);
    toast.promise(
      apiSendEmail({
        to: testRecipient,
        subject: `[TEST] ${subject || campaignName || "Test Email"}`,
        html: textToHtml(messageContent || "This is a test email from Student Diwan."),
        text: messageContent || "This is a test email from Student Diwan.",
      }),
      {
        loading: `Sending test email to ${testRecipient}…`,
        success: () => `Test email delivered to ${testRecipient}!`,
        error: (e) => `Send failed: ${e.message}`,
      }
    );
    setTestRecipient("");
  };

  const resetForm = () => {
    setCampaignName("");
    setSubject("");
    setMessageContent("");
    setTargetAudience("all-students");
    setIsScheduled(false);
  };

  const handleUseTemplate = (templateContent: string) => {
    setMessageContent(templateContent);
    toast.success("Template applied!");
  };

  const handleAiAssist = async () => {
    if (!campaignName && !subject) {
      toast.error("Please provide a campaign name or subject to help AI generate content.");
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = `Generate a professional ${outreachType} message for a school campaign named "${campaignName}". ${subject ? `The subject is "${subject}".` : ""} The message should be concise and allow for personalization tokens like {name}, {grade}, and {balance}. Format it for ${outreachType}.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const text = response.text;
      if (text) {
        setMessageContent(text);
        toast.success("AI content generated!");
      }
    } catch (error) {
      console.error("AI Generation Error:", error);
      toast.error("AI failed to generate content. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    setCampaigns(campaigns.filter(c => c.id !== id));
    toast.success("Campaign deleted.");
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
    await smartDb.delete("OutreachCampaign", id);
  };

  const duplicateCampaign = async (campaign: Campaign) => {
    const id = Math.random().toString(36).substr(2, 9);
    const duplicated: Campaign = {
      ...campaign,
      id,
      name: `${campaign.name} (Copy)`,
      status: "Draft",
      date: format(new Date(), "yyyy-MM-dd")
    };
    setCampaigns([duplicated, ...campaigns]);
    toast.success("Campaign duplicated as draft.");

    await smartDb.create(
      "OutreachCampaign",
      {
        id,
        name: duplicated.name,
        subject: duplicated.subject,
        channels: [duplicated.type],
        audience: duplicated.targetAudience,
        message: duplicated.content,
        status: "Draft",
        recipientCount: 0,
        deliveryRate: "0%",
        sentAt: new Date().toISOString(),
        uid,
        createdAt: new Date().toISOString(),
      },
      id
    );
  };

  const stats = useMemo(() => {
    const sentCampaigns = campaigns.filter(c => c.status === "Sent");
    const totalRecipients = sentCampaigns.reduce((acc, c) => acc + c.recipients, 0);
    const avgOpenRate = sentCampaigns.filter(c => c.openRate).reduce((acc, c) => acc + parseFloat(c.openRate!), 0) / (sentCampaigns.filter(c => c.openRate).length || 1);
    
    return {
      avgOpenRate: avgOpenRate.toFixed(1) + "%",
      totalRecipients,
      smsCredits: 4200 - campaigns.filter(c => c.type === "SMS" && c.status === "Sent").reduce((acc, c) => acc + c.recipients, 0)
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [campaigns, searchQuery]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Send className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Outreach & Broadcast</h1>
              <p className="text-sm text-slate-400">Send bulk Email, SMS, and WhatsApp messages to your community.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs font-bold" onClick={() => setIsHistoryOpen(true)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <Button className="gradient-primary shadow-lg shadow-primary/20" onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </div>
        </div>

        {/* SMTP Status Banner */}
        {smtpConfigured === false && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">SMTP not configured — emails won't be delivered</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                Open <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env</code> and fill in{" "}
                <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">SMTP_USER</code> and{" "}
                <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">SMTP_PASS</code>, then restart the server.
              </p>
            </div>
          </div>
        )}
        {smtpConfigured === true && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
              SMTP ready · sending from <span className="font-mono">{smtpUser}</span>
            </p>
          </div>
        )}

        {/* Quick Actions / Channel Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => setOutreachType("Email")}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-2xl border transition-all space-y-3",
              outreachType === "Email" ? "bg-primary/5 border-primary shadow-sm" : "bg-card border-border hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
              outreachType === "Email" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}>
              <Mail className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">Email Campaign</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-bold">99.9% Delivery</p>
            </div>
          </button>
          <button 
            onClick={() => setOutreachType("SMS")}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-2xl border transition-all space-y-3",
              outreachType === "SMS" ? "bg-primary/5 border-primary shadow-sm" : "bg-card border-border hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
              outreachType === "SMS" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}>
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">SMS Broadcast</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-bold">Instant Reach</p>
            </div>
          </button>
          <button 
            onClick={() => setOutreachType("WhatsApp")}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-2xl border transition-all space-y-3",
              outreachType === "WhatsApp" ? "bg-primary/5 border-primary shadow-sm" : "bg-card border-border hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
              outreachType === "WhatsApp" ? "bg-emerald-500 text-white" : "bg-secondary text-muted-foreground"
            )}>
              <MessageSquare className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">WhatsApp Business</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-bold">High Engagement</p>
            </div>
          </button>
        </div>

        {/* WhatsApp Blast Tool */}
        {outreachType === "WhatsApp" && <WhatsAppBlast />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Campaign Composer */}
          <Card className="lg:col-span-2 premium-card">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                {getTypeIcon(outreachType)}
                Compose {outreachType} Campaign
              </CardTitle>
              <CardDescription>
                Design your message and select your target audience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Campaign Name</label>
                  <Input 
                    placeholder="e.g. Spring Term Newsletter" 
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Audience</label>
                  <Select value={targetAudience} onValueChange={setTargetAudience}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select audience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-students">All Students (1,250)</SelectItem>
                      <SelectItem value="all-parents">All Parents (1,100)</SelectItem>
                      <SelectItem value="all-staff">All Staff (120)</SelectItem>
                      <SelectItem value="grade-10">Grade 10 Only (150)</SelectItem>
                      <SelectItem value="fee-defaulters">Fee Defaulters (45)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {outreachType === "Email" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Subject Line</label>
                    <Input 
                      placeholder="Enter email subject..." 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule (Optional)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground">{isScheduled ? "Enabled" : "Disabled"}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={cn("h-6 w-10 p-0 rounded-full border", isScheduled ? "bg-primary/10 border-primary" : "bg-muted border-border")}
                        onClick={() => setIsScheduled(!isScheduled)}
                      >
                        <div className={cn("h-4 w-4 rounded-full transition-all", isScheduled ? "bg-primary ml-4" : "bg-muted-foreground ml-0")} />
                      </Button>
                    </div>
                  </div>
                  <Input 
                    type="datetime-local" 
                    disabled={!isScheduled}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message Content</label>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase">
                          <Layout className="h-3 w-3 mr-1" /> Use Template
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Available Templates</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {TEMPLATES[outreachType].map((template, idx) => (
                          <DropdownMenuItem key={idx} onClick={() => handleUseTemplate(template.content)}>
                            <div className="flex flex-col">
                              <span className="font-bold">{template.title}</span>
                              <span className="text-[10px] text-muted-foreground truncate">{template.content}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-[10px] font-bold uppercase text-primary" 
                      onClick={handleAiAssist}
                      disabled={isGenerating}
                    >
                      <Sparkles className={cn("h-3 w-3 mr-1", isGenerating && "animate-spin")} /> 
                      {isGenerating ? "Generating..." : "AI Assist"}
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Textarea 
                    placeholder={`Write your ${outreachType.toLowerCase()} content here...`} 
                    className="min-h-[200px] bg-muted/20 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                  />
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="h-6 text-[9px] px-2"
                      onClick={() => setMessageContent(prev => prev + "{name}")}
                    >
                      + Name
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="h-6 text-[9px] px-2"
                      onClick={() => setMessageContent(prev => prev + "{grade}")}
                    >
                      + Grade
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="h-6 text-[9px] px-2"
                      onClick={() => setMessageContent(prev => prev + "{balance}")}
                    >
                      + Balance
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium pt-1">
                  <span>Personalize with: {"{name}"}, {"{grade}"}, {"{balance}"}</span>
                  {outreachType === "SMS" && (
                    <span className={cn(messageContent.length > 160 ? "text-destructive" : "")}>
                      {messageContent.length} / 160 characters ({Math.ceil(messageContent.length / 160)} segment)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="h-9 px-4 text-xs font-bold" onClick={handleSaveDraft}>Save as Draft</Button>
                  <Button variant="outline" className="h-9 px-4 text-xs font-bold" onClick={() => setIsTestDialogOpen(true)}>Send Test</Button>
                </div>
                <Button className="h-9 px-6 text-xs font-bold gradient-primary shadow-lg shadow-primary/20" onClick={handleLaunchCampaign}>
                  <Send className="h-4 w-4 mr-2" />
                  {isScheduled ? "Schedule Campaign" : "Launch Campaign"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Send Test Dialog */}
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Send Test {outreachType}</DialogTitle>
                <DialogDescription>
                  Enter the {outreachType === "Email" ? "email address" : "phone number"} where you'd like to receive the test message.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input 
                  placeholder={outreachType === "Email" ? "email@example.com" : "+1234567890"}
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSendTest}>Send Test</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Recent Campaigns & Stats */}
          <div className="space-y-6">
            <Card className="premium-card">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <span className="text-xs font-medium">Avg. Open Rate</span>
                  </div>
                  <span className="text-sm font-bold">{stats.avgOpenRate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Globe className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-xs font-medium">Monthly Reach</span>
                  </div>
                  <span className="text-sm font-bold">{stats.totalRecipients.toLocaleString()}</span>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-1/4 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Smartphone className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-xs font-medium">SMS Credits</span>
                  </div>
                  <span className="text-sm font-bold">{stats.smsCredits}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="premium-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {campaigns.slice(0, 5).map((campaign) => (
                    <div 
                      key={campaign.id} 
                      className="p-4 hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded-md", getStatusColor(campaign.status))}>
                            {getTypeIcon(campaign.type)}
                          </div>
                          <h4 className="text-xs font-bold truncate max-w-[120px]">{campaign.name}</h4>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                        <span>{campaign.recipients} recipients</span>
                        <span>{campaign.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button 
                  variant="ghost" 
                  className="w-full h-10 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/5 rounded-none"
                  onClick={() => setIsHistoryOpen(true)}
                >
                  View All History
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Campaign History Dialog */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl font-bold">Campaign History</DialogTitle>
              <DialogDescription>View and manage all your past communication campaigns.</DialogDescription>
              <div className="relative mt-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search campaigns..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 pt-2">
              <div className="space-y-3">
                {filteredCampaigns.map((campaign) => (
                  <div 
                    key={campaign.id} 
                    className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/30 transition-all group cursor-pointer"
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setIsHistoryOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", getStatusColor(campaign.status))}>
                        {getTypeIcon(campaign.type)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">{campaign.name}</h4>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {campaign.recipients}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {campaign.date}</span>
                          <Badge variant="outline" className="text-[8px] h-4 px-1">{campaign.status}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); duplicateCampaign(campaign); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); deleteCampaign(campaign.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredCampaigns.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No campaigns found matching your search.</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Campaign Details Dialog */}
        <Dialog open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                {selectedCampaign && (
                  <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", getStatusColor(selectedCampaign.status))}>
                    {getTypeIcon(selectedCampaign.type)}
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl font-bold">{selectedCampaign?.name}</DialogTitle>
                  <DialogDescription className="text-xs font-medium uppercase tracking-wider">
                    {selectedCampaign?.type} Campaign • {selectedCampaign?.date}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-xl bg-muted/50 border border-border/50 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                  <Badge variant="outline" className={cn("text-[10px] font-bold", getStatusColor(selectedCampaign?.status || ""))}>
                    {selectedCampaign?.status}
                  </Badge>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border border-border/50 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recipients</p>
                  <p className="text-sm font-bold">{selectedCampaign?.recipients}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border border-border/50 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Delivery</p>
                  <p className="text-sm font-bold">{selectedCampaign?.deliveryRate}</p>
                </div>
              </div>

              {selectedCampaign?.subject && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium p-3 rounded-lg bg-muted/30">{selectedCampaign.subject}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Content</p>
                <div className="text-sm leading-relaxed p-4 rounded-xl bg-muted/30 border border-border/50 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {selectedCampaign?.content}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Target Audience</p>
                    <p className="text-xs text-muted-foreground">{selectedCampaign?.targetAudience}</p>
                  </div>
                </div>
                {selectedCampaign?.openRate && (
                  <div className="text-right">
                    <p className="text-xs font-bold text-primary">{selectedCampaign.openRate}</p>
                    <p className="text-[10px] text-muted-foreground">Open Rate</p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => selectedCampaign && deleteCampaign(selectedCampaign.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedCampaign(null)}>Close</Button>
                <Button className="gradient-primary" onClick={() => {
                  if (selectedCampaign) duplicateCampaign(selectedCampaign);
                  setSelectedCampaign(null);
                }}>Duplicate</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Outreach;
