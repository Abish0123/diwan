import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, BookOpen, Search, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useGrades } from "@/contexts/CurriculumContext";
import { useSubjects, type Subject } from "@/lib/subjectRegistry";
import { useTranslation } from "react-i18next";

const emptyForm = () => ({ code: "", name: "", grades: [] as string[], status: "Active" as "Active" | "Inactive" });

const STATUS_LABEL_KEYS: Record<string, string> = {
  Active: "admin.academics.subjectCodes.statusActive",
  Inactive: "admin.academics.subjectCodes.statusInactive",
};

export default function SubjectCodes() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.uid;
  const allGrades = useGrades();
  const { subjects, loading, reload } = useSubjects();

  const [q, setQ] = useState("");
  const ALL_GRADES_VALUE = "All Grades";
  const [gradeFilter, setGradeFilter] = useState(ALL_GRADES_VALUE);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => subjects
    .filter(s => gradeFilter === ALL_GRADES_VALUE || s.grades.includes(gradeFilter))
    .filter(s => !q || s.code.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code)),
    [subjects, q, gradeFilter]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true); };
  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ code: s.code, name: s.name, grades: [...s.grades], status: s.status });
    setIsModalOpen(true);
  };

  const toggleGrade = (g: string) => setForm(f => ({
    ...f, grades: f.grades.includes(g) ? f.grades.filter(x => x !== g) : [...f.grades, g],
  }));

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code || !form.name.trim()) { toast.error(t("admin.academics.subjectCodes.errorCodeNameRequired")); return; }
    if (form.grades.length === 0) { toast.error(t("admin.academics.subjectCodes.errorSelectGrade")); return; }
    const duplicate = subjects.find(s => s.code === code && s.id !== editing?.id);
    if (duplicate) { toast.error(t("admin.academics.subjectCodes.errorDuplicateCode", { code, name: duplicate.name })); return; }
    setSaving(true);
    try {
      if (editing) {
        await smartDb.update("Subject", editing.id, { code, name: form.name.trim(), grades: form.grades, status: form.status });
        toast.success(t("admin.academics.subjectCodes.toastUpdated"));
      } else {
        const id = `SUBJ-${code}`;
        await smartDb.create("Subject", { id, code, name: form.name.trim(), grades: form.grades, status: form.status, uid, createdAt: new Date().toISOString() }, id);
        toast.success(t("admin.academics.subjectCodes.toastAdded", { code, name: form.name }));
      }
      setIsModalOpen(false);
      reload();
    } catch (e) {
      console.error("Failed to save subject:", e);
      toast.error(t("admin.academics.subjectCodes.errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Subject) => {
    if (!confirm(t("admin.academics.subjectCodes.confirmDelete", { code: s.code, name: s.name }))) return;
    try {
      await smartDb.delete("Subject", s.id);
      toast.success(t("admin.academics.subjectCodes.toastDeleted"));
      reload();
    } catch {
      toast.error(t("admin.academics.subjectCodes.errorDeleteFailed"));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("admin.academics.subjectCodes.pageTitle")}</h1>
              <p className="text-sm text-slate-400">
                {t("admin.academics.subjectCodes.pageSubtitle")}
              </p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 me-1.5" /> {t("admin.academics.subjectCodes.addSubject")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("admin.academics.subjectCodes.totalSubjects")}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{subjects.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("admin.academics.subjectCodes.active")}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{subjects.filter(s => s.status === "Active").length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">{t("admin.academics.subjectCodes.gradesCovered")}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{new Set(subjects.flatMap(s => s.grades)).size}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">{t("admin.academics.subjectCodes.allSubjects")}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t("admin.academics.subjectCodes.searchPlaceholder")} className="ps-8 h-9 w-56" />
              </div>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={ALL_GRADES_VALUE}>{t("admin.academics.subjectCodes.allGrades")}</SelectItem>
                  {allGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-400 py-8 text-center">{t("admin.academics.subjectCodes.loading")}</p>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{subjects.length === 0 ? t("admin.academics.subjectCodes.emptyStateNoSubjects") : t("admin.academics.subjectCodes.emptyStateNoMatch")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.academics.subjectCodes.colCode")}</TableHead>
                    <TableHead>{t("admin.academics.subjectCodes.colSubjectName")}</TableHead>
                    <TableHead>{t("admin.academics.subjectCodes.colGrades")}</TableHead>
                    <TableHead>{t("admin.academics.subjectCodes.colStatus")}</TableHead>
                    <TableHead className="text-end">{t("admin.academics.subjectCodes.colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="font-mono font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md text-xs">{s.code}</span>
                      </TableCell>
                      <TableCell className="font-semibold">{s.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                          {s.grades.length > 6
                            ? <span className="text-xs text-slate-500 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {t("admin.academics.subjectCodes.gradesCountRange", { count: s.grades.length, first: s.grades[0], last: s.grades[s.grades.length - 1] })}</span>
                            : s.grades.map(g => <Badge key={g} variant="outline" className="text-[10px] border-slate-200">{g}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.status === "Active" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-500 bg-slate-50"}>
                          {t(STATUS_LABEL_KEYS[s.status] || s.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("admin.academics.subjectCodes.editSubject") : t("admin.academics.subjectCodes.addSubject")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.academics.subjectCodes.subjectCodeLabel")}</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder={t("admin.academics.subjectCodes.subjectCodePlaceholder")} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.academics.subjectCodes.statusLabel")}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "Active" | "Inactive" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">{t("admin.academics.subjectCodes.statusActive")}</SelectItem>
                    <SelectItem value="Inactive">{t("admin.academics.subjectCodes.statusInactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.academics.subjectCodes.subjectNameLabel")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("admin.academics.subjectCodes.subjectNamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.academics.subjectCodes.gradesLabel")}</Label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-lg">
                {allGrades.map(g => {
                  const checked = form.grades.includes(g);
                  return (
                    <label key={g} className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer text-xs font-semibold transition-all select-none ${checked ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:border-violet-200"}`}>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleGrade(g)} />
                      {g}
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400">{form.grades.length === 0 ? t("admin.academics.subjectCodes.noGradesSelected") : t("admin.academics.subjectCodes.gradesSelectedCount", { count: form.grades.length })}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t("admin.academics.subjectCodes.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? t("admin.academics.subjectCodes.saving") : editing ? t("admin.academics.subjectCodes.saveChanges") : t("admin.academics.subjectCodes.addSubject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
