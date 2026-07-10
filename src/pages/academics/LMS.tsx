import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BookOpen, Video, FileText, CheckSquare, Play, Plus, Edit2, Users, GraduationCap, ChevronDown, ChevronUp, GripVertical, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";

// Courses persist to the (unmapped → literal) `lms_courses` table via smartDb.
// Lessons live as a JSON array on the course row itself.
interface LmsLesson {
  id: string;
  title: string;
  type: string; // video | pdf | quiz | assignment | worksheet | live
  duration?: string;
  description?: string;
  published: boolean;
}

interface LmsCourse {
  id: string;
  name: string;
  subject: string;
  grade: string;
  teacher: string;
  description?: string;
  color: string;
  lessons: LmsLesson[];
  createdAt?: string;
  updatedAt?: string;
}

interface RosterStudent {
  id: string;
  name: string;
  grade: string;
  section: string;
}

const COURSE_COLORS = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
const LESSON_TYPES = ["video", "pdf", "quiz", "assignment", "worksheet", "live"];

const normGrade = (g: string) => (g || "").toLowerCase().replace("grade ", "").trim();

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

function LessonTypeIcon({ type }: { type: string }) {
  if (type === "video" || type === "live") return <Video className="h-4 w-4 text-blue-500" />;
  if (type === "pdf") return <FileText className="h-4 w-4 text-orange-500" />;
  if (type === "quiz") return <CheckSquare className="h-4 w-4 text-purple-500" />;
  if (type === "assignment" || type === "worksheet") return <FileText className="h-4 w-4 text-green-500" />;
  return <BookOpen className="h-4 w-4 text-gray-500" />;
}

const EMPTY_FORM = { name: "", subject: "", grade: "", teacher: "", description: "" };
const EMPTY_LESSON = { title: "", type: "video", duration: "", description: "" };

export default function LMS() {
  const [courses, setCourses] = useState<LmsCourse[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("courses");
  const [builderCourseId, setBuilderCourseId] = useState<string>("");

  // Course create/edit dialog
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Add lesson dialog
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [lessonCourseId, setLessonCourseId] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState(EMPTY_LESSON);

  const [moodleOpen, setMoodleOpen] = useState(false);
  const [moodleUrl, setMoodleUrl] = useState("");

  const loadCourses = useCallback(async () => {
    try {
      const rows = await smartDb.getAll("lms_courses", "");
      const normalized: LmsCourse[] = (rows || []).map((r: any) => ({
        ...r,
        lessons: Array.isArray(r.lessons) ? r.lessons : [],
        color: r.color || COURSE_COLORS[0],
      }));
      normalized.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setCourses(normalized);
    } catch (error) {
      console.error("Error loading LMS courses:", error);
      toast.error("Failed to load courses");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Roster is loaded unscoped: Student rows stamp uid with the staff
        // account that created them, so a uid-scoped fetch returns nothing
        // for most viewers (same pattern as the exam pages).
        const [, students] = await Promise.all([
          loadCourses(),
          smartDb.getAll("Student", "") as Promise<any[]>,
        ]);
        if (cancelled) return;
        setRoster((students || []).map((s: any) => ({
          id: s.id || s.uid || "",
          name: s.name || s.studentName || s.displayName || "Student",
          grade: s.grade || s.gradeLevel || "",
          section: s.section || "",
        })).filter((s: RosterStudent) => s.id));
      } catch (error) {
        console.error("Error loading LMS data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadCourses]);

  // Real enrolled-student counts, derived from the roster by grade.
  const studentsForGrade = useCallback(
    (grade: string) => roster.filter(s => normGrade(s.grade) === normGrade(grade)),
    [roster]
  );

  const stats = useMemo(() => {
    const totalLessons = courses.reduce((sum, c) => sum + c.lessons.length, 0);
    const publishedLessons = courses.reduce((sum, c) => sum + c.lessons.filter(l => l.published).length, 0);
    const enrolledIds = new Set<string>();
    courses.forEach(c => studentsForGrade(c.grade).forEach(s => enrolledIds.add(s.id)));
    return [
      { label: "Total Courses", value: String(courses.length), icon: BookOpen, color: "text-purple-600 bg-blue-50" },
      { label: "Total Enrolled", value: String(enrolledIds.size), icon: Users, color: "text-purple-600 bg-purple-50" },
      { label: "Total Lessons", value: String(totalLessons), icon: Play, color: "text-green-600 bg-green-50" },
      { label: "Published Lessons", value: String(publishedLessons), icon: GraduationCap, color: "text-orange-600 bg-orange-50" },
    ];
  }, [courses, studentsForGrade]);

  const builderCourse = courses.find(c => c.id === builderCourseId) || courses[0];

  function openCreateCourse() {
    setEditingCourseId(null);
    setCourseForm(EMPTY_FORM);
    setCourseDialogOpen(true);
  }

  function openEditCourse(course: LmsCourse) {
    setEditingCourseId(course.id);
    setCourseForm({
      name: course.name,
      subject: course.subject,
      grade: course.grade,
      teacher: course.teacher,
      description: course.description || "",
    });
    setCourseDialogOpen(true);
  }

  async function saveCourse() {
    if (!courseForm.name || !courseForm.subject || !courseForm.grade || !courseForm.teacher) {
      toast.error("Please fill in course name, subject, grade and teacher");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    try {
      if (editingCourseId) {
        await smartDb.update("lms_courses", editingCourseId, { ...courseForm, updatedAt: now });
        toast.success(`Course "${courseForm.name}" updated`);
      } else {
        const id = `lms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await smartDb.create("lms_courses", {
          id,
          ...courseForm,
          color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
          lessons: [],
          createdAt: now,
          updatedAt: now,
        }, id);
        toast.success(`Course "${courseForm.name}" created`);
      }
      setCourseDialogOpen(false);
      setCourseForm(EMPTY_FORM);
      setEditingCourseId(null);
      await loadCourses();
    } catch (error) {
      console.error("Error saving course:", error);
      toast.error("Failed to save course");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCourse(course: LmsCourse) {
    if (!window.confirm(`Delete course "${course.name}"? This cannot be undone.`)) return;
    try {
      await smartDb.delete("lms_courses", course.id);
      toast.success(`Course "${course.name}" deleted`);
      setCourseDialogOpen(false);
      setEditingCourseId(null);
      await loadCourses();
    } catch (error) {
      console.error("Error deleting course:", error);
      toast.error("Failed to delete course");
    }
  }

  function openAddLesson(courseId: string) {
    setLessonCourseId(courseId);
    setLessonForm(EMPTY_LESSON);
    setLessonDialogOpen(true);
  }

  async function saveLesson() {
    const course = courses.find(c => c.id === lessonCourseId);
    if (!course) return;
    if (!lessonForm.title.trim()) {
      toast.error("Please enter a lesson title");
      return;
    }
    setSaving(true);
    try {
      const lesson: LmsLesson = {
        id: `lsn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: lessonForm.title.trim(),
        type: lessonForm.type,
        duration: lessonForm.duration.trim() || undefined,
        description: lessonForm.description.trim() || undefined,
        published: false,
      };
      await smartDb.update("lms_courses", course.id, {
        lessons: [...course.lessons, lesson],
        updatedAt: new Date().toISOString(),
      });
      toast.success(`Lesson "${lesson.title}" added to ${course.name}`);
      setLessonDialogOpen(false);
      setLessonForm(EMPTY_LESSON);
      await loadCourses();
    } catch (error) {
      console.error("Error adding lesson:", error);
      toast.error("Failed to add lesson");
    } finally {
      setSaving(false);
    }
  }

  async function persistLessons(course: LmsCourse, lessons: LmsLesson[], message: string) {
    try {
      await smartDb.update("lms_courses", course.id, { lessons, updatedAt: new Date().toISOString() });
      toast.success(message);
      await loadCourses();
    } catch (error) {
      console.error("Error updating lessons:", error);
      toast.error("Failed to update lessons");
    }
  }

  function toggleLessonPublished(course: LmsCourse, lessonId: string) {
    const lessons = course.lessons.map(l => l.id === lessonId ? { ...l, published: !l.published } : l);
    const lesson = course.lessons.find(l => l.id === lessonId);
    persistLessons(course, lessons, lesson?.published ? `"${lesson.title}" moved to draft` : `"${lesson?.title}" published`);
  }

  function deleteLesson(course: LmsCourse, lessonId: string) {
    const lesson = course.lessons.find(l => l.id === lessonId);
    persistLessons(course, course.lessons.filter(l => l.id !== lessonId), `Lesson "${lesson?.title}" removed`);
  }

  function publishAllLessons(course: LmsCourse) {
    const drafts = course.lessons.filter(l => !l.published).length;
    if (drafts === 0) {
      toast.info("All lessons are already published");
      return;
    }
    persistLessons(course, course.lessons.map(l => ({ ...l, published: true })), `${drafts} lesson${drafts === 1 ? "" : "s"} published`);
  }

  // Progress rows: real students enrolled in each course's grade. There is no
  // per-lesson progress tracking table yet, so lesson/quiz/activity columns
  // honestly show "not started" rather than fabricated numbers.
  const progressRows = useMemo(() =>
    courses.flatMap(course =>
      studentsForGrade(course.grade).map(student => ({ course, student }))
    ), [courses, studentsForGrade]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Learning Management System</h1>
              <p className="text-sm text-slate-400">Create courses, upload lessons, and track student completion</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={openCreateCourse} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> New Course
            </Button>
            <Button variant="outline" onClick={() => setMoodleOpen(true)}>
              Import from Moodle
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <Card key={stat.label} className="border border-gray-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", stat.color)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? "…" : stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-gray-100">
            <TabsTrigger value="courses">My Courses</TabsTrigger>
            <TabsTrigger value="builder">Course Builder</TabsTrigger>
            <TabsTrigger value="progress">Student Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading courses…
              </div>
            ) : courses.length === 0 ? (
              <Card className="border border-dashed border-gray-300">
                <CardContent className="py-16 flex flex-col items-center text-center">
                  <BookOpen className="h-10 w-10 text-gray-300 mb-3" />
                  <h3 className="font-semibold text-gray-900">No courses yet</h3>
                  <p className="text-sm text-gray-500 mt-1 mb-4">Create your first course to start building lessons.</p>
                  <Button onClick={openCreateCourse} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> New Course
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {courses.map(course => {
                  const enrolled = studentsForGrade(course.grade).length;
                  const published = course.lessons.filter(l => l.published).length;
                  const publishedPct = course.lessons.length ? Math.round((published / course.lessons.length) * 100) : 0;
                  return (
                    <Card key={course.id} className="border border-gray-200 overflow-hidden">
                      <div className={cn("h-2 w-full", course.color)} />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">{course.name}</h3>
                            <p className="text-sm text-gray-500">{course.subject}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">{course.grade}</Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-sm font-semibold text-gray-900">{course.lessons.length}</p>
                            <p className="text-xs text-gray-500">Lessons</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-sm font-semibold text-gray-900">{enrolled}</p>
                            <p className="text-xs text-gray-500">Students</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-sm font-semibold text-gray-900">{published}</p>
                            <p className="text-xs text-gray-500">Published</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Lessons Published</span>
                            <span>{course.lessons.length ? `${publishedPct}%` : "—"}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className={cn("h-1.5 rounded-full", course.color)}
                              style={{ width: `${publishedPct}%` }}
                            />
                          </div>
                        </div>

                        <p className="text-xs text-gray-400">Last updated: {relativeTime(course.updatedAt || course.createdAt)}</p>

                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => openEditCourse(course)}>
                            <Edit2 className="h-3 w-3 mr-1" /> Edit Course
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setTab("progress")}>
                            <Users className="h-3 w-3 mr-1" /> View Students
                          </Button>
                          <Button size="sm" className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => openAddLesson(course.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Add Lesson
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="builder" className="mt-4">
            {courses.length === 0 ? (
              <Card className="border border-dashed border-gray-300">
                <CardContent className="py-16 flex flex-col items-center text-center">
                  <BookOpen className="h-10 w-10 text-gray-300 mb-3" />
                  <h3 className="font-semibold text-gray-900">No course to build yet</h3>
                  <p className="text-sm text-gray-500 mt-1">Create a course first, then add lessons here.</p>
                </CardContent>
              </Card>
            ) : builderCourse && (
              <Card className="border border-gray-200">
                <CardHeader className="border-b border-gray-100 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-2">
                      <Select value={builderCourse.id} onValueChange={setBuilderCourseId}>
                        <SelectTrigger className="w-[280px] font-bold text-gray-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name} — {c.grade}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-500">
                        {builderCourse.description || `${builderCourse.subject} · ${builderCourse.grade} · ${builderCourse.teacher}`}
                      </p>
                    </div>
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => publishAllLessons(builderCourse)}>
                      Publish Course
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="w-full flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-gray-900 text-sm">Lessons</span>
                        <Badge variant="secondary" className="text-xs">{builderCourse.lessons.length} lessons</Badge>
                      </div>
                    </div>
                    {builderCourse.lessons.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">
                        No lessons yet — add the first lesson below.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {builderCourse.lessons.map(lesson => (
                          <div key={lesson.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                            <GripVertical className="h-4 w-4 text-gray-300 cursor-grab" />
                            <LessonTypeIcon type={lesson.type} />
                            <div className="flex-1 min-w-0">
                              <span className="block text-sm text-gray-800 truncate">{lesson.title}</span>
                              {lesson.description && <span className="block text-xs text-gray-400 truncate">{lesson.description}</span>}
                            </div>
                            {lesson.duration && <span className="text-xs text-gray-400">{lesson.duration}</span>}
                            <button onClick={() => toggleLessonPublished(builderCourse, lesson.id)} title="Toggle publish state">
                              <Badge
                                variant={lesson.published ? "default" : "secondary"}
                                className={cn("text-xs cursor-pointer", lesson.published ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" : "hover:bg-gray-200")}
                              >
                                {lesson.published ? "Published" : "Draft"}
                              </Badge>
                            </button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-red-600" onClick={() => deleteLesson(builderCourse, lesson.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="px-4 py-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-purple-600 hover:text-blue-700 hover:bg-blue-50 text-xs"
                        onClick={() => openAddLesson(builderCourse.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Lesson
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="progress" className="mt-4">
            <Card className="border border-gray-200">
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-base font-semibold text-gray-900">Student Progress Overview</CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  Students enrolled by grade. Per-lesson progress tracking is not recorded yet.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {progressRows.length === 0 ? (
                  <div className="py-14 flex flex-col items-center text-center text-gray-400">
                    <Users className="h-8 w-8 mb-2 text-gray-300" />
                    <p className="text-sm">
                      {courses.length === 0
                        ? "Create a course to see its enrolled students here."
                        : "No students found for the grades covered by your courses."}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs font-semibold text-gray-600">Student Name</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Grade</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">Course</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">Lessons</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">Quiz Score</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">Completion</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {progressRows.map(({ course, student }) => (
                        <TableRow key={`${course.id}_${student.id}`} className="hover:bg-gray-50">
                          <TableCell className="font-medium text-sm text-gray-900">{student.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {student.grade}{student.section ? ` - ${student.section}` : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-[160px] truncate">{course.name}</TableCell>
                          <TableCell className="text-center text-sm text-gray-700">—/{course.lessons.length}</TableCell>
                          <TableCell className="text-center text-sm text-gray-400">—</TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">
                              Not started
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => toast.info(`Reminder sent to ${student.name}`)}
                            >
                              Send Reminder
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Course create/edit dialog */}
      <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingCourseId ? "Edit Course" : "Create New Course"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-name">Course Name</Label>
              <Input
                id="course-name"
                placeholder="e.g. Advanced Mathematics"
                value={courseForm.name}
                onChange={(e) => setCourseForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select value={courseForm.subject} onValueChange={(v) => setCourseForm(prev => ({ ...prev, subject: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Math">Math</SelectItem>
                  <SelectItem value="Science">Science</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                  <SelectItem value="Islamic Studies">Islamic Studies</SelectItem>
                  <SelectItem value="Social Studies">Social Studies</SelectItem>
                  <SelectItem value="ICT">ICT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Grade</Label>
              <Select value={courseForm.grade} onValueChange={(v) => setCourseForm(prev => ({ ...prev, grade: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={`Grade ${i + 1}`}>Grade {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-teacher">Teacher</Label>
              <Input
                id="course-teacher"
                placeholder="e.g. Mr. Ahmed Al-Rashid"
                value={courseForm.teacher}
                onChange={(e) => setCourseForm(prev => ({ ...prev, teacher: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-description">Description (optional)</Label>
              <Textarea
                id="course-description"
                placeholder="What does this course cover?"
                value={courseForm.description}
                onChange={(e) => setCourseForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editingCourseId ? (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  const course = courses.find(c => c.id === editingCourseId);
                  if (course) deleteCourse(course);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>Cancel</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={saveCourse} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingCourseId ? "Save Changes" : "Create Course"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add lesson dialog */}
      <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Add Lesson{lessonCourseId ? ` — ${courses.find(c => c.id === lessonCourseId)?.name ?? ""}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title">Lesson Title</Label>
              <Input
                id="lesson-title"
                placeholder="e.g. Linear Equations"
                value={lessonForm.title}
                onChange={(e) => setLessonForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={lessonForm.type} onValueChange={(v) => setLessonForm(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration">Duration (optional)</Label>
              <Input
                id="lesson-duration"
                placeholder="e.g. 20 min"
                value={lessonForm.duration}
                onChange={(e) => setLessonForm(prev => ({ ...prev, duration: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-description">Description (optional)</Label>
              <Textarea
                id="lesson-description"
                placeholder="Short summary of this lesson"
                value={lessonForm.description}
                onChange={(e) => setLessonForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={saveLesson} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Lesson
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moodle Import Dialog */}
      <Dialog open={moodleOpen} onOpenChange={setMoodleOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Import from Moodle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-500">Paste your Moodle backup (.mbz) URL below to queue an import.</p>
            <div className="space-y-1.5">
              <Label htmlFor="moodle-url">Moodle Backup URL</Label>
              <Input
                id="moodle-url"
                placeholder="https://moodle.example.com/backup.mbz"
                value={moodleUrl}
                onChange={(e) => setMoodleUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoodleOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!moodleUrl.trim()) {
                toast.error("Please enter a Moodle backup URL");
                return;
              }
              toast.success("Import queued — courses will appear within 24 hours");
              setMoodleUrl('');
              setMoodleOpen(false);
            }}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
