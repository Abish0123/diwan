import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { BookOpen, Users2 } from "lucide-react";

export default function ParentLMS() {
  const { selected, loading } = useParentChildren();

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

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">LMS / Online Courses</h1>
              <p className="text-sm text-slate-400">{selected.name} — Learning progress across all courses</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-700">No LMS course progress available yet</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            LMS course progress isn't available for {selected.name} yet. This will appear once your child is
            enrolled in an online course.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
