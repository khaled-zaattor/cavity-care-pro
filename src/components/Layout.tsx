import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Users, Calendar, FileText, Stethoscope, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "لوحة التحكم", icon: Stethoscope },
    { path: "/patients", label: "المرضى", icon: Users },
    { path: "/appointments", label: "المواعيد", icon: Calendar },
    { path: "/treatments", label: "العلاجات", icon: FileText },
  ];

  const currentPage = navItems.find(item => item.path === location.pathname)?.label || "لوحة التحكم";

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header */}
          <header className="bg-card border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-row-reverse">
              <h2 className="text-lg lg:text-xl font-semibold truncate">
                {currentPage}
              </h2>
              <SidebarTrigger />
            </div>
          </header>
          
          {/* Main Content Area */}
          <main className="flex-1 p-3 lg:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};