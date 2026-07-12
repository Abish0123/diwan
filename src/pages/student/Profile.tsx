import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useStudentTeachers } from "@/hooks/useStudentTeachers";
import { userRepository } from "@/repositories/UserRepository";
import {
  UserCircle, GraduationCap, Hash, Phone, Mail, MapPin,
  AlertCircle, Home, User, Shield, Camera, Award, Calendar, Bookmark
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const AVATAR_OPTIONS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Zoya",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Sara",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Kabir",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya",
];

function InfoField({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: typeof UserCircle }) {
  return (
    <div className="flex items-start gap-4 p-4 bg-slate-50/50 dark:bg-slate-800/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/20">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#1A1A30] border border-slate-100 dark:border-slate-800 flex items-center justify-center text-slate-400 shrink-0">
          <Icon className="h-4.5 w-4.5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">{label}</p>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1.5 truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function StudentProfile() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [activeTab, setActiveTab] = useState<"academic" | "personal" | "family">("academic");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find(
      s => (user?.email && (s as any).email === user.email) ||
           (user?.displayName && (s as any).name === user.displayName)
    ) || students[0];
  }, [students, user]);

  const s = student as any;
  const { classTeacher, gradeCoordinator } = useStudentTeachers(s);

  // Real avatar, persisted on the user's own `users` row (photoURL is in
  // server.ts's USER_SELF_WRITABLE_FIELDS allowlist) — previously this only
  // ever wrote to localStorage, so the "saved" avatar never left this
  // browser and was invisible anywhere else the photo might be shown.
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  useEffect(() => {
    if (!user?.uid) return;
    userRepository.getOne(user.uid).then(row => {
      if (row?.photoURL) setAvatar(row.photoURL);
    }).catch(() => {});
  }, [user?.uid]);

  const handleAvatarChange = async (url: string) => {
    setAvatar(url);
    setShowAvatarPicker(false);
    if (!user?.uid) return;
    try {
      await userRepository.update(user.uid, { photoURL: url } as any);
      toast.success("Profile avatar updated successfully!");
    } catch {
      toast.error("Failed to save avatar");
    }
  };

  if (!students || students.length === 0 || !student) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 flex items-center justify-center transition-colors">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-[#9810fa] animate-spin" />
            <p className="text-sm font-semibold">Loading profile…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header Cover Card */}
          <div className="bg-white dark:bg-[#16162A] rounded-[24px] border border-slate-100 dark:border-slate-800/40 overflow-hidden shadow-sm transition-colors">
            {/* Top gradient cover */}
            <div className="h-32 bg-gradient-to-r from-[#9810fa] via-[#a322a3] to-[#d12386] relative" />
            
            <div className="px-8 pb-6 relative flex flex-col md:flex-row items-center md:items-end gap-6 -mt-10">
              {/* Profile image with custom editor trigger */}
              <div className="relative group">
                <div className="w-24 h-24 rounded-[20px] bg-white dark:bg-[#16162A] p-1 border-4 border-white dark:border-[#16162A] shadow-md overflow-hidden flex items-center justify-center">
                  <img src={avatar} alt="Student Avatar" className="w-full h-full object-cover rounded-[16px]" />
                </div>
                <button 
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="absolute bottom-1 right-1 bg-[#9810fa] text-white p-1.5 rounded-lg border-2 border-white dark:border-[#16162A] hover:bg-[#d12386] transition-colors shadow-md outline-none"
                  title="Change avatar"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 text-center md:text-left pt-2 md:pt-0">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  {s?.name || user?.displayName || "Student"}
                </h2>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                  {s?.grade && (
                    <Badge className="bg-violet-50 text-violet-700 dark:bg-violet-950/20 dark:text-violet-400 border-none text-[10px] font-bold py-1">
                      Grade {s.grade}
                      {s.section ? ` · Section ${s.section}` : ""}
                    </Badge>
                  )}
                  {s?.rollNumber && (
                    <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border-none text-[10px] font-bold py-1">
                      Roll #{s.rollNumber}
                    </Badge>
                  )}
                  {s?.status && (
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-none text-[10px] font-bold py-1">
                      {s.status}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar Select Dialog Box */}
            <AnimatePresence>
              {showAvatarPicker && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-8 pb-6 border-t border-slate-50 dark:border-slate-800/20 pt-4 bg-slate-55/10 dark:bg-slate-800/5"
                >
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">Choose a profile character avatar:</p>
                  <div className="flex flex-wrap gap-4">
                    {AVATAR_OPTIONS.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAvatarChange(opt)}
                        className={cn(
                          "w-12 h-12 rounded-xl bg-white border-2 hover:scale-105 transition-all p-0.5",
                          avatar === opt ? "border-[#9810fa] bg-violet-50" : "border-slate-200"
                        )}
                      >
                        <img src={opt} className="w-full h-full object-contain rounded-lg" alt="Avatar option" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1.5 bg-white dark:bg-[#16162A] rounded-2xl p-1.5 border border-slate-100 dark:border-slate-800/40 w-fit transition-colors shadow-sm">
            {[
              { id: "academic", label: "Academic Info", icon: GraduationCap },
              { id: "personal", label: "Personal Info", icon: User },
              { id: "family", label: "Emergency & Contacts", icon: Phone }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all outline-none",
                  activeTab === tab.id 
                    ? "bg-[#9810fa] text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Contents */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {activeTab === "academic" && (
              <>
                <InfoField label="Grade/Class" value={s?.grade ? `Grade ${s.grade}` : null} icon={GraduationCap} />
                <InfoField label="Section / Class Group" value={s?.section ? `Section ${s.section}` : null} icon={Hash} />
                <InfoField label="Class Roll Number" value={s?.rollNumber} icon={Bookmark} />
                <InfoField label="Assigned House" value={s?.house} icon={Shield} />
                <InfoField label="Class Teacher" value={classTeacher} icon={User} />
                <InfoField label="Grade Coordinator" value={gradeCoordinator} icon={Award} />
                <InfoField label="Enrollment Admission No." value={s?.admissionNumber || s?.id} icon={Hash} />
                <InfoField label="Academic Year" value={s?.academicYear || "2026-27"} icon={Calendar} />
              </>
            )}

            {activeTab === "personal" && (
              <>
                <InfoField label="Student Full Name" value={s?.name} icon={User} />
                <InfoField label="Date of Birth" value={s?.dateOfBirth || s?.dob} icon={Calendar} />
                <InfoField label="Gender Identity" value={s?.gender} icon={UserCircle} />
                <InfoField label="Blood Group Grouping" value={s?.bloodGroup} icon={AlertCircle} />
                <InfoField label="Nationality" value={s?.nationality} icon={MapPin} />
                <InfoField label="Official Religion" value={s?.religion} icon={Shield} />
              </>
            )}

            {activeTab === "family" && (
              <>
                <InfoField label="Primary Contact Email" value={s?.email || user?.email} icon={Mail} />
                <InfoField label="Contact Phone Line" value={s?.phone || s?.contactNumber} icon={Phone} />
                <InfoField label="Home Address Line" value={s?.address} icon={Home} />
                <InfoField label="Residential City" value={s?.city} icon={MapPin} />
                <InfoField label="Parent/Guardian Name" value={s?.fatherName || s?.parentName} icon={User} />
                <InfoField label="Parent Primary Phone" value={s?.parentPhone || s?.parentContact} icon={Phone} />
              </>
            )}
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
