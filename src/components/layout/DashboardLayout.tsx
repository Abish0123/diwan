import { SidebarInset } from "@/components/ui/sidebar";
import { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
  header?: ReactNode;
}

export const DashboardLayout = ({ children, header }: DashboardLayoutProps) => {
  return (
    <SidebarInset className="min-w-0 flex flex-col flex-1 min-h-0 transition-all duration-200 bg-[#F9FAFB] dark:bg-[#0E0E16]">
      {/* custom header override (e.g. teacher portal) */}
      {header && header}
      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="p-6 space-y-6 w-full">
          {children}
        </div>
      </div>
    </SidebarInset>
  );
};

export default DashboardLayout;
