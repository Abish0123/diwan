import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useActiveSubjectAssignment } from "@/hooks/useActiveSubject";
import { SubjectContextBar } from "@/components/teacher/SubjectContextBar";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection } from "@/lib/studentGradeSection";
import { toast } from "sonner";
import {
  BookMarked, Plus, Calendar, CheckCircle2, Clock, Paperclip, X, Trash2,
} from "lucide-react";

interface HW {
  id: string; title: string; subject: string; description: string;
  dueDate: string; grade: string; section: string; createdAt: string;
  attachment?: string;
}

const SUBJECTS = ["Mathematics", "English", "Science", "Arabic", "Islamic Studies", "Social Studies", "Computer", "Art"];

export default function Homework() {
  const { user } = useAuth();
  const { assignment, classStudents } = useTeacherClass();
  const { assignments: mySubjects } = useMySubjects();
  const [activeSubject, setActiveSubject] = useActiveSubjectAssignment(mySubjects);
  const [items, setItems] = useState<HW[]>([]);
  const [open, setOpen] = useState(false);

  const effGrade   = activeSubject?.grade   || assignment.grade;
  const effSection = activeSubject?.section || assignment.section;
  const effSubject = activeSubject?.subject || "Mathematics";
  const effClass   = activeSubject
    ? `${activeSubject.grade} · Sec ${activeSubject.section} · ${activeSubject.subject}`
    : assignment.className;

  const [form, setForm] = useState({ title: "", subject: "Mathematics", description: "", dueDate: "", attachment: "" });

  // Sync subject dropdown to active subject when it changes
  useEffect(() => {
    if (activeSubject) setForm(f => ({ ...f, subject: activeSubject.subject }));
  }, [activeSubject?.subject]);

  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("Homework", user.uid, (data: any[]) => {
      setItems((data || []).filter(h => canonGrade(h.grade) === canonGrade(effGrade) && canonSection(h.section) === canonSection(effSection))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
    });
    return () => unsub();
  }, [user, effGrade, effSection]);

  const submit = async () => {
    if (!form.title || !form.dueDate) { toast.error("Title and due date are required"); return; }
    const hw: HW = {
      id: `HW-${Date.now()}`, ...form, grade: effGrade, section: effSection,
      createdAt: new Date().toISOString(),
    };
    try {
      await smartDb.create("Homework", { ...hw, uid: user!.uid }, hw.id);
      toast.success("Homework assigned to " + assignment.className);
      setOpen(false);
      setForm({ title: "", subject: "Mathematics", description: "", dueDate: "", attachment: "" });
    } catch { toast.error("Failed to save"); }
  };

  const remove = async (id: string) => {
    try { await smartDb.delete("Homework", id); toast.success("Homework removed"); } catch { toast.error("Failed"); }
  };

  const isOverdue = (d: string) => new Date(d) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2"><BookMarked className="w-6 h-6 text-purple-600" /> Homework</h1>
            <p className="text-slate-500 text-sm mt-1">Daily homework for {effClass} · {classStudents.length} students</p>
          </div>
          <div className="flex items-center gap-3">
            <SubjectContextBar assignments={mySubjects} selected={activeSubject} onChange={setActiveSubject} />
            <button onClick={() => setOpen(true)} className="h-11 px-5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-violet-200 transition-colors">
              <Plus className="w-4 h-4" /> Assign Homework
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <BookMarked className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No homework assigned yet</p>
              <p className="text-slate-400 text-sm">Click "Assign Homework" to create your first task</p>
            </div>
          )}
          {items.map(h => (
            <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <span className="inline-flex px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold">{h.subject}</span>
                <button onClick={() => remove(h.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
              <h3 className="font-bold text-slate-900">{h.title}</h3>
              {h.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{h.description}</p>}
              {h.attachment && <p className="text-xs text-purple-600 mt-2 flex items-center gap-1"><Paperclip className="w-3 h-3" /> {h.attachment}</p>}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className={`text-xs font-semibold flex items-center gap-1 ${isOverdue(h.dueDate) ? "text-rose-600" : "text-slate-500"}`}>
                  <Calendar className="w-3 h-3" /> Due {h.dueDate}
                </span>
                {isOverdue(h.dueDate)
                  ? <span className="text-xs font-bold text-rose-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Overdue</span>
                  : <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Assign Homework</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Algebra Worksheet Ch.4"
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Subject</label>
                  <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-violet-500 outline-none bg-white">
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Due Date *</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-violet-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Instructions</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the homework…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Attachment (name)</label>
                <input value={form.attachment} onChange={e => setForm({ ...form, attachment: e.target.value })} placeholder="e.g. worksheet.pdf"
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-violet-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={submit} className="flex-1 h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold">Assign</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
