import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MessageCircle, Send, Users, Clock, Eye, Plus, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useIntegrationConnected } from "@/hooks/useIntegrationStatus";

const TEMPLATES: Record<string, string> = {
  "Fee Reminder":
    "Dear Parent, This is a reminder that [Student Name]'s fee of [Amount] is due on [Date]. Please pay via our online portal.",
  "Exam Notification":
    "Dear Parent, [Student Name]'s [Exam Name] is scheduled on [Date]. Please ensure preparation.",
  "Attendance Alert":
    "Dear Parent, [Student Name] was absent today [Date]. Please contact the school if needed.",
  "Event Reminder":
    "Dear Parent, [Event Name] is scheduled on [Date]. Please ensure [Student Name] attends.",
  Custom: "",
};

const CLASSES = [
  "Grade 1-A", "Grade 1-B", "Grade 2-A", "Grade 2-B",
  "Grade 3-A", "Grade 4-A", "Grade 5-A", "Grade 6-A",
  "Grade 7-A", "Grade 8-A", "Grade 9-A", "Grade 10-A",
  "Grade 11-A", "Grade 12-A",
];

const VARIABLES = ["[Student Name]", "[Parent Name]", "[Amount]", "[Date]", "[Class]"];

const SAMPLE_DATA: Record<string, string> = {
  "[Student Name]": "Ahmad Al Rashidi",
  "[Parent Name]": "Mr. Khalid Al Rashidi",
  "[Amount]": "AED 5,000",
  "[Date]": new Date().toLocaleDateString("en-GB"),
  "[Class]": "Grade 10-A",
  "[Exam Name]": "Mid-Term Examination",
  "[Event Name]": "Annual Sports Day",
};

const RECIPIENT_COUNTS: Record<string, number> = {
  "All Parents": 847,
  "All Students": 623,
  "Specific Class": 32,
  "Custom List": 0,
};

interface RecentSend {
  date: string;
  recipients: string;
  template: string;
  status: "Delivered" | "Pending" | "Failed";
  count: number;
}

const RECENT_SENDS: RecentSend[] = [
  { date: "19 Jun 2026", recipients: "All Parents", template: "Fee Reminder", status: "Delivered", count: 847 },
  { date: "15 Jun 2026", recipients: "Grade 10-A", template: "Exam Notification", status: "Delivered", count: 32 },
  { date: "12 Jun 2026", recipients: "All Parents", template: "Event Reminder", status: "Delivered", count: 847 },
  { date: "10 Jun 2026", recipients: "Custom List", template: "Attendance Alert", status: "Failed", count: 15 },
  { date: "05 Jun 2026", recipients: "All Students", template: "Custom", status: "Delivered", count: 623 },
];

export const WhatsAppBlast: React.FC = () => {
  const { connected: whatsappConnected, loading: whatsappLoading } = useIntegrationConnected("whatsapp-business");
  const [recipientType, setRecipientType] = useState("All Parents");
  const [selectedClass, setSelectedClass] = useState("Grade 10-A");
  const [templateName, setTemplateName] = useState("Fee Reminder");
  const [message, setMessage] = useState(TEMPLATES["Fee Reminder"]);
  const [scheduleType, setScheduleType] = useState("Send Now");
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const recipientCount =
    recipientType === "Specific Class"
      ? RECIPIENT_COUNTS["Specific Class"]
      : RECIPIENT_COUNTS[recipientType] ?? 0;

  const charCount = message.length;

  const handleTemplateChange = (name: string) => {
    setTemplateName(name);
    setMessage(TEMPLATES[name] || "");
  };

  const insertVariable = (variable: string) => {
    setMessage((prev) => prev + variable);
  };

  const getPreviewMessage = () => {
    let preview = message;
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`\\${key}`, "g"), value);
    });
    return preview;
  };

  const handleSend = () => {
    if (!message.trim()) {
      toast.error("Please enter a message before sending.");
      return;
    }
    const count = recipientCount;
    if (scheduleType === "Send Now") {
      toast.success(`Message queued for ${count} recipients`);
    } else {
      toast.success(`Message scheduled for ${scheduledDateTime} — ${count} recipients`);
    }
  };

  const statusColor = (status: RecentSend["status"]) => {
    if (status === "Delivered") return "bg-green-100 text-green-700";
    if (status === "Pending") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  if (whatsappLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Checking WhatsApp Business connection…</div>;
  }

  if (!whatsappConnected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">WhatsApp Blast</h2>
            <p className="text-sm text-muted-foreground">Send bulk WhatsApp messages to parents and students</p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
              <PlugZap className="h-7 w-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">WhatsApp Business isn't connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Bulk messaging needs a real WhatsApp Business API connection first — connect it under Administration → Integrations before composing a blast.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/settings/integrations">Go to Integrations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <MessageCircle className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">WhatsApp Blast</h2>
          <p className="text-sm text-muted-foreground">Send bulk WhatsApp messages to parents and students</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Recipients
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Recipient Group</Label>
                  <Select value={recipientType} onValueChange={setRecipientType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Parents">All Parents</SelectItem>
                      <SelectItem value="All Students">All Students</SelectItem>
                      <SelectItem value="Specific Class">Specific Class</SelectItem>
                      <SelectItem value="Custom List">Custom List</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recipientType === "Specific Class" && (
                  <div>
                    <Label>Select Class</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASSES.map((cls) => (
                          <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 text-white gap-1">
                  <Users className="h-3 w-3" />
                  {recipientCount} Recipients
                </Badge>
                {recipientType === "Specific Class" && (
                  <span className="text-sm text-muted-foreground">from {selectedClass}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message Composer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Template</Label>
                <Select value={templateName} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(TEMPLATES).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Message</Label>
                  <span className={`text-xs ${charCount > 900 ? "text-red-500" : "text-muted-foreground"}`}>
                    {charCount}/1000
                  </span>
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                  rows={5}
                  placeholder="Type your message here..."
                  className="resize-none"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Insert Variable</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {VARIABLES.map((v) => (
                    <Button
                      key={v}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => insertVariable(v)}
                    >
                      <Plus className="h-3 w-3" />
                      {v}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  {showPreview ? "Hide" : "Show"} Preview
                </Button>
              </div>

              {showPreview && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    Message Preview (with sample data)
                  </p>
                  <div className="bg-white rounded-lg p-3 text-sm shadow-sm max-w-xs">
                    <p className="text-gray-800 whitespace-pre-wrap">{getPreviewMessage()}</p>
                    <p className="text-xs text-gray-400 text-right mt-2">
                      {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button
                  variant={scheduleType === "Send Now" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScheduleType("Send Now")}
                >
                  Send Now
                </Button>
                <Button
                  variant={scheduleType === "Schedule for Later" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScheduleType("Schedule for Later")}
                >
                  Schedule for Later
                </Button>
              </div>
              {scheduleType === "Schedule for Later" && (
                <div>
                  <Label>Schedule Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              <Button
                onClick={handleSend}
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Send className="h-4 w-4" />
                {scheduleType === "Send Now" ? "Send WhatsApp Message" : "Schedule WhatsApp Message"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Stats sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Total Parents", value: "847", color: "text-purple-600" },
                { label: "Total Students", value: "623", color: "text-purple-600" },
                { label: "Messages Sent Today", value: "1,247", color: "text-green-600" },
                { label: "Delivery Rate", value: "98.2%", color: "text-orange-600" },
              ].map((stat) => (
                <div key={stat.label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <span className={`font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Message</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Template:</span>
                  <span className="font-medium">{templateName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipients:</span>
                  <span className="font-medium">{recipientCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Characters:</span>
                  <span className="font-medium">{charCount}/1000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Schedule:</span>
                  <span className="font-medium">{scheduleType}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Sends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sends</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECENT_SENDS.map((send, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm">{send.date}</TableCell>
                  <TableCell className="text-sm">{send.recipients}</TableCell>
                  <TableCell className="text-sm">{send.template}</TableCell>
                  <TableCell className="text-sm">{send.count.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(send.status)}`}>
                      {send.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
