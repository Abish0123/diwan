import { Search, Bell, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function StudentHeader() {
  const { user } = useAuth();

  return (
    <header className="h-16 flex items-center justify-between bg-white px-6 border-b border-slate-200 sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="text-slate-500 hover:text-[#9810fa]" />
        <div className="relative w-96 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search courses, assignments, etc..." 
            className="pl-10 bg-slate-50 border-none rounded-xl focus-visible:ring-1 focus-visible:ring-[#9810fa] h-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white" />
        </button>
        
        <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900 leading-none">{user?.displayName || "Student Name"}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">ID: STU-2024-001</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#9810fa] flex items-center justify-center text-white font-bold shadow-sm shadow-purple-100">
            {user?.displayName?.charAt(0) || "S"}
          </div>
        </div>
      </div>
    </header>
  );
}
