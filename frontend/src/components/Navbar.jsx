import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, Circle, LayoutDashboard, ListTodo, LogOut, UserRound } from "lucide-react";

const TASK_FILTERS = [
  { value: "open", label: "Open", icon: Circle },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
  { value: "all", label: "All", icon: ListTodo },
];

const Navbar = ({ filter, onFilterChange }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const selectTaskFilter = (nextFilter) => {
    onFilterChange(nextFilter);
    navigate("/tasks");
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };
  return (
    <aside className="sticky top-0 z-20 flex h-svh w-20 flex-none flex-col border-r border-emerald-900/70 bg-[#173b35] px-3 py-5 text-white sm:w-64 sm:px-4 sm:py-6">
      <NavLink to="/tasks" className="flex min-h-12 items-center justify-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-2">
        <span className="grid size-10 flex-none place-items-center rounded-lg bg-[#dce993] text-sm font-black text-[#173b35]">C</span>
        <span className="hidden text-lg font-bold tracking-tight sm:inline">Corner</span>
      </NavLink>

      <nav aria-label="Main navigation" className="mt-10 flex-1">
        <p className="mb-3 hidden px-3 text-[11px] font-bold tracking-[0.16em] text-emerald-100/55 uppercase sm:block">Menu</p>
        <NavLink
          to="/tasks"
          className={({ isActive }) => `flex min-h-12 items-center justify-center gap-3 rounded-lg text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10" : ""}`}
        >
          <LayoutDashboard aria-hidden="true" className="size-5 flex-none text-[#dce993]" />
          <span className="hidden sm:inline">Dashboard</span>
        </NavLink>

        <div className="group relative mt-2">
          <button
            type="button"
            onClick={() => selectTaskFilter("all")}
            aria-haspopup="menu"
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3"
          >
            <ListTodo aria-hidden="true" className="size-5 flex-none text-emerald-100" />
            <span className="hidden flex-1 text-left sm:inline">All task</span>
            <ChevronDown aria-hidden="true" className="hidden size-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180 sm:block" />
          </button>

          <div className="invisible absolute top-0 left-[calc(100%+0.5rem)] w-44 translate-x-1 opacity-0 transition duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100 sm:static sm:mt-1 sm:max-h-0 sm:w-auto sm:translate-x-0 sm:overflow-hidden sm:pl-4 sm:group-hover:max-h-44 sm:group-focus-within:max-h-44">
            <div role="menu" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl sm:border-0 sm:bg-emerald-950/35 sm:shadow-none">
              {TASK_FILTERS.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === "/tasks" && filter === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    role="menuitem"
                    onClick={() => selectTaskFilter(item.value)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-[#dce993] ${
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

        <NavLink
          to="/account"
          className={({ isActive }) => `mt-2 flex min-h-12 items-center justify-center gap-3 rounded-lg text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3 ${isActive ? "bg-white/10 text-white" : ""}`}
        >
          <UserRound aria-hidden="true" className="size-5 flex-none text-emerald-100" />
          <span className="hidden sm:inline">Account</span>
        </NavLink>
      </nav>

      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={logout}
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg text-sm font-semibold text-emerald-100 hover:bg-white/10 hover:text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#dce993] sm:justify-start sm:px-3"
        >
          <LogOut aria-hidden="true" className="size-5 flex-none" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </aside>
  );
};

export default Navbar;
