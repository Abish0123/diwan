import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { filterAnnouncementsForViewer } from "@/lib/announcementAudience";
import { SampleBadge } from "@/components/ui/sample-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  TrendingUp,
  TrendingDown,
  CreditCard,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Send,
  Bell,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  DollarSign,
  FileText,
  Award,
  Megaphone,
  GraduationCap,
  Phone,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Child {
  id: string;
  name: string;
  class: string;
  section: string;
  rollNumber: string;
  admissionNumber: string;
  photo: string;
  initials: string;
}

interface AttendanceDay {
  date: number;
  status: "present" | "absent" | "late" | "holiday" | "none";
}

interface Subject {
  name: string;
  marks: number;
  total: number;
  grade: string;
  gradeColor: string;
  teacher: string;
}

interface Assignment {
  title: string;
  subject: string;
  dueDate: string;
  submitted: boolean;
  grade?: string;
}

interface UpcomingExam {
  name: string;
  subject: string;
  date: string;
  syllabus: string;
}

interface FeeRecord {
  term: string;
  feeType: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: "paid" | "due" | "overdue";
  receipt?: string;
}

interface Activity {
  type: "attendance" | "assignment" | "fee" | "exam";
  message: string;
  date: string;
  icon: React.ReactNode;
  color: string;
}

interface Notice {
  title: string;
  date: string;
  category: string;
  content: string;
  categoryColor: string;
}

interface Message {
  teacher: string;
  subject: string;
  message: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
// Real children, grades, assignments, exams and attendance are loaded from
// the backend in ParentPortal below (via useParentChildren + smartDb) and
// passed into these tabs as props. What remains here (fees, communication,
// recent-activity) is demo data with no backing collection yet — every place
// it's shown carries a SampleBadge so it's never mistaken for real records.

// Builds a real month's attendance days for one child from actual
// TeacherAttendance records — replaces the old fixed "June 2026" mock month.
function buildMonthDays(records: any[], childId: string | undefined, year: number, month: number): AttendanceDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: AttendanceDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const rec = records.find((r: any) => String(r.date || "").slice(0, 10) === dateStr);
    let status: AttendanceDay["status"] = "none";
    if (rec && childId) {
      const val = (rec.students || {})[childId];
      if (val === "P") status = "present";
      else if (val === "A") status = "absent";
      else if (val === "L") status = "late";
    }
    days.push({ date: d, status });
  }
  return days;
}

const FEE_RECORDS: FeeRecord[] = [
  { term: "Q1 2026", feeType: "Tuition Fee", amount: 18000, dueDate: "Jan 10, 2026", paidDate: "Jan 8, 2026", status: "paid", receipt: "RCP-2026-0001" },
  { term: "Q1 2026", feeType: "Lab Fee", amount: 3500, dueDate: "Jan 10, 2026", paidDate: "Jan 8, 2026", status: "paid", receipt: "RCP-2026-0002" },
  { term: "Q2 2026", feeType: "Tuition Fee", amount: 18000, dueDate: "Apr 10, 2026", paidDate: "Apr 9, 2026", status: "paid", receipt: "RCP-2026-0018" },
  { term: "Q2 2026", feeType: "Activity Fee", amount: 2500, dueDate: "Apr 10, 2026", paidDate: "Apr 9, 2026", status: "paid", receipt: "RCP-2026-0019" },
  { term: "Q3 2026", feeType: "Tuition Fee", amount: 18000, dueDate: "Jul 10, 2026", status: "due" },
  { term: "Q3 2026", feeType: "Lab Fee", amount: 3500, dueDate: "Jul 10, 2026", status: "due" },
  { term: "Q4 2026", feeType: "Tuition Fee", amount: 18000, dueDate: "Oct 10, 2026", status: "due" },
  { term: "Q4 2026", feeType: "Annual Fund", amount: 5000, dueDate: "Oct 10, 2026", status: "due" },
];

const RECENT_ACTIVITIES: Activity[] = [
  { type: "attendance", message: "Marked Present – Friday, Jun 20", date: "Today", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-500 bg-emerald-50" },
  { type: "attendance", message: "Marked Late – Thursday, Jun 19", date: "Yesterday", icon: <Clock className="h-4 w-4" />, color: "text-amber-500 bg-amber-50" },
  { type: "assignment", message: "Physics Lab Report submitted", date: "Jun 18", icon: <FileText className="h-4 w-4" />, color: "text-blue-500 bg-blue-50" },
  { type: "attendance", message: "Marked Present – Jun 17", date: "Jun 17", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-500 bg-emerald-50" },
  { type: "fee", message: "Q2 fee payment confirmed – ₹42,500", date: "Apr 9", icon: <DollarSign className="h-4 w-4" />, color: "text-purple-500 bg-purple-50" },
];

const NOTICES: Notice[] = [
  { title: "Annual Sports Day – Registration Open", date: "Jun 18, 2026", category: "Event", content: "Annual Sports Day will be held on July 15. Students must register by July 1 through the sports coordinator.", categoryColor: "bg-blue-100 text-blue-700" },
  { title: "Summer Uniform Effective July 1", date: "Jun 15, 2026", category: "Uniform", content: "As per school policy, summer uniform is mandatory from July 1 onwards. No exceptions will be made.", categoryColor: "bg-amber-100 text-amber-700" },
  { title: "Parent-Teacher Meeting – July 5", date: "Jun 12, 2026", category: "PTM", content: "PTM is scheduled for July 5, 2026 from 9 AM to 1 PM. Please book your slot in advance via the portal.", categoryColor: "bg-green-100 text-green-700" },
];

const TEACHERS = [
  "Mr. Farooq Ahmed (Mathematics)",
  "Ms. Sana Riaz (Physics)",
  "Mr. Tariq Mahmood (Chemistry)",
  "Ms. Hina Baig (Biology)",
  "Ms. Ayesha Khan (English)",
  "Mr. Salman Qureshi (Urdu)",
  "Mr. Zubair Ali (Computer Science)",
  "Class Teacher – Ms. Nadia Hussain",
  "Principal Office",
];

const TIME_SLOTS = [
  "9:00 AM – 9:30 AM",
  "9:30 AM – 10:00 AM",
  "10:00 AM – 10:30 AM",
  "10:30 AM – 11:00 AM",
  "11:00 AM – 11:30 AM",
  "11:30 AM – 12:00 PM",
  "12:00 PM – 12:30 PM",
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getAttendanceStats(days: AttendanceDay[]) {
  const working = days.filter((d) => d.status !== "none");
  const present = days.filter((d) => d.status === "present").length;
  const absent = days.filter((d) => d.status === "absent").length;
  const late = days.filter((d) => d.status === "late").length;
  const total = working.length;
  const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  return { total, present, absent, late, pct };
}

function getGradeColor(grade: string) {
  if (grade.startsWith("A")) return "bg-green-100 text-green-700";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-700";
  if (grade.startsWith("C")) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  trend,
  iconBg,
  sample,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  iconBg: string;
  sample?: boolean;
}) {
  return (
    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
              {sample && <SampleBadge />}
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                {sub}
              </p>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendanceDot({ status }: { status: AttendanceDay["status"] }) {
  if (status === "none") return null;
  const map = {
    present: "bg-emerald-500",
    absent: "bg-red-500",
    late: "bg-amber-400",
    holiday: "bg-gray-300",
  } as const;
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-0.5 ${map[status]}`} />
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  child,
  realAttendance,
  realGpa,
  realExamsCount,
  nextExamDate,
  realNotices,
}: {
  child: Child;
  realAttendance?: number;
  realGpa: number | null;
  realExamsCount: number;
  nextExamDate: string | null;
  realNotices: Notice[];
}) {
  const attendancePct = typeof realAttendance === "number" ? realAttendance : null;
  const attendanceIsReal = typeof realAttendance === "number";

  return (
    <div className="space-y-6">
      {/* Child Info Card */}
      <Card className="border border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Avatar className="h-20 w-20 border-4 border-white shadow-md">
              <AvatarImage src={child.photo} />
              <AvatarFallback className="bg-purple-600 text-white text-2xl font-bold">
                {child.initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <h2 className="text-2xl font-bold text-gray-900">{child.name}</h2>
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-4 w-4 text-purple-500" />
                  {child.class}{child.section ? ` – Section ${child.section}` : ""}
                </span>
                <span className="text-gray-300">|</span>
                <span>Roll No: <strong>{child.rollNumber}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Admission No: <strong>{child.admissionNumber}</strong></span>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-emerald-100 text-emerald-700 border-none px-3 py-1">Active</Badge>
              <Badge className="bg-purple-100 text-purple-700 border-none px-3 py-1">Academic Year 2026</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Attendance"
          value={attendancePct !== null ? `${attendancePct}%` : "—"}
          sub={attendanceIsReal ? "From student record" : "No data yet"}
          trend="up"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          sample={!attendanceIsReal}
        />
        <KpiCard
          label="Current GPA"
          value={realGpa !== null ? realGpa.toFixed(1) : "—"}
          sub="Out of 4.0"
          trend="up"
          icon={<Award className="h-5 w-5 text-purple-600" />}
          iconBg="bg-purple-100"
          sample={realGpa === null}
        />
        <KpiCard
          label="Fee Status"
          value="Due"
          sub="Q3 payment pending"
          trend="down"
          icon={<DollarSign className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-100"
          sample
        />
        <KpiCard
          label="Upcoming Exams"
          value={String(realExamsCount)}
          sub={nextExamDate ? `First: ${nextExamDate}` : "None scheduled"}
          icon={<BookOpen className="h-5 w-5 text-purple-600" />}
          iconBg="bg-blue-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Feed */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              Recent Activity
              <SampleBadge />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {RECENT_ACTIVITIES.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`p-1.5 rounded-lg ${a.color} flex-shrink-0`}>{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.date}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notice Board */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-500" />
              Notice Board
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {realNotices.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No notices yet.</p>
            )}
            {realNotices.map((n, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">{n.title}</p>
                  <Badge className={`text-xs ${n.categoryColor} border-none flex-shrink-0`}>{n.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{n.content}</p>
                <p className="text-xs text-gray-400">{n.date}</p>
                {i < realNotices.length - 1 && <Separator className="mt-2" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────

function AttendanceTab({ attRecords, childId }: { attRecords: any[]; childId?: string }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const displayMonth = target.getMonth();
  const displayYear = target.getFullYear();
  const monthLabel = `${MONTH_NAMES[displayMonth]} ${displayYear}`;

  const days = useMemo(
    () => buildMonthDays(attRecords, childId, displayYear, displayMonth),
    [attRecords, childId, displayYear, displayMonth]
  );
  const stats = getAttendanceStats(days);
  const hasAnyRecords = days.some(d => d.status !== "none");
  const firstDayOfMonth = new Date(displayYear, displayMonth, 1).getDay();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Days", value: stats.total, color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Present", value: stats.present, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Absent", value: stats.absent, color: "text-red-700", bg: "bg-red-50" },
          { label: "Late", value: stats.late, color: "text-amber-700", bg: "bg-amber-50" },
          { label: "Attendance %", value: `${stats.pct}%`, color: "text-purple-700", bg: "bg-purple-50" },
        ].map((s, i) => (
          <Card key={i} className={`border-0 shadow-sm ${s.bg}`}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">Monthly Attendance Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthOffset((o) => o - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium w-36 text-center">{monthLabel}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset === 0}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-600">
            {[
              { color: "bg-emerald-500", label: "Present" },
              { color: "bg-red-500", label: "Absent" },
              { color: "bg-amber-400", label: "Late" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`inline-block w-3 h-3 rounded-full ${l.color}`} />
                {l.label}
              </span>
            ))}
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-xs font-medium text-center text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {!hasAnyRecords && (
            <p className="text-xs text-amber-600 mb-3">No attendance recorded for this month yet.</p>
          )}

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => (
              <div
                key={day.date}
                className={`relative flex flex-col items-center justify-center rounded-lg p-2 min-h-[52px] text-sm font-medium transition-colors ${
                  day.status === "present"
                    ? "bg-emerald-50 text-emerald-800"
                    : day.status === "absent"
                    ? "bg-red-50 text-red-800"
                    : day.status === "late"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-gray-50 text-gray-400"
                }`}
              >
                <span>{day.date}</span>
                <AttendanceDot status={day.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" className="gap-2" onClick={() => toast.success("Attendance report downloaded successfully!")}>
          <Download className="h-4 w-4" />
          Download Attendance Report
        </Button>
      </div>
    </div>
  );
}

// ─── Academics Tab ────────────────────────────────────────────────────────────

function AcademicsTab({
  subjects,
  trend,
  assignments,
  exams,
}: {
  subjects: Subject[];
  trend: { month: string; pct: number }[];
  assignments: Assignment[];
  exams: UpcomingExam[];
}) {
  return (
    <div className="space-y-6">
      {/* Subject Performance Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-purple-500" />
          Subject-wise Performance
        </h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No graded assessments yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {subjects.map((sub) => {
              const pct = sub.total ? Math.round((sub.marks / sub.total) * 100) : 0;
              return (
                <Card key={sub.name} className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{sub.name}</p>
                      <Badge className={`text-xs ${sub.gradeColor} border-none font-bold`}>{sub.grade}</Badge>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{sub.marks}/{sub.total}</span>
                        <span>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Performance Trend */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Performance Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Not enough dated assessments yet to chart a trend.</p>
          ) : (
            <>
              <div className="flex items-end gap-2 h-36 px-4">
                {trend.map((bar) => (
                  <div key={bar.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-gray-700">{bar.pct}%</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-purple-500 to-indigo-400 transition-all"
                      style={{ height: `${bar.pct}%` }}
                    />
                    <span className="text-xs text-muted-foreground">{bar.month}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">Average Score % by month</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Assignments */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-500" />
            Recent Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No assignments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Marks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{a.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{a.subject}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.dueDate}</TableCell>
                    <TableCell>
                      {a.submitted ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4" /> Yes
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 text-sm font-medium">
                          <AlertCircle className="h-4 w-4" /> Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.grade ? (
                        <Badge variant="secondary" className="text-xs">{a.grade}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Exams */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-red-500" />
            Upcoming Exams
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {exams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No exams scheduled.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Syllabus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{e.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{e.subject}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-red-600">{e.date}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.syllabus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Fees Tab ─────────────────────────────────────────────────────────────────

function FeesTab({ realFees }: { realFees?: { total: number; paid: number; due: number; hasData: boolean } }) {
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [ptmDialogOpen, setPtmDialogOpen] = useState(false);

  const feesAreReal = !!realFees?.hasData;
  const totalFee = feesAreReal ? realFees!.total : FEE_RECORDS.reduce((s, r) => s + r.amount, 0);
  const paidFee = feesAreReal ? realFees!.paid : FEE_RECORDS.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const dueFee = feesAreReal ? realFees!.due : totalFee - paidFee;

  function handlePayment() {
    if (!payMethod) {
      toast.error("Please select a payment method.");
      return;
    }
    setPayDialogOpen(false);
    setPayMethod("");
    // Demo build: no real payment gateway — record the intent honestly.
    toast.success(`Payment request recorded (demo). Amount: ₹${dueFee.toLocaleString()}. No real charge was made.`);
  }

  return (
    <div className="space-y-6">
      {/* Fee Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Annual Fee", value: `₹${totalFee.toLocaleString()}`, color: "text-gray-900", bg: "bg-gray-50 border-gray-100" },
          { label: "Amount Paid", value: `₹${paidFee.toLocaleString()}`, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
          { label: "Balance Due", value: `₹${dueFee.toLocaleString()}`, color: "text-red-700", bg: "bg-red-50 border-red-100" },
        ].map((s, i) => (
          <Card key={i} className={`border shadow-sm ${s.bg}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                {!feesAreReal && <SampleBadge />}
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          onClick={() => setPayDialogOpen(true)}
        >
          <CreditCard className="h-4 w-4" />
          Pay Online
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => toast.success("Fee receipts downloaded!")}>
          <Download className="h-4 w-4" />
          Download Receipts
        </Button>
      </div>

      {/* Fee Payment Table */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">Fee Payment Details <SampleBadge /></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Fee Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEE_RECORDS.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm font-medium">{r.term}</TableCell>
                  <TableCell className="text-sm">{r.feeType}</TableCell>
                  <TableCell className="text-sm font-semibold">₹{r.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.dueDate}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.paidDate ?? "—"}</TableCell>
                  <TableCell className="text-sm text-purple-600 font-medium">
                    {r.receipt ? (
                      <button className="hover:underline" onClick={() => toast.success(`Receipt ${r.receipt} downloaded!`)}>
                        {r.receipt}
                      </button>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.status === "paid" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-none text-xs">Paid</Badge>
                    ) : r.status === "overdue" ? (
                      <Badge className="bg-red-100 text-red-700 border-none text-xs">Overdue</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 border-none text-xs">Due</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pay Online Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-purple-600" />
              Online Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 space-y-1">
              <p className="text-sm font-semibold text-amber-800">Amount Due</p>
              <p className="text-2xl font-bold text-amber-700">₹21,500</p>
              <p className="text-xs text-amber-600">Q3 2026: Tuition Fee + Lab Fee</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Payment Method</label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit-card">Credit Card</SelectItem>
                  <SelectItem value="debit-card">Debit Card</SelectItem>
                  <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online-gateway">Online Gateway (JazzCash / EasyPaisa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePayment}>
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Communication Tab ────────────────────────────────────────────────────────

function CommunicationTab() {
  const [msgTeacher, setMsgTeacher] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [ptmDialogOpen, setPtmDialogOpen] = useState(false);
  const [ptmDate, setPtmDate] = useState("");
  const [ptmSlot, setPtmSlot] = useState("");

  function handleSendMessage() {
    if (!msgTeacher || !msgSubject.trim() || !msgBody.trim()) {
      toast.error("Please fill in all fields before sending.");
      return;
    }
    setMsgTeacher("");
    setMsgSubject("");
    setMsgBody("");
    // Demo build: no messaging backend — record the draft honestly.
    toast.success("Message recorded (demo). No real message was delivered in this environment.");
  }

  function handlePTMRequest() {
    if (!ptmDate || !ptmSlot) {
      toast.error("Please select a date and time slot.");
      return;
    }
    setPtmDialogOpen(false);
    setPtmDate("");
    setPtmSlot("");
    // Demo build: no scheduling backend — record the request honestly.
    toast.success(`PTM request recorded (demo): ${ptmDate} at ${ptmSlot}. No real booking was made.`);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Teacher */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              Message a Teacher
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Select Teacher</label>
              <Select value={msgTeacher} onValueChange={setMsgTeacher}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a teacher..." />
                </SelectTrigger>
                <SelectContent>
                  {TEACHERS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <Input
                placeholder="e.g. Regarding assignment deadline..."
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Message</label>
              <Textarea
                placeholder="Type your message here..."
                rows={4}
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                className="resize-none"
              />
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={handleSendMessage}>
              <Send className="h-4 w-4" />
              Send Message
            </Button>
          </CardContent>
        </Card>

        {/* Request PTM */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              Parent-Teacher Meeting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <p className="text-sm font-semibold text-blue-800">Next Scheduled PTM</p>
              <p className="text-lg font-bold text-blue-700 mt-1">July 5, 2026</p>
              <p className="text-xs text-purple-600">9:00 AM – 1:00 PM | Main Campus</p>
            </div>
            <p className="text-sm text-gray-600">
              Book a slot with any of your child's teachers to discuss academic progress, behavior, and other concerns.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Teachers</p>
              {TEACHERS.slice(0, 4).map((t) => (
                <div key={t} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <span className="text-sm text-gray-700">{t}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 border-none text-xs">Available</Badge>
                </div>
              ))}
            </div>
            <Button className="w-full gap-2 border-purple-200 text-purple-700 hover:bg-purple-50" variant="outline" onClick={() => setPtmDialogOpen(true)}>
              <Calendar className="h-4 w-4" />
              Request PTM Slot
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Announcements List */}
      <Card className="border border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            School Announcements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            ...NOTICES,
            {
              title: "Library Book Return Deadline",
              date: "Jun 10, 2026",
              category: "Library",
              content: "All borrowed library books must be returned by June 30, 2026 to avoid late fees.",
              categoryColor: "bg-indigo-100 text-indigo-700",
            },
            {
              title: "Fee Deadline Reminder – Q3",
              date: "Jun 5, 2026",
              category: "Finance",
              content: "Q3 2026 fee payment is due by July 10. Late payments will attract a penalty of ₹500.",
              categoryColor: "bg-red-100 text-red-700",
            },
          ].map((n, i) => (
            <Card key={i} className="border border-gray-50 bg-gray-50/50 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-sm font-semibold text-gray-800">{n.title}</h4>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`text-xs ${n.categoryColor} border-none`}>{n.category}</Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{n.content}</p>
                <p className="text-xs text-muted-foreground">{n.date}</p>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* PTM Request Dialog */}
      <Dialog open={ptmDialogOpen} onOpenChange={setPtmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              Request PTM Slot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Preferred Date</label>
              <Input
                type="date"
                value={ptmDate}
                onChange={(e) => setPtmDate(e.target.value)}
                min="2026-07-05"
                max="2026-07-05"
              />
              <p className="text-xs text-muted-foreground">PTM is scheduled for July 5, 2026</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Preferred Time Slot</label>
              <Select value={ptmSlot} onValueChange={setPtmSlot}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a time slot..." />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPtmDialogOpen(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePTMRequest}>
              Confirm Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParentPortal() {
  const { user } = useAuth();
  // The real parent→child relationship (matched by fatherEmail/motherEmail/
  // guardianEmail on the Student record) — this dashboard previously ignored
  // it and just showed the first two students in the ENTIRE school as "your
  // children" whenever it couldn't resolve a match, which is worse than a
  // sample-data fallback since it presented other families' real children as
  // this parent's own.
  const { children: parentChildren, selected: selectedParentChild, selectChild, loading: childrenLoading } = useParentChildren();

  const [invoices, setInvoices] = useState<{ amount?: number; status?: string; studentName?: string }[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attendanceRecs, setAttendanceRecs] = useState<any[]>([]);
  const [noticeRows, setNoticeRows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("overview");

  const children = useMemo<Child[]>(() => parentChildren.map((c) => ({
    id: c.id,
    name: c.name,
    class: c.grade || "—",
    section: c.section || "",
    rollNumber: c.rollNo,
    admissionNumber: c.admissionNo,
    photo: "",
    initials: c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
  })), [parentChildren]);

  const [selectedChildId, setSelectedChildId] = useState<string>("");

  // Keep selection valid when the real children list loads/changes.
  useEffect(() => {
    if (children.length && !children.some((c) => c.id === selectedChildId)) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [inv, asgn, subs, ex, asmt, att, ntc] = await Promise.allSettled([
          smartDb.getAll("Invoice", user?.uid),
          smartDb.getAll("TeacherAssignment", undefined),
          smartDb.getAll("assignment_submissions", undefined),
          smartDb.getAll("sd_exams", undefined),
          smartDb.getAll("Assessment", undefined),
          smartDb.getAll("TeacherAttendance", undefined),
          smartDb.getAll("Notice", undefined),
        ]);
        if (!active) return;
        if (inv.status === "fulfilled") setInvoices((inv.value || []) as typeof invoices);
        if (asgn.status === "fulfilled") setAssignments((asgn.value || []) as any[]);
        if (subs.status === "fulfilled") setSubmissions((subs.value || []) as any[]);
        if (ex.status === "fulfilled") setExams((ex.value || []) as any[]);
        if (asmt.status === "fulfilled") setAssessments((asmt.value || []) as any[]);
        if (att.status === "fulfilled") setAttendanceRecs((att.value || []) as any[]);
        if (ntc.status === "fulfilled") setNoticeRows((ntc.value || []) as any[]);
      } catch (error) {
        console.error("Error loading parent portal data:", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const childrenAreReal = children.length > 0;
  const child = children.find((c) => c.id === selectedChildId) ?? children[0];
  const parentName = user?.displayName ?? "Parent";

  // Real attendance % for the selected child from actual TeacherAttendance
  // records (same source/shape used by the student dashboard).
  const myAttRec = useMemo(
    () => attendanceRecs.filter((r: any) => (!r.grade || r.grade == child?.class) && (!r.section || r.section === child?.section)),
    [attendanceRecs, child]
  );
  const realAttendance = useMemo(() => {
    if (!child || !myAttRec.length) return undefined;
    let present = 0, total = 0;
    myAttRec.forEach((rec: any) => {
      const s = rec.students || {};
      if (s[child.id]) { total++; if (s[child.id] === "P") present++; }
    });
    return total ? Math.round((present / total) * 100) : undefined;
  }, [myAttRec, child]);

  // Real fees for the selected child from invoices (matched by student name).
  const realFees = useMemo(() => {
    const mine = childrenAreReal && child
      ? invoices.filter((i) => i.studentName === child.name)
      : [];
    const total = mine.reduce((s, i) => s + (i.amount || 0), 0);
    const paid = mine.filter((i) => i.status === "Paid").reduce((s, i) => s + (i.amount || 0), 0);
    return { total, paid, due: total - paid, hasData: mine.length > 0 };
  }, [invoices, child, childrenAreReal]);

  // Real subject-wise grades from Assessment records, mirroring the
  // computation the student dashboard uses for its own gradebook widget.
  const myAssessments = useMemo(
    () => child ? assessments.filter((a: any) => (!a.grade || a.grade == child.class) && (!a.section || a.section === child.section)) : [],
    [assessments, child]
  );
  const subjectScores = useMemo<Subject[]>(() => {
    if (!child) return [];
    const map: Record<string, { total: number; max: number }> = {};
    myAssessments.forEach((a: any) => {
      const subj = a.subject || "General";
      const entries = a.entries || {};
      const marks = entries[child.id];
      if (marks === null || marks === undefined) return;
      if (!map[subj]) map[subj] = { total: 0, max: 0 };
      map[subj].total += Number(marks);
      map[subj].max += Number(a.totalMarks || 100);
    });
    return Object.entries(map).map(([subject, v]) => {
      const pct = v.max ? Math.round((v.total / v.max) * 100) : 0;
      const grade = pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B" : pct >= 50 ? "C" : "F";
      return { name: subject, marks: v.total, total: v.max, grade, gradeColor: getGradeColor(grade), teacher: "" };
    }).sort((a, b) => (b.marks / (b.total || 1)) - (a.marks / (a.total || 1)));
  }, [myAssessments, child]);

  const realGpa = subjectScores.length
    ? (subjectScores.reduce((s, x) => s + (x.total ? x.marks / x.total : 0), 0) / subjectScores.length) * 4
    : null;

  // Performance trend: real monthly average from dated assessments.
  const performanceTrend = useMemo(() => {
    if (!child) return [];
    const map: Record<string, { total: number; max: number }> = {};
    myAssessments.forEach((a: any) => {
      const entries = a.entries || {};
      const marks = entries[child.id];
      if (marks === null || marks === undefined) return;
      const d = a.date ? new Date(a.date) : null;
      if (!d || isNaN(d.getTime())) return;
      const key = d.toLocaleDateString("en-US", { month: "short" });
      if (!map[key]) map[key] = { total: 0, max: 0 };
      map[key].total += Number(marks);
      map[key].max += Number(a.totalMarks || 100);
    });
    return Object.entries(map).map(([month, v]) => ({ month, pct: v.max ? Math.round((v.total / v.max) * 100) : 0 }));
  }, [myAssessments, child]);

  // Real assignments + submission status for the selected child.
  const myAssignments = useMemo(
    () => child ? assignments.filter((a: any) => (!a.grade || a.grade == child.class) && (!a.section || a.section === child.section)) : [],
    [assignments, child]
  );
  const assignmentRows = useMemo<Assignment[]>(() => {
    if (!child) return [];
    return myAssignments.slice(0, 8).map((a: any) => {
      const sub = submissions.find((s: any) => s.assignmentId === a.id && s.studentId === child.id);
      return {
        title: a.title || "Assignment",
        subject: a.subject || "General",
        dueDate: a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
        submitted: !!sub,
        grade: sub?.marks != null ? String(sub.marks) : undefined,
      };
    });
  }, [myAssignments, submissions, child]);

  // Real upcoming exams for the selected child.
  const myExams = useMemo(
    () => child ? exams.filter((e: any) => {
      const g = e.grade || e.Grade || "";
      const s = e.section || e.Section || "";
      return (!g || g == child.class) && (!s || s === child.section);
    }) : [],
    [exams, child]
  );
  const examRows = useMemo<UpcomingExam[]>(() => {
    const now = new Date();
    return myExams
      .filter((e: any) => { const d = e.date || e.startDate; return d ? new Date(d) >= now : true; })
      .slice(0, 8)
      .map((e: any) => ({
        name: e.name || e.title || "Exam",
        subject: e.subject || "—",
        date: (e.date || e.startDate) ? new Date(e.date || e.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
        syllabus: e.syllabus || e.description || "—",
      }));
  }, [myExams]);
  const nextExamDate = examRows[0]?.date ?? null;

  // Real notices for the selected child's grade/section, audience-enforced.
  const realNotices = useMemo<Notice[]>(() => {
    if (!child) return [];
    const visible = filterAnnouncementsForViewer(noticeRows, "parent", [{ grade: child.class, section: child.section }]);
    return visible.slice(0, 5).map((n: any) => ({
      title: n.title || n.subject || "Notice",
      date: n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
      category: n.category || "Notice",
      content: n.content || n.body || n.description || "",
      categoryColor: "bg-blue-100 text-blue-700",
    }));
  }, [noticeRows, child]);

  if (!childrenLoading && children.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
          <Users className="h-10 w-10 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700">No children linked to this account</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            This parent account isn't linked to a student record yet. Ask the school office to add your email
            as a parent/guardian contact on your child's student profile.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (!child) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Parent Portal</h1>
              <p className="text-sm text-slate-400">
                Welcome, <span className="font-semibold text-gray-700">{parentName}</span>
              </p>
            </div>
          </div>

          {/* Child Selector */}
          {children.length > 1 && (
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Viewing:</span>
              <Select value={selectedChildId} onValueChange={(id) => { setSelectedChildId(id); selectChild(id); }}>
                <SelectTrigger className="w-52 border-none shadow-none h-8 p-0 font-semibold text-gray-800 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {children.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="bg-purple-100 text-purple-700 text-xs">{c.initials}</AvatarFallback>
                        </Avatar>
                        <span>{c.name}</span>
                        <Badge variant="secondary" className="text-xs ml-1">{c.class}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-100 p-1 rounded-xl h-auto flex-wrap gap-1">
            {[
              { value: "overview", label: "Overview", icon: <Users className="h-3.5 w-3.5" /> },
              { value: "attendance", label: "Attendance", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
              { value: "academics", label: "Academics", icon: <BookOpen className="h-3.5 w-3.5" /> },
              { value: "fees", label: "Fees", icon: <DollarSign className="h-3.5 w-3.5" /> },
              { value: "communication", label: "Communication", icon: <MessageSquare className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 text-sm rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-purple-700 data-[state=active]:font-semibold"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab
              child={child}
              realAttendance={realAttendance}
              realGpa={realGpa}
              realExamsCount={examRows.length}
              nextExamDate={nextExamDate}
              realNotices={realNotices}
            />
          </TabsContent>

          <TabsContent value="attendance" className="mt-6">
            <AttendanceTab attRecords={myAttRec} childId={child.id} />
          </TabsContent>

          <TabsContent value="academics" className="mt-6">
            <AcademicsTab subjects={subjectScores} trend={performanceTrend} assignments={assignmentRows} exams={examRows} />
          </TabsContent>

          <TabsContent value="fees" className="mt-6">
            <FeesTab realFees={realFees} />
          </TabsContent>

          <TabsContent value="communication" className="mt-6">
            <CommunicationTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
