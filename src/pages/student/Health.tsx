import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Heart, Droplets, AlertCircle, Shield, Activity,
  Syringe, FileText, Clock, CheckCircle2, Phone, ShieldAlert,
  User, Check, ChevronRight
} from "lucide-react";
import { motion } from "framer-motion";

function InfoRow({ label, value, icon: Icon, highlight }: { label: string; value?: string | null; icon?: any; highlight?: string }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-50 dark:border-slate-800/20 last:border-none">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <span className={cn("text-xs font-black text-right max-w-[200px] truncate", highlight || "text-slate-800 dark:text-slate-200")}>
        {value || "Not recorded"}
      </span>
    </div>
  );
}

export default function StudentHealth() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [healthRecord, setHealthRecord] = useState<any>(null);
  const [nurseVisits, setNurseVisits] = useState<any[]>([]);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  useEffect(() => {
    const s = student as any;
    if (!s) return;
    smartDb.getOne("HealthRecord", s.id).catch(() => null).then(rec => {
      setHealthRecord(rec || null);
    });
    smartDb.getAll("NurseVisit", undefined).then((rows: any[]) => {
      setNurseVisits((rows || []).filter(r => r.studentId === s.id)
        .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    }).catch(() => {});
  }, [student]);

  const s = student as any;
  const rec = healthRecord;

  const bloodGroup = rec?.bloodGroup || s?.bloodGroup;
  const allergies = rec?.allergies || s?.allergies;
  const conditions = rec?.chronicConditions || rec?.conditions;
  const medications = rec?.medications || rec?.currentMedications;
  const emergencyContact = rec?.emergencyContact || s?.emergencyContact;
  const emergencyPhone = rec?.emergencyPhone || s?.emergencyPhone;
  const doctorName = rec?.doctorName;
  const doctorPhone = rec?.doctorPhone;

  const vaccinations: any[] = rec?.vaccinations || [];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors">
        <div className="space-y-6 max-w-4xl mx-auto">
          
          {/* Header */}
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="h-5.5 w-5.5 text-rose-500 fill-rose-500/20" /> Medical & Health Records
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Official clinic files, vaccination logs, and emergency contact registry.</p>
          </div>

          {/* Top Info Banner */}
          {s && (
            <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm transition-colors">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500 text-xl font-black shrink-0 shadow-inner">
                  {s.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-none">{s.name}</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 font-semibold">Grade {s.grade} · Section {s.section}</p>
                </div>
              </div>

              {bloodGroup && (
                <div className="flex items-center gap-2 bg-rose-500 text-white px-5 py-3 rounded-2xl shrink-0 shadow-md shadow-rose-500/10">
                  <Droplets className="h-5 w-5 fill-white" />
                  <div className="text-left">
                    <span className="text-[9px] font-black uppercase tracking-wider block opacity-75 leading-none">Blood Type</span>
                    <span className="text-sm font-black mt-1.5 block leading-none">{bloodGroup}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Medical Alerts (if critical allergies or chronic conditions exist) */}
          {(allergies || conditions) && (
            <div className="bg-amber-50/50 border border-amber-100/50 dark:bg-amber-950/10 dark:border-amber-900/20 rounded-[24px] p-5 flex items-start gap-4 transition-colors">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-amber-800 dark:text-amber-400 text-sm leading-tight">Critical Medical Advisory</h4>
                {allergies && <p className="text-xs text-amber-700 dark:text-amber-300">Allergies: <span className="font-extrabold">{allergies}</span></p>}
                {conditions && <p className="text-xs text-amber-700 dark:text-amber-300">Chronic Conditions: <span className="font-extrabold">{conditions}</span></p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Medical Info Card */}
            <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-50 dark:border-slate-800/20">
                <Activity className="h-4.5 w-4.5 text-purple-600" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Vital Information</h3>
              </div>
              
              <div className="divide-y divide-slate-50 dark:divide-slate-800/20">
                <InfoRow label="Blood Group" value={bloodGroup} icon={Droplets} highlight="text-rose-600 dark:text-rose-400 font-black text-sm" />
                <InfoRow label="Known Allergies" value={allergies} icon={ShieldAlert} highlight={allergies ? "text-amber-600 dark:text-amber-400 font-bold" : undefined} />
                <InfoRow label="Chronic Diseases" value={conditions} icon={Heart} />
                <InfoRow label="Current Prescription" value={medications} icon={FileText} />
              </div>
            </div>

            {/* Emergency Contacts Card */}
            <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-50 dark:border-slate-800/20">
                <Phone className="h-4.5 w-4.5 text-purple-600" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Emergency contacts</h3>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-slate-800/20">
                <InfoRow label="Emergency Contact" value={emergencyContact} icon={User} />
                <InfoRow label="Emergency Phone" value={emergencyPhone} icon={Phone} />
                <InfoRow label="Primary Doctor" value={doctorName} icon={Shield} />
                <InfoRow label="Doctor Phone" value={doctorPhone} icon={Phone} />
              </div>
            </div>
          </div>

          {/* Vaccination records */}
          {vaccinations.length > 0 && (
            <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-50 dark:border-slate-800/20">
                <Syringe className="h-4.5 w-4.5 text-purple-600" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Immunization Log</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {vaccinations.map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600 shrink-0">
                        <Check className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs leading-none">{v.name || v.vaccine}</h4>
                        {v.date && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-semibold">
                            {new Date(v.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                    {v.dose && <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 border-none font-bold text-[9px]">Dose {v.dose}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nurse visits logs */}
          <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] overflow-hidden transition-colors shadow-sm">
            <div className="px-6 py-5 border-b border-slate-50 dark:border-slate-800/20 flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-purple-600" />
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Nurse Room Visit History</h3>
            </div>

            {nurseVisits.length === 0 ? (
              <div className="py-14 text-center text-xs text-slate-400 bg-transparent">No visits logged. Student health is optimal!</div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/20">
                {nurseVisits.map((v, idx) => (
                  <div key={idx} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm leading-tight">
                        {v.reason || v.complaint || "Routine Evaluation"}
                      </h4>
                      {v.treatment && <p className="text-xs text-slate-400 dark:text-slate-500">Treatment: {v.treatment}</p>}
                      {v.notes && <p className="text-[11px] text-slate-400 dark:text-slate-500 italic mt-1">Notes: {v.notes}</p>}
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                        {v.date && new Date(v.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {v.status && (
                        <Badge 
                          className={cn(
                            "text-[9px] font-extrabold border-none px-2 py-0.5 rounded-full uppercase tracking-wider mt-1.5",
                            v.status === "Recovered" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20" : "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                          )}
                        >
                          {v.status}
                        </Badge>
                      )}
                    </div>
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
