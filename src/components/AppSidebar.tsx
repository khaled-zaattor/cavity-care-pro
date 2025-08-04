import { Users, Calendar, FileText, Stethoscope } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

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
  { path: "/", label: "لوحة التحكم", icon: Stethoscope },
  { path: "/patients", label: "المرضى", icon: Users },
  { path: "/appointments", label: "المواعيد", icon: Calendar },
  { path: "/treatments", label: "العلاجات", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

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
            <SidebarMenu>
              {navItems.map((item) => {
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