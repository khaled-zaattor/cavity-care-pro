import { useState, useEffect } from "react";
import { Users, Calendar, FileText, Stethoscope, UserCheck, Settings, FileSpreadsheet, ListChecks, MonitorPlay, Activity } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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
  { path: "/ongoing-treatments", label: "العلاجات الجارية", icon: Activity, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
  { path: "/treatments", label: "العلاجات", icon: FileText, allowedRoles: ['super_admin', 'doctor'] },
  { path: "/waiting-list-management", label: "إدارة لائحة الانتظار", icon: ListChecks, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant', 'receptionist'] },
  { path: "/waiting-list-display", label: "عرض لائحة الانتظار", icon: MonitorPlay, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant', 'receptionist'] },
  { path: "/activity-logs", label: "سجل النشاطات", icon: FileSpreadsheet, allowedRoles: ['super_admin'] },
  { path: "/admin", label: "إدارة النظام", icon: Settings, allowedRoles: ['super_admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      setUserRole(roleData?.role || null);
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

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
              {navItems.map((item) => {
                // Show menu item only if user role is in allowedRoles
                if (!userRole || !item.allowedRoles.includes(userRole)) {
                  return null;
                }
                
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