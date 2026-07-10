import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SubjectsPro from "@/components/classes/SubjectsPro";
import { useClasses } from "@/hooks/useClasses";
import { useStudents } from "@/contexts/StudentContext";
import { useGrades, useCurriculumContext } from "@/contexts/CurriculumContext";
import { getDefaultSubjectsForGrade } from "@/lib/curriculumConfig";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BookOpen, GraduationCap, ChevronDown, ChevronRight, Search, Layers, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
function gradeAbbr(g: string) {
  if (g === "Pre-KG") return "PK";
  if (g === "LKG") return "LK";
  if (g === "UKG") return "UK";
  return g.replace("Grade ", "G");
}

const GRADE_COLORS = [
  "from-violet-500 to-fuchsia-600","from-fuchsia-500 to-purple-600",
  "from-purple-500 to-purple-600","from-indigo-500 to-purple-600",
  "from-blue-500 to-sky-600","from-sky-500 to-cyan-600",
  "from-cyan-500 to-teal-600","from-teal-500 to-emerald-600",
  "from-emerald-500 to-green-600","from-green-500 to-lime-600",
  "from-lime-500 to-amber-600","from-amber-500 to-orange-600",
  "from-orange-500 to-red-600","from-red-500 to-rose-600",
  "from-rose-500 to-pink-600",
];

const SECTION_BADGE: Record<string, string> = {
  A: "bg-purple-100 text-purple-700 border-purple-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-green-100 text-green-700 border-green-200",
};

function sectionLetterOf(c: any): string {
  return String(c.name).match(/Section\s+([A-Z])/i)?.[1]
    || String(c.section || "").trim().toUpperCase()
    || "A";
}

export default function Subjects() {
  const navigate = useNavigate();
  const { classes, updateClass } = useClasses();
  const { students } = useStudents();
  const grades = useGrades();
  const { curriculum } = useCurriculumContext();

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedGrade, setSelectedGrade]     = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  // Every grade in the ACTIVE curriculum — this is the real source of truth
  // for what shows in the sidebar. Switching curriculum (Qatar → British,
  // etc.) changes this list automatically since `grades` comes from
  // useGrades(), which reads the currently active curriculum.
  //
  // Previously this was intersected with grades that already had a Class
  // record in the DB, which silently hid any curriculum grade nobody had
  // created a class for yet (e.g. Qatar's KG1/KG2 never appeared even though
  // they're real Qatar grades) — a school couldn't even see, let alone
  // manage, subjects for a grade until a class existed for it.
  const gradesWithClasses = useMemo(() => {
    const set = new Set<string>();
    (classes || []).forEach(c => { if (c.grade) set.add(c.grade); });
    return set;
  }, [classes]);
  const filteredByDB = grades;

  // Section letters per grade, from real class records
  const sectionsByGrade = useMemo(() => {
    const map: Record<string, string[]> = {};
    // Keyed by the normalized grade — real Class rows store grade as either
    // bare "3" or "Grade 3" depending on when they were created, and this
    // map is always read back via a normalized "Grade N" selectedGrade, so
    // keying by the raw value silently dropped every raw-format grade's
    // sections.
    (classes || []).forEach(c => {
      if (!c.grade) return;
      const normalizedKey = grades.find(g => canonGrade(g) === canonGrade(c.grade)) || c.grade;
      if (!map[normalizedKey]) map[normalizedKey] = [];
      const s = sectionLetterOf(c);
      if (!map[normalizedKey].includes(s)) map[normalizedKey].push(s);
    });
    Object.keys(map).forEach(g => map[g].sort());
    return map;
  }, [classes, grades]);

  // Filtered grades for sidebar search
  const filteredGrades = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return filteredByDB;
    return filteredByDB.filter(g => g.toLowerCase().includes(q));
  }, [filteredByDB, search]);

  // Default selection once data loads
  useEffect(() => {
    if (!selectedGrade && filteredByDB.length) {
      const g = filteredByDB[0];
      setSelectedGrade(g);
      setSelectedSection((sectionsByGrade[g] || [])[0] || "A");
    }
  }, [filteredByDB, sectionsByGrade, selectedGrade]);

  function toggleGrade(g: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }
  function select(g: string, s: string) {
    setSelectedGrade(g);
    setSelectedSection(s);
  }

  // Classes for the selected grade
  const gradeClasses = useMemo(
    () => (classes || []).filter(c => canonGrade(c.grade) === canonGrade(selectedGrade)),
    [classes, selectedGrade]
  );

  // Sections for the selected grade
  const sections = useMemo(
    () => sectionsByGrade[selectedGrade] || [],
    [sectionsByGrade, selectedGrade]
  );

  // Subjects are grade-wide — read from the first section's class record
  const subjects = useMemo(
    () => (gradeClasses[0]?.subjects as string[]) || [],
    [gradeClasses]
  );

  // Student count for this grade
  const studentCount = useMemo(
    () => (students || []).filter((s: any) => canonGrade(s.grade) === canonGrade(selectedGrade)).length,
    [students, selectedGrade]
  );

  const teacherName = (gradeClasses[0] as any)?.teacher;

  // Fetch subject_assignments for the selected grade+section so SubjectsPro can
  // show the real per-section teacher for each subject (not a fake cycled name).
  const [sectionAssignments, setSectionAssignments] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedGrade || !selectedSection) { setSectionAssignments([]); return; }
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((all: any[]) => {
        const mine = (Array.isArray(all) ? all : []).filter(
          a => canonGrade(a.grade) === canonGrade(selectedGrade) && canonSection(a.section) === canonSection(selectedSection)
        );
        setSectionAssignments(mine);
      })
      .catch(() => setSectionAssignments([]));
  }, [selectedGrade, selectedSection]);

  // Persist subject list to every section of this grade (subjects are grade-wide)
  async function persistGradeSubjects(names: string[]) {
    if (!gradeClasses.length) return;
    try {
      await Promise.all(gradeClasses.map(c => updateClass(c.id, { subjects: names } as any)));
    } catch {
      toast.error("Could not save subjects to the database");
    }
  }

  // The active curriculum's default subject list for whichever grade is
  // selected — e.g. Qatar Grade 5 gets Arabic/English/Mathematics/Science/...
  const defaultSubjectsForGrade = useMemo(
    () => getDefaultSubjectsForGrade(curriculum, selectedGrade),
    [curriculum, selectedGrade]
  );

  // Auto-seed once: a grade that has classes but has never had a subject list
  // set gets the curriculum's defaults automatically. This never touches a
  // grade that already has ANY subjects — even one — so a school's existing
  // customization is never silently overwritten. Schools can still change
  // curriculum later and re-seed a specific grade manually (button below).
  useEffect(() => {
    if (!selectedGrade || !gradeClasses.length) return;
    if (subjects.length > 0) return;
    if (!defaultSubjectsForGrade.length) return;
    persistGradeSubjects(defaultSubjectsForGrade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade, gradeClasses.length, subjects.length, defaultSubjectsForGrade]);

  // Explicit reset — for when a school switches curriculum and wants a grade
  // that already has (possibly stale) subjects reloaded from the new
  // curriculum's template instead of keeping the old ones.
  function loadCurriculumDefaults() {
    if (!defaultSubjectsForGrade.length) {
      toast.error(`No subject template defined for ${selectedGrade} under ${curriculum.name}`);
      return;
    }
    persistGradeSubjects(defaultSubjectsForGrade);
    toast.success(`Loaded ${curriculum.shortName} defaults for ${selectedGrade}`, {
      description: defaultSubjectsForGrade.join(', '),
    });
  }

  // Save teacher→subject assignment for the SELECTED SECTION ONLY.
  // Subjects are grade-wide but teachers are assigned per section:
  //   Grade 10-A → Mathematics → Mohammed
  //   Grade 10-B → Mathematics → Asha
  async function handleTeacherAssign(subject: string, teacherName: string) {
    if (!selectedGrade || !selectedSection) return;
    const sec = selectedSection;
    try {
      // Resolve the teacher's real account (by name match, the only link we have —
      // the allocation UI only captures a free-text name) BEFORE sending anything,
      // so the notification can target recipientUid instead of the unreliable
      // recipientName (duplicate names, spelling, Mr./Mrs./Dr. prefixes all break
      // name-matching; a real uid/email doesn't).
      const norm = (v: any) => String(v || "").trim().toLowerCase();
      const target = norm(teacherName);
      const [allUsers, allStaff]: any[][] = await Promise.all([
        fetch("/api/data/users").then(r => r.json()).catch(() => []),
        fetch("/api/data/staff").then(r => r.json()).catch(() => []),
      ]);
      const teacherUser = (Array.isArray(allUsers) ? allUsers : []).find(
        (u: any) => norm(u.name) === target || norm(u.displayName) === target
      );
      const staffRecord = (Array.isArray(allStaff) ? allStaff : []).find(
        (s: any) => norm(s.name) === target || norm(s.displayName) === target
      );

      // REJECT free-text names that don't resolve to a real staff member —
      // saving with teacherEmail: undefined silently breaks marks-entry RBAC
      // downstream (the teacher would never see this class in their portal).
      if (!teacherUser && !staffRecord) {
        toast.error(`"${teacherName}" is not in the staff list — pick a teacher from the staff suggestions to assign ${subject}.`);
        return;
      }
      const teacherEmail = teacherUser?.email || staffRecord?.email || undefined;
      if (!teacherEmail) {
        toast.error(`${teacherName} has no linked account email, so subject access can't be granted. Add an email to their staff record first.`);
        return;
      }

      // Upsert the assignment for this grade/section/subject — update the
      // existing row in place instead of delete-all-then-create, so a failed
      // reassignment can never leave the subject with no teacher at all.
      const existing: any[] = await fetch("/api/data/subject_assignments").then(r => r.json()).catch(() => []);
      const matches = (Array.isArray(existing) ? existing : []).filter(
        (a: any) => canonGrade(a.grade) === canonGrade(selectedGrade) && canonSection(a.section) === canonSection(sec) && a.subject === subject
      );

      const stamp = new Date().toISOString();
      const base = Date.now();
      if (matches.length > 0) {
        const [current, ...duplicates] = matches;
        await fetch(`/api/data/subject_assignments/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...current,
            teacherName,
            teacherEmail,
            updatedAt: stamp,
          }),
        });
        // Clean up any historical duplicate rows for the same slot (non-critical)
        await Promise.all(duplicates.map((a: any) =>
          fetch(`/api/data/subject_assignments/${a.id}`, { method: "DELETE" }).catch(() => {})
        ));
      } else {
        // No row yet — create one assignment for this section only
        await fetch("/api/data/subject_assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `sa-${base}-${Math.random().toString(36).slice(2, 6)}`,
            grade: selectedGrade,
            section: sec,
            subject,
            teacherName,
            teacherEmail,
            createdAt: stamp,
            uid: "admin",
          }),
        });
      }

      // Refresh the displayed assignments for this section
      setSectionAssignments(prev => [
        ...prev.filter(a => a.subject !== subject),
        { grade: selectedGrade, section: sec, subject, teacherName },
      ]);

      // Notify the assigned teacher — recipientUid when we resolved a real
      // account, recipientName only as a last-resort fallback so nothing silently
      // fails to deliver for a teacher whose name doesn't match any user record yet.
      await fetch("/api/data/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `ntf-subj-${base}-teacher`,
          type: "update",
          entity: "subject_assignments",
          category: "general",
          audienceRole: teacherEmail ? undefined : "teacher",
          recipientUid: teacherEmail,
          recipientName: teacherEmail ? undefined : teacherName,
          title: `You've been assigned ${subject} — ${selectedGrade} Section ${sec}`,
          message: `You are now the subject teacher for ${subject} in ${selectedGrade}, Section ${sec}. You can take attendance, upload study materials, create assignments and homework for this class.`,
          time: stamp,
          uid: "admin",
        }),
      }).catch(() => {});

      // Notify students in this section
      await fetch("/api/data/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `ntf-subj-${base}-students`,
          type: "update",
          entity: "subject_assignments",
          category: "general",
          audienceRole: "student",
          recipientGrade: selectedGrade,
          recipientSection: sec,
          title: `Subject teacher assigned: ${subject}`,
          message: `${teacherName} has been assigned as your ${subject} teacher for ${selectedGrade} Section ${sec}.`,
          time: stamp,
          uid: "admin",
        }),
      }).catch(() => {});

      // Update the teacher's own User record so their portal reflects the assignment
      try {
        if (teacherUser && teacherUser.email) {
          await fetch(`/api/data/users/${encodeURIComponent(teacherUser.email)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...teacherUser,
              assignedGrade: selectedGrade,
              assignedSection: sec,
              assignedSubject: subject,
              assignedClassName: `${selectedGrade} Section ${sec}`,
            }),
          });
        }
      } catch {
        // Non-critical — teacher assignment still saved, portal update failed silently
      }

    } catch {
      toast.error("Could not save teacher assignment");
    }
  }

  // Cross-grade header roll-ups
  const totalSubjects = useMemo(() => {
    let n = 0;
    filteredByDB.forEach(g => {
      const c = (classes || []).find(x => canonGrade(x.grade) === canonGrade(g));
      n += c?.subjects?.length || 0;
    });
    return n;
  }, [filteredByDB, classes]);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-112px)] overflow-hidden">

        {/* ════════════════ LEFT SIDEBAR ════════════════ */}
        <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col shadow-sm overflow-hidden">

          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">Subjects</h1>
                <p className="text-sm text-slate-400">Centralized Manager</p>
              </div>
            </div>

            {/* Roll-up pills */}
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 border border-violet-100 text-[10px] font-bold text-violet-700">
                <BookOpen className="w-3 h-3" />{totalSubjects} Subjects
              </span>
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700">
                <Layers className="w-3 h-3" />{filteredByDB.length} Grades
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search grade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-violet-300 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Grade → Section tree */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {filteredGrades.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No grades found</p>
            )}
            {filteredGrades.map((g, gi) => {
              const isCollapsed  = collapsed.has(g);
              const gradColor    = GRADE_COLORS[gi % GRADE_COLORS.length];
              const secs         = sectionsByGrade[g] || [];
              const isGradeActive = selectedGrade === g;
              const hasClasses  = gradesWithClasses.has(g);

              return (
                <div key={g}>
                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group",
                      isGradeActive ? "bg-violet-50" : "hover:bg-gray-50"
                    )}
                    onClick={() => {
                      toggleGrade(g);
                      // Grades with no classes yet have no sections to click,
                      // so selecting the grade header is the only way to
                      // reach them — needed so every curriculum grade (e.g.
                      // Qatar's KG1/KG2 before a class exists) is actually
                      // reachable, not just ones that already have data.
                      select(g, secs[0] || '');
                    }}
                  >
                    <span className={cn(
                      "w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm",
                      hasClasses ? gradColor : "from-slate-300 to-slate-400"
                    )}>
                      {gradeAbbr(g)}
                    </span>
                    <span className={cn(
                      "flex-1 text-xs font-semibold truncate",
                      isGradeActive ? "text-violet-700" : hasClasses ? "text-gray-700 group-hover:text-gray-900" : "text-gray-400"
                    )}>{g}</span>
                    {!hasClasses && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 shrink-0">No classes</span>
                    )}
                    <span className="text-gray-300">
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5" />
                        : <ChevronDown  className="w-3.5 h-3.5" />}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="ml-6 mt-0.5 space-y-0.5 mb-1">
                      {secs.map(sec => {
                        const isActive = selectedGrade === g && selectedSection === sec;
                        return (
                          <button
                            key={sec}
                            onClick={() => select(g, sec)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all group",
                              isActive
                                ? "bg-purple-600 text-white shadow-md shadow-violet-200"
                                : "hover:bg-violet-50 text-gray-600 hover:text-violet-700"
                            )}
                          >
                            <span className={cn(
                              "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black border shrink-0 transition-all",
                              isActive
                                ? "bg-white/20 border-white/30 text-white"
                                : (SECTION_BADGE[sec] || "bg-gray-100 text-gray-600 border-gray-200")
                            )}>{sec}</span>
                            <span className={cn("text-xs font-semibold", isActive ? "text-white" : "")}>
                              Section {sec}
                            </span>
                            {isActive && (
                              <span className="ml-auto">
                                <ChevronRight className="w-3 h-3 text-white/70" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {secs.length === 0 && (
                        <p className="px-3 py-1 text-[10px] text-gray-400">No sections</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer — current context */}
          {selectedGrade && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                Active scope
              </p>
              <p className="text-xs font-semibold text-violet-700 truncate">
                {selectedGrade} · Section {selectedSection}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {studentCount} student{studentCount !== 1 ? "s" : ""} · {sections.length} section{sections.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </aside>

        {/* ════════════════ MAIN CONTENT ════════════════ */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {selectedGrade && gradeClasses.length === 0 ? (
            <div className="flex items-center justify-center h-full p-5">
              <div className="text-center max-w-sm">
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-white shadow-sm flex items-center justify-center">
                  <GraduationCap className="w-10 h-10 text-slate-300" />
                </div>
                <p className="text-lg font-bold text-slate-700">No classes yet for {selectedGrade}</p>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedGrade} is part of the {curriculum.name}, but no class/section has
                  been created for it yet — subjects are stored per class, so create one first.
                </p>
                {defaultSubjectsForGrade.length > 0 && (
                  <div className="mt-4 p-3 bg-violet-50 border border-violet-100 rounded-2xl text-left">
                    <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 mb-1.5">
                      {curriculum.shortName} default subjects for {selectedGrade}
                    </p>
                    <p className="text-xs text-violet-800 font-medium">{defaultSubjectsForGrade.join(', ')}</p>
                    <p className="text-[10px] text-violet-400 mt-1.5">Applied automatically once a class exists for this grade.</p>
                  </div>
                )}
                <Button
                  className="rounded-xl h-10 px-5 font-bold text-xs gradient-primary text-white mt-5"
                  onClick={() => navigate('/academics/classes/new')}
                >
                  Create a Class for {selectedGrade}
                </Button>
              </div>
            </div>
          ) : selectedGrade ? (
            <div className="p-5">
              {/* Context header */}
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-600 flex items-center justify-center shadow-sm">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-slate-900 leading-tight">
                      {selectedGrade} — Section {selectedSection}
                    </h1>
                    <p className="text-xs text-slate-500">
                      Subjects apply grade-wide to{" "}
                      {sections.length ? sections.map(s => `Section ${s}`).join(", ") : "all sections"} ·{" "}
                      {studentCount} student{studentCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                {defaultSubjectsForGrade.length > 0 && (
                  <Button
                    variant="outline" size="sm"
                    className="rounded-xl h-9 px-3.5 font-bold text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50 shrink-0"
                    onClick={loadCurriculumDefaults}
                    title={`Replace ${selectedGrade}'s subjects with the ${curriculum.shortName} curriculum default: ${defaultSubjectsForGrade.join(', ')}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Load {curriculum.shortName} Defaults
                  </Button>
                )}
              </div>

              <SubjectsPro
                key={selectedGrade}
                classData={{ grade: selectedGrade, name: selectedGrade }}
                subjects={subjects}
                studentCount={studentCount}
                teacherName={teacherName}
                sections={sections.length ? sections : ["A"]}
                selectedSection={selectedSection}
                sectionAssignments={sectionAssignments}
                onSubjectsChange={persistGradeSubjects}
                onTeacherAssign={handleTeacherAssign}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-white shadow-sm flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-slate-300" />
                </div>
                <p className="text-lg font-bold text-slate-700">No Grades Available</p>
                <p className="text-sm text-slate-400 mt-1">
                  Create classes in Academics → Classes to manage subjects here.
                </p>
              </div>
            </div>
          )}
        </main>

      </div>
    </DashboardLayout>
  );
}
