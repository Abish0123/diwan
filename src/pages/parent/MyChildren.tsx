import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useStudentTeachers } from "@/hooks/useStudentTeachers";
import { smartDb } from "@/lib/localDb";
import { getSchoolName } from "@/lib/transportSettings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Users, Heart, Shield, UserCircle, MapPin, Users2 } from "lucide-react";

const AVATAR_COLORS = ["bg-violet-500","bg-emerald-500","bg-amber-500","bg-blue-500","bg-rose-500"];

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right max-w-[55%]">{value || "Not recorded"}</span>
    </div>
  );
}

export default function MyChildren() {
  const { children, selected, selectChild, loading } = useParentChildren();
  const { classTeacher, gradeCoordinator } = useStudentTeachers(selected);
  const [studentRecord, setStudentRecord] = useState<any>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);

  useEffect(() => {
    if (!selected) { setStudentRecord(null); return; }
    smartDb.getOne("Student", selected.id).then(setStudentRecord).catch(() => setStudentRecord(null));

    // TeacherAttendance.grade is stored WITH the "Grade " prefix (e.g.
    // "Grade 3"), but the real Student.grade is stored bare (e.g. "3") — a
    // plain === never matched real records.
    const canonGrade = (v: any) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
    const canonSection = (v: any) => String(v ?? "").trim().toUpperCase();
    smartDb.getAll("TeacherAttendance").then((rows: any[]) => {
      const now = new Date();
      const yr = now.getFullYear(), mo = now.getMonth() + 1;
      const relevant = (rows || []).filter((r: any) =>
        canonGrade(r.grade) === canonGrade(selected.grade) && canonSection(r.section) === canonSection(selected.section) && r.marks?.[selected.id] !== undefined
      );
      let present = 0, total = 0;
      relevant.forEach((r: any) => {
        const d = new Date(r.date || r.createdAt || "");
        if (isNaN(d.getTime()) || d.getFullYear() !== yr || d.getMonth() + 1 !== mo) return;
        const mark = r.marks?.[selected.id];
        if (mark === "P" || mark === "A" || mark === "L") { total++; if (mark === "P") present++; }
      });
      setAttendancePct(total > 0 ? Math.round((present / total) * 100) : null);
    }).catch(() => {});
  }, [selected]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
      </DashboardLayout>
    );
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const s = studentRecord || {};
  const parentName = s.fatherName || s.motherName || s.guardianName || "Not recorded";
  const parentPhone = s.fatherPhone || s.motherPhone || s.guardianPhone || "Not recorded";
  const parentEmail = s.fatherEmail || s.motherEmail || s.guardianEmail || "Not recorded";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Children</h1>
            <p className="text-sm text-slate-400">View and manage your children's profiles</p>
          </div>
        </div>

        {/* Child tabs */}
        {children.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {children.map((c, i) => {
              const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <button key={c.id} onClick={() => selectChild(c.id)}
                  className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition",
                    c.id === selected.id
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white border-slate-200 text-slate-700 hover:border-violet-300")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold", c.id === selected.id ? "bg-white/30" : col)}>
                    {c.name.charAt(0)}
                  </div>
                  {c.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        )}

        {/* Profile header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-600 rounded-2xl p-6 text-white flex items-center gap-5 flex-wrap">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0",
            AVATAR_COLORS[children.findIndex(c=>c.id===selected.id) % AVATAR_COLORS.length].replace("bg-","bg-").replace("500","400"))}>
            {selected.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black">{selected.name}</h2>
            <p className="text-white/70">{selected.grade} · Section {selected.section} · Roll {selected.rollNo}</p>
            <p className="text-white/50 text-xs mt-0.5">Admission: {selected.admissionNo}</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-black">{attendancePct !== null ? `${attendancePct}%` : "—"}</p>
              <p className="text-white/60 text-xs">Attendance</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><UserCircle className="w-4 h-4 text-violet-500" /> Student Information</h3>
            <Field label="Full Name"          value={selected.name} />
            <Field label="Grade & Section"    value={`${selected.grade} · Section ${selected.section}`} />
            <Field label="Roll Number"        value={selected.rollNo} />
            <Field label="Admission Number"   value={selected.admissionNo} />
            <Field label="Gender"             value={selected.gender} />
            <Field label="Date of Birth"      value={selected.dob} />
            <Field label="Nationality"        value={selected.nationality} />
            <Field label="Blood Group"        value={selected.bloodGroup} />
            <Field label="House"              value={selected.house} />
            <Field label="Class Teacher"      value={classTeacher} />
            <Field label="Grade Coordinator"  value={gradeCoordinator} />
          </div>

          {/* Parent & Emergency */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /> Parent Information</h3>
              <Field label="Parent Name"  value={parentName} />
              <Field label="Phone"        value={parentPhone} />
              <Field label="Email"        value={parentEmail} />
              <Field label="Address"      value={s.address} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-rose-500" /> Emergency Contact</h3>
              <Field label="Name"  value={s.emergencyContactName} />
              <Field label="Phone" value={s.emergencyContactPhone} />
              <button onClick={() => toast.info("Contact the school office to update emergency contact details.")}
                className="mt-2 w-full py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                Update Emergency Contact
              </button>
            </div>
          </div>

          {/* Medical */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> Medical Information</h3>
              <Field label="Blood Group"    value={selected.bloodGroup} />
              <p className="text-[11px] text-slate-400 mt-2">
                Full medical records, allergies and vaccination history are available on the{" "}
                <a href="/parent/health" className="text-purple-600 font-semibold hover:underline">Health Records</a> page.
              </p>
            </div>
            <div>
              <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-500" /> School</h3>
              <Field label="School Name" value={getSchoolName()} />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
