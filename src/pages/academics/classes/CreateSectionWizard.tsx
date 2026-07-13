import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronRight, ChevronLeft, Check, Plus, Users, BookOpen, Calendar,
  UserCheck, LayoutGrid, Search, X, Zap, AlertCircle, CheckCircle2,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useClasses } from "@/hooks/useClasses";
import { useStaff } from "@/contexts/StaffContext";
import { useStudents } from "@/contexts/StudentContext";
import type { TimetableSlot } from "@/types/classes";

const DEFAULT_SUBJECTS = [
  "Mathematics", "Science", "English", "History", "Geography", "Physics",
  "Chemistry", "Biology", "Computer Science", "Social Studies", "Hindi",
  "Tamil", "Art & Craft", "Physical Education", "Music",
];

const SECTION_TYPES = [
  { id: "Regular", label: "Regular", desc: "Standard class section" },
  { id: "Advanced", label: "Advanced", desc: "Honors / accelerated" },
  { id: "Special Needs", label: "Special Needs", desc: "Inclusive support" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [
  { start: "08:00", end: "09:00" }, { start: "09:00", end: "10:00" },
  { start: "10:15", end: "11:15" }, { start: "11:15", end: "12:15" },
  { start: "13:00", end: "14:00" }, { start: "14:00", end: "15:00" },
];

// Same flow as Create Class, but starts at the Section step (grade is already known).
const steps = [
  { id: 1, title: "Section", description: "Name, capacity & type", icon: LayoutGrid },
  { id: 2, title: "Semester", description: "Academic semester", icon: Calendar },
  { id: 3, title: "Subjects", description: "Assign subjects", icon: BookOpen },
  { id: 4, title: "Teachers", description: "Allocate staff", icon: UserCheck },
  { id: 5, title: "Students", description: "Assign students", icon: Users },
  { id: 6, title: "Timetable", description: "Quick schedule setup", icon: Calendar },
];

const STEP_LABEL_KEYS: Record<number, { title: string; description: string }> = {
  1: { title: "admin.academics.createSectionWizard.stepSectionTitle", description: "admin.academics.createSectionWizard.stepSectionDesc" },
  2: { title: "admin.academics.createSectionWizard.stepSemesterTitle", description: "admin.academics.createSectionWizard.stepSemesterDesc" },
  3: { title: "admin.academics.createSectionWizard.stepSubjectsTitle", description: "admin.academics.createSectionWizard.stepSubjectsDesc" },
  4: { title: "admin.academics.createSectionWizard.stepTeachersTitle", description: "admin.academics.createSectionWizard.stepTeachersDesc" },
  5: { title: "admin.academics.createSectionWizard.stepStudentsTitle", description: "admin.academics.createSectionWizard.stepStudentsDesc" },
  6: { title: "admin.academics.createSectionWizard.stepTimetableTitle", description: "admin.academics.createSectionWizard.stepTimetableDesc" },
};

const SECTION_TYPE_LABEL_KEYS: Record<string, { label: string; desc: string }> = {
  Regular: { label: "admin.academics.createSectionWizard.sectionTypeRegularLabel", desc: "admin.academics.createSectionWizard.sectionTypeRegularDesc" },
  Advanced: { label: "admin.academics.createSectionWizard.sectionTypeAdvancedLabel", desc: "admin.academics.createSectionWizard.sectionTypeAdvancedDesc" },
  "Special Needs": { label: "admin.academics.createSectionWizard.sectionTypeSpecialLabel", desc: "admin.academics.createSectionWizard.sectionTypeSpecialDesc" },
};

const SUBJECT_LABEL_KEYS: Record<string, string> = {
  Mathematics: "admin.academics.createSectionWizard.subjectMathematics",
  Science: "admin.academics.createSectionWizard.subjectScience",
  English: "admin.academics.createSectionWizard.subjectEnglish",
  History: "admin.academics.createSectionWizard.subjectHistory",
  Geography: "admin.academics.createSectionWizard.subjectGeography",
  Physics: "admin.academics.createSectionWizard.subjectPhysics",
  Chemistry: "admin.academics.createSectionWizard.subjectChemistry",
  Biology: "admin.academics.createSectionWizard.subjectBiology",
  "Computer Science": "admin.academics.createSectionWizard.subjectComputerScience",
  "Social Studies": "admin.academics.createSectionWizard.subjectSocialStudies",
  Hindi: "admin.academics.createSectionWizard.subjectHindi",
  Tamil: "admin.academics.createSectionWizard.subjectTamil",
  "Art & Craft": "admin.academics.createSectionWizard.subjectArtCraft",
  "Physical Education": "admin.academics.createSectionWizard.subjectPhysicalEducation",
  Music: "admin.academics.createSectionWizard.subjectMusic",
};

export default function CreateSectionWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const grade = ((location.state as any)?.grade || searchParams.get("grade") || "Grade 1") as string;
  const stateSections = (((location.state as any)?.existingSections) || []) as string[];
  const academicYear = ((location.state as any)?.academicYear || "2026-2027") as string;

  const { classes, loading: classesLoading, addClass, addSection: createSectionInDb, addTimetableSlot } = useClasses();

  // Existing sections for this grade — union of what the caller passed in
  // location.state (may be missing when navigated directly by URL) and the
  // LIVE class list, so the duplicate check never silently passes on stale
  // or absent data.
  const existingSections = useMemo(() => {
    const live = classes
      .filter(c => (c.grade || "").trim().toLowerCase() === grade.trim().toLowerCase())
      .map(c => ((c as any).section as string) || String(c.name || "").replace(new RegExp(`^${grade}\\s*-\\s*`, "i"), "").trim())
      .filter(Boolean);
    return Array.from(new Set([...stateSections, ...live]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, grade, stateSections.join("|")]);
  const { staff } = useStaff();
  const { students } = useStudents();

  const [currentStep, setCurrentStep] = useState(1);
  // suggest the next free section letter
  const nextLetter = (() => {
    for (let i = 0; i < 26; i++) {
      const L = String.fromCharCode(65 + i);
      if (!existingSections.map(s => s.toUpperCase().slice(-1)).includes(L)) return L;
    }
    return "A";
  })();

  const [formData, setFormData] = useState({
    sectionName: nextLetter,
    capacity: 40,
    sectionType: "Regular",
    semester: "",
    subjects: [] as string[],
    classTeacher: "",
    subjectTeachers: {} as Record<string, string>,
    studentAssignment: "auto",
    selectedStudents: [] as string[],
    timetable: "auto",
  });

  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const eligibleStudents = students.filter(s => {
    const g = ((s as any).grade || (s as any).class || "") as string;
    return g.toLowerCase().includes(grade.toLowerCase()) || g === grade || (s as any).classId === grade;
  });
  const filteredStudents = (eligibleStudents.length ? eligibleStudents : students).filter(s =>
    (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.email || "").toLowerCase().includes(studentSearch.toLowerCase())
  );
  const filteredSubjects = DEFAULT_SUBJECTS.filter(s =>
    !formData.subjects.includes(s) && s.toLowerCase().includes(subjectSearch.toLowerCase())
  );
  const subjectLabel = (s: string) => (SUBJECT_LABEL_KEYS[s] ? t(SUBJECT_LABEL_KEYS[s]) : s);

  const nameClean = formData.sectionName.trim();
  const duplicate = existingSections.some(s =>
    s.trim().toLowerCase() === nameClean.toLowerCase() ||
    s.trim().toLowerCase() === `section ${nameClean.toLowerCase()}`);

  const isStepValid = () => {
    switch (currentStep) {
      // While the class list is still loading, duplicates are unknown — block
      // the step instead of silently letting a duplicate through.
      case 1: return nameClean !== "" && !duplicate && !classesLoading && formData.capacity > 0;
      case 3: return formData.subjects.length > 0;
      default: return true;
    }
  };

  const toggleSubject = (subject: string) =>
    setFormData(f => ({ ...f, subjects: f.subjects.includes(subject) ? f.subjects.filter(s => s !== subject) : [...f.subjects, subject] }));

  const addCustomSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed) return;
    if (formData.subjects.includes(trimmed)) { toast.warning(t("admin.academics.createSectionWizard.toastSubjectAlreadyAdded")); return; }
    setFormData(f => ({ ...f, subjects: [...f.subjects, trimmed] }));
    setNewSubjectInput("");
  };

  const toggleStudent = (id: string) =>
    setFormData(f => ({ ...f, selectedStudents: f.selectedStudents.includes(id) ? f.selectedStudents.filter(x => x !== id) : [...f.selectedStudents, id] }));

  const generateAutoTimetable = async (classId: string) => {
    if (formData.subjects.length === 0) return;
    let idx = 0;
    for (const day of DAYS) {
      for (let p = 0; p < Math.min(formData.subjects.length, 4); p++) {
        const subject = formData.subjects[idx % formData.subjects.length];
        const teacherName = formData.subjectTeachers[subject] || formData.classTeacher || "TBD";
        try {
          await addTimetableSlot({
            classId, sectionId: "", day: day as TimetableSlot["day"],
            startTime: PERIODS[p].start, endTime: PERIODS[p].end,
            subject, teacherId: "", teacherName,
          });
        } catch (e) { console.error(e); }
        idx++;
      }
    }
  };

  const handleSkip = () => { if (currentStep < steps.length) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); else navigate("/academics/classes"); };

  const handleNext = async () => {
    if (currentStep < steps.length) { setCurrentStep(currentStep + 1); return; }
    // Final re-check against the freshly loaded class list — the section list
    // may have changed (or only just finished loading) since step 1.
    if (classesLoading) { toast.error(t("admin.academics.createSectionWizard.toastStillLoading")); return; }
    if (duplicate) {
      toast.error(t("admin.academics.createSectionWizard.toastDuplicateSection", { section: nameClean, grade }));
      setCurrentStep(1);
      return;
    }
    setCreating(true);
    try {
      const teacher = formData.classTeacher || "Unassigned";
      const classId = await addClass({
        name: `${grade} - ${nameClean}`,
        grade,
        section: nameClean,
        teacher,
        studentsCount: formData.selectedStudents.length,
        subjectsCount: formData.subjects.length,
        subjects: formData.subjects,
        capacity: formData.capacity,
        status: "Active",
        academicYearId: "2024-25",
        academicYear,
        semester: formData.semester,
        sectionType: formData.sectionType,
      } as any);

      if (classId) {
        await createSectionInDb({
          name: nameClean, classId, className: `${grade} - ${nameClean}`,
          teacherName: teacher, capacity: formData.capacity, studentsCount: 0,
        });
        if (formData.timetable === "auto") await generateAutoTimetable(classId);
      }
      toast.success(t("admin.academics.createSectionWizard.toastSectionAdded", { section: nameClean, grade }), {
        description: formData.timetable === "auto" ? t("admin.academics.createSectionWizard.toastTimetableAutoGenerated") : t("admin.academics.createSectionWizard.toastTimetableLater"),
      });
      navigate("/academics/classes", { state: { selectedGrade: grade } });
    } catch (e) {
      toast.error(t("admin.academics.createSectionWizard.toastCreateFailed"));
      console.error(e);
    } finally { setCreating(false); }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            {existingSections.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createSectionWizard.existingSectionsIn", { grade })}</Label>
                <div className="flex flex-wrap gap-2">
                  {existingSections.map(s => (
                    <Badge key={s} variant="outline" className="rounded-full border-slate-200 text-slate-500 font-bold">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createSectionWizard.sectionNameLabel")}</Label>
                <Input
                  value={formData.sectionName}
                  onChange={e => setFormData({ ...formData, sectionName: e.target.value })}
                  className="rounded-xl h-12 border-slate-200"
                  placeholder={t("admin.academics.createSectionWizard.sectionNamePlaceholder")}
                />
                {duplicate && <p className="text-xs font-semibold text-rose-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t("admin.academics.createSectionWizard.sectionAlreadyExists", { section: nameClean, grade })}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["A", "B", "C", "D", "E", "F"].filter(L => !existingSections.map(s => s.toUpperCase().slice(-1)).includes(L)).map(L => (
                    <button key={L} onClick={() => setFormData({ ...formData, sectionName: L })}
                      className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                        formData.sectionName === L ? "bg-[#9810fa] text-white border-[#9810fa]" : "bg-white text-slate-500 border-slate-200 hover:border-[#9810fa]/40")}>
                      {L}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createSectionWizard.capacityLabel")}</Label>
                <Input type="number" value={formData.capacity}
                  onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                  className="rounded-xl h-12 border-slate-200" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createSectionWizard.sectionTypeLabel")}</Label>
              <div className="grid grid-cols-3 gap-3">
                {SECTION_TYPES.map(st => (
                  <div key={st.id} onClick={() => setFormData({ ...formData, sectionType: st.id })}
                    className={cn("p-4 rounded-2xl border-2 cursor-pointer transition-all text-center",
                      formData.sectionType === st.id ? "border-[#9810fa] bg-[#9810fa]/5" : "border-slate-100 bg-slate-50 hover:border-slate-200")}>
                    <p className={cn("text-sm font-bold", formData.sectionType === st.id ? "text-[#9810fa]" : "text-slate-700")}>{t(SECTION_TYPE_LABEL_KEYS[st.id]?.label || st.label)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t(SECTION_TYPE_LABEL_KEYS[st.id]?.desc || st.desc)}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="flex flex-col items-center justify-center py-2 text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-violet-50 flex items-center justify-center"><Calendar className="h-8 w-8 text-[#9810fa]" /></div>
              <div><h3 className="text-lg font-bold text-slate-900">{t("admin.academics.createSectionWizard.selectSemesterTitle")}</h3><p className="text-slate-500 text-sm mt-1">{t("admin.academics.createSectionWizard.selectSemesterDesc")}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "Semester 1", labelKey: "admin.academics.createSectionWizard.semesterOption1" },
                { value: "Semester 2", labelKey: "admin.academics.createSectionWizard.semesterOption2" },
                { value: "Term 1", labelKey: "admin.academics.createSectionWizard.termOption1" },
                { value: "Term 2", labelKey: "admin.academics.createSectionWizard.termOption2" },
              ].map(sem => (
                <div key={sem.value} onClick={() => setFormData({ ...formData, semester: sem.value })}
                  className={cn("p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 text-center",
                    formData.semester === sem.value ? "border-[#9810fa] bg-[#9810fa]/5" : "border-slate-100 bg-slate-50 hover:border-slate-200")}>
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-lg font-black",
                    formData.semester === sem.value ? "bg-[#9810fa] text-white" : "bg-white text-slate-400")}>{sem.value.split(" ")[1]}</div>
                  <span className={cn("text-sm font-bold", formData.semester === sem.value ? "text-[#9810fa]" : "text-slate-700")}>{t(sem.labelKey)}</span>
                </div>
              ))}
            </div>
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">{t("admin.academics.createSectionWizard.semesterSkipHint")}</p>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            {formData.subjects.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createSectionWizard.selectedSubjectsLabel", { count: formData.subjects.length })}</Label>
                <div className="flex flex-wrap gap-2 p-3 bg-[#9810fa]/5 rounded-2xl border border-[#9810fa]/20 min-h-[56px]">
                  {formData.subjects.map(s => (
                    <Badge key={s} className="bg-[#9810fa] text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#5c0fa0]" onClick={() => toggleSubject(s)}>
                      {subjectLabel(s)} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createSectionWizard.addCustomSubjectLabel")}</Label>
              <div className="flex gap-2">
                <Input placeholder={t("admin.academics.createSectionWizard.typeSubjectNamePlaceholder")} value={newSubjectInput}
                  onChange={e => setNewSubjectInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSubject(); } }}
                  className="rounded-xl h-11 flex-1" />
                <Button className="rounded-xl gradient-primary text-white font-bold h-11 px-5 shadow-lg shadow-primary/20" onClick={addCustomSubject} disabled={!newSubjectInput.trim()}>
                  <Plus className="h-4 w-4 me-1" /> {t("admin.academics.createSectionWizard.addButton")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createSectionWizard.quickPickLabel")}</Label>
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder={t("admin.academics.createSectionWizard.searchPlaceholder")} value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)} className="rounded-xl h-8 ps-8 text-xs w-36" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pe-1">
                {filteredSubjects.map(subject => (
                  <div key={subject} onClick={() => toggleSubject(subject)}
                    className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:border-[#9810fa]/40 hover:bg-[#9810fa]/5 transition-all cursor-pointer flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-600 truncate">{subjectLabel(subject)}</span>
                  </div>
                ))}
                {filteredSubjects.length === 0 && <p className="col-span-3 text-center text-xs text-slate-400 py-4">{t("admin.academics.createSectionWizard.noSubjectsToAdd")}</p>}
              </div>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 font-medium">{t("admin.academics.createSectionWizard.teacherAssignmentOptionalHint")}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createSectionWizard.assignClassTeacherLabel")}</Label>
              <Select value={formData.classTeacher} onValueChange={v => setFormData({ ...formData, classTeacher: v })}>
                <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder={t("admin.academics.createSectionWizard.selectTeacherPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {staff && staff.length > 0 ? staff.map(m => <SelectItem key={m.id} value={m.name}>{m.name} ({m.role})</SelectItem>)
                    : <><SelectItem value="Mr. Sharma">{t("admin.academics.createSectionWizard.fallbackTeacherSharma")}</SelectItem><SelectItem value="Ms. Verma">{t("admin.academics.createSectionWizard.fallbackTeacherVerma")}</SelectItem></>}
                </SelectContent>
              </Select>
            </div>
            {formData.subjects.length > 0 && (
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createSectionWizard.assignSubjectTeachersLabel")}</Label>
                {formData.subjects.map(subject => (
                  <div key={subject} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-sm font-bold text-slate-700">{subjectLabel(subject)}</span>
                    <Select value={formData.subjectTeachers[subject] || ""} onValueChange={val => setFormData({ ...formData, subjectTeachers: { ...formData.subjectTeachers, [subject]: val } })}>
                      <SelectTrigger className="w-[200px] h-9 rounded-lg bg-white"><SelectValue placeholder={t("admin.academics.createSectionWizard.assignTeacherPlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {staff && staff.length > 0 ? staff.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)
                          : <><SelectItem value="Mr. Rajesh">{t("admin.academics.createSectionWizard.fallbackTeacherRajesh")}</SelectItem><SelectItem value="Ms. Priya">{t("admin.academics.createSectionWizard.fallbackTeacherPriya")}</SelectItem></>}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        );

      case 5:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: "auto", title: t("admin.academics.createSectionWizard.studentAutoAssignTitle"), desc: t("admin.academics.createSectionWizard.studentAutoAssignDesc"), icon: Zap },
                { id: "manual", title: t("admin.academics.createSectionWizard.studentManualAssignTitle"), desc: t("admin.academics.createSectionWizard.studentManualAssignDesc"), icon: UserCheck },
                { id: "bulk", title: t("admin.academics.createSectionWizard.studentBulkUploadTitle"), desc: t("admin.academics.createSectionWizard.studentBulkUploadDesc"), icon: LayoutGrid },
              ].map(opt => (
                <div key={opt.id} onClick={() => setFormData({ ...formData, studentAssignment: opt.id })}
                  className={cn("p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col gap-3",
                    formData.studentAssignment === opt.id ? "border-[#9810fa] bg-[#9810fa]/5" : "border-slate-100 bg-slate-50 hover:border-slate-200")}>
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", formData.studentAssignment === opt.id ? "bg-[#9810fa] text-white" : "bg-white text-slate-400")}>
                    <opt.icon className="h-5 w-5" />
                  </div>
                  <div><h4 className={cn("font-bold", formData.studentAssignment === opt.id ? "text-[#9810fa]" : "text-slate-900")}>{opt.title}</h4><p className="text-xs text-slate-500 mt-1">{opt.desc}</p></div>
                </div>
              ))}
            </div>
            {formData.studentAssignment === "manual" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">{t("admin.academics.createSectionWizard.studentsAvailableFor", { grade })}</p>
                  {formData.selectedStudents.length > 0 && <Badge className="bg-[#9810fa]/10 text-[#9810fa] border-none rounded-full font-bold">{t("admin.academics.createSectionWizard.studentsSelectedCount", { count: formData.selectedStudents.length })}</Badge>}
                </div>
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder={t("admin.academics.createSectionWizard.searchStudentsPlaceholder")} value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="rounded-xl ps-10 h-11" />
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-2 pe-1">
                  {filteredStudents.length > 0 ? filteredStudents.map(student => {
                    const sel = formData.selectedStudents.includes(student.id);
                    return (
                      <div key={student.id} onClick={() => toggleStudent(student.id)}
                        className={cn("flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all", sel ? "border-[#9810fa] bg-[#9810fa]/5" : "border-slate-100 bg-slate-50 hover:border-slate-200")}>
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0", sel ? "bg-[#9810fa] text-white" : "bg-slate-200 text-slate-600")}>
                          {sel ? <Check className="h-4 w-4" /> : (student.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{student.name}</p><p className="text-xs text-slate-400 truncate">{student.email}</p></div>
                        {sel && <CheckCircle2 className="h-4 w-4 text-[#9810fa] flex-shrink-0" />}
                      </div>
                    );
                  }) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <AlertCircle className="h-8 w-8 text-slate-300" /><p className="text-sm font-bold text-slate-500">{t("admin.academics.createSectionWizard.noStudentsFound")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {formData.studentAssignment === "auto" && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                <Zap className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <p className="text-sm font-bold text-blue-900">{t("admin.academics.createSectionWizard.studentsAutoAssignedHint")}</p>
              </div>
            )}
            {formData.studentAssignment === "bulk" && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <LayoutGrid className="h-8 w-8 text-slate-300" /><p className="text-sm font-bold text-slate-600">{t("admin.academics.createSectionWizard.uploadCsvExcelTitle")}</p>
                <Button variant="outline" className="rounded-xl mt-1 text-xs font-bold">{t("admin.academics.createSectionWizard.browseFileButton")}</Button>
              </div>
            )}
          </motion.div>
        );

      case 6:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
              <div className="h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center"><Calendar className="h-10 w-10 text-purple-600" /></div>
              <div><h3 className="text-xl font-bold text-slate-900">{t("admin.academics.createSectionWizard.timetableSetupTitle")}</h3><p className="text-slate-500 text-sm max-w-md mx-auto mt-2">{t("admin.academics.createSectionWizard.timetableSetupDesc")}</p></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[{ id: "auto", title: t("admin.academics.createSectionWizard.timetableAutoGenerateTitle"), desc: t("admin.academics.createSectionWizard.timetableAutoGenerateDesc"), icon: Zap }, { id: "manual", title: t("admin.academics.createSectionWizard.timetableManualSetupTitle"), desc: t("admin.academics.createSectionWizard.timetableManualSetupDesc"), icon: LayoutGrid }].map(opt => (
                <div key={opt.id} onClick={() => setFormData({ ...formData, timetable: opt.id })}
                  className={cn("p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4", formData.timetable === opt.id ? "border-[#9810fa] bg-[#9810fa]/5" : "border-slate-100 bg-slate-50 hover:border-slate-200")}>
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", formData.timetable === opt.id ? "bg-[#9810fa] text-white" : "bg-white text-slate-400")}><opt.icon className="h-6 w-6" /></div>
                  <div><h4 className={cn("font-bold", formData.timetable === opt.id ? "text-[#9810fa]" : "text-slate-900")}>{opt.title}</h4><p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">{opt.desc}</p></div>
                </div>
              ))}
            </div>
            {formData.timetable === "auto" && formData.subjects.length > 0 && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-3"><Zap className="h-5 w-5 text-purple-600" /><p className="text-sm font-bold text-indigo-900">{t("admin.academics.createSectionWizard.timetablePreviewLabel")}</p></div>
                <div className="grid grid-cols-3 gap-2">
                  {DAYS.slice(0, 6).map((day, di) => (
                    <div key={day} className="bg-white rounded-xl p-2 text-center border border-indigo-100">
                      <p className="text-[9px] font-bold uppercase text-indigo-400 tracking-wider">{day.slice(0, 3)}</p>
                      <p className="text-xs font-bold text-indigo-700 mt-1 truncate">{subjectLabel(formData.subjects[di % formData.subjects.length])}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );

      default: return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <span className="hover:text-[#9810fa] cursor-pointer" onClick={() => navigate("/academics/classes")}>{t("admin.academics.createSectionWizard.breadcrumbClasses")}</span>
              <ChevronRight className="h-3 w-3 rtl:rotate-180" />
              <span className="hover:text-[#9810fa] cursor-pointer" onClick={() => navigate("/academics/classes", { state: { selectedGrade: grade } })}>{grade}</span>
              <ChevronRight className="h-3 w-3 rtl:rotate-180" />
              <span className="text-[#9810fa]">{t("admin.academics.createSectionWizard.breadcrumbAddSection")}</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900">{t("admin.academics.createSectionWizard.pageTitle", { grade })}</h1>
            <p className="text-slate-500 font-medium">{t("admin.academics.createSectionWizard.pageSubtitle")}</p>
          </div>
          <Button variant="ghost" className="text-slate-500 font-bold" onClick={() => navigate("/academics/classes", { state: { selectedGrade: grade } })}>{t("admin.academics.createSectionWizard.cancelButton")}</Button>
        </div>

        {/* Steps Progress */}
        <div className="flex items-center justify-between relative px-2">
          <div className="absolute top-5 start-0 w-full h-0.5 bg-slate-100 z-0" />
          {steps.map(step => (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
              <div className={cn("h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 border-4",
                currentStep === step.id ? "bg-[#9810fa] text-white border-white shadow-lg shadow-[#9810fa]/20 scale-110"
                  : currentStep > step.id ? "bg-emerald-500 text-white border-white" : "bg-white text-slate-400 border-slate-50")}>
                {currentStep > step.id ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </div>
              <span className={cn("text-[10px] font-bold uppercase tracking-wider", currentStep === step.id ? "text-[#9810fa]" : "text-slate-400")}>{t(STEP_LABEL_KEYS[step.id]?.title || step.title)}</span>
            </div>
          ))}
        </div>

        {/* Wizard Card */}
        <Card className="border-none shadow-2xl shadow-slate-200/50 rounded-[32px] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black text-slate-900">{t(STEP_LABEL_KEYS[steps[currentStep - 1].id]?.title || steps[currentStep - 1].title)}</CardTitle>
                <CardDescription className="text-slate-500 font-medium">{t(STEP_LABEL_KEYS[steps[currentStep - 1].id]?.description || steps[currentStep - 1].description)}</CardDescription>
              </div>
              <Badge className="bg-[#9810fa]/10 text-[#9810fa] border-none px-4 py-1 rounded-full font-bold">{t("admin.academics.createSectionWizard.stepOfTotal", { current: currentStep, total: steps.length })}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8">{renderStep()}</CardContent>
          <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <Button variant="ghost" className="rounded-xl font-bold text-slate-500 h-12 px-8" onClick={handleBack}>
              <ChevronLeft className="h-5 w-5 me-2 rtl:rotate-180" /> {currentStep === 1 ? t("admin.academics.createSectionWizard.cancelButton") : t("admin.academics.createSectionWizard.backButton")}
            </Button>
            <div className="flex items-center gap-3">
              {(currentStep === 2 || currentStep === 4) && (
                <Button variant="outline" className="rounded-xl font-bold h-12 px-8 text-slate-500 border-slate-200" onClick={handleSkip}>
                  {t("admin.academics.createSectionWizard.skipButton")} <ChevronRight className="h-4 w-4 ms-1 rtl:rotate-180" />
                </Button>
              )}
              <Button className="rounded-xl gradient-primary text-white font-bold h-12 px-12 shadow-lg shadow-primary/20 disabled:opacity-50" onClick={handleNext} disabled={!isStepValid() || creating}>
                {creating ? t("admin.academics.createSectionWizard.creatingLabel") : currentStep === steps.length ? t("admin.academics.createSectionWizard.finishCreateButton") : t("admin.academics.createSectionWizard.nextStepButton")}
                <ChevronRight className="h-5 w-5 ms-2 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
