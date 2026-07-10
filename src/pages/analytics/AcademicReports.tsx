import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, Users, AlertCircle, Search,
  Download, Calendar, ArrowUpRight,
  ArrowDownRight, Brain, Sparkles, UserCheck,
  BookOpen, Award, BarChart3, PieChart as PieChartIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis
} from "recharts";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { num, avgBy, studentGrade, studentSection, exportCsv } from "./analyticsUtils";

export default function AcademicReports() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [students, setStudents] = useState<any[]>([]);
  const [examMarks, setExamMarks] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [st, marks] = await Promise.all([
          smartDb.getAll("students"),
          smartDb.getAll("ExamMark"),
        ]);
        setStudents(st || []);
        setExamMarks(marks || []);
      } catch (e) {
        console.error("Error loading academic data:", e);
      }
    })();
  }, []);

  const filteredStudents = useMemo(() => {
    if (gradeFilter === "all") return students;
    return students.filter((s) => studentGrade(s).replace(/\D/g, "") === gradeFilter);
  }, [students, gradeFilter]);

  // Real per-student average exam score, built from ExamMark rows shaped
  // { id: examId, uid, createdAt, updatedAt, [subject]: { [studentId]: number } }
  const studentScores = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const row of examMarks) {
      for (const [key, val] of Object.entries(row)) {
        if (["id", "uid", "createdAt", "updatedAt"].includes(key)) continue;
        if (!val || typeof val !== "object") continue;
        for (const [studentId, mark] of Object.entries(val as Record<string, unknown>)) {
          const n = Number(mark);
          if (!Number.isFinite(n)) continue;
          const entry = map.get(studentId) || { sum: 0, count: 0 };
          entry.sum += n;
          entry.count += 1;
          map.set(studentId, entry);
        }
      }
    }
    return map;
  }, [examMarks]);
  const avgScoreFor = (studentId: string) => {
    const e = studentScores.get(String(studentId));
    return e && e.count > 0 ? Math.round(e.sum / e.count) : null;
  };

  // Real per-subject average score, computed directly from ExamMark rows.
  const subjectData = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of examMarks) {
      for (const [key, val] of Object.entries(row)) {
        if (["id", "uid", "createdAt", "updatedAt"].includes(key)) continue;
        if (!val || typeof val !== "object") continue;
        const entry = totals.get(key) || { sum: 0, count: 0 };
        for (const mark of Object.values(val as Record<string, unknown>)) {
          const n = Number(mark);
          if (Number.isFinite(n)) { entry.sum += n; entry.count += 1; }
        }
        totals.set(key, entry);
      }
    }
    const rows = Array.from(totals.entries())
      .map(([subject, { sum, count }]) => ({ subject, score: count > 0 ? Math.round(sum / count) : 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return rows.length ? rows : [{ subject: "No exam marks recorded yet", score: 0 }];
  }, [examMarks]);

  // Performance by grade: real average exam score per grade (not attendance).
  const performanceData = useMemo(() => {
    const map = new Map<string, { scoreSum: number; scoreCount: number; attSum: number; attCount: number }>();
    for (const s of filteredStudents) {
      const g = studentGrade(s);
      const cur = map.get(g) || { scoreSum: 0, scoreCount: 0, attSum: 0, attCount: 0 };
      const score = avgScoreFor(s.id);
      if (score !== null) { cur.scoreSum += score; cur.scoreCount += 1; }
      cur.attSum += num(s.attendance);
      cur.attCount += 1;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([name, { scoreSum, scoreCount, attSum, attCount }]) => ({
        name,
        score: scoreCount ? Math.round(scoreSum / scoreCount) : 0,
        hasScore: scoreCount > 0,
        attendance: attCount ? Math.round(attSum / attCount) : 0,
        count: attCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [filteredStudents, studentScores]);

  // Status breakdown -> distribution donut
  const distributionData = useMemo(() => {
    const palette = ["#10b981", "#3b82f6", "#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4"];
    const map = new Map<string, number>();
    for (const s of filteredStudents) {
      const status = String(s.status || "Unknown").trim() || "Unknown";
      map.set(status, (map.get(status) || 0) + 1);
    }
    const rows = Array.from(map.entries()).map(([name, value], i) => ({
      name,
      value,
      color: palette[i % palette.length],
    }));
    return rows.length ? rows : [{ name: "No data", value: 1, color: "#cbd5e1" }];
  }, [filteredStudents]);

  const avgAttendance = useMemo(() => avgBy(filteredStudents, (s: any) => s.attendance), [filteredStudents]);

  // Scatter points: each student's real attendance vs. their real average
  // exam score (from ExamMark). Students with no recorded marks are
  // excluded rather than backfilled with attendance as a stand-in score.
  const scatterData = useMemo(
    () => filteredStudents
      .map((s) => ({ attendance: num(s.attendance), score: avgScoreFor(s.id) }))
      .filter((p): p is { attendance: number; score: number } => p.score !== null),
    [filteredStudents, studentScores],
  );

  // At-risk students: REAL students with attendance < 75, sorted ascending.
  const atRiskStudents = useMemo(() => {
    const matchesSearch = (s: any) => {
      const t = searchTerm.trim().toLowerCase();
      if (!t) return true;
      const name = String(s.name || `${s.firstName || ""} ${s.lastName || ""}`).toLowerCase();
      const cls = `${studentGrade(s)}-${studentSection(s)}`.toLowerCase();
      return name.includes(t) || cls.includes(t);
    };
    return filteredStudents
      .filter((s) => num(s.attendance) < 75)
      .filter(matchesSearch)
      .sort((a, b) => num(a.attendance) - num(b.attendance))
      .map((s, i) => {
        const att = num(s.attendance);
        const score = avgScoreFor(s.id);
        return {
          id: s.id ?? i,
          name: String(s.name || `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Student"),
          class: `${studentGrade(s).replace(/^Grade\s*/i, "")}-${studentSection(s)}`,
          score,
          attendance: att,
          risk: att < 60 ? "High" : "Medium",
          trend: "down" as const,
        };
      });
  }, [filteredStudents, searchTerm, studentScores]);

  const handleExport = () => {
    exportCsv("academic-report", [
      { metric: "Total Students", value: filteredStudents.length },
      { metric: "Avg Attendance %", value: avgAttendance.toFixed(1) },
      { metric: "At-Risk Count (<75%)", value: atRiskStudents.length },
      ...performanceData.map((g) => ({ metric: `Enrollment - ${g.name}`, value: g.count })),
      ...distributionData.map((d) => ({ metric: `Status - ${d.name}`, value: d.value })),
      ...atRiskStudents.map((s) => ({
        metric: `At-Risk - ${s.name} (${s.class})`,
        value: `${s.attendance}%`,
      })),
    ]);
  };

  // Real, derived insights — no fabricated numbers.
  const insights = useMemo(() => {
    const list: { title: string; desc: string }[] = [];
    const belowAtt = filteredStudents.filter((s) => num(s.attendance) < 75);
    if (belowAtt.length > 0) {
      const withScore = belowAtt.map((s) => avgScoreFor(s.id)).filter((n): n is number => n !== null);
      const withoutBelowScore = filteredStudents
        .filter((s) => num(s.attendance) >= 75)
        .map((s) => avgScoreFor(s.id))
        .filter((n): n is number => n !== null);
      if (withScore.length > 0 && withoutBelowScore.length > 0) {
        const avgLow = withScore.reduce((a, b) => a + b, 0) / withScore.length;
        const avgHigh = withoutBelowScore.reduce((a, b) => a + b, 0) / withoutBelowScore.length;
        const diff = avgHigh - avgLow;
        list.push({
          title: "Attendance & Score",
          desc: `Students below 75% attendance average ${Math.round(avgLow)}% in exams, vs ${Math.round(avgHigh)}% for others — a ${Math.abs(Math.round(diff))} point ${diff >= 0 ? "gap" : "difference"}.`,
        });
      } else {
        list.push({
          title: "Attendance Risk",
          desc: `${belowAtt.length} student${belowAtt.length === 1 ? "" : "s"} below 75% attendance.`,
        });
      }
    }
    const scored = subjectData.filter((s) => s.score > 0);
    if (scored.length > 0) {
      const weakest = scored[scored.length - 1];
      const strongest = scored[0];
      if (weakest.subject !== strongest.subject) {
        list.push({ title: "Weakest Subject", desc: `${weakest.subject} has the lowest average score at ${weakest.score}%.` });
      }
      list.push({ title: "Strongest Subject", desc: `${strongest.subject} has the highest average score at ${strongest.score}%.` });
    }
    return list;
  }, [filteredStudents, subjectData, studentScores]);

  return (
    <div className="p-6 space-y-8 bg-slate-50/50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Academic Dashboard</h1>
            <p className="text-sm text-slate-400">Deep dive into student performance and learning outcomes.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button className="bg-[#9810fa] hover:bg-[#5b4bc4] gap-2" onClick={() => navigate("/behavior")}>
            <Sparkles className="h-4 w-4" />
            Open Behaviour & Interventions
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search students or classes..." 
                className="pl-10 bg-slate-50 border-none focus-visible:ring-1 ring-[#9810fa]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-[140px] bg-slate-50 border-none">
              <SelectValue placeholder="Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {Array.from(new Set(students.map((s) => studentGrade(s).replace(/\D/g, "")).filter(Boolean)))
                .sort((a, b) => Number(a) - Number(b))
                .map((g) => (
                  <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* AI Insights Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-none shadow-sm bg-indigo-50 border-l-4 border-indigo-500">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Brain className="h-6 w-6 text-purple-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                  Academic Insights
                  {insights.length > 0 && (
                    <Badge className="bg-indigo-200 text-indigo-700 border-none">{insights.length} New</Badge>
                  )}
                </h3>
                {insights.length > 0 ? (
                  <ul className="space-y-2">
                    {insights.map((insight, i) => (
                      <li key={i} className="text-sm text-indigo-800 flex items-center gap-2">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        {insight.desc}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-indigo-700">Not enough exam mark and attendance data yet to generate insights.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-blue-500" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-4">
              {distributionData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-medium text-slate-500 uppercase">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              Subject Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="subject" type="category" axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="score" fill="#9810fa" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-500" />
              Attendance vs Score
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="attendance" name="Attendance" unit="%" fontSize={10} />
                  <YAxis type="number" dataKey="score" name="Score" unit="%" fontSize={10} />
                  <ZAxis type="number" range={[50, 400]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Students" data={scatterData} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 text-center px-6">
                No students have recorded exam marks yet — this chart needs both attendance and exam data.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* At-Risk Students Table */}
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                At-Risk Students
              </CardTitle>
              <CardDescription>Students requiring immediate academic intervention.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Class</th>
                  <th className="px-6 py-4">Avg Score</th>
                  <th className="px-6 py-4">Attendance</th>
                  <th className="px-6 py-4">Risk Level</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {atRiskStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                      No at-risk students (all above 75% attendance).
                    </td>
                  </tr>
                )}
                {atRiskStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                          {(student.name || "ST").split(' ').map(n => n[0] || "").join('')}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{student.class}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">{student.score !== null ? `${student.score}%` : "No marks"}</span>
                        {student.trend === 'down' ? (
                          <ArrowDownRight className="h-3 w-3 text-rose-500" />
                        ) : student.trend === 'up' ? (
                          <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{student.attendance}%</td>
                    <td className="px-6 py-4">
                      <Badge className={cn(
                        "border-none",
                        student.risk === 'High' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {student.risk}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Button
                          variant="ghost" size="sm"
                          className="text-slate-500 font-bold hover:text-[#9810fa] hover:bg-[#9810fa]/5 rounded-xl px-4"
                          onClick={() => navigate(`/students?id=${student.id}`)}
                        >
                          Profile
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold rounded-xl px-5 shadow-sm shadow-[#9810fa]/20"
                          onClick={() => navigate("/communication/messages")}
                        >
                          Intervene
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
