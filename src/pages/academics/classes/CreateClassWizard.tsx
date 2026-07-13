import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Users, 
  BookOpen, 
  Calendar,
  UserCheck,
  LayoutGrid,
  GraduationCap,
  Search,
  Check,
  X,
  Zap,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useClasses } from "@/hooks/useClasses";
import { useStaff } from "@/contexts/StaffContext";
import { useStudents } from "@/contexts/StudentContext";
import { useGrades, useCurriculumContext } from "@/contexts/CurriculumContext";
import { getDefaultSubjectsForGrade } from "@/lib/curriculumConfig";
import type { TimetableSlot } from "@/types/classes";

// Academic year options (scrollable)
const ACADEMIC_YEAR_OPTIONS = [
  "2020-2021",
  "2021-2022",
  "2022-2023",
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "2026-2027",
  "2027-2028",
  "2028-2029",
  "2029-2030",
  "2030-2031",
];

// Default subject list for quick pick
const DEFAULT_SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "History",
  "Geography",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Social Studies",
  "Hindi",
  "Tamil",
  "Art & Craft",
  "Physical Education",
  "Music",
];

// Display-label keys for semester identifiers (identifiers themselves are stored as data).
const SEMESTER_LABEL_KEYS: Record<string, string> = {
  "Semester 1": "admin.academics.createClassWizard.semester1",
  "Semester 2": "admin.academics.createClassWizard.semester2",
  "Semester 3": "admin.academics.createClassWizard.semester3",
  "Semester 4": "admin.academics.createClassWizard.semester4",
};

// Days of the week and periods for auto-timetable generation
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Display-label keys for the day abbreviations shown in the timetable preview
// (DAYS values themselves are stored as data and must stay in English).
const DAY_ABBR_LABEL_KEYS: Record<string, string> = {
  Monday: "admin.academics.createClassWizard.dayMonAbbr",
  Tuesday: "admin.academics.createClassWizard.dayTueAbbr",
  Wednesday: "admin.academics.createClassWizard.dayWedAbbr",
  Thursday: "admin.academics.createClassWizard.dayThuAbbr",
  Friday: "admin.academics.createClassWizard.dayFriAbbr",
  Saturday: "admin.academics.createClassWizard.daySatAbbr",
};
const PERIODS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:15", end: "11:15" },
  { start: "11:15", end: "12:15" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
];

const STEP_DEFS = [
  { id: 1, titleKey: "admin.academics.createClassWizard.step1Title", descKey: "admin.academics.createClassWizard.step1Desc", icon: GraduationCap },
  { id: 2, titleKey: "admin.academics.createClassWizard.step2Title", descKey: "admin.academics.createClassWizard.step2Desc", icon: LayoutGrid },
  { id: 3, titleKey: "admin.academics.createClassWizard.step3Title", descKey: "admin.academics.createClassWizard.step3Desc", icon: Calendar },
  { id: 4, titleKey: "admin.academics.createClassWizard.step4Title", descKey: "admin.academics.createClassWizard.step4Desc", icon: BookOpen },
  { id: 5, titleKey: "admin.academics.createClassWizard.step5Title", descKey: "admin.academics.createClassWizard.step5Desc", icon: UserCheck },
  { id: 6, titleKey: "admin.academics.createClassWizard.step6Title", descKey: "admin.academics.createClassWizard.step6Desc", icon: Users },
  { id: 7, titleKey: "admin.academics.createClassWizard.step7Title", descKey: "admin.academics.createClassWizard.step7Desc", icon: Calendar },
];

export default function CreateClassWizard() {
  const { t } = useTranslation();
  const steps = STEP_DEFS.map(s => ({ ...s, title: t(s.titleKey), description: t(s.descKey) }));
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    className: "",
    academicYear: "2024-2025",
    semester: "",
    sections: [{ name: "A", capacity: 40 }],
    subjects: [] as string[],
    classTeacher: "",
    subjectTeachers: {} as Record<string, string>,
    studentAssignment: "auto",
    selectedStudents: [] as string[],
    timetable: "auto",
  });

  // Custom subject input state
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");

  // Student search for manual assign
  const [studentSearch, setStudentSearch] = useState("");

  const navigate = useNavigate();

  const { classes, addClass, addSection: createSectionInDb, addTimetableSlot } = useClasses();
  const { staff } = useStaff();
  const { students } = useStudents();
  const grades = useGrades();
  const { curriculum } = useCurriculumContext();

  // Filter students by selected grade (className)
  const eligibleStudents = formData.className
    ? students.filter(s => {
        const grade = ((s as any).grade || (s as any).class || "") as string;
        const cn = formData.className.toLowerCase();
        return (
          grade.toLowerCase().includes(cn) ||
          (s as any).classId === formData.className ||
          grade === formData.className
        );
      })
    : students;

  const filteredStudents = eligibleStudents.filter(s =>
    (s.name || "").toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.email || "").toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredSubjects = DEFAULT_SUBJECTS.filter(
    s =>
      !formData.subjects.includes(s) &&
      s.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  // Duplicate guard — a class is created as "<Grade> - <Section>", so block any
  // section whose resulting class name already exists (case-insensitive).
  const existingClassNames = new Set(classes.map(c => (c.name || "").trim().toLowerCase()));
  const fullClassName = (sectionName: string) => `${formData.className.trim()} - ${sectionName.trim()}`;
  const duplicateSections = formData.className.trim()
    ? formData.sections.filter(s => s.name.trim() !== "" && existingClassNames.has(fullClassName(s.name).toLowerCase()))
    : [];

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.className.trim() !== "" && formData.academicYear.trim() !== "";
      case 2:
        return formData.sections.length > 0
          && formData.sections.every(s => s.name.trim() !== "" && s.capacity > 0)
          && duplicateSections.length === 0;
      case 3:
        return true; // semester is optional
      case 4:
        return formData.subjects.length > 0;
      case 5:
        return true; // teachers can be skipped
      default:
        return true;
    }
  };

  const generateAutoTimetable = async (classId: string, sectionName: string) => {
    // Distribute subjects across the week
    const subjects = formData.subjects;
    if (subjects.length === 0) return;

    const slots: { day: string; startTime: string; endTime: string; subject: string; teacherName: string }[] = [];
    let subjectIndex = 0;

    for (const day of DAYS) {
      const periodsPerDay = Math.min(subjects.length, 4);
      for (let p = 0; p < periodsPerDay; p++) {
        const period = PERIODS[p];
        const subject = subjects[subjectIndex % subjects.length];
        const teacherName = formData.subjectTeachers[subject] || formData.classTeacher || "TBD";
        slots.push({
          day,
          startTime: period.start,
          endTime: period.end,
          subject,
          teacherName,
        });
        subjectIndex++;
      }
    }

    for (const slot of slots) {
      try {
        await addTimetableSlot({
          classId,
          sectionId: "",
          day: slot.day as TimetableSlot["day"],
          startTime: slot.startTime,
          endTime: slot.endTime,
          subject: slot.subject,
          teacherId: "",
          teacherName: slot.teacherName,
        });
      } catch (e) {
        console.error("Error adding timetable slot:", e);
      }
    }
  };

  const handleSkipStep = () => {
    if (currentStep < steps.length) setCurrentStep(currentStep + 1);
  };

  const handleNext = async () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final re-check against the live class list (it may have loaded/changed
      // since step 2 was validated).
      if (duplicateSections.length > 0) {
        const dupNames = duplicateSections.map(s => fullClassName(s.name)).join(", ");
        toast.error(
          duplicateSections.length === 1
            ? t("admin.academics.createClassWizard.duplicateSectionErrorSingular", { names: dupNames })
            : t("admin.academics.createClassWizard.duplicateSectionErrorPlural", { names: dupNames })
        );
        setCurrentStep(2);
        return;
      }
      try {
        for (const section of formData.sections) {
          // "Unassigned" is stored as data (compared elsewhere as an identifier) — keep as literal English.
          const selectedTeacherName = formData.classTeacher || "Unassigned";

          const classId = await addClass({
            name: `${formData.className} - ${section.name}`,
            grade: formData.className,
            section: section.name,
            teacher: selectedTeacherName,
            studentsCount: 0,
            subjectsCount: formData.subjects.length,
            subjects: formData.subjects,
            capacity: section.capacity,
            status: "Active",
            academicYearId: "2024-25",
            academicYear: formData.academicYear,
            semester: formData.semester,
          } as any);

          if (classId) {
            await createSectionInDb({
              name: section.name,
              classId: classId,
              className: `${formData.className} - ${section.name}`,
              teacherName: selectedTeacherName,
              capacity: section.capacity,
              studentsCount: 0,
            });

            // Auto-generate timetable if selected
            if (formData.timetable === "auto") {
              await generateAutoTimetable(classId, section.name);
            }
          }
        }
        toast.success(t("admin.academics.createClassWizard.classCreatedSuccess"), {
          description: formData.timetable === "auto"
            ? t("admin.academics.createClassWizard.timetableAutoGeneratedDesc")
            : t("admin.academics.createClassWizard.timetableLaterDesc"),
        });
        navigate("/academics/classes");
      } catch (error) {
        toast.error(t("admin.academics.createClassWizard.classCreateFailedError"));
        console.error(error);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate("/academics/classes");
    }
  };

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { name: String.fromCharCode(65 + formData.sections.length), capacity: 40 }],
    });
  };

  const removeSection = (index: number) => {
    const newSections = [...formData.sections];
    newSections.splice(index, 1);
    setFormData({ ...formData, sections: newSections });
  };

  const toggleSubject = (subject: string) => {
    const newSubjects = formData.subjects.includes(subject)
      ? formData.subjects.filter(s => s !== subject)
      : [...formData.subjects, subject];
    setFormData({ ...formData, subjects: newSubjects });
  };

  const addCustomSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed) return;
    if (formData.subjects.includes(trimmed)) {
      toast.warning(t("admin.academics.createClassWizard.subjectAlreadyAdded"));
      return;
    }
    setFormData({ ...formData, subjects: [...formData.subjects, trimmed] });
    setNewSubjectInput("");
  };

  const toggleStudentSelection = (studentId: string) => {
    const updated = formData.selectedStudents.includes(studentId)
      ? formData.selectedStudents.filter(id => id !== studentId)
      : [...formData.selectedStudents, studentId];
    setFormData({ ...formData, selectedStudents: updated });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-5">
              {/* Class Name Dropdown */}
              <div className="space-y-2">
                <Label htmlFor="className" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t("admin.academics.createClassWizard.classNameLabel")}
                </Label>
                <Select
                  value={formData.className}
                  onValueChange={(v) => {
                    // Auto-fill the curriculum's default subjects for this
                    // grade — still fully editable in the Subjects step.
                    // Only applies when nothing's been picked yet, so
                    // re-selecting a grade after manually curating a list
                    // never clobbers that choice.
                    const shouldAutoFill = formData.subjects.length === 0;
                    const defaults = getDefaultSubjectsForGrade(curriculum, v);
                    setFormData({
                      ...formData,
                      className: v,
                      subjects: shouldAutoFill && defaults.length ? defaults : formData.subjects,
                    });
                  }}
                >
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 bg-white">
                    <SelectValue placeholder={t("admin.academics.createClassWizard.selectGradePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px] overflow-y-auto rounded-xl">
                    {grades.map(grade => (
                      <SelectItem key={grade} value={grade} className="font-medium">
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Academic Year - Scrollable Select */}
              <div className="space-y-2">
                <Label htmlFor="academicYear" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t("admin.academics.createClassWizard.academicYearLabel")}
                </Label>
                <Select
                  value={formData.academicYear}
                  onValueChange={(v) => setFormData({ ...formData, academicYear: v })}
                >
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 bg-white">
                    <SelectValue placeholder={t("admin.academics.createClassWizard.selectAcademicYearPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px] overflow-y-auto rounded-xl">
                    {ACADEMIC_YEAR_OPTIONS.map(year => (
                      <SelectItem key={year} value={year} className="font-medium">
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              {formData.sections.map((section, index) => (
                <div key={index} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.sectionNameLabel")}</Label>
                    <Input
                      value={section.name}
                      onChange={(e) => {
                        const newSections = [...formData.sections];
                        newSections[index].name = e.target.value;
                        setFormData({ ...formData, sections: newSections });
                      }}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.capacityLabel")}</Label>
                    <Input
                      type="number"
                      value={section.capacity}
                      onChange={(e) => {
                        const newSections = [...formData.sections];
                        newSections[index].capacity = parseInt(e.target.value);
                        setFormData({ ...formData, sections: newSections });
                      }}
                      className="rounded-xl"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                    onClick={() => removeSection(index)}
                    disabled={formData.sections.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full rounded-xl border-dashed border-2 h-12 gap-2"
                onClick={addSection}
              >
                <Plus className="h-4 w-4" />
                {t("admin.academics.createClassWizard.addAnotherSection")}
              </Button>
              {duplicateSections.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                  <p className="text-xs text-rose-600 font-semibold">
                    {duplicateSections.length === 1
                      ? t("admin.academics.createClassWizard.duplicateSectionInlineSingular", { names: duplicateSections.map(s => fullClassName(s.name)).join(", ") })
                      : t("admin.academics.createClassWizard.duplicateSectionInlinePlural", { names: duplicateSections.map(s => fullClassName(s.name)).join(", ") })}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-violet-50 flex items-center justify-center">
                <Calendar className="h-8 w-8 text-[#9810fa]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t("admin.academics.createClassWizard.selectSemesterTitle")}</h3>
                <p className="text-slate-500 text-sm mt-1">{t("admin.academics.createClassWizard.selectSemesterSubtitle")}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {["Semester 1", "Semester 2", "Semester 3", "Semester 4"].map((sem) => (
                <div
                  key={sem}
                  onClick={() => setFormData({ ...formData, semester: sem })}
                  className={cn(
                    "p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 text-center",
                    formData.semester === sem
                      ? "border-[#9810fa] bg-[#9810fa]/5"
                      : "border-slate-100 bg-slate-50 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center text-lg font-black",
                    formData.semester === sem ? "bg-[#9810fa] text-white" : "bg-white text-slate-400"
                  )}>
                    {sem.split(" ")[1]}
                  </div>
                  <span className={cn("text-sm font-bold", formData.semester === sem ? "text-[#9810fa]" : "text-slate-700")}>
                    {t(SEMESTER_LABEL_KEYS[sem] || sem)}
                  </span>
                </div>
              ))}
            </div>

            {/* Custom semester input */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.customSemesterLabel")}</Label>
              <Input
                placeholder={t("admin.academics.createClassWizard.customSemesterPlaceholder")}
                value={formData.semester.startsWith("Semester") ? "" : formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                className="rounded-xl h-11"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">{t("admin.academics.createClassWizard.semesterSkipNote")}</p>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Selected subjects as tags */}
            {formData.subjects.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.selectedSubjectsLabel", { count: formData.subjects.length })}</Label>
                <div className="flex flex-wrap gap-2 p-3 bg-[#9810fa]/5 rounded-2xl border border-[#9810fa]/20 min-h-[56px]">
                  {formData.subjects.map(s => (
                    <Badge
                      key={s}
                      className="bg-[#9810fa] text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#5c0fa0] transition-colors"
                      onClick={() => toggleSubject(s)}
                    >
                      {s}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom subject */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.addCustomSubjectLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("admin.academics.createClassWizard.typeSubjectNamePlaceholder")}
                  value={newSubjectInput}
                  onChange={e => setNewSubjectInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSubject(); }}}
                  className="rounded-xl h-11 flex-1"
                />
                <Button
                  className="rounded-xl gradient-primary text-white font-bold h-11 px-5 shadow-lg shadow-primary/20"
                  onClick={addCustomSubject}
                  disabled={!newSubjectInput.trim()}
                >
                  <Plus className="h-4 w-4 me-1" />
                  {t("admin.academics.createClassWizard.addButton")}
                </Button>
              </div>
            </div>

            {/* Quick-pick from defaults */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("admin.academics.createClassWizard.quickPickLabel")}</Label>
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder={t("admin.academics.createClassWizard.searchPlaceholder")}
                    value={subjectSearch}
                    onChange={e => setSubjectSearch(e.target.value)}
                    className="rounded-xl h-8 ps-8 text-xs w-36"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pe-1">
                {filteredSubjects.map(subject => (
                  <div
                    key={subject}
                    onClick={() => toggleSubject(subject)}
                    className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:border-[#9810fa]/40 hover:bg-[#9810fa]/5 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-600 truncate">{subject}</span>
                  </div>
                ))}
                {filteredSubjects.length === 0 && (
                  <p className="col-span-3 text-center text-xs text-slate-400 py-4">{t("admin.academics.createClassWizard.noSubjectsToAdd")}</p>
                )}
              </div>
            </div>
          </motion.div>
        );

      case 5:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 font-medium">{t("admin.academics.createClassWizard.teacherOptionalNote")}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createClassWizard.assignClassTeacherLabel")}</Label>
                <Select value={formData.classTeacher} onValueChange={(v) => setFormData({ ...formData, classTeacher: v })}>
                  <SelectTrigger className="rounded-xl h-12">
                    <SelectValue placeholder={t("admin.academics.createClassWizard.selectTeacherPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {staff && staff.length > 0 ? (
                      staff.map(member => (
                        <SelectItem key={member.id} value={member.name}>{member.name} ({member.role})</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="Mr. Sharma">Mr. Sharma (Math)</SelectItem>
                        <SelectItem value="Ms. Verma">Ms. Verma (Science)</SelectItem>
                        <SelectItem value="Mr. Kumar">Mr. Kumar (English)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {formData.subjects.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("admin.academics.createClassWizard.assignSubjectTeachersLabel")}</Label>
                  {formData.subjects.map(subject => (
                    <div key={subject} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-bold text-slate-700">{subject}</span>
                      <Select
                        value={formData.subjectTeachers[subject] || ""}
                        onValueChange={(val) =>
                          setFormData({
                            ...formData,
                            subjectTeachers: { ...formData.subjectTeachers, [subject]: val },
                          })
                        }
                      >
                        <SelectTrigger className="w-[200px] h-9 rounded-lg bg-white">
                          <SelectValue placeholder={t("admin.academics.createClassWizard.assignTeacherPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {staff && staff.length > 0 ? (
                            staff.map(member => (
                              <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="Mr. Rajesh">Mr. Rajesh</SelectItem>
                              <SelectItem value="Ms. Priya">Ms. Priya</SelectItem>
                              <SelectItem value="Mr. Amit">Mr. Amit</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );

      case 6:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: "auto", title: t("admin.academics.createClassWizard.autoAssignTitle"), desc: t("admin.academics.createClassWizard.autoAssignDesc"), icon: Zap },
                { id: "manual", title: t("admin.academics.createClassWizard.manualAssignTitle"), desc: t("admin.academics.createClassWizard.manualAssignDesc"), icon: UserCheck },
                { id: "bulk", title: t("admin.academics.createClassWizard.bulkUploadTitle"), desc: t("admin.academics.createClassWizard.bulkUploadDesc"), icon: LayoutGrid },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setFormData({ ...formData, studentAssignment: opt.id })}
                  className={cn(
                    "p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col gap-3",
                    formData.studentAssignment === opt.id
                      ? "border-[#9810fa] bg-[#9810fa]/5"
                      : "border-slate-100 bg-slate-50 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center",
                    formData.studentAssignment === opt.id ? "bg-[#9810fa] text-white" : "bg-white text-slate-400"
                  )}>
                    <opt.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className={cn("font-bold", formData.studentAssignment === opt.id ? "text-[#9810fa]" : "text-slate-900")}>{opt.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Manual assign: show students for the selected grade */}
            {formData.studentAssignment === "manual" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {t("admin.academics.createClassWizard.studentsAvailableFor", { className: formData.className || t("admin.academics.createClassWizard.thisClassFallback") })}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      {eligibleStudents.length === 1
                        ? t("admin.academics.createClassWizard.studentsFoundCountSingular", { count: eligibleStudents.length })
                        : t("admin.academics.createClassWizard.studentsFoundCountPlural", { count: eligibleStudents.length })}
                      {" · "}
                      {t("admin.academics.createClassWizard.selectedCount", { count: formData.selectedStudents.length })}
                    </p>
                  </div>
                  {formData.selectedStudents.length > 0 && (
                    <Badge className="bg-[#9810fa]/10 text-[#9810fa] border-none rounded-full font-bold">
                      {t("admin.academics.createClassWizard.selectedBadge", { count: formData.selectedStudents.length })}
                    </Badge>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder={t("admin.academics.createClassWizard.searchStudentsPlaceholder")}
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="rounded-xl ps-10 h-11"
                  />
                </div>

                <div className="max-h-[240px] overflow-y-auto space-y-2 pe-1">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map(student => {
                      const isSelected = formData.selectedStudents.includes(student.id);
                      return (
                        <div
                          key={student.id}
                          onClick={() => toggleStudentSelection(student.id)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                            isSelected
                              ? "border-[#9810fa] bg-[#9810fa]/5"
                              : "border-slate-100 bg-slate-50 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0",
                            isSelected ? "bg-[#9810fa] text-white" : "bg-slate-200 text-slate-600"
                          )}>
                            {isSelected ? <Check className="h-4 w-4" /> : student.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{student.name}</p>
                            <p className="text-xs text-slate-400 truncate">{student.email}</p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 text-[#9810fa] flex-shrink-0" />
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <AlertCircle className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-bold text-slate-500">{t("admin.academics.createClassWizard.noStudentsFoundFor", { className: formData.className })}</p>
                      <p className="text-xs text-slate-400">{t("admin.academics.createClassWizard.studentsAddedLaterNote")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {formData.studentAssignment === "auto" && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                <Zap className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <p className="text-sm font-bold text-blue-900">
                  {t("admin.academics.createClassWizard.autoAssignInfo")}
                </p>
              </div>
            )}

            {formData.studentAssignment === "bulk" && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <LayoutGrid className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">{t("admin.academics.createClassWizard.uploadFileTitle")}</p>
                <p className="text-xs text-slate-400">{t("admin.academics.createClassWizard.uploadFileSubtitle")}</p>
                <Button variant="outline" className="rounded-xl mt-1 text-xs font-bold">{t("admin.academics.createClassWizard.browseFileButton")}</Button>
              </div>
            )}
          </motion.div>
        );

      case 7:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center">
                <Calendar className="h-10 w-10 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">{t("admin.academics.createClassWizard.timetableSetupTitle")}</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">
                  {t("admin.academics.createClassWizard.timetableSetupSubtitle")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => setFormData({ ...formData, timetable: "auto" })}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
                  formData.timetable === "auto"
                    ? "border-[#9810fa] bg-[#9810fa]/5"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200"
                )}
              >
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center",
                  formData.timetable === "auto" ? "bg-[#9810fa] text-white" : "bg-white text-slate-400"
                )}>
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <h4 className={cn("font-bold", formData.timetable === "auto" ? "text-[#9810fa]" : "text-slate-900")}>{t("admin.academics.createClassWizard.autoGenerateTitle")}</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">{t("admin.academics.createClassWizard.autoGenerateDesc")}</p>
                </div>
              </div>

              <div
                onClick={() => setFormData({ ...formData, timetable: "manual" })}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
                  formData.timetable === "manual"
                    ? "border-[#9810fa] bg-[#9810fa]/5"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200"
                )}
              >
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center",
                  formData.timetable === "manual" ? "bg-[#9810fa] text-white" : "bg-white text-slate-400"
                )}>
                  <LayoutGrid className="h-6 w-6" />
                </div>
                <div>
                  <h4 className={cn("font-bold", formData.timetable === "manual" ? "text-[#9810fa]" : "text-slate-900")}>{t("admin.academics.createClassWizard.manualSetupTitle")}</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">{t("admin.academics.createClassWizard.manualSetupDesc")}</p>
                </div>
              </div>
            </div>

            {formData.timetable === "auto" && formData.subjects.length > 0 && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-purple-600" />
                  <p className="text-sm font-bold text-indigo-900">{t("admin.academics.createClassWizard.previewAutoTimetableTitle")}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DAYS.slice(0, 6).map((day, di) => {
                    const daySubject = formData.subjects[di % formData.subjects.length];
                    return (
                      <div key={day} className="bg-white rounded-xl p-2 text-center border border-indigo-100">
                        <p className="text-[9px] font-bold uppercase text-indigo-400 tracking-wider">{t(DAY_ABBR_LABEL_KEYS[day] || day)}</p>
                        <p className="text-xs font-bold text-indigo-700 mt-1 truncate">{daySubject}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{t("admin.academics.createClassWizard.moreSubjectsCount", { count: Math.min(formData.subjects.length - 1, 3) })}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-purple-600 font-medium">
                  {t("admin.academics.createClassWizard.subjectsDistributedNote", { subjectCount: formData.subjects.length, dayCount: DAYS.length })}
                </p>
              </div>
            )}

            {formData.timetable === "auto" && formData.subjects.length === 0 && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <p className="text-sm text-amber-800 font-medium">{t("admin.academics.createClassWizard.addSubjectsToEnableAutoGenerate")}</p>
              </div>
            )}
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{t("admin.academics.createClassWizard.pageTitle")}</h1>
            <p className="text-slate-500 font-medium">{t("admin.academics.createClassWizard.pageSubtitle")}</p>
          </div>
          <Button variant="ghost" className="text-slate-500 font-bold" onClick={() => navigate("/academics/classes")}>
            {t("admin.academics.createClassWizard.cancelButton")}
          </Button>
        </div>

        {/* Steps Progress */}
        <div className="flex items-center justify-between relative px-2">
          <div className="absolute top-5 start-0 w-full h-0.5 bg-slate-100 z-0" />
          {steps.map((step) => (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 border-4",
                currentStep === step.id
                  ? "bg-[#9810fa] text-white border-white shadow-lg shadow-[#9810fa]/20 scale-110"
                  : currentStep > step.id
                    ? "bg-emerald-500 text-white border-white"
                    : "bg-white text-slate-400 border-slate-50"
              )}>
                {currentStep > step.id ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider",
                currentStep === step.id ? "text-[#9810fa]" : "text-slate-400"
              )}>{step.title}</span>
            </div>
          ))}
        </div>

        {/* Wizard Card */}
        <Card className="border-none shadow-2xl shadow-slate-200/50 rounded-[32px] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black text-slate-900">{steps[currentStep - 1].title}</CardTitle>
                <CardDescription className="text-slate-500 font-medium">{steps[currentStep - 1].description}</CardDescription>
              </div>
              <Badge className="bg-[#9810fa]/10 text-[#9810fa] border-none px-4 py-1 rounded-full font-bold">
                {t("admin.academics.createClassWizard.stepOfTotal", { current: currentStep, total: steps.length })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {renderStep()}
          </CardContent>
          <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <Button
              variant="ghost"
              className="rounded-xl font-bold text-slate-500 h-12 px-8"
              onClick={handleBack}
            >
              <ChevronLeft className="h-5 w-5 me-2 rtl:rotate-180" />
              {t("admin.academics.createClassWizard.backButton")}
            </Button>
            <div className="flex items-center gap-3">
              {(currentStep === 3 || currentStep === 5) && (
                <Button
                  variant="outline"
                  className="rounded-xl font-bold h-12 px-8 text-slate-500 border-slate-200"
                  onClick={handleSkipStep}
                >
                  {t("admin.academics.createClassWizard.skipButton")}
                  <ChevronRight className="h-4 w-4 ms-1 rtl:rotate-180" />
                </Button>
              )}
              <Button
                className="rounded-xl gradient-primary text-white font-bold h-12 px-12 shadow-lg shadow-primary/20 disabled:opacity-50"
                onClick={handleNext}
                disabled={!isStepValid()}
              >
                {currentStep === steps.length ? t("admin.academics.createClassWizard.finishCreateButton") : t("admin.academics.createClassWizard.nextStepButton")}
                <ChevronRight className="h-5 w-5 ms-2 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
