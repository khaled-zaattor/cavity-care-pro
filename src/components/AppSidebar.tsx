import { Users, Calendar, FileText, UserCheck, Settings, FileSpreadsheet, ListChecks, MonitorPlay, Wallet, Layers, BarChart3, Pill, Clock, Landmark, LayoutDashboard, LogOut, UserCircle, type LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/components/AuthWrapper";
import { Button } from "@/components/ui/button";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = { path: string; label: string; icon: LucideIcon; allowedRoles: string[] };

const ALL_ROLES = ['super_admin', 'doctor', 'dentist_assistant', 'receptionist'];

const myFinancesItem: NavItem = { path: "/my-finances", label: "حساباتي", icon: Wallet, allowedRoles: ['doctor'] };

// Plan §4.8: grouped menu
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "الاستقبال",
    items: [
      { path: "/", label: "لوحة التحكم", icon: LayoutDashboard, allowedRoles: ALL_ROLES },
      { path: "/appointments", label: "المواعيد", icon: Calendar, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
      { path: "/waiting-list-management", label: "إدارة لائحة الانتظار", icon: ListChecks, allowedRoles: ALL_ROLES },
      { path: "/waiting-list-display", label: "عرض لائحة الانتظار", icon: MonitorPlay, allowedRoles: ALL_ROLES },
    ],
  },
  {
    label: "المرضى",
    items: [
      { path: "/patients", label: "المرضى", icon: Users, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
    ],
  },
  {
    label: "الأطباء والتخصصات",
    items: [
      { path: "/doctors", label: "الأطباء", icon: UserCheck, allowedRoles: ['super_admin', 'doctor', 'dentist_assistant'] },
      { path: "/specialties", label: "التخصصات", icon: Layers, allowedRoles: ['super_admin'] },
      { path: "/attendance", label: "حضور الأطباء", icon: Clock, allowedRoles: ['super_admin', 'receptionist', 'doctor'] },
      { path: "/treatments", label: "العلاجات", icon: FileText, allowedRoles: ['super_admin', 'doctor'] },
      { path: "/medicines", label: "الأدوية", icon: Pill, allowedRoles: ['super_admin', 'doctor'] },
    ],
  },
  {
    label: "المالية",
    items: [
      { path: "/reports", label: "التقارير المالية", icon: BarChart3, allowedRoles: ['super_admin'] },
      { path: "/finance", label: "المالية", icon: Landmark, allowedRoles: ['super_admin'] },
      myFinancesItem,
    ],
  },
  {
    label: "الإعدادات",
    items: [
      { path: "/activity-logs", label: "سجل النشاطات", icon: FileSpreadsheet, allowedRoles: ['super_admin'] },
      { path: "/admin", label: "إدارة النظام", icon: Settings, allowedRoles: ['super_admin'] },
    ],
  },
];

// Independent doctors (own books) see only these pages
const independentDoctorPaths = [
  "/",
  "/patients",
  "/appointments",
  "/attendance",
  "/treatments",
  "/medicines",
  "/my-finances",
  "/reports",
  "/waiting-list-management",
  "/waiting-list-display",
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { user, signOut } = useAuth();
  const userName = user ? user.full_name || user.email.replace(/@gmail\.com$/, "") : "";
  const location = useLocation();
  const currentPath = location.pathname;
  const { userRole, isIndependentDoctor } = useUserRole();

  // Every doctor sees حساباتي (own percentage settlement, Phase G)
  const canSee = (item: NavItem) =>
    isIndependentDoctor
      ? independentDoctorPaths.includes(item.path)
      : !!userRole && item.allowedRoles.includes(userRole); // every doctor has a settlement now (Phase G)

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const isActive = (path: string) => currentPath === path;
  const isCollapsed = state === "collapsed";

  const getNavCls = (active: boolean) =>
    active
      ? "bg-white/15 text-white font-semibold shadow-lg shadow-black/10 ring-1 ring-white/20"
      : "text-white/80 hover:bg-white/10 hover:text-white";

  return (
    <Sidebar 
      variant="sidebar" 
      side="right"
      className="border-l"
    >
      <SidebarContent>
        <div className="p-4 border-b border-white/10">
          <h1 className={`font-bold text-white transition-all ${isCollapsed ? "text-sm text-center" : "text-xl"}`}>
            {isCollapsed ? "ع.أ" : "عيادة الأسنان"}
          </h1>
        </div>

        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className={isCollapsed ? "sr-only" : "text-white/50 font-semibold"}>
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {group.items.map((item) => {
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
                          onClick={() => isMobile && setOpenMobile(false)}
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
        ))}
      </SidebarContent>

      {/* user + logout: part of the sidebar, so it never covers menu items or page content */}
      {user && (
        <SidebarFooter className="border-t border-white/10">
          <div className={`flex items-center gap-2 ${isCollapsed ? "flex-col" : ""}`}>
            <UserCircle className="h-5 w-5 shrink-0 text-white/80" />
            {!isCollapsed && <span className="flex-1 truncate text-sm font-medium" title={userName}>{userName}</span>}
            <Button variant="ghost" size="sm" onClick={signOut} title="تسجيل الخروج" className="h-8 shrink-0 px-2 text-xs text-white/80 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4 rtl:rotate-180" />
              {!isCollapsed && <span className="mr-1">خروج</span>}
            </Button>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}