import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Users, Calendar, FileText, Stethoscope } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: "/", label: "لوحة التحكم", icon: Stethoscope },
    { path: "/patients", label: "المرضى", icon: Users },
    { path: "/appointments", label: "المواعيد", icon: Calendar },
    { path: "/treatments", label: "العلاجات", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">عيادة الأسنان</h1>
        </div>
        <nav className="px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Button
                key={item.path}
                variant={isActive ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => navigate(item.path)}
              >
                <Icon className="ml-2 h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-card border-b p-4">
          <h2 className="text-xl font-semibold">
            {navItems.find(item => item.path === location.pathname)?.label || "لوحة التحكم"}
          </h2>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};