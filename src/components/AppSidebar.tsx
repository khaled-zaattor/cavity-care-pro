import { Users, Calendar, FileText, Stethoscope, UserCheck, Settings, FileSpreadsheet, ListChecks, MonitorPlay, Wallet, Layers, BarChart3, Pill } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { path: "/", label: "لوحة التحكم", icon: Stethoscope, allowedRoles: ['super_admin'] },
  { path: "/patients", label: "المرضى", icon: Users, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
  { path: "/doctors", label: "الأطباء", icon: UserCheck, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
  { path: "/appointments", label: "المواعيد", icon: Calendar, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
  { path: "/treatments", label: "العلاجات", icon: FileText, allowedRoles: ['super_admin', 'doctor'] },
  { path: "/medicines", label: "الأدوية", icon: Pill, allowedRoles: ['super_admin', 'doctor'] },
  { path: "/specialties", label: "التخصصات", icon: Layers, allowedRoles: ['super_admin'] },
  { path: "/reports", label: "التقارير المالية", icon: BarChart3, allowedRoles: ['super_admin'] },
  { path: "/waiting-list-management", label: "إدارة لائحة الانتظار", icon: ListChecks, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant', 'receptionist'] },
  { path: "/waiting-list-display", label: "عرض لائحة الانتظار", icon: MonitorPlay, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant', 'receptionist'] },
  { path: "/activity-logs", label: "سجل النشاطات", icon: FileSpreadsheet, allowedRoles: ['super_admin'] },
  { path: "/admin", label: "إدارة النظام", icon: Settings, allowedRoles: ['super_admin'] },
];

// Independent doctors (own books) see only these pages
const independentDoctorPaths = [
  "/patients",
  "/appointments",
  "/treatments",
  "/medicines",
  "/my-finances",
  "/reports",
  "/waiting-list-management",
  "/waiting-list-display",
];

const myFinancesItem = { path: "/my-finances", label: "حساباتي", icon: Wallet, allowedRoles: ['doctor'] };

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { userRole, isIndependentDoctor } = useUserRole();

  const visibleItems = isIndependentDoctor
    ? [...navItems, myFinancesItem].filter((item) => independentDoctorPaths.includes(item.path))
    : navItems.filter((item) => userRole && item.allowedRoles.includes(userRole));

  const isActive = (path: string) => currentPath === path;
  const isCollapsed = state === "collapsed";

  const getNavCls = (active: boolean) =>
    active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent hover:text-accent-foreground";

  return (
    <Sidebar 
      variant="sidebar" 
      side="right"
      className="border-l"
    >
      <SidebarContent>
        <div className="p-4 border-b">
          <h1 className={`font-bold text-primary transition-all ${isCollapsed ? "text-sm text-center" : "text-xl"}`}>
            {isCollapsed ? "ع.أ" : "عيادة الأسنان"}
          </h1>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className={isCollapsed ? "sr-only" : ""}>
            القائمة الرئيسية
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.path} 
                        end 
                        className={getNavCls(active)}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!isCollapsed && <span className="mr-2">{item.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}