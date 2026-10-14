import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import NotificationCenter from "./NotificationCenter";

const getSectionLabel = (pathname) => {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/tasks") return "Tasks";
  if (pathname === "/projects") return "Projects";
  if (pathname.startsWith("/projects/")) return "Project workspace";
  if (pathname === "/account") return "Account";
  return "Workspace";
};

const TopNavbar = ({ profile }) => {
  const navigate = useNavigate();
  const location = useLocation();
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

  const openAccountSettings = () => {
    setIsAccountMenuOpen(false);
    navigate("/account");
  };

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 flex h-12 flex-none items-center justify-between border-b border-slate-200 bg-white/95 px-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur sm:px-5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Corner</p>
        <p className="truncate text-sm font-semibold text-slate-800">{getSectionLabel(location.pathname)}</p>
      </div>

      <div className="flex items-center gap-1.5">
        <NotificationCenter />

        <div ref={accountMenuRef} className="relative">
          <button
            ref={accountMenuTriggerRef}
            type="button"
            onClick={() => setIsAccountMenuOpen((current) => !current)}
            aria-expanded={isAccountMenuOpen}
            aria-controls="top-account-menu"
            aria-label={`Account menu for ${displayName}`}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:pr-2.5"
          >
            <span className="grid size-8 flex-none place-items-center rounded-full bg-[#173b35] text-xs font-black text-[#dce993]" aria-hidden="true">{initials}</span>
            <span className="hidden max-w-36 truncate text-sm font-semibold sm:block">{displayName}</span>
            <ChevronDown aria-hidden="true" className={`hidden size-4 flex-none text-slate-400 transition-transform sm:block ${isAccountMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div className={`absolute top-[calc(100%+0.375rem)] right-0 z-50 w-52 transition duration-150 ${isAccountMenuOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>
            <div id="top-account-menu" className="overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl" role="menu">
              <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
                <p className="truncate text-xs font-semibold text-slate-900">{displayName}</p>
                <p className="text-[10px] text-slate-500">Account</p>
              </div>
              <button type="button" role="menuitem" onClick={openAccountSettings} className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
                <Settings aria-hidden="true" className="size-4 text-emerald-800" />
                Account settings
              </button>
              <button type="button" role="menuitem" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-red-700">
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavbar;
