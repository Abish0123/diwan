import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
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

// Note: relativeTime is a plain helper outside the component (no hook access),
// so its strings are left as English JS constants (cannot call t() here).
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

// Lookup map: keeps LESSON_TYPES values (used as logic identifiers) untouched
// while providing translated labels for display.
const LESSON_TYPE_LABEL_KEYS: Record<string, string> = {
  video: "admin.academics.lms.lessonTypeVideo",
  pdf: "admin.academics.lms.lessonTypePdf",
  quiz: "admin.academics.lms.lessonTypeQuiz",
  assignment: "admin.academics.lms.lessonTypeAssignment",
  worksheet: "admin.academics.lms.lessonTypeWorksheet",
  live: "admin.academics.lms.lessonTypeLive",
};

export default function LMS() {
  const { t } = useTranslation();
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
      toast.error(t('admin.academics.lms.toastLoadCoursesFailed'));
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
          name: s.name || s.studentName || s.displayName || t('admin.academics.lms.defaultStudentName'),
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
      { label: t('admin.academics.lms.statTotalCourses'), value: String(courses.length), icon: BookOpen, color: "text-purple-600 bg-blue-50" },
      { label: t('admin.academics.lms.statTotalEnrolled'), value: String(enrolledIds.size), icon: Users, color: "text-purple-600 bg-purple-50" },
      { label: t('admin.academics.lms.statTotalLessons'), value: String(totalLessons), icon: Play, color: "text-green-600 bg-green-50" },
      { label: t('admin.academics.lms.statPublishedLessons'), value: String(publishedLessons), icon: GraduationCap, color: "text-orange-600 bg-orange-50" },
    ];
  }, [courses, studentsForGrade, t]);

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
      toast.error(t('admin.academics.lms.toastFillRequiredFields'));
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    try {
      if (editingCourseId) {
        await smartDb.update("lms_courses", editingCourseId, { ...courseForm, updatedAt: now });
        toast.success(t('admin.academics.lms.toastCourseUpdated', { name: courseForm.name }));
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
        toast.success(t('admin.academics.lms.toastCourseCreated', { name: courseForm.name }));
      }
      setCourseDialogOpen(false);
      setCourseForm(EMPTY_FORM);
      setEditingCourseId(null);
      await loadCourses();
    } catch (error) {
      console.error("Error saving course:", error);
      toast.error(t('admin.academics.lms.toastSaveCourseFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCourse(course: LmsCourse) {
    if (!window.confirm(t('admin.academics.lms.confirmDeleteCourse', { name: course.name }))) return;
    try {
      await smartDb.delete("lms_courses", course.id);
      toast.success(t('admin.academics.lms.toastCourseDeleted', { name: course.name }));
      setCourseDialogOpen(false);
      setEditingCourseId(null);
      await loadCourses();
    } catch (error) {
      console.error("Error deleting course:", error);
      toast.error(t('admin.academics.lms.toastDeleteCourseFailed'));
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
      toast.error(t('admin.academics.lms.toastEnterLessonTitle'));
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
      toast.success(t('admin.academics.lms.toastLessonAdded', { lesson: lesson.title, course: course.name }));
      setLessonDialogOpen(false);
      setLessonForm(EMPTY_LESSON);
      await loadCourses();
    } catch (error) {
      console.error("Error adding lesson:", error);
      toast.error(t('admin.academics.lms.toastAddLessonFailed'));
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
      toast.error(t('admin.academics.lms.toastUpdateLessonsFailed'));
    }
  }

  function toggleLessonPublished(course: LmsCourse, lessonId: string) {
    const lessons = course.lessons.map(l => l.id === lessonId ? { ...l, published: !l.published } : l);
    const lesson = course.lessons.find(l => l.id === lessonId);
    persistLessons(course, lessons, lesson?.published
      ? t('admin.academics.lms.toastLessonMovedToDraft', { title: lesson.title })
      : t('admin.academics.lms.toastLessonPublished', { title: lesson?.title }));
  }

  function deleteLesson(course: LmsCourse, lessonId: string) {
    const lesson = course.lessons.find(l => l.id === lessonId);
    persistLessons(course, course.lessons.filter(l => l.id !== lessonId), t('admin.academics.lms.toastLessonRemoved', { title: lesson?.title }));
  }

  function publishAllLessons(course: LmsCourse) {
    const drafts = course.lessons.filter(l => !l.published).length;
    if (drafts === 0) {
      toast.info(t('admin.academics.lms.toastAllLessonsPublished'));
      return;
    }
    const message = drafts === 1
      ? t('admin.academics.lms.toastDraftsPublishedSingular', { count: drafts })
      : t('admin.academics.lms.toastDraftsPublishedPlural', { count: drafts });
    persistLessons(course, course.lessons.map(l => ({ ...l, published: true })), message);
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
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.lms.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.academics.lms.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={openCreateCourse} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4 me-2" /> {t('admin.academics.lms.newCourseButton')}
            </Button>
            <Button variant="outline" onClick={() => setMoodleOpen(true)}>
              {t('admin.academics.lms.importFromMoodleButton')}
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
            <TabsTrigger value="courses">{t('admin.academics.lms.tabMyCourses')}</TabsTrigger>
            <TabsTrigger value="builder">{t('admin.academics.lms.tabCourseBuilder')}</TabsTrigger>
            <TabsTrigger value="progress">{t('admin.academics.lms.tabStudentProgress')}</TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin me-2" /> {t('admin.academics.lms.loadingCourses')}
              </div>
            ) : courses.length === 0 ? (
              <Card className="border border-dashed border-gray-300">
                <CardContent className="py-16 flex flex-col items-center text-center">
                  <BookOpen className="h-10 w-10 text-gray-300 mb-3" />
                  <h3 className="font-semibold text-gray-900">{t('admin.academics.lms.noCoursesTitle')}</h3>
                  <p className="text-sm text-gray-500 mt-1 mb-4">{t('admin.academics.lms.noCoursesDescription')}</p>
                  <Button onClick={openCreateCourse} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="h-4 w-4 me-2" /> {t('admin.academics.lms.newCourseButton')}
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
                            <p className="text-xs text-gray-500">{t('admin.academics.lms.lessonsLabel')}</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-sm font-semibold text-gray-900">{enrolled}</p>
                            <p className="text-xs text-gray-500">{t('admin.academics.lms.studentsLabel')}</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-sm font-semibold text-gray-900">{published}</p>
                            <p className="text-xs text-gray-500">{t('admin.academics.lms.publishedLabel')}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{t('admin.academics.lms.lessonsPublishedLabel')}</span>
                            <span>{course.lessons.length ? `${publishedPct}%` : "—"}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className={cn("h-1.5 rounded-full", course.color)}
                              style={{ width: `${publishedPct}%` }}
                            />
                          </div>
                        </div>

                        <p className="text-xs text-gray-400">{t('admin.academics.lms.lastUpdatedLabel', { time: relativeTime(course.updatedAt || course.createdAt) })}</p>

                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => openEditCourse(course)}>
                            <Edit2 className="h-3 w-3 me-1" /> {t('admin.academics.lms.editCourseButton')}
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setTab("progress")}>
                            <Users className="h-3 w-3 me-1" /> {t('admin.academics.lms.viewStudentsButton')}
                          </Button>
                          <Button size="sm" className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => openAddLesson(course.id)}>
                            <Plus className="h-3 w-3 me-1" /> {t('admin.academics.lms.addLessonButton')}
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
                  <h3 className="font-semibold text-gray-900">{t('admin.academics.lms.noCourseToBuildTitle')}</h3>
                  <p className="text-sm text-gray-500 mt-1">{t('admin.academics.lms.noCourseToBuildDescription')}</p>
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
                        {builderCourse.description || t('admin.academics.lms.courseMetaSummary', { subject: builderCourse.subject, grade: builderCourse.grade, teacher: builderCourse.teacher })}
                      </p>
                    </div>
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => publishAllLessons(builderCourse)}>
                      {t('admin.academics.lms.publishCourseButton')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="w-full flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-gray-900 text-sm">{t('admin.academics.lms.lessonsLabel')}</span>
                        <Badge variant="secondary" className="text-xs">{t('admin.academics.lms.lessonsCountBadge', { count: builderCourse.lessons.length })}</Badge>
                      </div>
                    </div>
                    {builderCourse.lessons.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">
                        {t('admin.academics.lms.noLessonsYet')}
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
                            <button onClick={() => toggleLessonPublished(builderCourse, lesson.id)} title={t('admin.academics.lms.togglePublishTitle')}>
                              <Badge
                                variant={lesson.published ? "default" : "secondary"}
                                className={cn("text-xs cursor-pointer", lesson.published ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" : "hover:bg-gray-200")}
                              >
                                {lesson.published ? t('admin.academics.lms.publishedBadge') : t('admin.academics.lms.draftBadge')}
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
                        <Plus className="h-3 w-3 me-1" /> {t('admin.academics.lms.addLessonButton')}
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
                <CardTitle className="text-base font-semibold text-gray-900">{t('admin.academics.lms.studentProgressOverviewTitle')}</CardTitle>
                <p className="text-xs text-gray-400 font-normal">
                  {t('admin.academics.lms.studentProgressOverviewSubtitle')}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {progressRows.length === 0 ? (
                  <div className="py-14 flex flex-col items-center text-center text-gray-400">
                    <Users className="h-8 w-8 mb-2 text-gray-300" />
                    <p className="text-sm">
                      {courses.length === 0
                        ? t('admin.academics.lms.emptyProgressNoCourses')
                        : t('admin.academics.lms.emptyProgressNoStudents')}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs font-semibold text-gray-600">{t('admin.academics.lms.tableHeaderStudentName')}</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">{t('admin.academics.lms.tableHeaderGrade')}</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">{t('admin.academics.lms.tableHeaderCourse')}</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">{t('admin.academics.lms.tableHeaderLessons')}</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">{t('admin.academics.lms.tableHeaderQuizScore')}</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-center">{t('admin.academics.lms.tableHeaderCompletion')}</TableHead>
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
                              {t('admin.academics.lms.notStartedBadge')}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => toast.info(t('admin.academics.lms.toastReminderSent', { name: student.name }))}
                            >
                              {t('admin.academics.lms.sendReminderButton')}
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
            <DialogTitle>{editingCourseId ? t('admin.academics.lms.editCourseDialogTitle') : t('admin.academics.lms.createCourseDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-name">{t('admin.academics.lms.courseNameLabel')}</Label>
              <Input
                id="course-name"
                placeholder={t('admin.academics.lms.courseNamePlaceholder')}
                value={courseForm.name}
                onChange={(e) => setCourseForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.academics.lms.subjectLabel')}</Label>
              <Select value={courseForm.subject} onValueChange={(v) => setCourseForm(prev => ({ ...prev, subject: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.academics.lms.selectSubjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Math">{t('admin.academics.lms.subjectMath')}</SelectItem>
                  <SelectItem value="Science">{t('admin.academics.lms.subjectScience')}</SelectItem>
                  <SelectItem value="English">{t('admin.academics.lms.subjectEnglish')}</SelectItem>
                  <SelectItem value="Arabic">{t('admin.academics.lms.subjectArabic')}</SelectItem>
                  <SelectItem value="Islamic Studies">{t('admin.academics.lms.subjectIslamicStudies')}</SelectItem>
                  <SelectItem value="Social Studies">{t('admin.academics.lms.subjectSocialStudies')}</SelectItem>
                  <SelectItem value="ICT">{t('admin.academics.lms.subjectIct')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.academics.lms.gradeLabel')}</Label>
              <Select value={courseForm.grade} onValueChange={(v) => setCourseForm(prev => ({ ...prev, grade: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.academics.lms.selectGradePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={`Grade ${i + 1}`}>{t('admin.academics.lms.gradeOption', { number: i + 1 })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-teacher">{t('admin.academics.lms.teacherLabel')}</Label>
              <Input
                id="course-teacher"
                placeholder={t('admin.academics.lms.teacherPlaceholder')}
                value={courseForm.teacher}
                onChange={(e) => setCourseForm(prev => ({ ...prev, teacher: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-description">{t('admin.academics.lms.courseDescriptionLabel')}</Label>
              <Textarea
                id="course-description"
                placeholder={t('admin.academics.lms.courseDescriptionPlaceholder')}
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
                <Trash2 className="h-4 w-4 me-1" /> {t('admin.academics.lms.deleteButton')}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>{t('admin.academics.lms.cancelButton')}</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={saveCourse} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {editingCourseId ? t('admin.academics.lms.saveChangesButton') : t('admin.academics.lms.createCourseButton')}
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
              {lessonCourseId
                ? t('admin.academics.lms.addLessonDialogTitleWithCourse', { course: courses.find(c => c.id === lessonCourseId)?.name ?? "" })
                : t('admin.academics.lms.addLessonDialogTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title">{t('admin.academics.lms.lessonTitleLabel')}</Label>
              <Input
                id="lesson-title"
                placeholder={t('admin.academics.lms.lessonTitlePlaceholder')}
                value={lessonForm.title}
                onChange={(e) => setLessonForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.academics.lms.typeLabel')}</Label>
              <Select value={lessonForm.type} onValueChange={(v) => setLessonForm(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPES.map(lt => (
                    <SelectItem key={lt} value={lt}>{t(LESSON_TYPE_LABEL_KEYS[lt] || lt)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration">{t('admin.academics.lms.lessonDurationLabel')}</Label>
              <Input
                id="lesson-duration"
                placeholder={t('admin.academics.lms.lessonDurationPlaceholder')}
                value={lessonForm.duration}
                onChange={(e) => setLessonForm(prev => ({ ...prev, duration: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-description">{t('admin.academics.lms.lessonDescriptionLabel')}</Label>
              <Textarea
                id="lesson-description"
                placeholder={t('admin.academics.lms.lessonDescriptionPlaceholder')}
                value={lessonForm.description}
                onChange={(e) => setLessonForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>{t('admin.academics.lms.cancelButton')}</Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={saveLesson} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {t('admin.academics.lms.addLessonButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moodle Import Dialog */}
      <Dialog open={moodleOpen} onOpenChange={setMoodleOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('admin.academics.lms.importFromMoodleDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-500">{t('admin.academics.lms.moodleImportDescription')}</p>
            <div className="space-y-1.5">
              <Label htmlFor="moodle-url">{t('admin.academics.lms.moodleBackupUrlLabel')}</Label>
              <Input
                id="moodle-url"
                placeholder="https://moodle.example.com/backup.mbz"
                value={moodleUrl}
                onChange={(e) => setMoodleUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoodleOpen(false)}>{t('admin.academics.lms.cancelButton')}</Button>
            <Button onClick={() => {
              if (!moodleUrl.trim()) {
                toast.error(t('admin.academics.lms.toastEnterMoodleUrl'));
                return;
              }
              toast.success(t('admin.academics.lms.toastImportQueued'));
              setMoodleUrl('');
              setMoodleOpen(false);
            }}>
              {t('admin.academics.lms.importButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
