import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BookOpen, Plus, Play, FileText, Video, HelpCircle, Users, Clock,
  ChevronRight, Search, Upload, Eye, Edit3, Trash2, BarChart3, X,
  CheckCircle, MoreVertical,
} from "lucide-react";

interface Course {
  id: string; title: string; subject: string; description: string;
  lessons: number; videos: number; quizzes: number; students: number;
  progress: number; status: "Published" | "Draft"; createdAt: string;
}


type Tab = "courses" | "lessons" | "analytics";

function statusBadge(s: string) {
  return s === "Published"
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-slate-100 text-slate-600 border border-slate-200";
}

export default function TeacherLMS() {
  const { assignment } = useTeacherClass();
  const grade   = assignment.grade   || "Grade 5";
  const section = (assignment.section || "B").toUpperCase();

  const [tab, setTab]               = useState<Tab>("courses");
  const [q, setQ]                   = useState("");
  const [courses, setCourses]       = useState<Course[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({ title:"", subject:"Mathematics", description:"" });
  const [saving, setSaving]         = useState(false);

  const filtered = courses.filter(c =>
    !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.subject.toLowerCase().includes(q.toLowerCase())
  );

  const published = courses.filter(c => c.status === "Published").length;
  const totalLessons = courses.reduce((a, c) => a + c.lessons, 0);
  const totalVideos  = courses.reduce((a, c) => a + c.videos, 0);
  const totalQuizzes = courses.reduce((a, c) => a + c.quizzes, 0);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Course title is required."); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    const nc: Course = {
      id: `c${Date.now()}`, title: form.title, subject: form.subject,
      description: form.description, lessons:0, videos:0, quizzes:0,
      students:28, progress:0, status:"Draft", createdAt: new Date().toISOString().slice(0,10),
    };
    setCourses(prev => [nc, ...prev]);
    setShowCreate(false);
    setForm({ title:"", subject:"Mathematics", description:"" });
    setSaving(false);
    toast.success("Course created as Draft.");
  };

  const handleDelete = (id: string) => {
    setCourses(prev => prev.filter(c => c.id !== id));
    toast.success("Course deleted.");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">LMS / Courses</h1>
              <p className="text-sm text-slate-400">{grade} · Section {section} — Learning Management</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
            <Plus className="w-4 h-4" /> New Course
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:"Published Courses", value: published,     icon: BookOpen,  color:"text-purple-600 bg-violet-50" },
            { label:"Total Lessons",     value: totalLessons,  icon: FileText,  color:"text-purple-600 bg-blue-50" },
            { label:"Video Lessons",     value: totalVideos,   icon: Video,     color:"text-emerald-600 bg-emerald-50" },
            { label:"Quizzes",           value: totalQuizzes,  icon: HelpCircle,color:"text-amber-600 bg-amber-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(["courses","lessons","analytics"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition",
                tab === t ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {t}
            </button>
          ))}
        </div>

        {tab === "courses" && (
          <>
            {/* Search */}
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>

            {/* Course cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.length === 0 && (
                <div className="col-span-3 py-12 text-center text-slate-400">No courses found.</div>
              )}
              {filtered.map(c => (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm leading-tight">{c.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.subject}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0", statusBadge(c.status))}>{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Avg. completion</span><span>{c.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-violet-500" style={{ width:`${c.progress}%` }} />
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{c.lessons} lessons</span>
                    <span className="flex items-center gap-1"><Video className="w-3 h-3" />{c.videos} videos</span>
                    <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" />{c.quizzes} quizzes</span>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                    <button onClick={() => toast.info(`Opening "${c.title}"…`)}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-violet-50 text-violet-700 font-semibold hover:bg-violet-100 transition flex items-center justify-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => toast.info("Opening course editor…")}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-slate-50 text-slate-600 font-semibold hover:bg-slate-100 transition flex items-center justify-center gap-1">
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "lessons" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-700">Lesson Builder</p>
            <p className="text-sm text-slate-400 mt-1 mb-4">Select a course to manage lessons, upload PDFs, videos, and recorded sessions.</p>
            <button onClick={() => toast.info("Select a course first to manage its lessons.")}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
              Select Course
            </button>
          </div>
        )}

        {tab === "analytics" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-700">Student Progress Analytics</p>
            <p className="text-sm text-slate-400 mt-1">Track completion rates and quiz scores per student.</p>
            <div className="mt-4 grid grid-cols-3 gap-4 text-left max-w-sm mx-auto">
              {courses.filter(c => c.status === "Published").length === 0 ? (
                <p className="text-sm text-slate-400 col-span-3 text-center py-2">No published courses yet</p>
              ) : courses.filter(c => c.status === "Published").map(c => (
                <div key={c.id} className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-lg font-black text-purple-600">{c.progress}%</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{c.title.slice(0,20)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-900">New Course</h2>
                <button onClick={() => setShowCreate(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Course Title *</label>
                  <input value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))}
                    placeholder="e.g. Mathematics Grade 5 – Term 2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Subject</label>
                  <select value={form.subject} onChange={e => setForm(f => ({...f, subject:e.target.value}))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    {["Mathematics","English","Science","Arabic","Islamic Studies","Social Studies","Computer"].map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))}
                    rows={3} placeholder="Brief course overview…"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                  {saving ? "Creating…" : "Create Course"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
