import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Search, Users, Home, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { notifyParentsOfStudents } from "@/lib/classPublishNotify";

interface HostelAllocation {
  id: string;
  studentName: string;
  studentId: string;
  room: string;
  block: string;
  status: string;
}

type Status = "Present" | "Absent" | "On Leave";

// Real nightly roll-call for boarders — did not exist at all before. Roster
// is derived from real HostelAllocation records (Allocation.tsx), and marks
// persist as real `HostelAttendanceRecord` rows keyed by student+date, same
// upsert-by-deterministic-id pattern as the main Attendance.tsx page. An
// absent boarder triggers the same real parent notification used by daily
// school attendance — a boarder not present in their room overnight is
// exactly the kind of thing a parent needs to know about immediately.
export default function HostelAttendance() {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [allocations, setAllocations] = useState<HostelAllocation[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [allocs, records] = await Promise.all([
          smartDb.getAll("HostelAllocation", undefined),
          smartDb.getAll("HostelAttendanceRecord", undefined),
        ]);
        if (cancelled) return;
        const active = (allocs as HostelAllocation[]).filter((a) => a.status === "Active");
        setAllocations(active);
        const todays = (records as any[]).filter((r) => r.date === date);
        const map: Record<string, Status> = {};
        todays.forEach((r) => { map[r.studentId] = r.status; });
        setMarks(map);
      } catch (error) {
        console.error("Failed to load hostel attendance:", error);
        toast.error("Failed to load hostel roster");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  const filtered = useMemo(
    () => allocations.filter((a) =>
      !search ||
      a.studentName.toLowerCase().includes(search.toLowerCase()) ||
      a.room.toLowerCase().includes(search.toLowerCase())
    ),
    [allocations, search]
  );

  const setMark = (studentId: string, status: Status) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  };

  const summary = useMemo(() => {
    const present = allocations.filter((a) => marks[a.studentId] === "Present").length;
    const absent = allocations.filter((a) => marks[a.studentId] === "Absent").length;
    const onLeave = allocations.filter((a) => marks[a.studentId] === "On Leave").length;
    return { present, absent, onLeave, total: allocations.length };
  }, [allocations, marks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        allocations.map((a) => {
          const status = marks[a.studentId] || "Present";
          const id = `HATT-${a.studentId}-${date}`;
          return smartDb.create("HostelAttendanceRecord", {
            id, studentId: a.studentId, studentName: a.studentName,
            room: a.room, block: a.block, status, date, uid: user?.uid, createdAt: now,
          }, id);
        })
      );
      toast.success(`Hostel attendance for ${date} saved`);

      const flagged = allocations.filter((a) => marks[a.studentId] === "Absent");
      if (flagged.length) {
        notifyParentsOfStudents(
          flagged.map((a) => ({
            id: a.studentId, name: a.studentName,
            message: `${a.studentName} was marked Absent from hostel roll-call on ${new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })} (Room ${a.room}).`,
          })),
          { entity: "HostelAttendance", type: "hostel_attendance_marked", title: "Hostel Attendance Alert", sourceId: `HATT-${date}`, grade: "", section: "", redirectUrl: "/parent/attendance" }
        ).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to save hostel attendance:", error);
      toast.error("Failed to save hostel attendance");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const header = "Student,Room,Block,Status,Date\n";
    const rows = allocations.map((a) => `"${a.studentName}","${a.room}","${a.block}","${marks[a.studentId] || "Present"}","${date}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hostel-attendance-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Home className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Hostel Attendance</h1>
              <p className="text-sm text-slate-400">Nightly roll-call for boarding students</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button variant="outline" onClick={handleExport} disabled={allocations.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button onClick={handleSave} disabled={saving || loading || allocations.length === 0}>
              {saving ? "Saving…" : "Save Roll-Call"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Boarders", value: summary.total, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Present", value: summary.present, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Absent", value: summary.absent, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50" },
            { label: "On Leave", value: summary.onLeave, icon: Home, color: "text-amber-600", bg: "bg-amber-50" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-5 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", s.bg)}><s.icon className={cn("h-5 w-5", s.color)} /></div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Boarder Roster — {date}</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name or room…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-10">Loading roster…</p>
            ) : allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No active hostel allocations yet — assign students to rooms in Room Allocation first.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const status = marks[a.studentId] || "Present";
                    return (
                      <TableRow key={a.studentId}>
                        <TableCell className="font-medium">{a.studentName}</TableCell>
                        <TableCell>{a.room}</TableCell>
                        <TableCell>{a.block}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {(["Present", "Absent", "On Leave"] as Status[]).map((s) => (
                              <button
                                key={s}
                                onClick={() => setMark(a.studentId, s)}
                                className={cn(
                                  "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                                  status === s
                                    ? s === "Present" ? "bg-emerald-500 text-white border-emerald-500"
                                      : s === "Absent" ? "bg-rose-500 text-white border-rose-500"
                                      : "bg-amber-500 text-white border-amber-500"
                                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
