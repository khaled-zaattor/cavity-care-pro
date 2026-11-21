import { ReactNode } from "react";
import { Users, Calendar, FileText, Stethoscope } from "lucide-react";
import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const isMobile = useIsMobile();

  const navItems = [
    { path: "/", label: "لوحة التحكم", icon: Stethoscope },
    { path: "/patients", label: "المرضى", icon: Users },
    { path: "/appointments", label: "المواعيد", icon: Calendar },
    { path: "/treatments", label: "العلاجات", icon: FileText },
    { path: "/activity-logs", label: "سجل النشاطات", icon: FileText },
    { path: "/doctors", label: "الأطباء", icon: Users },
    { path: "/specialties", label: "التخصصات", icon: FileText },
    { path: "/reports", label: "التقارير المالية", icon: FileText },
    { path: "/waiting-list-management", label: "إدارة لائحة الانتظار", icon: Users },
    { path: "/admin", label: "إدارة النظام", icon: FileText },
    { path: "/my-finances", label: "حساباتي", icon: FileText },
  ];

  const currentPage = navItems.find(item => item.path === location.pathname)?.label || "لوحة التحكم";

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="bg-card border-b px-3 py-2 sm:px-4 sm:py-4 flex items-center justify-between sticky top-0 z-10">
            {/* RTL: menu button + page title at the start (next to the sidebar), theme toggle at the end. */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="h-8 w-8 sm:h-9 sm:w-9 rtl:rotate-180" />
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold truncate">
                {currentPage}
              </h2>
            </div>
            <ThemeToggle />
          </header>
          
          {/* Main Content Area */}
          <main className="flex-1 p-2 sm:p-4 lg:p-6 overflow-auto">
            <div className="max-w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};