import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  UserRound,
  Users,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const Dashboard = () => {
  const {
    profile,
    projects,
    isProjectsLoading,
    projectsError,
    loadProjects,
    onFilterChange,
  } = useOutletContext();
  const [taskRequest, setTaskRequest] = useState({ tasks: null, error: "" });

  useEffect(() => {
    let isCurrent = true;

    instance.get(ENDPOINTS.GET_TASKS())
      .then((response) => {
        if (isCurrent) setTaskRequest({ tasks: response.data, error: "" });
      })
      .catch((error) => {
        if (isCurrent) {
          setTaskRequest({
            tasks: [],
            error: getErrorMessage(error, "We couldn't load your task overview."),
          });
        }
      });

    return () => { isCurrent = false; };
  }, []);

  const tasks = taskRequest.tasks || [];
  const openTasks = tasks.filter((task) => !task.completed);
  const completedCount = tasks.length - openTasks.length;
  const visibleTasks = openTasks.slice(0, 5);
  const visibleProjects = projects.slice(0, 4);
  const firstName = profile?.first_name || "there";

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <div className="w-full">
        <header className="border-b border-slate-300 pb-5">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">
            <LayoutDashboard aria-hidden="true" className="size-3.5" />
            Workspace overview
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-600">See what needs attention across your workspace.</p>
        </header>

        <section aria-labelledby="module-overview-heading" className="py-5">
          <h2 id="module-overview-heading" className="sr-only">Module overview</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link to="/tasks" onClick={() => onFilterChange("open")} className="group min-h-32 bg-[#173b35] p-4 text-white shadow-sm focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800">
              <span className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-white/10 text-[#dce993]"><ListTodo aria-hidden="true" className="size-5" /></span>
                <ArrowRight aria-hidden="true" className="size-4 text-emerald-100/60 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="mt-4 block text-2xl font-semibold tabular-nums">{taskRequest.tasks === null ? "-" : openTasks.length}</span>
              <span className="mt-0.5 block text-xs font-semibold text-emerald-50/75">Open tasks</span>
            </Link>

            <Link to="/projects" className="group min-h-32 border border-slate-200 bg-white p-4 shadow-sm focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800">
              <span className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><FolderKanban aria-hidden="true" className="size-5" /></span>
                <ArrowRight aria-hidden="true" className="size-4 text-slate-400 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="mt-4 block text-2xl font-semibold tabular-nums">{isProjectsLoading ? "-" : projects.length}</span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-600">Projects</span>
            </Link>

            <Link to="/account" className="group min-h-32 border border-slate-200 bg-white p-4 shadow-sm focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800">
              <span className="flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-[#f3f6d8] text-emerald-900"><UserRound aria-hidden="true" className="size-5" /></span>
                <ArrowRight aria-hidden="true" className="size-4 text-slate-400 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="mt-4 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 aria-hidden="true" className="size-5 text-emerald-700" />Profile complete</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{profile?.email}</span>
            </Link>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <section aria-labelledby="open-tasks-heading" className="bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 px-4">
              <h2 id="open-tasks-heading" className="flex items-center gap-2 font-semibold"><Circle aria-hidden="true" className="size-5 text-amber-700" />Open tasks</h2>
              <Link to="/tasks" onClick={() => onFilterChange("open")} className="flex min-h-11 items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 focus-visible:outline-3 focus-visible:outline-emerald-800">View all<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
            </div>

            {taskRequest.tasks === null ? (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading tasks...</div>
            ) : taskRequest.error ? (
              <div className="grid min-h-52 place-items-center px-5 text-center"><div><p className="font-semibold">Tasks unavailable</p><p className="mt-1 text-sm text-slate-500">{taskRequest.error}</p></div></div>
            ) : visibleTasks.length === 0 ? (
              <div className="grid min-h-52 place-items-center px-5 text-center"><div><CheckCircle2 aria-hidden="true" className="mx-auto size-8 text-emerald-700" /><p className="mt-3 font-semibold">You&apos;re all caught up</p><p className="mt-1 text-sm text-slate-500">There are no open tasks right now.</p></div></div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleTasks.map((task) => (
                  <li key={task.id} className="flex min-h-16 items-start gap-3 px-4 py-3">
                    <Circle aria-hidden="true" className="mt-0.5 size-4 flex-none text-amber-700" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{task.title}</span><span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">{task.description || "No description"}</span></span>
                  </li>
                ))}
              </ul>
            )}

            {taskRequest.tasks !== null && !taskRequest.error ? (
              <dl className="flex gap-5 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs"><div className="flex gap-1.5"><dt className="text-slate-500">Open</dt><dd className="font-bold tabular-nums text-slate-900">{openTasks.length}</dd></div><div className="flex gap-1.5"><dt className="text-slate-500">Completed</dt><dd className="font-bold tabular-nums text-slate-900">{completedCount}</dd></div></dl>
            ) : null}
          </section>

          <section aria-labelledby="projects-heading" className="bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-200 px-4">
              <h2 id="projects-heading" className="flex items-center gap-2 font-semibold"><FolderKanban aria-hidden="true" className="size-5 text-emerald-800" />Projects</h2>
              <Link to="/projects" className="flex min-h-11 items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 focus-visible:outline-3 focus-visible:outline-emerald-800">View all<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
            </div>

            {isProjectsLoading ? (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading projects...</div>
            ) : projectsError ? (
              <div className="grid min-h-52 place-items-center px-5 text-center"><div><p className="font-semibold">Projects unavailable</p><p className="mt-1 text-sm text-slate-500">{projectsError}</p><button type="button" onClick={loadProjects} className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-xs font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800">Try again</button></div></div>
            ) : visibleProjects.length === 0 ? (
              <div className="grid min-h-52 place-items-center px-5 text-center"><div><FolderKanban aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">No projects yet</p><Link to="/projects" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-emerald-800 focus-visible:outline-3 focus-visible:outline-emerald-800">Create a project</Link></div></div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleProjects.map((project) => (
                  <li key={project.id}>
                    <Link to={`/projects/${project.id}`} className="group flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-emerald-800">
                      <span className="grid size-9 flex-none place-items-center rounded-lg bg-emerald-50 text-emerald-800"><FolderKanban aria-hidden="true" className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{project.name}</span><span className="mt-0.5 flex items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><Users aria-hidden="true" className="size-3" />{project.member_count || 0}</span><span>{DATE_FORMATTER.format(new Date(project.created_at))}</span></span></span>
                      <ArrowRight aria-hidden="true" className="size-4 flex-none text-slate-300 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
