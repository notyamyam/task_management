import { useEffect, useRef, useState } from "react";
import { BarChart3, Bell, ClipboardList, FileBarChart, FolderKanban, Menu, ScrollText, ServerCog, ShieldCheck, Users, X, Workflow } from "lucide-react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";

import { hasPermission } from "./adminPermissions";
import { useAdminFocusTrap } from "./useAdminFocusTrap";

const ADMIN_NAVIGATION = [
  { to: "/admin", label: "Overview", icon: BarChart3, end: true },
  { to: "/admin/users", label: "Users", icon: Users, permission: "users.read" },
  { to: "/admin/roles", label: "Roles", icon: Workflow, permission: "roles.read" },
  { to: "/admin/projects", label: "Projects", icon: FolderKanban, permission: "projects.read" },
  { to: "/admin/tasks", label: "Tasks", icon: ClipboardList, permission: "tasks.read" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, permission: "notifications.read" },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, anyPermissions: ["reports.export", "reports.generate"] },
  { to: "/admin/audit", label: "Audit", icon: ScrollText, permission: "audit_logs.read" },
  { to: "/admin/system", label: "System", icon: ServerCog, permission: "system_integrations.read" },
];

const AdminLayout = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  ));
  const triggerRef = useRef(null);
  const drawerCloseButtonRef = useRef(null);
  const context = useOutletContext();
  const visibleNavigation = ADMIN_NAVIGATION.filter((item) => (
    (!item.permission || hasPermission(context.adminPermissions, item.permission))
    && (!item.anyPermissions || item.anyPermissions.some((permission) => hasPermission(context.adminPermissions, permission)))
  ));
  const isMobileViewport = !isDesktopViewport;
  const drawerRef = useRef(null);

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    if (isMobileViewport) triggerRef.current?.focus();
  };

  const openDrawer = () => {
    setIsDrawerOpen(true);
    requestAnimationFrame(() => drawerCloseButtonRef.current?.focus());
  };

  useAdminFocusTrap({
    isOpen: isDrawerOpen && isMobileViewport,
    containerRef: drawerRef,
    initialFocusRef: drawerCloseButtonRef,
    onEscape: closeDrawer,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleViewportChange = (event) => setIsDesktopViewport(event.matches);

    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  return (
    <div className="relative flex min-h-[calc(100svh-3rem)] min-w-0 flex-1 bg-[#f4f6f2]">
      {isDrawerOpen ? (
        <button type="button" aria-label="Close administration navigation" onClick={closeDrawer} className="fixed inset-0 z-30 cursor-pointer bg-slate-950/30 md:hidden" />
      ) : null}

      <aside ref={drawerRef} id="admin-navigation" className={`fixed inset-y-12 left-0 z-40 w-56 border-r border-emerald-900/70 bg-[#173b35] px-3 py-4 text-white shadow-xl transition-transform md:sticky md:top-12 md:z-10 md:block md:h-[calc(100svh-3rem)] md:w-52 md:translate-x-0 md:shadow-none ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"}`} aria-hidden={isMobileViewport && !isDrawerOpen} inert={isMobileViewport && !isDrawerOpen} aria-label="Administration navigation">
        <div className="flex items-center justify-between border-b border-white/15 px-2 pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 text-[#dce993]" />
            <span className="text-sm font-bold">Administration</span>
          </div>
          <button ref={drawerCloseButtonRef} type="button" aria-label="Close administration navigation" onClick={closeDrawer} className="grid size-11 cursor-pointer place-items-center rounded-lg text-emerald-50 hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[#dce993] md:hidden">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <nav aria-label="Administration sections" className="mt-4 space-y-1">
           {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={closeDrawer}
                className={({ isActive }) => `flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[#dce993] ${isActive ? "bg-white/15 text-white" : ""}`}
              >
                <Icon aria-hidden="true" className="size-4 text-[#dce993]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-12 items-center border-b border-slate-200 bg-white px-3 md:hidden">
          <button ref={triggerRef} type="button" aria-expanded={isDrawerOpen} aria-controls="admin-navigation" onClick={openDrawer} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
            <Menu aria-hidden="true" className="size-5 text-emerald-800" />
            Administration menu
          </button>
        </div>
        <Outlet context={context} />
      </div>
    </div>
  );
};

export default AdminLayout;
