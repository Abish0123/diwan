import { useState } from "react";
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

// Days of the week and periods for auto-timetable generation
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:15", end: "11:15" },
  { start: "11:15", end: "12:15" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
];

const steps = [
  { id: 1, title: "Basic Info", description: "Class name & year", icon: GraduationCap },
  { id: 2, title: "Sections", description: "Setup sections & capacity", icon: LayoutGrid },
  { id: 3, title: "Semester", description: "Academic semester", icon: Calendar },
  { id: 4, title: "Subjects", description: "Assign subjects", icon: BookOpen },
  { id: 5, title: "Teachers", description: "Allocate staff", icon: UserCheck },
  { id: 6, title: "Students", description: "Assign students", icon: Users },
  { id: 7, title: "Timetable", description: "Quick schedule setup", icon: Calendar },
];

export default function CreateClassWizard() {
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
        toast.error(`${duplicateSections.map(s => fullClassName(s.name)).join(", ")} already exist${duplicateSections.length === 1 ? "s" : ""} — choose a different section name`);
        setCurrentStep(2);
        return;
      }
      try {
        for (const section of formData.sections) {
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
        toast.success("Class created successfully!", {
          description: formData.timetable === "auto" ? "Timetable has been auto-generated." : "You can set up the timetable later.",
        });
        navigate("/academics/classes");
      } catch (error) {
        toast.error("Failed to create class. Please try again.");
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
      toast.warning("Subject already added");
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
                  Class Name (Grade)
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
                    <SelectValue placeholder="Select grade (Pre-KG to Grade 12)" />
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
                  Academic Year
                </Label>
                <Select
                  value={formData.academicYear}
                  onValueChange={(v) => setFormData({ ...formData, academicYear: v })}
                >
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 bg-white">
                    <SelectValue placeholder="Select academic year" />
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
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Section Name</Label>
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
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Capacity</Label>
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
                Add Another Section
              </Button>
              {duplicateSections.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                  <p className="text-xs text-rose-600 font-semibold">
                    {duplicateSections.map(s => fullClassName(s.name)).join(", ")} already exist{duplicateSections.length === 1 ? "s" : ""} — choose a different section name.
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
                <h3 className="text-lg font-bold text-slate-900">Select Semester</h3>
                <p className="text-slate-500 text-sm mt-1">Which semester will this class belong to?</p>
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
                    {sem}
                  </span>
                </div>
              ))}
            </div>

            {/* Custom semester input */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Or enter custom semester name</Label>
              <Input
                placeholder="e.g. Q1, Term 1, First Half..."
                value={formData.semester.startsWith("Semester") ? "" : formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                className="rounded-xl h-11"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">You can skip this step — semester can be updated later from class settings.</p>
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
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected Subjects ({formData.subjects.length})</Label>
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
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Add Custom Subject</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Type subject name..."
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
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {/* Quick-pick from defaults */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Pick</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search..."
                    value={subjectSearch}
                    onChange={e => setSubjectSearch(e.target.value)}
                    className="rounded-xl h-8 pl-8 text-xs w-36"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1">
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
                  <p className="col-span-3 text-center text-xs text-slate-400 py-4">No subjects to add</p>
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
              <p className="text-xs text-blue-700 font-medium">Teacher assignment is optional — you can assign or change teachers later from the class detail page.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign Class Teacher</Label>
                <Select value={formData.classTeacher} onValueChange={(v) => setFormData({ ...formData, classTeacher: v })}>
                  <SelectTrigger className="rounded-xl h-12">
                    <SelectValue placeholder="Select teacher..." />
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
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign Subject Teachers (Optional)</Label>
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
                          <SelectValue placeholder="Assign teacher..." />
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
                { id: "auto", title: "Auto-assign", desc: "Based on grade & age", icon: Zap },
                { id: "manual", title: "Manual Assign", desc: "Select from list", icon: UserCheck },
                { id: "bulk", title: "Bulk Upload", desc: "CSV / Excel import", icon: LayoutGrid },
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
                      Students available for {formData.className || "this class"}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      {eligibleStudents.length} student{eligibleStudents.length !== 1 ? "s" : ""} found · {formData.selectedStudents.length} selected
                    </p>
                  </div>
                  {formData.selectedStudents.length > 0 && (
                    <Badge className="bg-[#9810fa]/10 text-[#9810fa] border-none rounded-full font-bold">
                      {formData.selectedStudents.length} selected
                    </Badge>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search students by name or email..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="rounded-xl pl-10 h-11"
                  />
                </div>

                <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
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
                      <p className="text-sm font-bold text-slate-500">No students found for {formData.className}</p>
                      <p className="text-xs text-slate-400">Students can also be added later from the class detail page</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {formData.studentAssignment === "auto" && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                <Zap className="h-5 w-5 text-purple-600 flex-shrink-0" />
                <p className="text-sm font-bold text-blue-900">
                  Students will be auto-assigned based on grade and enrollment data when class is created.
                </p>
              </div>
            )}

            {formData.studentAssignment === "bulk" && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <LayoutGrid className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">Upload CSV or Excel File</p>
                <p className="text-xs text-slate-400">Drag & drop your file here, or click to browse</p>
                <Button variant="outline" className="rounded-xl mt-1 text-xs font-bold">Browse File</Button>
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
                <h3 className="text-xl font-bold text-slate-900">Timetable Setup</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">
                  Auto-generate an optimized timetable based on your subjects and teachers, or set it up manually later.
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
                  <h4 className={cn("font-bold", formData.timetable === "auto" ? "text-[#9810fa]" : "text-slate-900")}>Auto-Generate</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Distribute subjects across week</p>
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
                  <h4 className={cn("font-bold", formData.timetable === "manual" ? "text-[#9810fa]" : "text-slate-900")}>Manual Setup</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Custom Schedule</p>
                </div>
              </div>
            </div>

            {formData.timetable === "auto" && formData.subjects.length > 0 && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-purple-600" />
                  <p className="text-sm font-bold text-indigo-900">Preview: Auto-Generated Timetable</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DAYS.slice(0, 6).map((day, di) => {
                    const daySubject = formData.subjects[di % formData.subjects.length];
                    return (
                      <div key={day} className="bg-white rounded-xl p-2 text-center border border-indigo-100">
                        <p className="text-[9px] font-bold uppercase text-indigo-400 tracking-wider">{day.slice(0,3)}</p>
                        <p className="text-xs font-bold text-indigo-700 mt-1 truncate">{daySubject}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">+{Math.min(formData.subjects.length - 1, 3)} more</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-purple-600 font-medium">
                  {formData.subjects.length} subjects will be distributed across {DAYS.length} days automatically.
                </p>
              </div>
            )}

            {formData.timetable === "auto" && formData.subjects.length === 0 && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <p className="text-sm text-amber-800 font-medium">Please go back and add subjects to enable auto-generate.</p>
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
            <h1 className="text-3xl font-black text-slate-900">Create New Class</h1>
            <p className="text-slate-500 font-medium">Follow the steps to build your academic structure.</p>
          </div>
          <Button variant="ghost" className="text-slate-500 font-bold" onClick={() => navigate("/academics/classes")}>
            Cancel
          </Button>
        </div>

        {/* Steps Progress */}
        <div className="flex items-center justify-between relative px-2">
          <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-100 z-0" />
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
                Step {currentStep} of {steps.length}
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
              <ChevronLeft className="h-5 w-5 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              {(currentStep === 3 || currentStep === 5) && (
                <Button
                  variant="outline"
                  className="rounded-xl font-bold h-12 px-8 text-slate-500 border-slate-200"
                  onClick={handleSkipStep}
                >
                  Skip
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              <Button
                className="rounded-xl gradient-primary text-white font-bold h-12 px-12 shadow-lg shadow-primary/20 disabled:opacity-50"
                onClick={handleNext}
                disabled={!isStepValid()}
              >
                {currentStep === steps.length ? "Finish & Create" : "Next Step"}
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
