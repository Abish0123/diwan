import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus, ListChecks, FileQuestion, Activity, BarChart3, Users, Clock, Award,
  Monitor, Library, Eye, Code2, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import {
  ensureCodingSeed, getTests, getQuestions, getAttempts, getRealClasses, CODING_TESTS,
} from "@/lib/codingData";
import { SchoolClass, classLabel } from "@/types/coding";
import {
  CodingTest, CodingQuestion, CodingAttempt, CodingLanguage, LANGUAGE_LABELS, TestStatus, Difficulty,
} from "@/types/coding";
import { logAudit } from "@/lib/codingAudit";
import { AdminNav } from "@/components/coding/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";
import { Copy, Trash2, Settings } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const ALL_LANGS: CodingLanguage[] = ["javascript", "python", "java", "cpp", "csharp"];

export default function InstructorTests() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();
  const canCreate = can(role, "test.create");
  const canDelete = can(role, "test.delete");
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [open, setOpen] = useState(false);

  // create-test form
  const [form, setForm] = useState({
    title: "", description: "", instructions: "Camera and full-screen are mandatory. Do not switch tabs.",
    durationMins: 60, proctoringEnabled: true, passingMarks: 0, difficulty: "Medium" as Difficulty,
    startDate: "", endDate: "", randomizeQuestions: false, negativeMarking: false, autoSubmit: true,
    classId: "",
  });
  const [pickedQ, setPickedQ] = useState<string[]>([]);
  const [pickedL, setPickedL] = useState<CodingLanguage[]>(["javascript", "python", "java"]);

  const load = async () => {
    await ensureCodingSeed();
    const [t, q, a, c] = await Promise.all([getTests(), getQuestions(), getAttempts(), getRealClasses()]);
    setTests(t || []); setQuestions(q || []); setAttempts(a || []); setClasses(c || []);
  };
  useEffect(() => { load(); }, []);

  // Arriving from Classes.tsx's "Create Test" action (?classId=...) opens the
  // create dialog pre-scoped to that class instead of landing on a blank
  // list — the class the admin just picked stays picked, rather than making
  // them re-select it from scratch in a second dropdown.
  useEffect(() => {
    const classId = searchParams.get("classId");
    if (classId && classes.some((c) => c.id === classId)) {
      setForm((f) => ({ ...f, classId }));
      setOpen(true);
      searchParams.delete("classId");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]);

  const attemptsByTest = useMemo(() => {
    const m: Record<string, CodingAttempt[]> = {};
    attempts.forEach((a) => { (m[a.testId] ||= []).push(a); });
    return m;
  }, [attempts]);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const createTest = async () => {
    if (!form.title.trim()) return toast.error("Give the test a title");
    if (pickedQ.length === 0) return toast.error("Pick at least one question");
    if (pickedL.length === 0) return toast.error("Pick at least one language");
    const totalMarks = questions.filter((q) => pickedQ.includes(q.id)).reduce((s, q) => s + q.marks, 0);
    const targetClass = classes.find((c) => c.id === form.classId);
    const test: CodingTest = {
      id: `TEST-${Date.now()}`,
      title: form.title, description: form.description, instructions: form.instructions,
      durationMins: Number(form.durationMins) || 60, totalMarks, languages: pickedL,
      questionIds: pickedQ, status: "Published", proctoringEnabled: form.proctoringEnabled,
      passingMarks: Number(form.passingMarks) || Math.round(totalMarks * 0.4),
      difficulty: form.difficulty, startDate: form.startDate || undefined, endDate: form.endDate || undefined,
      randomizeQuestions: form.randomizeQuestions, negativeMarking: form.negativeMarking,
      autoSubmit: form.autoSubmit, grade: targetClass?.grade, section: targetClass?.section,
      createdBy: user?.uid, createdAt: new Date().toISOString(),
    };
    await smartDb.create(CODING_TESTS, test as never, test.id);
    await logAudit("Test created", "coding_tests", { user: user?.email, role }, test.title);
    toast.success("Test published");
    setOpen(false);
    setForm({ ...form, title: "", description: "", passingMarks: 0, startDate: "", endDate: "", classId: "" });
    setPickedQ([]);
    load();
  };

  const duplicateTest = async (t: CodingTest) => {
    const copy: CodingTest = { ...t, id: `TEST-${Date.now()}`, title: `${t.title} (Copy)`, status: "Draft", createdAt: new Date().toISOString() };
    await smartDb.create(CODING_TESTS, copy as never, copy.id);
    await logAudit("Test duplicated", "coding_tests", { user: user?.email, role }, copy.title);
    toast.success("Test duplicated as draft");
    load();
  };

  const deleteTest = async (t: CodingTest) => {
    await smartDb.delete(CODING_TESTS, t.id);
    await logAudit("Test deleted", "coding_tests", { user: user?.email, role }, t.title);
    toast.success("Test deleted");
    load();
  };

  const setStatus = async (test: CodingTest, status: TestStatus) => {
    await logAudit(`Test ${status.toLowerCase()}`, "coding_tests", { user: user?.email, role }, test.title);
    await smartDb.update(CODING_TESTS, test.id, { ...test, status } as never);
    load();
  };

  const totalStudents = new Set(attempts.map((a) => a.studentId)).size;
  const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + (a.totalMarks ? (a.totalScore / a.totalMarks) * 100 : 0), 0) / attempts.length) : 0;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Code2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Coding Tests</h1>
            <p className="text-sm text-slate-400">Author proctored coding assessments and monitor candidates.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canCreate && <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#9810fa] hover:bg-[#5d1899]"><Plus className="h-4 w-4 mr-1.5" /> Create Test</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Coding Test</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Backend Hiring Round 2" /></div>
                  <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short summary" /></div>
                  <div><Label>Duration (minutes)</Label><Input type="number" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })} /></div>
                  <div><Label>Passing Marks (0 = auto 40%)</Label><Input type="number" value={form.passingMarks} onChange={(e) => setForm({ ...form, passingMarks: Number(e.target.value) })} /></div>
                  <div>
                    <Label>Difficulty Level</Label>
                    <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as Difficulty })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Class</Label>
                    <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
                      <SelectTrigger><SelectValue placeholder={classes.length ? "Select a class (optional)" : "No classes yet — assign later"} /></SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => <SelectItem key={c.id} value={c.id}>{classLabel(c)} · {c.studentCount || 0} students</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Start Date</Label><Input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
                  <div><Label>End Date</Label><Input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2"><Switch checked={form.proctoringEnabled} onCheckedChange={(v) => setForm({ ...form, proctoringEnabled: v })} /><Label className="mb-0 text-xs">AI Proctoring</Label></div>
                  <div className="flex items-center gap-2"><Switch checked={form.randomizeQuestions} onCheckedChange={(v) => setForm({ ...form, randomizeQuestions: v })} /><Label className="mb-0 text-xs">Randomize Qs</Label></div>
                  <div className="flex items-center gap-2"><Switch checked={form.negativeMarking} onCheckedChange={(v) => setForm({ ...form, negativeMarking: v })} /><Label className="mb-0 text-xs">Negative Mark</Label></div>
                  <div className="flex items-center gap-2"><Switch checked={form.autoSubmit} onCheckedChange={(v) => setForm({ ...form, autoSubmit: v })} /><Label className="mb-0 text-xs">Auto Submit</Label></div>
                </div>
                <div><Label>Instructions</Label><Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
                <div>
                  <Label>Languages</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {ALL_LANGS.map((l) => (
                      <button key={l} type="button" onClick={() => toggle(pickedL, l, setPickedL)}
                        className={cn("px-3 py-1 rounded-full text-xs border transition-colors",
                          pickedL.includes(l) ? "bg-violet-100 border-violet-300 text-[#9810fa]" : "bg-white border-slate-200 text-slate-500")}>
                        {LANGUAGE_LABELS[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Questions ({pickedQ.length} selected)</Label>
                    <Button variant="link" size="sm" className="h-auto p-0 text-[#9810fa]" onClick={() => navigate("/coding/questions")}>+ New question</Button>
                  </div>
                  <div className="mt-1.5 space-y-1.5 max-h-52 overflow-y-auto">
                    {questions.map((q) => (
                      <label key={q.id} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer",
                        pickedQ.includes(q.id) ? "border-violet-300 bg-violet-50/50" : "border-slate-200")}>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={pickedQ.includes(q.id)} onChange={() => toggle(pickedQ, q.id, setPickedQ)} className="accent-[#9810fa]" />
                          <span className="text-sm text-slate-700">{q.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Badge variant="outline">{q.difficulty}</Badge> {q.marks} marks
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={createTest}>Publish Test</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      <AdminNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<ListChecks className="h-5 w-5" />} label="Tests" value={tests.length} />
        <Stat icon={<FileQuestion className="h-5 w-5" />} label="Questions" value={questions.length} />
        <Stat icon={<Users className="h-5 w-5" />} label="Candidates" value={totalStudents} />
        <Stat icon={<Award className="h-5 w-5" />} label="Avg Score" value={`${avgScore}%`} />
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">All Tests</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead><TableHead>Questions</TableHead><TableHead>Duration</TableHead>
                <TableHead>Marks</TableHead><TableHead>Attempts</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((t) => {
                const att = attemptsByTest[t.id] || [];
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium text-slate-800 flex items-center gap-1.5">
                        {t.proctoringEnabled && <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />}{t.title}
                      </div>
                      <div className="text-xs text-slate-400">{t.description}</div>
                    </TableCell>
                    <TableCell>{t.questionIds.length}</TableCell>
                    <TableCell><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{t.durationMins}m</span></TableCell>
                    <TableCell>{t.totalMarks}</TableCell>
                    <TableCell>{att.length}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        t.status === "Published" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                        t.status === "Draft" && "bg-slate-50 text-slate-600 border-slate-200",
                        t.status === "Archived" && "bg-rose-50 text-rose-700 border-rose-200")}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Live monitor" onClick={() => navigate(`/coding/monitor/${t.id}`)}><Monitor className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Preview" onClick={() => navigate(`/coding/test/${t.id}`)}><Eye className="h-4 w-4" /></Button>
                        {canCreate && <Button size="sm" variant="ghost" title="Duplicate" onClick={() => duplicateTest(t)}><Copy className="h-4 w-4" /></Button>}
                        {t.status === "Published"
                          ? <Button size="sm" variant="ghost" className="text-xs text-slate-500" onClick={() => setStatus(t, "Archived")}>Archive</Button>
                          : <Button size="sm" variant="ghost" className="text-xs text-emerald-600" onClick={() => setStatus(t, "Published")}>Publish</Button>}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" title="Delete" className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete “{t.title}”?</AlertDialogTitle>
                                <AlertDialogDescription>This permanently removes the test. Attempts and reports are kept.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteTest(t)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-lg bg-violet-50 text-[#9810fa] grid place-items-center">{icon}</div>
        <div><div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>
      </CardContent>
    </Card>
  );
}
