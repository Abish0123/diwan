import { useState, useMemo } from "react";
import { useGrades } from "@/contexts/CurriculumContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GraduationCap,
  Users,
  Plus,
  BookOpen,
  Search,
  ChevronRight,
  User,
  Calendar,
  ArrowLeft,
  LayoutGrid,
  Check,
  Layers,
  Loader2,
} from "lucide-react";
import { useClasses } from "@/hooks/useClasses";
import { Class } from "@/types/classes";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type DrillLevel = "grades" | "sections" | "semesters";

const SEMESTER_OPTIONS = ["Semester 1", "Semester 2", "Semester 3", "Semester 4"];

const gradeColor = (grade: string, grades: string[]) => {
  const idx = grades.indexOf(grade);
  const colors = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-indigo-500 to-purple-600",
    "from-teal-500 to-emerald-600",
  ];
  return colors[Math.abs(idx) % colors.length];
};

const Classes = () => {
  const grades = useGrades();
  const { classes, loading, deleteClass } = useClasses();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("grades");
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSectionClass, setSelectedSectionClass] = useState<Class | null>(null);
  const navigate = useNavigate();

  // Deduplicate: group by grade, then by section, keeping the latest record for each
  const deduped = useMemo(() => {
    const seen = new Map<string, Class>();
    for (const cls of (classes as Class[])) {
      const key = `${cls.grade}__${cls.section}`;
      const existing = seen.get(key);
      // Keep the one with more subjects / newer id
      if (!existing || (cls.subjectsCount || 0) >= (existing.subjectsCount || 0)) {
        seen.set(key, cls);
      }
    }
    return Array.from(seen.values());
  }, [classes]);

  // Unique grades, sorted by grades order from useGrades()
  const uniqueGrades = useMemo(() => {
    const gs = Array.from(new Set(deduped.map(c => c.grade).filter(Boolean)));
    return gs.sort((a, b) => {
      const ia = grades.indexOf(a);
      const ib = grades.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [deduped, grades]);

  // Sections for selected grade
  const sectionsForGrade = useMemo(() => {
    if (!selectedGrade) return [];
    return deduped
      .filter(c => c.grade === selectedGrade)
      .sort((a, b) => (a.section || "").localeCompare(b.section || ""));
  }, [deduped, selectedGrade]);

  // Semesters available for selected section
  const semestersForSection = useMemo(() => {
    if (!selectedSectionClass) return [];
    const all = (classes as Class[]).filter(
      c => c.grade === selectedSectionClass.grade && c.section === selectedSectionClass.section && c.semester
    );
    const unique = Array.from(new Set(all.map(c => c.semester)));
    return unique;
  }, [classes, selectedSectionClass]);

  const filteredGrades = useMemo(() =>
    uniqueGrades.filter(g =>
      g.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deduped.filter(c => c.grade === g).some(c =>
        (c.teacher || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    ),
  [uniqueGrades, deduped, searchQuery]);

  const totalStats = useMemo(() => {
    const totalGrades = uniqueGrades.length;
    const totalSections = deduped.length;
    const totalStudents = deduped.reduce((acc, c) => acc + (c.studentsCount || 0), 0);
    return { totalGrades, totalSections, totalStudents };
  }, [uniqueGrades, deduped]);

  const handleGradeClick = (grade: string) => {
    setSelectedGrade(grade);
    setDrillLevel("sections");
  };

  const handleSectionClick = (cls: Class) => {
    setSelectedSectionClass(cls);
    setDrillLevel("semesters");
  };

  const handleSemesterSelect = (semester: string) => {
    if (!selectedSectionClass) return;
    // Find the class record that matches grade + section + semester
    const match = (classes as Class[]).find(
      c => c.grade === selectedSectionClass.grade &&
           c.section === selectedSectionClass.section &&
           c.semester === semester
    ) || selectedSectionClass;
    navigate(`/academics/classes/${match.id}`);
  };

  const handleViewAllSemesters = () => {
    if (!selectedSectionClass) return;
    navigate(`/academics/classes/${selectedSectionClass.id}`);
  };

  const goBack = () => {
    if (drillLevel === "semesters") {
      setDrillLevel("sections");
      setSelectedSectionClass(null);
    } else if (drillLevel === "sections") {
      setDrillLevel("grades");
      setSelectedGrade(null);
    }
  };

  const breadcrumbs = [
    { label: "Classes", onClick: () => { setDrillLevel("grades"); setSelectedGrade(null); setSelectedSectionClass(null); } },
    ...(selectedGrade ? [{ label: selectedGrade, onClick: () => { setDrillLevel("sections"); setSelectedSectionClass(null); } }] : []),
    ...(selectedSectionClass ? [{ label: `Section ${selectedSectionClass.section}`, onClick: () => {} }] : []),
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="hover:text-primary cursor-pointer" onClick={() => navigate("/")}>Home</span>
          <ChevronRight className="h-3 w-3" />
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span
                className={cn("cursor-pointer hover:text-primary transition-colors", i === breadcrumbs.length - 1 ? "text-primary font-bold" : "")}
                onClick={b.onClick}
              >
                {b.label}
              </span>
            </span>
          ))}
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {drillLevel !== "grades" && (
              <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10" onClick={goBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {drillLevel === "grades" && "Academic Classes"}
                {drillLevel === "sections" && selectedGrade}
                {drillLevel === "semesters" && `Section ${selectedSectionClass?.section}`}
              </h1>
              <p className="text-sm text-slate-400">
                {drillLevel === "grades" && "Select a class to view its sections"}
                {drillLevel === "sections" && `Choose a section in ${selectedGrade}`}
                {drillLevel === "semesters" && `Choose a semester to view or edit`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {drillLevel === "grades" && (
              <>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search classes..."
                    className="pl-10 bg-white border-slate-200 rounded-xl h-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="rounded-xl gradient-primary text-white font-bold shadow-lg shadow-primary/20 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create Class
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats (grades level only) */}
        {drillLevel === "grades" && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Classes", value: totalStats.totalGrades, icon: GraduationCap },
              { label: "Total Sections", value: totalStats.totalSections, icon: Layers },
              { label: "Total Students", value: totalStats.totalStudents, icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="border-none shadow-sm rounded-2xl bg-white">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-11 w-11 rounded-xl bg-[#9810fa]/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-[#9810fa]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-2xl font-black text-slate-900">{loading ? "—" : value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <CreateClassDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

        {loading ? (
          <div className="flex flex-col items-center justify-center h-[400px] gap-4">
            <Loader2 className="h-8 w-8 text-[#9810fa] animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">Loading classes...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* ---- LEVEL 1: GRADES ---- */}
            {drillLevel === "grades" && (
              <motion.div
                key="grades"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {filteredGrades.length === 0 ? (
                  <div className="col-span-full h-56 flex flex-col items-center justify-center text-muted-foreground bg-white rounded-3xl border border-dashed border-slate-200">
                    <BookOpen className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium">No classes found.</p>
                    <Button variant="link" onClick={() => setSearchQuery("")} className="text-primary text-xs font-bold mt-1">
                      Clear search
                    </Button>
                  </div>
                ) : filteredGrades.map((grade) => {
                  const gradeSections = deduped.filter(c => c.grade === grade);
                  const totalStudents = gradeSections.reduce((acc, c) => acc + (c.studentsCount || 0), 0);
                  const sectionNames = gradeSections.map(c => c.section).filter(Boolean).sort();
                  const teacher = gradeSections[0]?.teacher || "Not Assigned";
                  return (
                    <motion.div
                      key={grade}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4, transition: { duration: 0.15 } }}
                    >
                      <Card
                        className="group border-none shadow-sm hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 rounded-2xl overflow-hidden bg-white cursor-pointer"
                        onClick={() => handleGradeClick(grade)}
                      >
                        {/* Color header strip */}
                        <div className={`h-2 w-full bg-gradient-to-r ${gradeColor(grade, grades)}`} />
                        <CardHeader className="pb-2 pt-4">
                          <div className="flex items-start justify-between">
                            <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${gradeColor(grade, grades)} flex items-center justify-center shadow-lg`}>
                              <GraduationCap className="h-6 w-6 text-white" />
                            </div>
                            <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px] font-bold rounded-full px-2">
                              Active
                            </Badge>
                          </div>
                          <CardTitle className="text-xl font-black text-slate-900 mt-3 group-hover:text-[#9810fa] transition-colors">
                            {grade}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-5">
                          {/* Sections as chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {sectionNames.map(sec => (
                              <span key={sec} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                Section {sec}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <User className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="font-medium truncate">{teacher}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                              <p className="text-lg font-black text-slate-800">{gradeSections.length}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Sections</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                              <p className="text-lg font-black text-slate-800">{totalStudents}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Students</p>
                            </div>
                          </div>
                          <Button
                            className="w-full rounded-xl gradient-primary text-white font-bold text-xs h-9 shadow-md shadow-primary/20 gap-1.5"
                            onClick={(e) => { e.stopPropagation(); handleGradeClick(grade); }}
                          >
                            View Sections
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* ---- LEVEL 2: SECTIONS ---- */}
            {drillLevel === "sections" && (
              <motion.div
                key="sections"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-sm text-slate-500 font-medium">
                  {sectionsForGrade.length} section{sectionsForGrade.length !== 1 ? "s" : ""} in {selectedGrade}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sectionsForGrade.map((cls) => (
                    <motion.div
                      key={cls.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4, transition: { duration: 0.15 } }}
                    >
                      <Card
                        className="group border-none shadow-sm hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 rounded-2xl overflow-hidden bg-white cursor-pointer"
                        onClick={() => handleSectionClick(cls)}
                      >
                        <div className={`h-2 w-full bg-gradient-to-r ${gradeColor(selectedGrade || "", grades)}`} />
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-start justify-between">
                            <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${gradeColor(selectedGrade || "", grades)} flex items-center justify-center shadow-lg`}>
                              <span className="text-2xl font-black text-white">{cls.section}</span>
                            </div>
                            <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px] font-bold rounded-full px-2">
                              {cls.status || "Active"}
                            </Badge>
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-slate-900 group-hover:text-[#9810fa] transition-colors">
                              Section {cls.section}
                            </h3>
                            <p className="text-xs text-slate-400 font-medium">{selectedGrade}</p>
                          </div>
                          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                            <div className="h-8 w-8 rounded-full bg-white border border-slate-100 flex items-center justify-center text-xs font-black text-slate-500">
                              {(cls.teacher || "U").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-700">{cls.teacher || "Unassigned"}</p>
                              <p className="text-[10px] text-slate-400 font-medium">Class Teacher</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                              <p className="text-base font-black text-slate-800">{cls.studentsCount || 0}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Students</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                              <p className="text-base font-black text-slate-800">{cls.subjectsCount || 0}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Subjects</p>
                            </div>
                          </div>
                          <Button
                            className="w-full rounded-xl gradient-primary text-white font-bold text-xs h-9 shadow-md shadow-primary/20 gap-1.5"
                            onClick={(e) => { e.stopPropagation(); handleSectionClick(cls); }}
                          >
                            Choose Semester
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ---- LEVEL 3: SEMESTER PICKER ---- */}
            {drillLevel === "semesters" && selectedSectionClass && (
              <motion.div
                key="semesters"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Section summary card */}
                <Card className="border-none shadow-sm rounded-2xl bg-white">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${gradeColor(selectedGrade || "", grades)} flex items-center justify-center shadow-lg flex-shrink-0`}>
                      <span className="text-2xl font-black text-white">{selectedSectionClass.section}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-slate-900">{selectedGrade} — Section {selectedSectionClass.section}</h3>
                      <p className="text-xs text-slate-500 font-medium">{selectedSectionClass.teacher || "Unassigned"} · {selectedSectionClass.subjectsCount || 0} subjects · {selectedSectionClass.studentsCount || 0} students</p>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-xl text-xs font-bold border-slate-200"
                      onClick={handleViewAllSemesters}
                    >
                      View All
                    </Button>
                  </CardContent>
                </Card>

                <div>
                  <h2 className="text-lg font-black text-slate-900 mb-1">Choose a Semester</h2>
                  <p className="text-sm text-slate-400 font-medium mb-4">Select the semester to view or edit this section</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {SEMESTER_OPTIONS.map((sem) => {
                      const hasData = semestersForSection.includes(sem);
                      return (
                        <motion.div
                          key={sem}
                          whileHover={{ y: -4, transition: { duration: 0.15 } }}
                        >
                          <Card
                            className={cn(
                              "border-2 rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-lg overflow-hidden",
                              hasData ? "border-[#9810fa]/30 bg-[#9810fa]/5 hover:border-[#9810fa]" : "border-slate-100 bg-white hover:border-slate-300"
                            )}
                            onClick={() => handleSemesterSelect(sem)}
                          >
                            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
                              <div className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-black",
                                hasData ? "bg-[#9810fa] text-white" : "bg-slate-100 text-slate-400"
                              )}>
                                {sem.split(" ")[1]}
                              </div>
                              <div>
                                <p className={cn("font-black text-sm", hasData ? "text-[#9810fa]" : "text-slate-700")}>{sem}</p>
                                {hasData && (
                                  <span className="text-[10px] font-bold text-emerald-500 flex items-center justify-center gap-1 mt-1">
                                    <Check className="h-3 w-3" /> Has data
                                  </span>
                                )}
                                {!hasData && (
                                  <span className="text-[10px] text-slate-400 font-medium mt-1 block">New semester</span>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    className="rounded-xl gradient-primary text-white font-bold gap-2 shadow-lg shadow-primary/20"
                    onClick={handleViewAllSemesters}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Open Section Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl font-bold border-slate-200 gap-2"
                    onClick={goBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Sections
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Classes;
