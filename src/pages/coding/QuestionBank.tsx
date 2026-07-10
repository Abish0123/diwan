import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus, Search, Trash2, Pencil, ArrowLeft, Eye, EyeOff, Library, FileQuestion, Upload, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { ensureCodingSeed, getQuestions, CODING_QUESTIONS } from "@/lib/codingData";
import { logAudit } from "@/lib/codingAudit";
import {
  CodingQuestion, Difficulty, CodingLanguage, LANGUAGE_LABELS, TestCase,
  QuestionType, QUESTION_TYPE_LABELS, QUESTION_CATEGORIES,
} from "@/types/coding";
import { DifficultyBadge } from "@/components/coding/shared";
import { AdminNav } from "@/components/coding/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/codingRbac";
import { cn } from "@/lib/utils";

const ALL_LANGS: CodingLanguage[] = ["javascript", "python", "java", "cpp", "csharp"];
const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const TYPES: QuestionType[] = ["coding", "mcq", "sql", "aptitude"];

let _cid = 0;
const blankCase = (hidden = false): TestCase => ({ id: `tc_${Date.now()}_${_cid++}`, input: "", expected: "", hidden });

export default function QuestionBank() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const canManage = can(role, "question.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [search, setSearch] = useState("");
  const [diff, setDiff] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [f, setF] = useState({
    type: "coding" as QuestionType, title: "", description: "",
    difficulty: "Easy" as Difficulty, category: QUESTION_CATEGORIES[0] as string,
    marks: 20, timeLimitSec: 3, memoryMb: 256, functionName: "solution",
    constraints: "", inputFormat: "", outputFormat: "", tags: "", sampleInput: "", sampleOutput: "",
  });
  const [langs, setLangs] = useState<CodingLanguage[]>([...ALL_LANGS]);
  const [cases, setCases] = useState<TestCase[]>([blankCase(false), blankCase(true)]);
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);

  const load = async () => { await ensureCodingSeed(); setQuestions((await getQuestions()) || []); };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => questions.filter((q) =>
    (diff === "all" || q.difficulty === diff) &&
    (typeFilter === "all" || (q.type || "coding") === typeFilter) &&
    (q.title.toLowerCase().includes(search.toLowerCase()) || q.category.toLowerCase().includes(search.toLowerCase()))
  ), [questions, search, diff, typeFilter]);

  const toggleLang = (l: CodingLanguage) => setLangs((p) => p.includes(l) ? p.filter((x) => x !== l) : [...p, l]);
  const usesCases = f.type === "coding" || f.type === "sql";
  const usesOptions = f.type === "mcq" || f.type === "aptitude";

  const resetForm = () => {
    setF({
      type: "coding", title: "", description: "", difficulty: "Easy", category: QUESTION_CATEGORIES[0],
      marks: 20, timeLimitSec: 3, memoryMb: 256, functionName: "solution",
      constraints: "", inputFormat: "", outputFormat: "", tags: "", sampleInput: "", sampleOutput: "",
    });
    setLangs([...ALL_LANGS]); setCases([blankCase(false), blankCase(true)]); setOptions(["", "", "", ""]); setCorrect(0);
  };

  const openCreate = () => { setEditingId(null); resetForm(); setOpen(true); };

  const openEdit = (q: CodingQuestion) => {
    setEditingId(q.id);
    setF({
      type: q.type || "coding", title: q.title, description: q.description,
      difficulty: q.difficulty, category: q.category, marks: q.marks,
      timeLimitSec: q.timeLimitSec, memoryMb: q.memoryMb, functionName: q.functionName || "solution",
      constraints: q.constraints || "", inputFormat: q.inputFormat || "", outputFormat: q.outputFormat || "",
      tags: (q.tags || []).join(", "), sampleInput: q.sampleInput || "", sampleOutput: q.sampleOutput || "",
    });
    setLangs(q.languages && q.languages.length ? [...q.languages] : [...ALL_LANGS]);
    setCases(q.testCases && q.testCases.length ? q.testCases.map((c) => ({ ...c })) : [blankCase(false), blankCase(true)]);
    setOptions(q.options && q.options.length ? [...q.options] : ["", "", "", ""]);
    setCorrect(q.correctOption ?? 0);
    setOpen(true);
  };

  const importCases = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const apply = (rows: Record<string, unknown>[]) => {
      const imported: TestCase[] = rows
        .filter((r) => r.input !== undefined || r.Input !== undefined)
        .map((r) => ({
          id: `tc_${Date.now()}_${_cid++}`,
          input: String(r.input ?? r.Input ?? "").trim(),
          expected: String(r.expected ?? r.Expected ?? r.output ?? r.Output ?? "").trim(),
          hidden: String(r.hidden ?? r.Hidden ?? "false").toLowerCase() === "true",
        }));
      if (imported.length === 0) return toast.error("No rows found. Use columns: input, expected, hidden");
      setCases((prev) => [...prev.filter((c) => c.input || c.expected), ...imported]);
      toast.success(`Imported ${imported.length} test cases`);
    };
    if (ext === "csv") {
      import("papaparse").then(({ default: Papa }) => {
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => apply(res.data as Record<string, unknown>[]) });
      });
    } else {
      import("xlsx").then((XLSX) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const wb = XLSX.read(e.target?.result, { type: "binary" });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[];
          apply(rows);
        };
        reader.readAsBinaryString(file);
      });
    }
  };

  const save = async () => {
    if (!f.title.trim()) return toast.error("Title is required");
    if (usesCases && cases.some((c) => !c.input.trim() || !c.expected.trim())) return toast.error("Fill all test cases");
    if (usesCases && !cases.some((c) => !c.hidden)) return toast.error("Add at least one public test case");
    if (usesOptions && options.filter((o) => o.trim()).length < 2) return toast.error("Add at least two options");

    const starter: CodingQuestion["starterCode"] = {};
    if (f.type === "coding") {
      langs.forEach((l) => {
        starter[l] = l === "javascript"
          ? `// Implement ${f.functionName}(input). Return your answer.\nfunction ${f.functionName}(input) {\n  \n}\n`
          : `# Implement ${f.functionName}(input)\n`;
      });
    }
    const q: CodingQuestion = {
      id: editingId || `Q-${Date.now()}`, type: f.type, title: f.title, description: f.description,
      difficulty: f.difficulty, category: f.category, marks: Number(f.marks),
      timeLimitSec: Number(f.timeLimitSec), memoryMb: Number(f.memoryMb),
      languages: f.type === "coding" ? langs : [], functionName: f.functionName || "solution",
      constraints: f.constraints, inputFormat: f.inputFormat, outputFormat: f.outputFormat,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      sampleInput: f.sampleInput, sampleOutput: f.sampleOutput,
      starterCode: starter, testCases: usesCases ? cases : [],
      options: usesOptions ? options.filter((o) => o.trim()) : undefined,
      correctOption: usesOptions ? correct : undefined,
      createdBy: user?.uid,
    };
    if (editingId) {
      await smartDb.update(CODING_QUESTIONS, editingId, q as never);
      await logAudit("Question updated", "coding_questions", { user: user?.email, role }, `${QUESTION_TYPE_LABELS[f.type]}: ${f.title}`);
      toast.success("Question updated");
    } else {
      await smartDb.create(CODING_QUESTIONS, q as never, q.id);
      await logAudit("Question created", "coding_questions", { user: user?.email, role }, `${QUESTION_TYPE_LABELS[f.type]}: ${f.title}`);
      toast.success("Question added to bank");
    }
    setOpen(false); setEditingId(null); resetForm();
    load();
  };

  const remove = async (q: CodingQuestion) => {
    await smartDb.delete(CODING_QUESTIONS, q.id);
    await logAudit("Question deleted", "coding_questions", { user: user?.email, role }, q.title);
    load(); toast.success("Question removed");
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Library className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Question Bank</h1>
            <p className="text-sm text-slate-400">Coding, MCQ, SQL &amp; aptitude questions with public/hidden test cases.</p>
          </div>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
            <DialogTrigger asChild><Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Create Question</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit Question" : "Create Question"}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                {/* type selector */}
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => setF({ ...f, type: t })}
                      className={cn("px-3 py-1.5 rounded-lg text-sm border transition-colors",
                        f.type === t ? "bg-violet-100 border-violet-300 text-[#9810fa] font-medium" : "bg-white border-slate-200 text-slate-500")}>
                      {QUESTION_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
                  <div>
                    <Label>Difficulty</Label>
                    <Select value={f.difficulty} onValueChange={(v) => setF({ ...f, difficulty: v as Difficulty })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{QUESTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Marks</Label><Input type="number" value={f.marks} onChange={(e) => setF({ ...f, marks: Number(e.target.value) })} /></div>
                  <div><Label>Tags (comma-sep)</Label><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="arrays, hashing" /></div>
                  {f.type === "coding" && <>
                    <div><Label>Function name</Label><Input value={f.functionName} onChange={(e) => setF({ ...f, functionName: e.target.value })} /></div>
                    <div><Label>Time limit (s)</Label><Input type="number" value={f.timeLimitSec} onChange={(e) => setF({ ...f, timeLimitSec: Number(e.target.value) })} /></div>
                    <div><Label>Memory (MB)</Label><Input type="number" value={f.memoryMb} onChange={(e) => setF({ ...f, memoryMb: Number(e.target.value) })} /></div>
                  </>}
                </div>

                {usesCases && <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Input Format</Label><Input value={f.inputFormat} onChange={(e) => setF({ ...f, inputFormat: e.target.value })} /></div>
                    <div><Label>Output Format</Label><Input value={f.outputFormat} onChange={(e) => setF({ ...f, outputFormat: e.target.value })} /></div>
                    <div><Label>Sample Input</Label><Input value={f.sampleInput} onChange={(e) => setF({ ...f, sampleInput: e.target.value })} /></div>
                    <div><Label>Sample Output</Label><Input value={f.sampleOutput} onChange={(e) => setF({ ...f, sampleOutput: e.target.value })} /></div>
                    <div className="col-span-2"><Label>Constraints</Label><Input value={f.constraints} onChange={(e) => setF({ ...f, constraints: e.target.value })} placeholder="e.g. 1 ≤ N ≤ 10^4" /></div>
                  </div>
                  {f.type === "coding" && (
                    <div>
                      <Label>Languages</Label>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {ALL_LANGS.map((l) => (
                          <button key={l} type="button" onClick={() => toggleLang(l)}
                            className={cn("px-3 py-1 rounded-full text-xs border", langs.includes(l) ? "bg-violet-100 border-violet-300 text-[#9810fa]" : "bg-white border-slate-200 text-slate-500")}>
                            {LANGUAGE_LABELS[l]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Test Cases (public / hidden / edge / stress)</Label>
                      <div className="flex gap-2">
                        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                          onChange={(e) => { const file = e.target.files?.[0]; if (file) importCases(file); e.target.value = ""; }} />
                        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5 mr-1" /> Import CSV/Excel</Button>
                        <Button variant="outline" size="sm" onClick={() => setCases([...cases, blankCase()])}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {cases.map((c) => (
                        <div key={c.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                          <Input placeholder="Input" value={c.input} onChange={(e) => setCases(cases.map((x) => x.id === c.id ? { ...x, input: e.target.value } : x))} />
                          <Input placeholder="Expected output" value={c.expected} onChange={(e) => setCases(cases.map((x) => x.id === c.id ? { ...x, expected: e.target.value } : x))} />
                          <Button type="button" variant="outline" size="sm" className={cn(c.hidden ? "text-amber-600" : "text-emerald-600")}
                            onClick={() => setCases(cases.map((x) => x.id === c.id ? { ...x, hidden: !x.hidden } : x))}>
                            {c.hidden ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Hidden</> : <><Eye className="h-3.5 w-3.5 mr-1" />Public</>}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="text-rose-500" onClick={() => setCases(cases.filter((x) => x.id !== c.id))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">Import columns: <code>input, expected, hidden</code></p>
                  </div>
                </>}

                {usesOptions && (
                  <div>
                    <Label>Answer Options (select the correct one)</Label>
                    <div className="space-y-2 mt-1.5">
                      {options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <button type="button" onClick={() => setCorrect(i)}
                            className={cn("h-6 w-6 rounded-full border grid place-items-center shrink-0", correct === i ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent")}>
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <Input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, idx) => idx === i ? e.target.value : x))} />
                          {options.length > 2 && <Button type="button" variant="ghost" size="sm" className="text-rose-500" onClick={() => { setOptions(options.filter((_, idx) => idx !== i)); if (correct >= options.length - 1) setCorrect(0); }}><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, ""])}><Plus className="h-3.5 w-3.5 mr-1" /> Add option</Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={save}>{editingId ? "Save Changes" : "Save Question"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <AdminNav />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search by title or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={diff} onValueChange={setDiff}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((q) => {
          const type = q.type || "coding";
          return (
            <Card key={q.id} className="border-slate-200">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{q.title}</CardTitle>
                  {canManage && (
                    <div className="flex items-center gap-0.5 -mt-1 -mr-1 shrink-0">
                      <Button variant="ghost" size="sm" title="Edit question" className="text-slate-400 hover:text-[#9810fa] h-7 w-7 p-0" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" title="Delete question" className="text-rose-400 hover:text-rose-600 h-7 w-7 p-0" onClick={() => remove(q)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{q.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">{QUESTION_TYPE_LABELS[type]}</Badge>
                  <DifficultyBadge difficulty={q.difficulty} />
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{q.category}</Badge>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{q.marks} marks</Badge>
                </div>
                {(type === "coding" || type === "sql") ? (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-emerald-500" />{q.testCases.filter((c) => !c.hidden).length} public</span>
                    <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5 text-amber-500" />{q.testCases.filter((c) => c.hidden).length} hidden</span>
                    {type === "coding" && <span>{q.languages.length} langs</span>}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">{q.options?.length || 0} options · correct #{(q.correctOption ?? 0) + 1}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <FileQuestion className="h-10 w-10 mx-auto mb-2 opacity-40" />No questions match your filters.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
