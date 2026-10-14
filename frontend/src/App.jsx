import { useEffect, useState } from "react";
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
import { LoaderCircle } from "lucide-react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { ENDPOINTS, instance } from "./components/api";

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

const DashboardLayout = () => {
  const [filter, setFilter] = useState("all");
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [projects, setProjects] = useState([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const location = useLocation();
  const isProfileComplete = Boolean(profile?.profile_complete);
  const projectChatMatch = location.pathname.match(/^\/projects\/(\d+)$/);
  const chatProjectId = projectChatMatch?.[1] ?? null;
  const showChatAssistant = location.pathname === "/dashboard" || Boolean(chatProjectId);

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
    if (!isProfileComplete) return undefined;

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
  }, [isProfileComplete]);

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

  if (!isProfileLoading && profile && !profile.profile_complete && location.pathname !== "/account") {
    return <Navigate to="/account" replace state={{ completeProfile: true }} />;
  }

  return (
    <div className="flex min-h-svh bg-[#f4f6f2]">
      <Navbar
        filter={filter}
        onFilterChange={setFilter}
        projects={projects}
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
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
