import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { Heart, Shield, AlertTriangle, Phone, Syringe, Users2, CheckCircle2, XCircle } from "lucide-react";

export default function ParentHealth() {
  const { selected, loading } = useParentChildren();
  const [healthRecord, setHealthRecord] = useState<any>(null);
  const [nurseVisits, setNurseVisits] = useState<any[]>([]);
  // Full Student row — the ParentChild shape useParentChildren returns is
  // deliberately narrow; emergencyContactName/emergencyContactPhone/
  // medicalConditions only exist on the real Student record, same reason
  // MyChildren.tsx fetches it separately instead of reading `selected`.
  const [studentRecord, setStudentRecord] = useState<any>(null);

  // Fetch real HealthRecord + NurseVisit rows — same tables the school nurse writes to
  useEffect(() => {
    setHealthRecord(null);
    setNurseVisits([]);
    setStudentRecord(null);
    if (!selected?.id) return;

    // Real HealthRecord rows are keyed by an internal id (`HLT-{timestamp}`,
    // see students/Health.tsx's handleAddEntry) — NOT by the student's own
    // id — so a getOne(..., selected.id) lookup could never find a real
    // record, even a fully populated one. Must scan by the row's studentId
    // field instead, same as NurseVisit below.
    smartDb.getAll("HealthRecord").then((rows: any[]) => {
      const mine = (rows || []).filter((r: any) => r.studentId === selected.id);
      mine.sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      setHealthRecord(mine[0] || null);
    }).catch(() => setHealthRecord(null));

    smartDb.getOne("Student", selected.id).then(setStudentRecord).catch(() => setStudentRecord(null));

    smartDb.getAll("NurseVisit").then((rows: any[]) => {
      setNurseVisits(
        (rows || []).filter((r: any) => r.studentId === selected.id)
          .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      );
    }).catch(() => {});
  }, [selected?.id]);

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
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

  const rec = healthRecord;
  const bloodGroup = rec?.bloodGroup || selected.bloodGroup || "Not recorded";
  const allergies  = rec?.allergies || "Not recorded";
  // Real field is HealthRecord.condition (a single nurse-entered string) —
  // falls back to the Student record's own admission-time medicalConditions
  // when the nurse hasn't logged anything yet, same field MyChildren.tsx and
  // StudentDetailsDialog.tsx already use.
  const conditions = (rec?.condition && rec.condition !== "None") ? rec.condition : (studentRecord?.medicalConditions || "Not recorded");
  // Real Student fields — HealthRecord has no emergency-contact field at all.
  const emergencyContact = studentRecord?.emergencyContactName || "Not recorded";
  const emergencyPhone   = studentRecord?.emergencyContactPhone || studentRecord?.guardianPhone || studentRecord?.phone || "Not recorded";

  const hasAllergy = allergies && allergies !== "Not recorded" && allergies.toLowerCase() !== "none" && allergies.toLowerCase() !== "none known";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Heart className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Health Records</h1>
              <p className="text-sm text-slate-400">{selected.name} — Medical history &amp; nurse visits</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        {hasAllergy && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Allergy alert: {allergies}
          </div>
        )}

        {!rec && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            No health record on file yet for {selected.name}. Showing available information only.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Medical summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> Medical Summary</h3>
            {[
              ["Blood Group",        bloodGroup],
              ["Allergies",          allergies],
              ["Chronic Conditions", conditions],
            ].map(([l,v]) => (
              <div key={l} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-400 font-medium">{l}</span>
                <span className="text-xs font-semibold text-slate-800 text-right max-w-[55%]">{v}</span>
              </div>
            ))}
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-rose-50">
              <Phone className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-rose-400">Emergency Contact</p>
                <p className="text-xs font-bold text-rose-700">{emergencyContact}</p>
                <p className="text-xs text-rose-500">{emergencyPhone}</p>
              </div>
            </div>
          </div>

          {/* Vaccination status — real HealthRecord.isVaccinated boolean +
              lastCheckup date, not a per-vaccine list (no writer anywhere in
              the app ever populates a vaccinations array). */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Syringe className="w-4 h-4 text-blue-500" /> Vaccination Status</h3>
            {!rec ? (
              <p className="text-sm text-slate-400 py-4 text-center">No record on file.</p>
            ) : (
              <div className={cn("flex items-center gap-3 p-4 rounded-xl", rec.isVaccinated ? "bg-emerald-50" : "bg-amber-50")}>
                {rec.isVaccinated ? <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />}
                <div>
                  <p className={cn("text-sm font-bold", rec.isVaccinated ? "text-emerald-700" : "text-amber-700")}>
                    {rec.isVaccinated ? "Up to date" : "Not marked vaccinated"}
                  </p>
                  {rec.lastCheckup && <p className="text-xs text-slate-500 mt-0.5">Last checkup: {rec.lastCheckup}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Nurse visits */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-black text-slate-900 mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500" /> Nurse Visits</h3>
            {nurseVisits.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No nurse visits recorded.</p>
            ) : (
              <div className="space-y-3">
                {nurseVisits.map((v, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-slate-900">{v.reason || v.complaint || "Routine Evaluation"}</p>
                      <p className="text-[10px] text-slate-400">{v.date}</p>
                    </div>
                    {v.treatment && <p className="text-[11px] text-slate-600">Treatment: {v.treatment}</p>}
                    {v.notes && <p className="text-[10px] text-slate-500 italic mt-1">Notes: {v.notes}</p>}
                    {v.status && <p className="text-[10px] text-blue-500 mt-1">Status: {v.status}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
