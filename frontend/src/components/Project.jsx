import { useEffect, useRef, useState } from "react";
import { CalendarClock, FolderKanban, LayoutGrid, List, LoaderCircle, Plus, Users, X } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const Project = () => {
  const {
    projects,
    isProjectsLoading,
    projectsError,
    loadProjects,
    isAddProjectOpen,
    onAddProjectOpen,
    onAddProjectClose,
    onProjectCreated,
  } = useOutletContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("project-view") || "grid");
  const closeTimer = useRef(null);

  const changeView = (nextView) => {
    setView(nextView);
    localStorage.setItem("project-view", nextView);
  };

  useEffect(() => {
    if (!isAddProjectOpen) return undefined;

    const animationFrame = window.requestAnimationFrame(() => setIsDrawerVisible(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isAddProjectOpen]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const finishClosingDrawer = () => {
    window.clearTimeout(closeTimer.current);
    setName("");
    setDescription("");
    onAddProjectClose();
  };

  const animateDrawerClosed = () => {
    setIsDrawerVisible(false);
    closeTimer.current = window.setTimeout(finishClosingDrawer, 300);
  };

  const closeDrawer = () => {
    if (isSubmitting) return;
    animateDrawerClosed();
  };

  const createProject = async (event) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName) return;

    setIsSubmitting(true);
    try {
      const response = await instance.post(ENDPOINTS.CREATE_PROJECT(), {
        name: projectName,
        description: description.trim() || null,
      });
      onProjectCreated(response.data);
      onAddProjectClose();
      navigate(`/projects/${response.data.id}`);
      toast.success("Project created.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't create the project."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <div className="w-full">
        <header className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Organize your work</p>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Projects</h1>
            <p className="mt-1 text-sm text-slate-600">Give related work a clear home and shared direction.</p>
          </div>
          <button
            type="button"
            onClick={onAddProjectOpen}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 sm:w-auto"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add project
          </button>
        </header>

        <section aria-labelledby="project-list-heading" className="mt-5 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
            <h2 id="project-list-heading" className="flex items-center gap-2 font-semibold">
              <FolderKanban aria-hidden="true" className="size-5 text-emerald-800" />
              Your projects
            </h2>
            <div className="flex items-center gap-3">
              {!isProjectsLoading && !projectsError ? (
                <span className="text-xs font-semibold text-slate-500">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
              ) : null}
              <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-0.5" aria-label="Project view">
                <button type="button" onClick={() => changeView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className={`grid size-9 cursor-pointer place-items-center rounded-md focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "grid" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>
                  <LayoutGrid aria-hidden="true" className="size-4" />
                </button>
                <button type="button" onClick={() => changeView("list")} aria-label="List view" aria-pressed={view === "list"} className={`grid size-9 cursor-pointer place-items-center rounded-md focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "list" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>
                  <List aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {isProjectsLoading ? (
            <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-slate-600" role="status">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />
              Loading projects...
            </div>
          ) : projectsError ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
              <p className="font-semibold text-slate-900">{projectsError}</p>
              <button type="button" onClick={loadProjects} className="mt-4 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                Try again
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="relative isolate flex min-h-80 flex-col items-center justify-center overflow-hidden px-5 py-10 text-center">
              <div aria-hidden="true" className="absolute -top-16 -right-12 size-48 rounded-full bg-[#dce993]/35 blur-2xl" />
              <div className="relative grid size-16 place-items-center rounded-2xl border border-emerald-900/10 bg-emerald-50 text-emerald-900 shadow-sm">
                <FolderKanban aria-hidden="true" className="size-8" />
              </div>
              <h3 className="relative mt-5 text-xl font-semibold tracking-[-0.025em]">No projects yet</h3>
              <p className="relative mt-2 max-w-md text-sm leading-6 text-slate-600">
                Start with one project for the work you care about now. You can give it a name and add a little context in the next step.
              </p>
              <button
                type="button"
                onClick={onAddProjectOpen}
                className="relative mt-6 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800"
              >
                <Plus aria-hidden="true" className="size-4" />
                Create your first project
              </button>
            </div>
          ) : (
            <ul className={view === "grid" ? "grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3" : "divide-y divide-slate-200"}>
              {projects.map((project) => (
                <li key={project.id} className="bg-white">
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className={`w-full cursor-pointer text-left transition-colors hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-emerald-800 ${view === "grid" ? "min-h-44 p-5" : "flex min-h-20 items-center gap-4 px-4 py-3"}`}
                  >
                    <span className="grid size-10 flex-none place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                      <FolderKanban aria-hidden="true" className="size-5" />
                    </span>
                    <span className={view === "grid" ? "mt-4 block" : "min-w-0 flex-1"}>
                      <span className="block break-words font-semibold text-slate-950">{project.name}</span>
                      <span className={`mt-1 block text-sm leading-5 text-slate-600 ${view === "grid" ? "line-clamp-2" : "truncate"}`}>{project.description || "No description yet."}</span>
                    </span>
                    <span className={view === "grid" ? "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500" : "hidden flex-none items-center gap-4 text-xs text-slate-500 md:flex"}>
                      <span className="flex items-center gap-1.5"><Users aria-hidden="true" className="size-3.5" />{project.member_count || 0} members</span>
                      <span className="flex items-center gap-1.5"><CalendarClock aria-hidden="true" className="size-3.5" />Created {DATE_FORMATTER.format(new Date(project.created_at))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isAddProjectOpen ? (
        <div
          className={`fixed inset-0 z-50 flex justify-end bg-slate-950/45 transition-opacity duration-200 motion-reduce:transition-none ${isDrawerVisible ? "opacity-100" : "opacity-0"}`}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-project-drawer-title"
            aria-describedby="add-project-drawer-description"
            className={`flex h-svh w-full transform-gpu flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:max-w-xl sm:border-l sm:border-slate-200 ${isDrawerVisible ? "translate-x-0" : "translate-x-full"}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDrawer();
            }}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "transform" && !isDrawerVisible) {
                finishClosingDrawer();
              }
            }}
          >
            <div className="flex min-h-20 items-center justify-between border-b border-slate-200 px-5 sm:px-7">
              <div className="min-w-0 pr-4">
                <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">New project</p>
                <h2 id="add-project-drawer-title" className="text-xl font-semibold tracking-[-0.025em] text-slate-950">Create a project</h2>
              </div>
              <button type="button" onClick={closeDrawer} disabled={isSubmitting} aria-label="Close add project form" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>

            <form onSubmit={createProject} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
                <p id="add-project-drawer-description" className="mb-6 text-sm leading-6 text-slate-600">
                  Use a clear name so this project is easy to recognize in your menu.
                </p>
                <div>
                  <label htmlFor="project-name" className="mb-1.5 block text-sm font-semibold text-slate-800">Project name</label>
                  <input
                    id="project-name"
                    type="text"
                    autoFocus
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="For example, Website redesign"
                    maxLength={255}
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                  />
                </div>

                <div className="mt-6">
                  <label htmlFor="project-description" className="mb-1.5 block text-sm font-semibold text-slate-800">
                    Description <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What outcome are you working toward?"
                    rows={6}
                    maxLength={1000}
                    className="min-h-40 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                  />
                  <p className="mt-1.5 text-right text-xs text-slate-500">{description.length}/1000</p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button type="button" onClick={closeDrawer} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting || !name.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
                  {isSubmitting ? "Creating..." : "Create project"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  );
};

export default Project;
