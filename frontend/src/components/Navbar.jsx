import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, Circle, FolderKanban, LayoutDashboard, ListTodo, ShieldCheck, UserRoundCheck } from "lucide-react";

import { hasAnyAdminPermission } from "./admin/adminPermissions";

const TASK_FILTERS = [
  { value: "my", label: "My Tasks", icon: UserRoundCheck },
  { value: "open", label: "Open", icon: Circle },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "all", label: "All", icon: ListTodo },
];

const Navbar = ({ filter, onFilterChange, projects = [], adminPermissions = [], isAdminLoading, adminError }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const selectTaskFilter = (nextFilter) => {
    onFilterChange(nextFilter);
    setIsTaskMenuOpen(false);
    navigate("/tasks");
  };

  const selectProject = (projectId) => {
    setIsProjectMenuOpen(false);
    navigate(`/projects/${projectId}`);
  };

  return (
    <aside className="sticky top-0 z-20 flex h-svh w-16 flex-none flex-col border-r border-emerald-900/70 bg-[#173b35] px-2 py-3 text-white sm:w-52 sm:px-3 sm:py-4">
      <NavLink to="/dashboard" aria-label="Corner dashboard" className="flex min-h-11 items-center justify-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-2">
        <span className="grid size-9 flex-none place-items-center rounded-lg bg-[#dce993] p-1">
          <img src="/Corner-logo.png" alt="" className="size-full rounded-md object-cover" />
        </span>
        <span className="hidden text-base font-bold tracking-tight sm:inline">Corner</span>
      </NavLink>

      <nav aria-label="Main navigation" className="mt-6 flex-1">
        <p className="mb-1.5 hidden px-3 text-[10px] font-bold tracking-[0.16em] text-emerald-100/55 uppercase sm:block">Menu</p>
        <NavLink
          to="/dashboard"
          onClick={() => {
             setIsTaskMenuOpen(false);
             setIsProjectMenuOpen(false);
          }}
          className={({ isActive }) => `flex min-h-11 items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10" : ""}`}
        >
          <LayoutDashboard aria-hidden="true" className="size-5 flex-none text-[#dce993]" />
          <span className="hidden sm:inline">Dashboard</span>
        </NavLink>

        <div
          className="relative mt-1"
          onMouseEnter={() => setIsTaskMenuOpen(true)}
          onMouseLeave={() => setIsTaskMenuOpen(false)}
          onFocus={() => setIsTaskMenuOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsTaskMenuOpen(false);
          }}
        >
          <NavLink
            to="/tasks"
            onClick={() => {
              onFilterChange("all");
              setIsProjectMenuOpen(false);
              setIsTaskMenuOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={isTaskMenuOpen}
            className={({ isActive }) => `flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10" : ""}`}
          >
            <ListTodo aria-hidden="true" className="size-5 flex-none text-emerald-100" />
            <span className="hidden flex-1 text-left sm:inline">Tasks</span>
            <ChevronDown aria-hidden="true" className={`hidden size-4 transition-transform sm:block ${isTaskMenuOpen ? "rotate-180" : ""}`} />
          </NavLink>

          <div className={`absolute top-0 left-full z-30 w-[calc(10rem+0.375rem)] pl-1.5 transition duration-150 ${isTaskMenuOpen ? "visible translate-x-0 opacity-100" : "invisible translate-x-1 opacity-0"}`}>
            <div role="menu" className="rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
              {TASK_FILTERS.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === "/tasks" && filter === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    role="menuitem"
                    onClick={() => selectTaskFilter(item.value)}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[#dce993] ${
                      isActive
                        ? "bg-[#dce993] text-[#173b35]"
                        : "hover:bg-slate-100"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="relative mt-1"
          onMouseEnter={() => {
            if (projects.length > 0) setIsProjectMenuOpen(true);
          }}
          onMouseLeave={() => setIsProjectMenuOpen(false)}
          onFocus={() => {
            if (projects.length > 0) setIsProjectMenuOpen(true);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsProjectMenuOpen(false);
          }}
        >
          <NavLink
            to="/projects"
            onClick={() => {
              setIsTaskMenuOpen(false);
              setIsProjectMenuOpen(false);
            }}
            aria-haspopup={projects.length > 0 ? "menu" : undefined}
            aria-expanded={projects.length > 0 ? isProjectMenuOpen : undefined}
            className={`flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${location.pathname.startsWith("/projects") ? "bg-white/10" : ""}`}
          >
            <FolderKanban aria-hidden="true" className="size-5 flex-none text-emerald-100" />
            <span className="hidden flex-1 text-left sm:inline">Projects</span>
            {projects.length > 0 ? <ChevronDown aria-hidden="true" className={`hidden size-4 transition-transform sm:block ${isProjectMenuOpen ? "rotate-180" : ""}`} /> : null}
          </NavLink>

          {projects.length > 0 ? (
            <div className={`absolute top-0 left-full z-30 w-[calc(13rem+0.375rem)] pl-1.5 transition duration-150 ${isProjectMenuOpen ? "visible translate-x-0 opacity-100" : "invisible translate-x-1 opacity-0"}`}>
              <div role="menu" className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
                {projects.map((project) => {
                  const isActive = location.pathname === `/projects/${project.id}`;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="menuitem"
                      onClick={() => selectProject(project.id)}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800 ${isActive ? "bg-[#dce993] text-[#173b35]" : "hover:bg-slate-100"}`}
                    >
                      <FolderKanban aria-hidden="true" className="size-4 flex-none" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        {!isAdminLoading && !adminError && hasAnyAdminPermission(adminPermissions) ? (
          <NavLink
            to="/admin"
            aria-label="Administration"
            onClick={() => {
              setIsTaskMenuOpen(false);
              setIsProjectMenuOpen(false);
            }}
            className={({ isActive }) => `mt-1 flex min-h-11 items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10" : ""}`}
          >
            <ShieldCheck aria-hidden="true" className="size-5 flex-none text-[#dce993]" />
            <span className="hidden sm:inline">Administration</span>
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
};

export default Navbar;
