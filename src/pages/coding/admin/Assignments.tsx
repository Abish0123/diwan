import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Plus, Trash2, User, GraduationCap, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import {
  ensureCodingSeed, getTests, getAssignments, getRealClasses,
  getEnrolledStudents, ASSESSMENT_ASSIGNMENTS,
} from "@/lib/codingData";
import { logAudit } from "@/lib/codingAudit";
import {
  CodingTest, AssessmentAssignment, AssignmentTarget, SchoolClass, classLabel,
} from "@/types/coding";
import { AdminNav } from "@/components/coding/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";

const TARGET_META: Record<AssignmentTarget, { label: string; icon: React.ElementType }> = {
  student: { label: "Student", icon: User },
  class: { label: "Class", icon: GraduationCap },
};

export default function AssignmentsPage() {
  const { user, role } = useAuth();
  const editable = can(role, "assignment.manage");
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [assignments, setAssignments] = useState<AssessmentAssignment[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    testId: "", targetType: "class" as AssignmentTarget, targetLabel: "",
    attemptLimit: 1, retakeAllowed: false, passPercentage: 40,
    windowStart: "", windowEnd: "",
  });

  const load = async () => {
    await ensureCodingSeed();
    const [t, a, c, s] = await Promise.all([
      getTests(), getAssignments(), getRealClasses(), getEnrolledStudents(),
    ]);
    setTests(t || []); setAssignments(a || []); setClasses(c || []); setStudents(s || []);
  };
  useEffect(() => { load(); }, []);

  // How many real enrolled students the current target covers.
  const coverage = useMemo<number | null>(() => {
    if (form.targetType === "class" && form.targetLabel) {
      const cls = classes.find((c) => classLabel(c) === form.targetLabel);
      return cls?.studentCount ?? null;
    }
    return null;
  }, [form.targetType, form.targetLabel, classes]);

  const create = async () => {
    const test = tests.find((t) => t.id === form.testId);
    if (!test) return toast.error("Select a test");
    if (!form.targetLabel.trim()) return toast.error("Choose who to assign to");
    const a: AssessmentAssignment = {
      id: `asg_${Date.now()}`, testId: test.id, testTitle: test.title,
      targetType: form.targetType, targetLabel: form.targetLabel,
      attemptLimit: Number(form.attemptLimit) || 1, retakeAllowed: form.retakeAllowed,
      passPercentage: Number(form.passPercentage) || 40,
      windowStart: form.windowStart || undefined, windowEnd: form.windowEnd || undefined,
      assignedAt: new Date().toISOString(), assignedBy: user?.email,
    };
    await smartDb.create(ASSESSMENT_ASSIGNMENTS, a as never, a.id);
    await logAudit("Assessment assigned", "assessment_assignments", { user: user?.email, role },
      `${test.title} → ${TARGET_META[form.targetType].label}: ${form.targetLabel}` + (coverage != null ? ` (${coverage} students)` : ""));
    toast.success(coverage != null ? `Assigned to ${coverage} students` : "Assessment assigned");
    setOpen(false);
    setForm({ ...form, targetLabel: "" });
    load();
  };

  const remove = async (a: AssessmentAssignment) => {
    await smartDb.delete(ASSESSMENT_ASSIGNMENTS, a.id);
    await logAudit("Assignment removed", "assessment_assignments", { user: user?.email, role }, `${a.testTitle} → ${a.targetLabel}`);
    load();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Send className="h-5 w-5 text-[#9810fa]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Assessment Assignment</h1>
            <p className="text-sm text-slate-500">Assign tests to a real class or an individual student, with attempt rules.</p>
          </div>
        </div>
        {editable ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#9810fa] hover:bg-[#5d1899]"><Plus className="h-4 w-4 mr-1.5" /> Assign Test</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Assign Assessment</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full bg-violet-100 text-[#9810fa] grid place-items-center text-[10px] font-bold">1</span> Test</Label>
                  <Select value={form.testId} onValueChange={(v) => setForm({ ...form, testId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a test" /></SelectTrigger>
                    <SelectContent>{tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full bg-violet-100 text-[#9810fa] grid place-items-center text-[10px] font-bold">2</span> Assign to</Label>
                    <Select value={form.targetType} onValueChange={(v) => setForm({ ...form, targetType: v as AssignmentTarget, targetLabel: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(TARGET_META) as AssignmentTarget[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-1.5">{(() => { const I = TARGET_META[k].icon; return <I className="h-3.5 w-3.5" />; })()} {TARGET_META[k].label}</span>
                        </SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{TARGET_META[form.targetType].label}</Label>
                    {form.targetType === "student" ? (
                      <Input value={form.targetLabel} onChange={(e) => setForm({ ...form, targetLabel: e.target.value })} placeholder="Student name / email" />
                    ) : classes.length > 0 ? (
                      <Select value={form.targetLabel} onValueChange={(v) => setForm({ ...form, targetLabel: v })}>
                        <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={classLabel(c)}>{classLabel(c)} · {c.studentCount || 0} students</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input disabled placeholder="No classes yet — enroll students first" />
                    )}
                  </div>
                </div>

                {coverage != null && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-sm text-emerald-700 flex items-center gap-2">
                    <Users className="h-4 w-4" /> This will assign the test to <strong>{coverage} enrolled student{coverage === 1 ? "" : "s"}</strong>.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Attempt limit</Label><Input type="number" min={1} value={form.attemptLimit} onChange={(e) => setForm({ ...form, attemptLimit: Number(e.target.value) })} /></div>
                  <div><Label>Pass %</Label><Input type="number" min={0} max={100} value={form.passPercentage} onChange={(e) => setForm({ ...form, passPercentage: Number(e.target.value) })} /></div>
                  <div><Label>Window start</Label><Input type="datetime-local" value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} /></div>
                  <div><Label>Window end</Label><Input type="datetime-local" value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={form.retakeAllowed} onCheckedChange={(v) => setForm({ ...form, retakeAllowed: v })} /><Label className="mb-0">Allow retake</Label></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={create}>Assign</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only (Instructor)</Badge>
        )}
      </div>

      <AdminNav />

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">Active Assignments ({assignments.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead><TableHead>Assigned To</TableHead><TableHead>Attempts</TableHead>
                <TableHead>Retake</TableHead><TableHead>Pass %</TableHead><TableHead>Window</TableHead>
                {editable && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => {
                // Defensive fallback: assignments created before this module
                // dropped Institution/Department/Batch targeting may still
                // carry one of those old targetType values in the database.
                const Meta = TARGET_META[a.targetType] || { label: a.targetType, icon: User };
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-slate-800">{a.testTitle}</TableCell>
                    <TableCell><span className="flex items-center gap-1.5"><Meta.icon className="h-3.5 w-3.5 text-slate-400" /><Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{Meta.label}</Badge> {a.targetLabel}</span></TableCell>
                    <TableCell>{a.attemptLimit}</TableCell>
                    <TableCell>{a.retakeAllowed ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Yes</Badge> : <span className="text-slate-400">No</span>}</TableCell>
                    <TableCell>{a.passPercentage}%</TableCell>
                    <TableCell className="text-xs text-slate-500">{a.windowStart ? new Date(a.windowStart).toLocaleDateString() : "—"} → {a.windowEnd ? new Date(a.windowEnd).toLocaleDateString() : "—"}</TableCell>
                    {editable && <TableCell><Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-600" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button></TableCell>}
                  </TableRow>
                );
              })}
              {assignments.length === 0 && <TableRow><TableCell colSpan={editable ? 7 : 6} className="text-center text-slate-400 py-8">No assignments yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
