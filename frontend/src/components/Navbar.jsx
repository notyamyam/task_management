import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, Circle, LayoutDashboard, ListTodo, LogOut, Settings } from "lucide-react";

const TASK_FILTERS = [
  { value: "open", label: "Open", icon: Circle },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "all", label: "All", icon: ListTodo },
];

const Navbar = ({ filter, onFilterChange, profile }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountMenuTriggerRef = useRef(null);

  const initials = `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "?";
  const displayName = profile?.profile_complete
    ? `${profile.first_name} ${profile.last_name}`
    : "Complete profile";

  useEffect(() => {
    if (!isAccountMenuOpen) return undefined;

    const closeMenu = (event) => {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountMenuTriggerRef.current?.focus();
      } else if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener("keydown", closeMenu);
    document.addEventListener("pointerdown", closeMenu);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("pointerdown", closeMenu);
    };
  }, [isAccountMenuOpen]);

  const selectTaskFilter = (nextFilter) => {
    onFilterChange(nextFilter);
    setIsTaskMenuOpen(false);
    navigate("/tasks");
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  const openAccountSettings = () => {
    setIsAccountMenuOpen(false);
    navigate("/account");
  };
  return (
    <aside className="sticky top-0 z-20 flex h-svh w-16 flex-none flex-col border-r border-emerald-900/70 bg-[#173b35] px-2 py-3 text-white sm:w-52 sm:px-3 sm:py-4">
      <NavLink to="/tasks" className="flex min-h-11 items-center justify-center gap-2.5 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-2">
        <span className="grid size-9 flex-none place-items-center rounded-lg bg-[#dce993] text-sm font-black text-[#173b35]">C</span>
        <span className="hidden text-base font-bold tracking-tight sm:inline">Corner</span>
      </NavLink>

      <nav aria-label="Main navigation" className="mt-6 flex-1">
        <p className="mb-1.5 hidden px-3 text-[10px] font-bold tracking-[0.16em] text-emerald-100/55 uppercase sm:block">Menu</p>
        <NavLink
          to="/tasks"
          onClick={() => {
            setIsTaskMenuOpen(false);
            setIsAccountMenuOpen(false);
          }}
          className={({ isActive }) => `flex min-h-11 items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10" : ""}`}
        >
          <LayoutDashboard aria-hidden="true" className="size-5 flex-none text-[#dce993]" />
          <span className="hidden sm:inline">Dashboard</span>
        </NavLink>

        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => {
              setIsAccountMenuOpen(false);
              setIsTaskMenuOpen((current) => !current);
            }}
            aria-haspopup="menu"
            aria-expanded={isTaskMenuOpen}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3"
          >
            <ListTodo aria-hidden="true" className="size-5 flex-none text-emerald-100" />
            <span className="hidden flex-1 text-left sm:inline">All task</span>
            <ChevronDown aria-hidden="true" className={`hidden size-4 transition-transform sm:block ${isTaskMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div className={`absolute top-0 left-[calc(100%+0.375rem)] w-40 transition duration-150 sm:static sm:mt-1 sm:w-auto sm:translate-x-0 sm:overflow-hidden sm:pl-3 ${isTaskMenuOpen ? "visible translate-x-0 opacity-100 sm:max-h-40" : "invisible translate-x-1 opacity-0 sm:max-h-0"}`}>
            <div role="menu" className="rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl sm:border-0 sm:bg-emerald-950/35 sm:shadow-none">
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
                        : "hover:bg-slate-100 sm:text-emerald-50 sm:hover:bg-white/10"
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

      </nav>

      <div ref={accountMenuRef} className="relative border-t border-white/10 pt-2">
        <button
          ref={accountMenuTriggerRef}
          type="button"
          onClick={() => {
            setIsTaskMenuOpen(false);
            setIsAccountMenuOpen((current) => !current);
          }}
          aria-expanded={isAccountMenuOpen}
          aria-controls="account-submenu"
          aria-label={`Account menu for ${displayName}`}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-2"
        >
          <span className="grid size-8 flex-none place-items-center rounded-full bg-[#dce993] text-xs font-black text-[#173b35]" aria-hidden="true">
            {initials}
          </span>
          <span className="hidden min-w-0 flex-1 text-left sm:block">
            <span className="block truncate text-sm">{displayName}</span>
            <span className="block truncate text-[11px] font-normal text-emerald-100/65">Account</span>
          </span>
          <ChevronDown aria-hidden="true" className={`hidden size-4 flex-none transition-transform sm:block ${isAccountMenuOpen ? "rotate-180" : ""}`} />
        </button>

        <div className={`absolute bottom-0 left-[calc(100%+0.375rem)] z-30 w-48 transition duration-150 sm:bottom-[calc(100%+0.5rem)] sm:left-0 sm:w-full ${isAccountMenuOpen ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"}`}>
          <div id="account-submenu" className="rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl">
            <button type="button" onClick={openAccountSettings} className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
              <Settings aria-hidden="true" className="size-4 text-emerald-800" />
              Account settings
            </button>
            <button type="button" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-red-700">
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Navbar;
