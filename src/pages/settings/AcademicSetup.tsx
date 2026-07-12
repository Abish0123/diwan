import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Plus,
  Calendar,
  Settings2,
  Edit,
  Trash2,
  Clock,
  Save,
  BookOpen,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  CURRICULUM_LIST, getCurriculum, getPeriodLabels, getBandForGrade,
  type CurriculumId, type CurriculumConfig,
} from "@/lib/curriculumConfig";
import { saveCurriculumId, loadCurriculumId } from "@/hooks/useCurriculum";

const initialTerms = [
  { id: "TRM-001", name: "Term 1 (Spring)", startDate: "2024-01-15", endDate: "2024-04-30", status: "Active" },
  { id: "TRM-002", name: "Term 2 (Summer)", startDate: "2024-05-15", endDate: "2024-08-30", status: "Planned" },
  { id: "TRM-003", name: "Term 3 (Fall)", startDate: "2024-09-15", endDate: "2024-12-15", status: "Planned" }
];

const initialGrades = [
  { id: "G-1", label: "A+", min: 90, max: 100, gpa: 4.0, color: "text-green-500" },
  { id: "G-2", label: "A", min: 80, max: 89, gpa: 3.7, color: "text-green-500" },
  { id: "G-3", label: "B", min: 70, max: 79, gpa: 3.0, color: "text-blue-500" },
  { id: "G-4", label: "C", min: 60, max: 69, gpa: 2.0, color: "text-amber-500" },
  { id: "G-5", label: "F", min: 0, max: 59, gpa: 0.0, color: "text-destructive" }
];

const AcademicSetup = () => {
  const { user } = useAuth();
  const uid = user?.uid;

  // ── Curriculum selection ──────────────────────────────────────────────────
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<CurriculumId>('qatar');
  const [savingCurriculum, setSavingCurriculum] = useState(false);
  const [previewGrade, setPreviewGrade] = useState<string>('Grade 5');

  useEffect(() => {
    loadCurriculumId().then(id => {
      setSelectedCurriculumId(id);
      const c = getCurriculum(id);
      setPreviewGrade(c.primary[0] ?? c.grades[3] ?? c.grades[0]);
    });
  }, []);

  const selectedCurriculum = getCurriculum(selectedCurriculumId);

  const handleSaveCurriculum = async () => {
    setSavingCurriculum(true);
    try {
      await saveCurriculumId(selectedCurriculumId);
      toast.success(`Curriculum set to ${selectedCurriculum.name}. Grade structure and gradebook templates updated.`);
    } catch {
      toast.error('Failed to save curriculum setting.');
    } finally {
      setSavingCurriculum(false);
    }
  };

  const [terms, setTerms] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let termData = await smartDb.getAll("AcademicTerm", uid);
        if (!termData || termData.length === 0) {
          termData = [];
          for (const row of initialTerms) {
            const created = await smartDb.create(
              "AcademicTerm",
              { ...row, uid, createdAt: new Date().toISOString() },
              row.id
            );
            termData.push(created);
          }
        }

        let gradeData = await smartDb.getAll("GradeLevel", uid);
        if (!gradeData || gradeData.length === 0) {
          gradeData = [];
          for (const row of initialGrades) {
            const created = await smartDb.create(
              "GradeLevel",
              { ...row, uid, createdAt: new Date().toISOString() },
              row.id
            );
            gradeData.push(created);
          }
        }

        if (!cancelled) {
          setTerms(termData);
          setGrades(gradeData);
        }
      } catch (e) {
        console.error("Failed to load academic setup:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Term Modal State
  const [isTermModalOpen, setIsTermModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<any>(null);
  const [termFormData, setTermFormData] = useState({ name: "", startDate: "", endDate: "", status: "Planned" });

  // Grade Modal State
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<any>(null);
  const [gradeFormData, setGradeFormData] = useState({ label: "", min: 0, max: 100, gpa: 0.0 });

  // Timetable Period Settings
  const [periodSettings, setPeriodSettings] = useState({
    schoolStartTime: "08:00",
    schoolEndTime: "15:00",
    periodDuration: 60,
    breakDuration: 15,
    periodsPerDay: 6,
    lunchDuration: 45,
    lunchAfterPeriod: 4,
  });
  const [periodSettingsSaved, setPeriodSettingsSaved] = useState(false);

  useEffect(() => {
    smartDb.getAll("TimetableSettings", uid).then((data: any[]) => {
      if (data && data.length > 0) setPeriodSettings({ ...periodSettings, ...data[0] });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const handleSavePeriodSettings = async () => {
    try {
      const existing = await smartDb.getAll("TimetableSettings", uid) as any[];
      if (existing && existing.length > 0) {
        await smartDb.update("TimetableSettings", existing[0].id, periodSettings);
      } else {
        await smartDb.create("TimetableSettings", { ...periodSettings, uid, createdAt: new Date().toISOString() });
      }
      setPeriodSettingsSaved(true);
      toast.success("Timetable period settings saved.");
      setTimeout(() => setPeriodSettingsSaved(false), 2000);
    } catch (e) {
      toast.error("Failed to save period settings.");
    }
  };

  // === TERM HANDLERS ===
  const openNewTermModal = () => {
    setEditingTerm(null);
    setTermFormData({ name: "", startDate: "", endDate: "", status: "Planned" });
    setIsTermModalOpen(true);
  };

  const openEditTermModal = (term: any) => {
    setEditingTerm(term);
    setTermFormData({ name: term.name, startDate: term.startDate, endDate: term.endDate, status: term.status });
    setIsTermModalOpen(true);
  };

  const handleSaveTerm = async () => {
    if (!termFormData.name || !termFormData.startDate || !termFormData.endDate) {
      toast.error("Please fill all required term fields.");
      return;
    }

    try {
      if (editingTerm) {
        await smartDb.update("AcademicTerm", editingTerm.id, { ...termFormData });
        setTerms(terms.map(t => t.id === editingTerm.id ? { ...t, ...termFormData } : t));
        toast.success("Term updated successfully.");
      } else {
        const newId = `TRM-${String(Date.now()).slice(-6)}`;
        const created = await smartDb.create(
          "AcademicTerm",
          { id: newId, ...termFormData, uid, createdAt: new Date().toISOString() },
          newId
        );
        setTerms([...terms, created]);
        toast.success("New Term added successfully.");
      }
      setIsTermModalOpen(false);
    } catch (e) {
      console.error("Failed to save term:", e);
      toast.error("Failed to save term.");
    }
  };

  const handleDeleteTerm = async (id: string) => {
    try {
      await smartDb.delete("AcademicTerm", id);
      setTerms(terms.filter(t => t.id !== id));
      toast.success("Term removed successfully.");
    } catch (e) {
      console.error("Failed to delete term:", e);
      toast.error("Failed to delete term.");
    }
  };

  const toggleTermStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Planned" : "Active";
    const updated = terms.map(t => {
      if (t.id === id) return { ...t, status: newStatus };
      if (newStatus === "Active") return { ...t, status: "Planned" }; // only 1 active
      return t;
    });
    setTerms(updated);
    try {
      // Persist every affected row (the toggled term plus any demoted ones).
      await Promise.all(
        updated
          .filter(t => terms.find(o => o.id === t.id)?.status !== t.status)
          .map(t => smartDb.update("AcademicTerm", t.id, { status: t.status }))
      );
      toast.success(`Term marked as ${newStatus}.`);
    } catch (e) {
      console.error("Failed to update term status:", e);
      toast.error("Failed to update term status.");
    }
  };

  // === GRADE HANDLERS ===
  const openEditGradeModal = (grade: any) => {
    setEditingGrade(grade);
    setGradeFormData({ label: grade.label, min: grade.min, max: grade.max, gpa: grade.gpa });
    setIsGradeModalOpen(true);
  };

  const handleSaveGrade = async () => {
    try {
      await smartDb.update("GradeLevel", editingGrade.id, { ...gradeFormData });
      setGrades(grades.map(g => g.id === editingGrade.id ? { ...g, ...gradeFormData } : g));
      toast.success("Grading scale updated successfully.");
      setIsGradeModalOpen(false);
    } catch (e) {
      console.error("Failed to save grade:", e);
      toast.error("Failed to update grading scale.");
    }
  };

  const activeTerm = terms.find(t => t.status === "Active") || terms[0];

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Academic Setup</h1>
              <p className="text-sm text-slate-400">Configure live terms, grading systems, and real-time academic calendars.</p>
            </div>
          </div>
          <Button className="gradient-primary h-10 px-6 rounded-xl text-white font-medium hover:opacity-90 transition-opacity" onClick={openNewTermModal}>
            <Plus className="mr-2 h-4 w-4" /> Add New Term
          </Button>
        </div>

        {/* ── Curriculum Selection ──────────────────────────────────────── */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Curriculum & Grade Structure</h2>
                <p className="text-xs text-slate-500">Choose the curriculum that drives grade lists, gradebook templates, and term structure across the entire ERP.</p>
              </div>
            </div>
            <Button
              onClick={handleSaveCurriculum}
              disabled={savingCurriculum}
              className="h-9 px-5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl"
            >
              {savingCurriculum ? 'Saving…' : 'Save Curriculum'}
            </Button>
          </div>

          {/* Curriculum cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-0 divide-x divide-slate-100">
            {CURRICULUM_LIST.map(c => {
              const active = c.id === selectedCurriculumId;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCurriculumId(c.id); setPreviewGrade(c.primary[0] ?? c.grades[0]); }}
                  className={cn(
                    "flex flex-col items-start gap-1 px-5 py-4 text-left transition-colors",
                    active ? "bg-violet-50" : "hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className="text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: c.accentColor + '22', color: c.accentColor }}
                    >{c.shortName}</span>
                    {active && <Check className="h-4 w-4 text-purple-600" />}
                  </div>
                  <p className="text-sm font-bold text-slate-800 mt-1">{c.name}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{c.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] font-semibold text-slate-400">{c.grades.length} grades</span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {c.annualStructure.periods} {c.annualStructure.periodLabel}s
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Preview: grade list + gradebook template */}
          <div className="border-t border-slate-100 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

            {/* Grade structure */}
            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Grade Structure — {selectedCurriculum.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedCurriculum.earlyYears.length > 0 && (
                  <div className="w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Early Years</span>
                    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                      {selectedCurriculum.earlyYears.map(g => (
                        <span key={g} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCurriculum.primary.length > 0 && (
                  <div className="w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Primary</span>
                    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                      {selectedCurriculum.primary.map(g => (
                        <span key={g} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCurriculum.middle.length > 0 && (
                  <div className="w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Middle School</span>
                    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                      {selectedCurriculum.middle.map(g => (
                        <span key={g} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCurriculum.secondary.length > 0 && (
                  <div className="w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Secondary</span>
                    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                      {selectedCurriculum.secondary.map(g => (
                        <span key={g} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Annual structure */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Annual Structure</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {getPeriodLabels(selectedCurriculum).map((lbl, i) => (
                    <div key={lbl} className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1">{lbl}</span>
                      <span className="text-[11px] font-semibold text-slate-400">{selectedCurriculum.annualStructure.weights[i]}%</span>
                      {i < selectedCurriculum.annualStructure.periods - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Gradebook template preview */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Gradebook Template</p>
                <div className="flex gap-1 flex-wrap">
                  {selectedCurriculum.grades.slice(0, 8).map(g => (
                    <button key={g} onClick={() => setPreviewGrade(g)}
                      className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
                        previewGrade === g ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                      {g}
                    </button>
                  ))}
                  {selectedCurriculum.grades.length > 8 && (
                    <select className="px-1 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 outline-none"
                      value={selectedCurriculum.grades.slice(8).includes(previewGrade) ? previewGrade : ''}
                      onChange={e => e.target.value && setPreviewGrade(e.target.value)}>
                      <option value="">More…</option>
                      {selectedCurriculum.grades.slice(8).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {(() => {
                const band = getBandForGrade(selectedCurriculum, previewGrade);
                if (!band) return <p className="text-sm text-slate-400">Select a grade to preview</p>;
                return (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">{band.label} — per {selectedCurriculum.annualStructure.periodLabel}</p>
                    <div className="space-y-1.5">
                      {band.categories.map(cat => (
                        <div key={cat.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cat.isExam ? "bg-rose-400" : "bg-violet-400")} />
                            <span className="text-xs font-medium text-slate-700 truncate">{cat.name}</span>
                            {cat.count !== null && (
                              <span className="text-[10px] text-slate-400 shrink-0">×{cat.count}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="h-1.5 bg-slate-100 rounded-full w-20 overflow-hidden">
                              <div className="h-full rounded-full bg-violet-400" style={{ width: `${cat.marks}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-700 w-8 text-right">{cat.marks}m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
                      <span className="text-sm font-black text-slate-800">100 marks</span>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="premium-card bg-white border-slate-100 shadow-sm rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wider text-slate-400 uppercase">Current Term</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-800">{activeTerm?.name || 'No Active Term'}</div>
              <p className="text-sm font-medium text-emerald-500 mt-1">Active through {activeTerm?.endDate}</p>
            </CardContent>
          </Card>
          <Card className="premium-card bg-white border-slate-100 shadow-sm rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wider text-slate-400 uppercase">Academic Year</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-800">2024 - 2025</div>
              <p className="text-sm font-medium text-slate-500 mt-1">Active academic session</p>
            </CardContent>
          </Card>
          <Card className="premium-card bg-white border-slate-100 shadow-sm rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wider text-slate-400 uppercase">Grading System</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-800">Standard A-F</div>
              <p className="text-sm font-medium text-slate-500 mt-1">4.0 GPA-based calculation logic</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* TERMS TABLE */}
          <Card className="premium-card bg-white shadow-sm border-slate-100 rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
              <CardTitle className="text-lg font-bold text-slate-800">Academic Terms Registry</CardTitle>
              <Settings2 className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <p className="text-[11px] text-amber-600 bg-amber-50 border-b border-amber-100 px-4 py-2">
              Reference only — no module reads a "current term" from here yet. Finance, Exams, and Attendance each compute their own dates independently.
            </p>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="font-bold text-slate-600">Term Name</TableHead>
                    <TableHead className="font-bold text-slate-600">Duration</TableHead>
                    <TableHead className="font-bold text-slate-600">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((term) => (
                    <TableRow key={term.id} className="cursor-pointer hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-medium px-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${term.status === 'Active' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 leading-tight">{term.name}</div>
                            <div className="text-xs font-medium text-slate-400">{term.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-bold text-slate-700">{term.startDate}</div>
                          <div className="text-xs font-medium text-slate-500">to {term.endDate}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`font-bold border-none px-3 py-1 cursor-pointer transition-colors ${term.status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                          onClick={() => toggleTermStatus(term.id, term.status)}
                        >
                          {term.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-purple-600 hover:bg-blue-50 transition-colors" onClick={() => openEditTermModal(term)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" onClick={() => handleDeleteTerm(term.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {terms.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-slate-500 font-medium">No terms registered. Add a term to begin.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* GRADING SCALE TABLE */}
          <Card className="premium-card bg-white shadow-sm border-slate-100 rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
              <CardTitle className="text-lg font-bold text-slate-800">Global Grading Scale</CardTitle>
              <Settings2 className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <p className="text-[11px] text-amber-600 bg-amber-50 border-b border-amber-100 px-4 py-2">
              Reference only — not yet enforced. Report cards and the gradebook compute letter grades from a fixed A+/A/B+/B/C/D/F scale, not these bands.
            </p>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="font-bold text-slate-600 px-6">Grade</TableHead>
                    <TableHead className="font-bold text-slate-600">Threshold (%)</TableHead>
                    <TableHead className="font-bold text-slate-600">GPA Weight</TableHead>
                    <TableHead className="text-right font-bold text-slate-600 pr-6">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade) => (
                    <TableRow key={grade.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className={`font-black text-lg px-6 ${grade.color}`}>{grade.label}</TableCell>
                      <TableCell className="font-bold text-slate-700">{grade.min}% - {grade.max}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-bold px-3 py-1">
                          {grade.gpa.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors" onClick={() => openEditGradeModal(grade)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* TIMETABLE PERIOD SETTINGS */}
        <Card className="premium-card bg-white shadow-sm border-slate-100 rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-[#9810fa]" />
              <CardTitle className="text-lg font-bold text-slate-800">Timetable Period Settings</CardTitle>
            </div>
            <span className="text-xs text-slate-400 font-medium">Used for auto-generating class schedules</span>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">School Start Time</Label>
                <Input
                  type="time"
                  value={periodSettings.schoolStartTime}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, schoolStartTime: e.target.value })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">School End Time</Label>
                <Input
                  type="time"
                  value={periodSettings.schoolEndTime}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, schoolEndTime: e.target.value })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Period Duration (minutes)</Label>
                <Input
                  type="number"
                  min={20}
                  max={120}
                  value={periodSettings.periodDuration}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, periodDuration: Number(e.target.value) })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Break Duration (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={periodSettings.breakDuration}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, breakDuration: Number(e.target.value) })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periods Per Day</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={periodSettings.periodsPerDay}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, periodsPerDay: Number(e.target.value) })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lunch Duration (minutes)</Label>
                <Input
                  type="number"
                  min={15}
                  max={90}
                  value={periodSettings.lunchDuration}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, lunchDuration: Number(e.target.value) })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lunch After Period #</Label>
                <Input
                  type="number"
                  min={1}
                  max={periodSettings.periodsPerDay}
                  value={periodSettings.lunchAfterPeriod}
                  onChange={(e) => setPeriodSettings({ ...periodSettings, lunchAfterPeriod: Number(e.target.value) })}
                  className="rounded-xl h-11 border-slate-200 font-medium"
                />
              </div>
              {/* Preview */}
              <div className="md:col-span-2 p-4 bg-violet-50 border border-violet-100 rounded-xl">
                <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2">Schedule Preview</p>
                <div className="space-y-1">
                  {Array.from({ length: Math.min(periodSettings.periodsPerDay, 4) }).map((_, i) => {
                    const start = periodSettings.schoolStartTime.split(":").map(Number);
                    const startMins = start[0] * 60 + start[1] + i * (periodSettings.periodDuration + periodSettings.breakDuration) + (i >= periodSettings.lunchAfterPeriod ? periodSettings.lunchDuration : 0);
                    const endMins = startMins + periodSettings.periodDuration;
                    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs text-purple-600 font-medium">
                        <span className="bg-violet-200 text-violet-800 rounded px-1.5 py-0.5 font-bold">P{i + 1}</span>
                        <span>{fmt(startMins)} – {fmt(endMins)}</span>
                        {i + 1 === periodSettings.lunchAfterPeriod && <span className="text-orange-500 font-bold ml-1">→ Lunch break</span>}
                      </div>
                    );
                  })}
                  {periodSettings.periodsPerDay > 4 && (
                    <p className="text-xs text-violet-400 font-medium">+{periodSettings.periodsPerDay - 4} more periods…</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <Button
                className="rounded-xl gradient-primary text-white font-bold px-8 shadow-md shadow-purple-200 gap-2"
                onClick={handleSavePeriodSettings}
              >
                <Save className="h-4 w-4" />
                {periodSettingsSaved ? "Saved!" : "Save Period Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TERM MODAL */}
      <Dialog open={isTermModalOpen} onOpenChange={setIsTermModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-white border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">{editingTerm ? 'Edit Academic Term' : 'Create New Term'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-bold text-slate-500 uppercase">Term Name</Label>
              <Input 
                id="name" 
                value={termFormData.name} 
                onChange={(e) => setTermFormData({ ...termFormData, name: e.target.value })}
                className="rounded-xl border-slate-200 h-10 font-medium" 
                placeholder="e.g. Term 4 (Winter)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start" className="text-xs font-bold text-slate-500 uppercase">Start Date</Label>
                <Input 
                  id="start" 
                  type="date"
                  value={termFormData.startDate} 
                  onChange={(e) => setTermFormData({ ...termFormData, startDate: e.target.value })}
                  className="rounded-xl border-slate-200 h-10 font-medium text-slate-700" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end" className="text-xs font-bold text-slate-500 uppercase">End Date</Label>
                <Input 
                  id="end" 
                  type="date"
                  value={termFormData.endDate} 
                  onChange={(e) => setTermFormData({ ...termFormData, endDate: e.target.value })}
                  className="rounded-xl border-slate-200 h-10 font-medium text-slate-700" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl font-bold text-slate-500" onClick={() => setIsTermModalOpen(false)}>Cancel</Button>
            <Button className="rounded-xl gradient-primary font-bold shadow-md shadow-purple-200" onClick={handleSaveTerm}>Save Term</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GRADE MODAL */}
      <Dialog open={isGradeModalOpen} onOpenChange={setIsGradeModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-white border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">Adjust Grade Parameters: {gradeFormData.label}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Minimum %</Label>
                <Input 
                  type="number"
                  value={gradeFormData.min} 
                  onChange={(e) => setGradeFormData({ ...gradeFormData, min: Number(e.target.value) })}
                  className="rounded-xl border-slate-200 h-10 font-medium text-slate-700" 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Maximum %</Label>
                <Input 
                  type="number"
                  value={gradeFormData.max} 
                  onChange={(e) => setGradeFormData({ ...gradeFormData, max: Number(e.target.value) })}
                  className="rounded-xl border-slate-200 h-10 font-medium text-slate-700" 
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">GPA Weight Contribution</Label>
              <Input 
                type="number"
                step="0.1"
                value={gradeFormData.gpa} 
                onChange={(e) => setGradeFormData({ ...gradeFormData, gpa: Number(e.target.value) })}
                className="rounded-xl border-slate-200 h-10 font-medium text-slate-700 w-1/2" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl font-bold text-slate-500" onClick={() => setIsGradeModalOpen(false)}>Discard</Button>
            <Button className="rounded-xl gradient-primary font-bold shadow-md shadow-purple-200" onClick={handleSaveGrade}>Apply to Scale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AcademicSetup;
