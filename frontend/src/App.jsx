import { lazy, Suspense, useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import TopNavbar from "./components/TopNavbar";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import Task from "./components/Task";
import Project from "./components/Project";
import ProjectDetails from "./components/ProjectDetails";
import Account from "./components/Account";
import ForgotPassword from "./components/ForgotPassword";
import ChatAssistant from "./components/ChatAssistant";
import TemporaryPasswordChange from "./components/TemporaryPasswordChange";
import { LoaderCircle } from "lucide-react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { ENDPOINTS, instance } from "./components/api";

const AdminRoute = lazy(() => import("./components/admin/AdminRoute"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminOverview = lazy(() => import("./components/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./components/admin/AdminUsers"));
const AdminUserDetails = lazy(() => import("./components/admin/AdminUserDetails"));
const AdminRoles = lazy(() => import("./components/admin/AdminRoles"));
const AdminRoleDetails = lazy(() => import("./components/admin/AdminRoleDetails"));
const AdminProjects = lazy(() => import("./components/admin/AdminProjects"));
const AdminTasks = lazy(() => import("./components/admin/AdminTasks"));
const AdminNotifications = lazy(() => import("./components/admin/AdminNotifications"));
const AdminReports = lazy(() => import("./components/admin/AdminReports"));
const AdminAudit = lazy(() => import("./components/admin/AdminAudit"));
const AdminSystem = lazy(() => import("./components/admin/AdminSystem"));

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");
  return token ? <DashboardLayout /> : <Navigate to="/" replace />;
};

const BackendLoadingScreen = () => (
  <main className="grid min-h-svh place-items-center bg-[#f2f4ef] px-5 text-slate-950">
    <div className="text-center" role="status" aria-live="polite">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#173b35] shadow-lg shadow-emerald-950/15">
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-[#dce993]" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Starting Corner</h1>
      <p className="mt-1.5 text-sm text-slate-600">Waiting for the workspace server...</p>
    </div>
  </main>
);

const AdminRouteLoading = () => (
  <main className="grid min-h-[calc(100svh-3rem)] place-items-center bg-[#f4f6f2] px-5 text-sm text-slate-600" role="status">
    <span className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading administration...</span>
  </main>
);

const DashboardLayout = () => {
  const [filter, setFilter] = useState("all");
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [adminPermissions, setAdminPermissions] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState("");
  const [projects, setProjects] = useState([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const location = useLocation();
  const isProfileComplete = Boolean(profile?.profile_complete);
  const projectChatMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  const chatProjectId = projectChatMatch?.[1] ?? null;
  const showChatAssistant = location.pathname === "/dashboard" || Boolean(chatProjectId);
  const isAdminRoute = location.pathname.startsWith("/admin");

  const loadProfile = async () => {
    setIsProfileLoading(true);
    setProfileError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_PROFILE());
      setProfile(response.data);
    } catch (error) {
      setProfileError(error.response?.data?.detail ?? "We couldn't load your account.");
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    instance
      .get(ENDPOINTS.GET_PROFILE())
      .then((response) => {
        if (isCurrent) setProfile(response.data);
      })
      .catch((error) => {
        if (isCurrent) setProfileError(error.response?.data?.detail ?? "We couldn't load your account.");
      })
      .finally(() => {
        if (isCurrent) setIsProfileLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const loadAdminCapabilities = async () => {
    setIsAdminLoading(true);
    setAdminError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_ADMIN_ME());
      setAdminPermissions(response.data.permissions ?? []);
      setIsSuperAdmin(Boolean(response.data.is_super_admin));
    } catch (error) {
      setAdminPermissions([]);
      setIsSuperAdmin(false);
      const detail = error.response?.data?.detail;
      setAdminError(typeof detail === "string" ? detail : "We couldn't verify administration access.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    instance
      .get(ENDPOINTS.GET_ADMIN_ME())
      .then((response) => {
        if (isCurrent) {
          setAdminPermissions(response.data.permissions ?? []);
          setIsSuperAdmin(Boolean(response.data.is_super_admin));
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setAdminPermissions([]);
          setIsSuperAdmin(false);
          setAdminError(typeof error.response?.data?.detail === "string" ? error.response.data.detail : "We couldn't verify administration access.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsAdminLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const loadProjects = async () => {
    setIsProjectsLoading(true);
    setProjectsError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_PROJECTS());
      setProjects(response.data);
    } catch (error) {
      setProjectsError(error.response?.data?.detail ?? "We couldn't load your projects.");
    } finally {
      setIsProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (!isProfileComplete || profile?.must_change_password || isAdminRoute) {
      return undefined;
    }

    let isCurrent = true;
    instance
      .get(ENDPOINTS.GET_PROJECTS())
      .then((response) => {
        if (isCurrent) setProjects(response.data);
      })
      .catch((error) => {
        if (isCurrent) {
          setProjectsError(error.response?.data?.detail ?? "We couldn't load your projects.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsProjectsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isAdminRoute, isProfileComplete, profile?.must_change_password]);

  const addProjectToList = (project) => {
    setProjects((current) => [...current, project].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const updateProjectInList = (projectId, updates) => {
    setProjects((current) => current.map((project) => (
      project.id === Number(projectId) ? { ...project, ...updates } : project
    )).sort((a, b) => a.name.localeCompare(b.name)));
  };

  const removeProjectFromList = (projectId) => {
    setProjects((current) => current.filter((project) => project.id !== Number(projectId)));
  };

  if (isProfileLoading) {
    return (
      <div className="flex min-h-svh bg-[#f4f6f2]">
        <Navbar
          filter={filter}
          onFilterChange={setFilter}
          projects={projects}
          adminPermissions={adminPermissions}
          isAdminLoading={isAdminLoading}
          adminError={adminError}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopNavbar profile={profile} />
          <main className="grid min-w-0 flex-1 place-items-center px-4 text-sm font-semibold text-slate-600" role="status">
            Loading your account...
          </main>
        </div>
      </div>
    );
  }

  if (profileError && location.pathname !== "/account") {
    return <Navigate to="/account" replace state={{ completeProfile: true }} />;
  }

  if (profile?.must_change_password) {
    return location.pathname === "/change-temporary-password"
      ? <TemporaryPasswordChange />
      : <Navigate to="/change-temporary-password" replace />;
  }

  if (location.pathname === "/change-temporary-password") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isProfileLoading && profile && !profile.profile_complete && location.pathname !== "/account") {
    return <Navigate to="/account" replace state={{ completeProfile: true }} />;
  }

  return (
    <div className="flex min-h-svh bg-[#f4f6f2]">
      <Navbar
        filter={filter}
        onFilterChange={setFilter}
        projects={projects}
        adminPermissions={adminPermissions}
        isAdminLoading={isAdminLoading}
        adminError={adminError}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar profile={profile} />
        <Outlet context={{
          filter,
          onFilterChange: setFilter,
          profile,
          isProfileLoading,
          profileError,
          loadProfile,
          onProfileChange: setProfile,
          projects,
          isProjectsLoading,
          projectsError,
          loadProjects,
          isAddProjectOpen,
          onAddProjectOpen: () => setIsAddProjectOpen(true),
          onAddProjectClose: () => setIsAddProjectOpen(false),
          onProjectCreated: addProjectToList,
          onProjectUpdated: updateProjectInList,
          onProjectDeleted: removeProjectFromList,
          adminPermissions,
          isSuperAdmin,
          isAdminLoading,
          adminError,
          loadAdminCapabilities,
        }} />
      </div>
      {showChatAssistant ? (
        <ChatAssistant
          key={chatProjectId ? `project-${chatProjectId}` : "workspace"}
          projectId={chatProjectId}
          projectName={projects.find((project) => project.id === Number(chatProjectId))?.name}
          projects={projects}
        />
      ) : null}
    </div>
  );
};

function App() {
  const [isBackendReady, setIsBackendReady] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    let retryTimer;
    const controller = new AbortController();

    const checkBackend = async () => {
      try {
        await instance.get("/", { signal: controller.signal, timeout: 3000 });
        if (isCurrent) setIsBackendReady(true);
      } catch (error) {
        if (isCurrent && error.code !== "ERR_CANCELED") {
          retryTimer = window.setTimeout(checkBackend, 1500);
        }
      }
    };

    checkBackend();
    return () => {
      isCurrent = false;
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, []);

  if (!isBackendReady) return <BackendLoadingScreen />;

  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tasks" element={<Task />} />
            <Route path="/projects" element={<Project />} />
            <Route path="/projects/:projectId" element={<ProjectDetails />} />
            <Route path="/account" element={<Account />} />
            <Route path="/change-temporary-password" element={<TemporaryPasswordChange />} />
            <Route path="/admin" element={<Suspense fallback={<AdminRouteLoading />}><AdminRoute /></Suspense>}>
              <Route element={<Suspense fallback={<AdminRouteLoading />}><AdminLayout /></Suspense>}>
                <Route index element={<Suspense fallback={<AdminRouteLoading />}><AdminOverview /></Suspense>} />
                <Route path="users" element={<Suspense fallback={<AdminRouteLoading />}><AdminUsers /></Suspense>} />
                <Route path="users/:userId" element={<Suspense fallback={<AdminRouteLoading />}><AdminUserDetails /></Suspense>} />
                <Route path="roles" element={<Suspense fallback={<AdminRouteLoading />}><AdminRoles /></Suspense>} />
                <Route path="roles/:roleId" element={<Suspense fallback={<AdminRouteLoading />}><AdminRoleDetails /></Suspense>} />
                <Route path="projects" element={<Suspense fallback={<AdminRouteLoading />}><AdminProjects /></Suspense>} />
                <Route path="tasks" element={<Suspense fallback={<AdminRouteLoading />}><AdminTasks /></Suspense>} />
                <Route path="notifications" element={<Suspense fallback={<AdminRouteLoading />}><AdminNotifications /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<AdminRouteLoading />}><AdminReports /></Suspense>} />
                <Route path="audit" element={<Suspense fallback={<AdminRouteLoading />}><AdminAudit /></Suspense>} />
                <Route path="system" element={<Suspense fallback={<AdminRouteLoading />}><AdminSystem /></Suspense>} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
