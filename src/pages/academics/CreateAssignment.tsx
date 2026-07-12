import { useState, useRef, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronRight, Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, Link as LinkIcon, Image as ImageIcon,
  Plus, UploadCloud, FileSpreadsheet, Eye, Info,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Trash2, X,
} from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useGrades } from "@/contexts/CurriculumContext";
import { notifyClassPublish } from "@/lib/classPublishNotify";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";

const SUBJECTS = [
  "Mathematics","Science","English","History","Computer Science","Art","Physical Education",
  "Arabic","Islamic Studies","Social Studies","Biology","Physics","Chemistry",
];
const SECTIONS = ["A","B","C","D","E"];
const ASSIGNMENT_TYPES = [
  "Worksheet","Project","Quiz","Lab Activity","Research Work","Presentation",
  "Notebook Work","Reading Assignment","Writing Assignment","Art & Craft Activity",
  "Practical Work","Group Activity","Assessment","Homework","Essay","Lab Report",
];

function uid() { return `asgn_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

interface AttachmentFile {
  name: string;
  size: number;
  type: string;
  url: string;
}

export default function CreateAssignment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { assignmentId } = useParams<{ assignmentId?: string }>();
  const isEditMode = !!assignmentId;
  const grades = useGrades();

  // Teacher portal uses /teacher/assignments/* paths
  const isTeacherContext = location.pathname.startsWith("/teacher/");
  const backPath = isTeacherContext ? "/teacher/assignments" : "/assignments";
  const { assignment: teacherAssignment } = useTeacherClass();
  const { assignments: mySubjectAssignments } = useMySubjects();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [title,          setTitle]          = useState("");
  const [subject,        setSubject]        = useState("");
  const [grade,          setGrade]          = useState("");
  const [section,        setSection]        = useState("");
  const [teacher,        setTeacher]        = useState("");
  const [assignmentType, setAssignmentType] = useState("");
  const [totalMarks,     setTotalMarks]     = useState("");
  const [passingScore,   setPassingScore]   = useState("");
  const [assignDate,     setAssignDate]     = useState(() => { const n = new Date(); n.setMinutes(n.getMinutes() - n.getTimezoneOffset()); return n.toISOString().slice(0,16); });
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [dueDate,        setDueDate]        = useState("");
  const [submissionType, setSubmissionType] = useState("");
  const [attachments,    setAttachments]    = useState<AttachmentFile[]>([]);
  const [isSaving,       setIsSaving]       = useState(false);
  const [editorEmpty,    setEditorEmpty]    = useState(true);
  const [showPreview,    setShowPreview]    = useState(false);
  const [loadingEdit,    setLoadingEdit]    = useState(isEditMode);

  // Resource links
  const [linkInput,  setLinkInput]  = useState("");
  const [links,      setLinks]      = useState<{url:string;label:string}[]>([]);

  // Teachers from DB
  const [teachers, setTeachers] = useState<string[]>([]);

  // Refs
  const editorRef   = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Strict Subject → Teacher → Grade → Section mapping (same contract as
  // Assessments.tsx/MarksEntry.tsx/TeacherExams.tsx): in the teacher portal, a
  // teacher may only create assignments for grade/subject/section combos they
  // are actually assigned to teach — either their homeroom class or an
  // explicit Subject Allocation row — never an arbitrary other class.
  const myCombos = useMemo(() => {
    const combos = mySubjectAssignments.map(a => ({ grade: a.grade, section: a.section, subject: a.subject }));
    if (teacherAssignment.grade) {
      combos.push({
        grade: teacherAssignment.grade,
        section: teacherAssignment.section || "",
        subject: teacherAssignment.subject || "",
      });
    }
    return combos;
  }, [mySubjectAssignments, teacherAssignment]);

  const assignedGrades = useMemo(() => [...new Set(myCombos.map(c => c.grade))].filter(Boolean), [myCombos]);
  const assignedSubjectsForGrade = useMemo(
    () => [...new Set(myCombos.filter(c => !grade || c.grade === grade).map(c => c.subject))].filter(Boolean),
    [myCombos, grade]
  );
  const assignedSectionsForGradeSubject = useMemo(
    () => [...new Set(myCombos
      .filter(c => (!grade || c.grade === grade) && (!subject || c.subject === subject))
      .map(c => c.section))].filter(Boolean),
    [myCombos, grade, subject]
  );

  // ─── Load existing assignment for edit ───────────────────────────────────
  useEffect(() => {
    if (!assignmentId) return;
    setLoadingEdit(true);
    smartDb.getAll("TeacherAssignment", undefined).then((list: any[]) => {
      const existing = (list || []).find((a: any) => a.id === assignmentId);
      if (!existing) { toast.error("Assignment not found"); navigate(backPath); return; }
      setTitle(existing.title || "");
      setSubject(existing.subject || "");
      setGrade(existing.grade || "");
      setSection(existing.section || "");
      setTeacher(existing.teacher || "");
      setAssignmentType(existing.type || "");
      setTotalMarks(String(existing.totalMarks || ""));
      setPassingScore(String(existing.passingScore || ""));
      setAssignDate(existing.assignDate || "");
      setDueDate(existing.dueDate || "");
      setSubmissionType(existing.submissionType || "");
      setLinks(existing.links || []);
      // Keep the real existing url — blanking it here used to mean re-saving
      // an edited assignment without re-uploading files silently wiped out
      // every attachment's file data (the exact bug students hit: teacher
      // "attached" a file that could never actually be opened).
      setAttachments((existing.attachments || []).map((a: any) => ({ ...a, url: a.url || "" })));
      // Set editor content after a short delay so the ref is mounted
      setTimeout(() => {
        if (editorRef.current && existing.instructions) {
          editorRef.current.innerHTML = existing.instructions;
          setEditorEmpty(false);
        }
      }, 150);
    }).catch(() => toast.error("Failed to load assignment"))
      .finally(() => setLoadingEdit(false));
  }, [assignmentId]);

  // ─── Pre-fill grade/section/teacher for teacher portal ───────────────────
  useEffect(() => {
    if (isTeacherContext && !isEditMode && teacherAssignment.grade) {
      setGrade(teacherAssignment.grade);
      setSection(teacherAssignment.section || "");
      setTeacher(teacherAssignment.teacherName || "");
    }
  }, [isTeacherContext, isEditMode, teacherAssignment.grade, teacherAssignment.section, teacherAssignment.teacherName]);

  // ─── Load teachers ─────────────────────────────────────────────────────────
  useEffect(() => {
    smartDb.getAll("Staff", undefined).then((staff: any[]) => {
      if (!staff?.length) return;
      const filtered = staff
        .filter((s: any) => {
          const role = (s.role || "").toLowerCase();
          const desig = (s.designation || "").toLowerCase();
          return role.includes("teacher") || desig.includes("teacher");
        })
        .map((s: any) => s.name || s.displayName || "")
        .filter(Boolean);
      setTeachers(filtered);
    }).catch(() => {});
  }, []);

  // ─── Rich text editor ──────────────────────────────────────────────────────
  function execFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    updateEditorEmpty();
  }

  function updateEditorEmpty() {
    const html = editorRef.current?.innerHTML || "";
    const text = editorRef.current?.innerText || "";
    setEditorEmpty(!text.trim() && !html.includes("<img"));
  }

  // ─── File upload ───────────────────────────────────────────────────────────
  function handleFiles(fileList: FileList) {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type,
          url: ev.target?.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  }

  // ─── Link helpers ──────────────────────────────────────────────────────────
  function handleAddLink() {
    const url = linkInput.trim();
    if (!url) { toast.error("Please enter a URL"); return; }
    const finalUrl = url.startsWith("http") ? url : `https://${url}`;
    setLinks(prev => [...prev, { url: finalUrl, label: finalUrl }]);
    setLinkInput("");
    toast.success("Link added");
  }

  // ─── Save helpers ──────────────────────────────────────────────────────────
  async function saveAssignment(status: "Active" | "Draft") {
    if (!title.trim())  { toast.error("Assignment title is required"); return; }
    if (!subject)       { toast.error("Please select a subject"); return; }
    if (!grade)         { toast.error("Please select a grade"); return; }
    if (!dueDate)       { toast.error("Due date is required"); return; }
    if (!totalMarks)    { toast.error("Total marks is required"); return; }
    // Strict mapping: a teacher may only create assignments for grade/subject/
    // section combos they are actually assigned to teach.
    if (isTeacherContext && !isEditMode) {
      const allowed = myCombos.some(c => c.grade === grade && c.subject === subject && (!section || c.section === section));
      if (!allowed) { toast.error("You are not assigned to teach this subject for the selected grade/section"); return; }
    }
    // If scheduling, override status to "Upcoming" until publish time
    const effectiveStatus: "Active" | "Draft" | "Upcoming" = (status === "Active" && scheduleEnabled) ? "Upcoming" : status;

    setIsSaving(true);
    try {
      const data = {
        title: title.trim(), subject, grade, section, teacher,
        type: assignmentType || "Worksheet", dueDate, assignDate,
        totalMarks: Number(totalMarks), passingScore: Number(passingScore) || 0,
        submissionType, instructions: editorRef.current?.innerHTML || "",
        // `url` (the actual file data) must be persisted, not just the file's
        // metadata — dropping it here was the reason a student could see that
        // a teacher attached a file but could never actually open/download it.
        attachments: attachments.map(a => ({ name: a.name, size: a.size, type: a.type, url: a.url })),
        links, status: effectiveStatus, scheduledAt: scheduleEnabled ? assignDate : null,
      };
      if (isEditMode && assignmentId) {
        await smartDb.update("TeacherAssignment", assignmentId, data as any);
        toast.success("Assignment updated successfully!");
      } else {
        const id = uid();
        await smartDb.create("TeacherAssignment", { ...data, id, createdAt: new Date().toISOString() } as any, id);
        toast.success(effectiveStatus === "Draft" ? "Assignment saved as draft" : effectiveStatus === "Upcoming" ? `Assignment scheduled for ${new Date(assignDate).toLocaleString()}` : "Assignment published successfully!");
        // Notify students, their parents, the section's real class teacher,
        // and school leadership when the assignment is published (not
        // draft/scheduled) — previously only ever reached students filtered
        // by grade/section, never parents or staff.
        if (effectiveStatus === "Active") {
          notifyClassPublish({
            grade, section,
            entity: "Assignment", type: "assignment_published",
            title: `New Assignment: ${title.trim()}`,
            message: `${subject} assignment due ${new Date(dueDate).toLocaleDateString()} has been posted${section ? ` for Section ${section}` : ""}.`,
            sourceId: id,
            redirectUrlStudent: "/student/assignments",
            redirectUrlParent: "/parent/assignments",
            redirectUrlTeacher: "/teacher/assignments",
          }).catch(() => {});
        }
      }
      setTimeout(() => navigate(backPath), 1200);
    } catch (err) {
      toast.error("Failed to save assignment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const handlePublish   = () => saveAssignment("Active");
  const handleSaveDraft = () => saveAssignment("Draft");

  // ─── Sub-components ────────────────────────────────────────────────────────
  const SectionBadge = ({ number }: { number: number }) => (
    <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold mr-3 shadow-sm">{number}</div>
  );

  const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
    <label className="block text-slate-700 font-semibold text-sm mb-1.5">
      {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );

  const StyledSelect = ({ value, onChange, placeholder, children, required, disabled }: any) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={cn(
        "w-full h-11 px-3 rounded-xl border bg-slate-50/50 text-sm outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all disabled:bg-slate-100 disabled:text-slate-400",
        value ? "border-slate-300 text-slate-800" : "border-slate-300 text-slate-400"
      )}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );

  if (loadingEdit) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"/>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="flex-1 flex flex-col h-full bg-[#F8FAFC]">

        {/* Header */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 shrink-0 px-6 md:px-10 py-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full max-w-[1500px] mx-auto">
            <div>
              <div className="flex items-center text-sm font-medium text-purple-600 mb-2">
                <span className="hover:underline cursor-pointer" onClick={() => navigate(backPath)}>Assignments</span>
                <ChevronRight className="w-4 h-4 mx-1"/>
                <span className="text-slate-600">{isEditMode ? "Edit Assignment" : "Create New Assignment"}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${isEditMode ? "bg-amber-50 border-amber-100" : "bg-purple-50 border-purple-100"}`}>
                  <FileSpreadsheet className={`w-6 h-6 ${isEditMode ? "text-amber-600" : "text-purple-600"}`}/>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {isEditMode ? "Edit Assignment" : "Create New Assignment"}
                  </h1>
                  <p className="text-slate-500 text-sm mt-0.5 font-medium">
                    {isEditMode ? "Update the assignment details and save changes." : "Add assignment details and publish it for your students."}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button variant="outline" onClick={() => navigate(isEditMode ? `${backPath}/${assignmentId}/submissions` : backPath)} disabled={isSaving}
                className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-semibold w-full md:w-auto rounded-xl h-11 px-6 shadow-sm">
                Cancel
              </Button>
              {!isEditMode && (
                <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}
                  className="border-purple-200 text-purple-700 bg-white hover:bg-purple-50 font-semibold w-full md:w-auto rounded-xl h-11 px-6 shadow-sm">
                  {isSaving ? "Saving…" : "Save as Draft"}
                </Button>
              )}
              <Button onClick={handlePublish} disabled={isSaving}
                className={`text-white shadow-md font-semibold w-full md:w-auto rounded-xl h-11 px-6 ${isEditMode ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20" : "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20"}`}>
                <Plus className="w-4 h-4 mr-2"/>
                {isSaving ? "Saving…" : isEditMode ? "Save Changes" : "Publish Assignment"}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-10 max-w-[1500px] mx-auto w-full">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-8">

              {/* Left Column */}
              <div className="space-y-6">

                {/* Section 1: Assignment Information */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-8 space-y-6">
                    <div className="flex items-center border-b border-slate-100 pb-4">
                      <SectionBadge number={1}/>
                      <h2 className="text-lg font-bold text-slate-900">Assignment Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="lg:col-span-2">
                        <FieldLabel required>Assignment Title</FieldLabel>
                        <Input
                          value={title} onChange={e => setTitle(e.target.value)}
                          placeholder="Enter assignment title"
                          className="rounded-xl border-slate-300 focus-visible:ring-purple-600 h-11 bg-slate-50/50"/>
                      </div>
                      <div>
                        <FieldLabel required>Class / Grade</FieldLabel>
                        <StyledSelect value={grade} onChange={(v: string) => { setGrade(v); setSubject(""); setSection(""); }} placeholder="Select Grade" required>
                          {(isTeacherContext ? assignedGrades : grades).map(g => <option key={g} value={g}>{g}</option>)}
                        </StyledSelect>
                        {isTeacherContext && assignedGrades.length === 0 && (
                          <p className="text-[11px] text-rose-500 mt-1">No subject assigned to you yet — contact admin.</p>
                        )}
                      </div>
                      <div>
                        <FieldLabel required>Subject</FieldLabel>
                        <StyledSelect value={subject} onChange={(v: string) => { setSubject(v); setSection(""); }} placeholder="Select Subject" required
                          disabled={isTeacherContext && !grade}>
                          {(isTeacherContext ? assignedSubjectsForGrade : SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}
                        </StyledSelect>
                      </div>
                      <div>
                        <FieldLabel>Section</FieldLabel>
                        <StyledSelect value={section} onChange={setSection} placeholder="All Sections"
                          disabled={isTeacherContext && !subject}>
                          {(isTeacherContext ? assignedSectionsForGradeSubject : SECTIONS).map(s => <option key={s} value={s}>Section {s}</option>)}
                        </StyledSelect>
                      </div>
                      <div>
                        <FieldLabel>Assigned Teacher</FieldLabel>
                        {isTeacherContext ? (
                          // A teacher creates assignments as themselves — this
                          // was an editable dropdown that let them accidentally
                          // pick a different teacher's name entirely.
                          <Input
                            value={teacherAssignment.teacherName || teacher || "—"}
                            disabled
                            className="rounded-xl border-slate-300 h-11 bg-slate-100 text-slate-600"
                          />
                        ) : (
                          <StyledSelect value={teacher} onChange={setTeacher} placeholder="Select Teacher">
                            {(teachers.length > 0 ? teachers : [
                              "Ms. Aisha Rahman","Mr. Saif Sulaiman","Ms. Priya Nair",
                              "Mr. Ahmed Al-Farsi","Ms. Fatima Hassan","Mr. Omar Khalid",
                              "Ms. Sara Ali","Mr. Yusuf Ibrahim",
                            ]).map(t => <option key={t} value={t}>{t}</option>)}
                          </StyledSelect>
                        )}
                      </div>
                    </div>

                    {/* Rich Text Editor */}
                    <div>
                      <FieldLabel required>Description / Instructions</FieldLabel>
                      <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-purple-600 focus-within:border-transparent transition-all shadow-sm">
                        {/* Toolbar */}
                        <div className="bg-slate-50/80 border-b border-slate-200 px-3 py-2.5 flex flex-wrap items-center gap-1">
                          {([
                            { icon: Bold,         cmd: "bold" },
                            { icon: Italic,       cmd: "italic" },
                            { icon: UnderlineIcon,cmd: "underline" },
                          ] as const).map(({ icon: Icon, cmd }) => (
                            <Button key={cmd} variant="ghost" size="icon"
                              className="h-9 w-9 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                              onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}>
                              <Icon className="w-4 h-4"/>
                            </Button>
                          ))}
                          <div className="w-px h-6 bg-slate-300 mx-1"/>
                          {([
                            { icon: List,         cmd: "insertUnorderedList" },
                            { icon: ListOrdered,  cmd: "insertOrderedList" },
                          ] as const).map(({ icon: Icon, cmd }) => (
                            <Button key={cmd} variant="ghost" size="icon"
                              className="h-9 w-9 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                              onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}>
                              <Icon className="w-4 h-4"/>
                            </Button>
                          ))}
                          <div className="w-px h-6 bg-slate-300 mx-1"/>
                          {([
                            { icon: AlignLeft,    cmd: "justifyLeft" },
                            { icon: AlignCenter,  cmd: "justifyCenter" },
                            { icon: AlignRight,   cmd: "justifyRight" },
                            { icon: AlignJustify, cmd: "justifyFull" },
                          ] as const).map(({ icon: Icon, cmd }) => (
                            <Button key={cmd} variant="ghost" size="icon"
                              className="h-9 w-9 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                              onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}>
                              <Icon className="w-4 h-4"/>
                            </Button>
                          ))}
                          <div className="w-px h-6 bg-slate-300 mx-1"/>
                          <Button variant="ghost" size="icon"
                            className="h-9 w-9 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const url = prompt("Enter URL:");
                              if (url) execFormat("createLink", url);
                            }}>
                            <LinkIcon className="w-4 h-4"/>
                          </Button>
                          <Button variant="ghost" size="icon"
                            className="h-9 w-9 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const url = prompt("Enter image URL:");
                              if (url) execFormat("insertImage", url);
                            }}>
                            <ImageIcon className="w-4 h-4"/>
                          </Button>
                        </div>

                        {/* Editable area */}
                        <div className="relative">
                          {editorEmpty && (
                            <div className="absolute top-3 left-3 text-slate-400 text-sm pointer-events-none select-none">
                              Enter assignment instructions, guidelines, and details...
                            </div>
                          )}
                          <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={updateEditorEmpty}
                            onFocus={updateEditorEmpty}
                            onBlur={updateEditorEmpty}
                            className="min-h-[180px] p-3 outline-none text-slate-700 bg-white prose prose-sm max-w-none"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 2: Assignment Settings */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-8 space-y-6">
                    <div className="flex items-center border-b border-slate-100 pb-4">
                      <SectionBadge number={2}/>
                      <h2 className="text-lg font-bold text-slate-900">Assignment Settings</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <FieldLabel required>Assignment Type</FieldLabel>
                        <StyledSelect value={assignmentType} onChange={setAssignmentType} placeholder="Select Type" required>
                          {ASSIGNMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </StyledSelect>
                      </div>
                      <div>
                        <FieldLabel required>Total Marks</FieldLabel>
                        <Input
                          type="number" value={totalMarks} onChange={e => setTotalMarks(e.target.value)}
                          placeholder="Enter total marks"
                          className="rounded-xl border-slate-300 h-11 bg-slate-50/50 focus-visible:ring-purple-600"/>
                      </div>
                      <div>
                        <FieldLabel>Passing Score (%)</FieldLabel>
                        <div className="relative">
                          <Input
                            type="number" min={0} max={100} value={passingScore} onChange={e => setPassingScore(e.target.value)}
                            placeholder="e.g. 60"
                            className="rounded-xl border-slate-300 h-11 bg-slate-50/50 focus-visible:ring-purple-600 pr-9"/>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">%</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Minimum percentage required to pass</p>
                      </div>
                      <div>
                        <FieldLabel required>Submission Type</FieldLabel>
                        <StyledSelect value={submissionType} onChange={setSubmissionType} placeholder="Select Submission Type" required>
                          <option value="file">File Upload</option>
                          <option value="text">Text Submission</option>
                          <option value="offline">Offline (Physical)</option>
                        </StyledSelect>
                      </div>
                    </div>

                    <div className="pt-2 space-y-4">
                      {/* Schedule toggle */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <button type="button" onClick={() => setScheduleEnabled(v => !v)}
                          className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0",
                            scheduleEnabled ? "bg-purple-600" : "bg-slate-300")}>
                          <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                            scheduleEnabled ? "translate-x-4" : "translate-x-1")}/>
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">Schedule for later</p>
                          <p className="text-xs text-slate-400">
                            {scheduleEnabled ? "Assignment will be published at the specified date & time." : "Assignment publishes immediately when you click Publish."}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <FieldLabel required>{scheduleEnabled ? "Scheduled Publish Date & Time" : "Assign Date & Time"}</FieldLabel>
                          <Input
                            type="datetime-local" value={assignDate} onChange={e => setAssignDate(e.target.value)}
                            className="rounded-xl border-slate-300 h-11 bg-slate-50/50 focus-visible:ring-purple-600"/>
                          {scheduleEnabled && (
                            <p className="text-xs text-purple-600 mt-1">Assignment will go live at this time automatically.</p>
                          )}
                        </div>
                        <div>
                          <FieldLabel required>Due Date & Time</FieldLabel>
                          <Input
                            type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
                            className="rounded-xl border-slate-300 h-11 bg-slate-50/50 focus-visible:ring-purple-600"/>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 3: Attachments & Resources */}
                <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <CardContent className="p-8 space-y-6">
                    <div className="flex items-center border-b border-slate-100 pb-4">
                      <SectionBadge number={3}/>
                      <h2 className="text-lg font-bold text-slate-900">Attachments & Resources</h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label className="text-slate-800 font-semibold">Upload Attachments</Label>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
                          className="border-2 border-dashed border-purple-200 bg-purple-50/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-purple-50 transition-colors cursor-pointer group h-36">
                          <UploadCloud className="w-8 h-8 text-purple-600 mb-3 group-hover:scale-110 transition-transform"/>
                          <p className="text-sm text-slate-600 mb-1">Drag & drop or <span className="text-purple-600 font-bold">browse files</span></p>
                          <p className="text-[11px] text-slate-400 font-medium">PDF, DOC, PPT, XLS, JPG, PNG (Max 50MB)</p>
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        {attachments.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {attachments.map((f, i) => (
                              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs border border-slate-100">
                                <span className="text-slate-600 truncate flex-1">{f.name}</span>
                                <span className="text-slate-400 ml-2">{(f.size / 1024).toFixed(0)} KB</span>
                                <button
                                  onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                                  className="ml-3 text-slate-400 hover:text-rose-500 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5"/>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Label className="text-slate-800 font-semibold">Add Resource Links <span className="text-slate-400 font-normal">(Optional)</span></Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"/>
                            <Input
                              value={linkInput}
                              onChange={e => setLinkInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && handleAddLink()}
                              placeholder="https://youtube.com/watch?v=..."
                              className="pl-10 rounded-xl border-slate-300 h-11 bg-slate-50/50 focus-visible:ring-purple-600"/>
                          </div>
                          <Button onClick={handleAddLink} variant="outline" className="h-11 px-6 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 font-semibold">Add</Button>
                        </div>
                        {links.length === 0 ? (
                          <p className="text-sm text-slate-400 italic pt-1">No links added yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {links.map((link, i) => (
                              <div key={i} className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                                <LinkIcon className="h-3.5 w-3.5 text-blue-500 shrink-0"/>
                                <a href={link.url} target="_blank" rel="noopener noreferrer"
                                  className="text-sm text-purple-700 truncate flex-1 hover:underline">{link.url}</a>
                                <button onClick={() => setLinks(prev => prev.filter((_,j) => j !== i))}
                                  className="text-slate-400 hover:text-rose-500 ml-1 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5"/>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 flex items-start">
                  <div className="bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center mr-3 shrink-0 mt-0.5">
                    <Info className="w-3.5 h-3.5 text-white"/>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-0.5">Note:</h4>
                    <p className="text-sm text-blue-800">Students will be able to view this assignment after it is published.</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Sidebar */}
              <div className="space-y-6">

                {/* Live Summary */}
                <Card className="border-slate-200 shadow-sm rounded-2xl bg-white">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">Assignment Summary</h3>
                    <div className="space-y-2.5">
                      {[
                        { label:"Title",        value: title || "—" },
                        { label:"Subject",      value: subject || "—" },
                        { label:"Grade",        value: grade || "—" },
                        { label:"Section",      value: section ? `Section ${section}` : "All Sections" },
                        { label:"Teacher",      value: teacher || "—" },
                        { label:"Type",         value: assignmentType || "—" },
                        { label:"Total Marks",  value: totalMarks || "—" },
                        { label:"Passing Score",value: passingScore ? `${passingScore}%` : "—" },
                        { label:"Due Date",     value: dueDate ? new Date(dueDate).toLocaleDateString("en-US",{day:"2-digit",month:"short",year:"numeric"}) : "—" },
                      ].map(r => (
                        <div key={r.label} className="flex items-start justify-between gap-2">
                          <span className="text-[11px] text-slate-400 font-medium shrink-0">{r.label}</span>
                          <span className="text-[11px] font-semibold text-slate-700 text-right truncate max-w-[160px]">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                <Card className="border-slate-200 shadow-sm rounded-2xl bg-white">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-slate-900 flex items-center mb-2">
                      <Eye className="w-4 h-4 mr-2 text-purple-600"/> Preview
                    </h3>
                    <p className="text-sm text-slate-600 mb-5 leading-relaxed">This is how the assignment will appear to students.</p>
                    <Button onClick={() => setShowPreview(true)} variant="outline" className="w-full h-11 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 rounded-xl shadow-sm">
                      <Eye className="w-4 h-4 mr-2 text-slate-500"/> Preview Assignment
                    </Button>
                  </CardContent>
                </Card>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview Modal ────────────────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-purple-600"/>
                <h3 className="font-bold text-slate-900">Student Preview</h3>
                <span className="text-xs bg-purple-50 text-purple-600 rounded-full px-2 py-0.5 font-semibold border border-purple-100">
                  How students will see this
                </span>
              </div>
              <button onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4 text-slate-400"/>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Assignment hero */}
              <div className="bg-gradient-to-br from-purple-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full">
                      {subject || "Subject"}
                    </span>
                    <h2 className="text-xl font-bold mt-2 mb-1 leading-tight">
                      {title || "Assignment Title"}
                    </h2>
                    <p className="text-sm text-blue-100">
                      {grade || "Grade"}{section ? ` · Section ${section}` : ""}
                      {teacher ? ` · ${teacher}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-black">{totalMarks || "—"}</div>
                    <div className="text-xs text-blue-200 mt-0.5">Total Marks</div>
                    {passingScore && (
                      <div className="text-xs text-blue-200 mt-1 bg-white/10 rounded px-1.5 py-0.5">
                        Pass: {passingScore}%
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Type",       value: assignmentType || "—" },
                  { label: "Submission", value: submissionType === "file" ? "File Upload" : submissionType === "text" ? "Text Entry" : submissionType === "offline" ? "Offline / Physical" : "—" },
                  { label: "Due Date",   value: dueDate ? new Date(dueDate).toLocaleString("en-US",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—" },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{item.label}</p>
                    <p className="text-sm font-bold text-slate-800 leading-tight">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">Instructions</h4>
                {(editorRef.current?.innerHTML || "").replace(/<[^>]+>/g,"").trim() ? (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-700 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || "" }}/>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
                    No instructions added yet
                  </div>
                )}
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2">
                    Attachments <span className="text-slate-400 font-normal">({attachments.length})</span>
                  </h4>
                  <div className="space-y-1.5">
                    {attachments.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-blue-500"/>
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="text-slate-400">{(f.size/1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resource links */}
              {links.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Resource Links</h4>
                  <div className="space-y-1.5">
                    {links.map((link, i) => (
                      <div key={i} className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs">
                        <LinkIcon className="h-3.5 w-3.5 text-blue-500 shrink-0"/>
                        <span className="text-purple-700 truncate">{link.url}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submission area preview */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-sm font-bold text-slate-800 mb-2">Submission Area</h4>
                {submissionType === "file" ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50">
                    <UploadCloud className="h-7 w-7 text-slate-300 mx-auto mb-1.5"/>
                    <p className="text-sm text-slate-400">Students will upload their files here</p>
                  </div>
                ) : submissionType === "text" ? (
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <p className="text-sm text-slate-400 italic">Students will type their answer here...</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-amber-700 font-medium">Physical submission — students hand in directly</p>
                  </div>
                )}
                <button disabled
                  className="mt-3 w-full h-10 bg-blue-100 text-blue-400 font-semibold rounded-xl text-sm cursor-not-allowed">
                  Submit Assignment (Preview Only)
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
