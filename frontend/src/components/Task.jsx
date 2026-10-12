import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Circle, Columns3, Inbox, List, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2, UserRound, X } from "lucide-react";
import { toast } from "react-toastify";
import { Link, useOutletContext } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";
import TaskBoard from "./TaskBoard";
import { AssigneeBadge, DueDateBadge, PriorityBadge, StatusBadge, TaskAttributeFields, TaskPlanningFields, TaskTags } from "./TaskAttributes";
import { getTaskTagSuggestions, getTaskUserName, mergeTaskTagSuggestions, normalizeTaskTags, validateTaskTags } from "./taskUtils";
import { buildTaskPayload, getDueDateState, getTaskAssignee, normalizeTaskStatus, sortTasksByDueDate, taskMatchesPlanningView } from "./taskPlanning";

const getErrorMessage = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;
const emptyForm = { title: "", description: "", projectId: "", tags: [], priority: "medium", dueDate: "", assigneeId: "", status: "backlog" };
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? DATE_TIME_FORMATTER.format(new Date(value)) : "Not available";

const Task = () => {
  const { filter, profile, projects, isProjectsLoading } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [savedTagSuggestions, setSavedTagSuggestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [dueFilter, setDueFilter] = useState("any");
  const [dueSort, setDueSort] = useState("none");
  const [membersRequest, setMembersRequest] = useState({ projectId: "", members: [], loading: false });
  const [view, setView] = useState(() => localStorage.getItem(`task-view:${profile?.id ?? profile?.email ?? "user"}`) || "list");
  const editorTimer = useRef(null);
  const memberRequestId = useRef(0);

  const loadTasks = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await instance.get(ENDPOINTS.GET_TASKS());
      setTasks(response.data);
    } catch (error) {
      setLoadError(getErrorMessage(error, "We couldn't load your tasks."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let current = true;
    Promise.allSettled([
      instance.get(ENDPOINTS.GET_TASKS()),
      instance.get(ENDPOINTS.GET_TASK_TAG_RECOMMENDATIONS()),
    ]).then(([taskResult, tagResult]) => {
      if (!current) return;
      if (taskResult.status === "fulfilled") setTasks(taskResult.value.data);
      else setLoadError(getErrorMessage(taskResult.reason, "We couldn't load your tasks."));
      if (tagResult.status === "fulfilled") setSavedTagSuggestions(normalizeTaskTags(tagResult.value.data));
      setIsLoading(false);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => () => window.clearTimeout(editorTimer.current), []);

  const changeView = (nextView) => {
    setView(nextView);
    localStorage.setItem(`task-view:${profile?.id ?? profile?.email ?? "user"}`, nextView);
  };

  const loadProjectMembers = async (projectId, selectedAssigneeId = "") => {
    const requestId = memberRequestId.current + 1;
    memberRequestId.current = requestId;
    if (!projectId) {
      setMembersRequest({ projectId: "", members: [], loading: false });
      setForm((current) => ({ ...current, projectId: "", assigneeId: "" }));
      return;
    }
    setForm((current) => ({ ...current, projectId: String(projectId), assigneeId: selectedAssigneeId }));
    setMembersRequest({ projectId: String(projectId), members: [], loading: true });
    try {
      const response = await instance.get(ENDPOINTS.GET_PROJECT(projectId));
      if (memberRequestId.current !== requestId) return;
      const members = [response.data.owner, ...(response.data.members || [])].filter(Boolean);
      setMembersRequest({ projectId: String(projectId), members, loading: false });
      if (selectedAssigneeId && !members.some((member) => Number(member.id) === Number(selectedAssigneeId))) {
        setForm((current) => ({ ...current, assigneeId: "" }));
      }
    } catch (error) {
      if (memberRequestId.current !== requestId) return;
      setMembersRequest({ projectId: String(projectId), members: [], loading: false });
      toast.error(getErrorMessage(error, "Couldn't load project members."));
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setMembersRequest({ projectId: "", members: [], loading: false });
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    if (isSubmitting) return;
    setIsCreateOpen(false);
    resetForm();
  };

  const openEditor = (task) => {
    window.clearTimeout(editorTimer.current);
    setForm({
      title: task.title,
      description: task.description || "",
      projectId: String(task.project_id || ""),
      tags: normalizeTaskTags(task.tags),
      priority: task.priority || "medium",
      dueDate: task.due_date || "",
      assigneeId: String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""),
      status: normalizeTaskStatus(task),
    });
    setEditingId(task.id);
    setIsEditorVisible(false);
    if (task.project_id) loadProjectMembers(task.project_id, String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""));
    window.requestAnimationFrame(() => setIsEditorVisible(true));
  };

  const closeEditor = () => {
    if (isSubmitting) return;
    setIsEditorVisible(false);
    editorTimer.current = window.setTimeout(() => { setEditingId(null); resetForm(); }, 300);
  };

  const saveTask = async (event) => {
    event.preventDefault();
    const tagsError = validateTaskTags(form.tags);
    if (tagsError) return toast.error(tagsError);
    const selectedAssigneeIsMember = !form.assigneeId || membersRequest.members.some((member) => Number(member.id) === Number(form.assigneeId));
    if (!selectedAssigneeIsMember) return toast.error("Choose an assignee who belongs to this project.");
    const payload = buildTaskPayload({ title: form.title.trim(), project_id: form.projectId }, {
      description: form.description.trim() || null,
      tags: form.tags,
      priority: form.priority,
      due_date: form.dueDate || null,
      assignee_user_id: form.assigneeId ? Number(form.assigneeId) : null,
      status: form.status,
    });
    setIsSubmitting(true);
    try {
      const response = editingId
        ? await instance.put(ENDPOINTS.UPDATE_TASK(editingId), payload)
        : await instance.post(ENDPOINTS.CREATE_TASK(), payload);
      setTasks((current) => editingId ? current.map((task) => task.id === editingId ? response.data : task) : [response.data, ...current]);
      setSavedTagSuggestions((current) => mergeTaskTagSuggestions(current, response.data.tags));
      toast.success(editingId ? "Task updated." : "Task added.");
      setIsSubmitting(false);
      if (editingId) closeEditor(); else closeCreate();
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the task."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (task, status) => {
    setUpdatingTaskId(task.id);
    try {
      const response = await instance.patch(ENDPOINTS.UPDATE_TASK_STATUS(task.id), { status });
      setTasks((current) => current.map((item) => item.id === task.id ? response.data : item));
      toast.success(`Moved “${task.title}” to ${status.replace("_", " ")}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the task status."));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await instance.delete(ENDPOINTS.DELETE_TASK(taskToDelete.id));
      setTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
      setTaskToDelete(null);
      toast.success("Task deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the task."));
    }
  };

  const completedCount = tasks.filter((task) => normalizeTaskStatus(task) === "done").length;
  const overdueCount = tasks.filter((task) => getDueDateState(task) === "overdue").length;
  let visibleTasks = tasks.filter((task) => taskMatchesPlanningView(task, filter, profile?.id));
  if (dueFilter === "dated") visibleTasks = visibleTasks.filter((task) => Boolean(task.due_date));
  if (dueFilter === "undated") visibleTasks = visibleTasks.filter((task) => !task.due_date);
  visibleTasks = sortTasksByDueDate(visibleTasks, dueSort);
  const editingTask = tasks.find((task) => task.id === editingId);
  const tagSuggestions = mergeTaskTagSuggestions(getTaskTagSuggestions(tasks), savedTagSuggestions);
  const viewLabels = { all: "All tasks", my: "My Tasks", today: "Today", upcoming: "Upcoming", overdue: "Overdue", open: "Open tasks", completed: "Completed tasks" };

  const planningFields = <TaskPlanningFields idPrefix={editingId ? "edit-task" : "new-task"} dueDate={form.dueDate} onDueDateChange={(dueDate) => setForm((current) => ({ ...current, dueDate }))} status={form.status} onStatusChange={(status) => setForm((current) => ({ ...current, status }))} assigneeId={form.assigneeId} onAssigneeChange={(assigneeId) => setForm((current) => ({ ...current, assigneeId }))} members={membersRequest.members} isMembersLoading={membersRequest.loading} />;
  const attributeFields = <TaskAttributeFields idPrefix={editingId ? "edit-task" : "new-task"} tags={form.tags} onTagsChange={(tags) => setForm((current) => ({ ...current, tags }))} tagSuggestions={tagSuggestions} priority={form.priority} onPriorityChange={(priority) => setForm((current) => ({ ...current, priority }))} />;

  const formContents = (
    <>
      <div><label htmlFor={editingId ? "edit-task-title" : "new-task-title"} className="mb-1.5 block text-sm font-semibold">Task title</label><input id={editingId ? "edit-task-title" : "new-task-title"} autoFocus required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
      <div className="mt-4"><label htmlFor={editingId ? "edit-task-project" : "new-task-project"} className="mb-1.5 block text-sm font-semibold">Project</label><select id={editingId ? "edit-task-project" : "new-task-project"} required value={form.projectId} onChange={(event) => loadProjectMembers(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
      <div className="mt-4"><label htmlFor={editingId ? "edit-task-description" : "new-task-description"} className="mb-1.5 block text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span></label><textarea id={editingId ? "edit-task-description" : "new-task-description"} rows={editingId ? 7 : 4} maxLength={1000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
      {planningFields}{attributeFields}
      {editingTask ? (
        <dl className="mt-8 space-y-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <div className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Created by</dt><dd>{getTaskUserName(editingTask.created_by)} · {formatDateTime(editingTask.created_at)}</dd></div>
          <div className="flex items-center gap-2"><RefreshCw aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Updated by</dt><dd>{getTaskUserName(editingTask.updated_by)} · {formatDateTime(editingTask.updated_at)}</dd></div>
        </dl>
      ) : null}
    </>
  );

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <header className="flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Planning workspace</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{viewLabels[filter] || "Tasks"}</h1><p className="mt-1 text-sm text-slate-600">Plan deadlines, ownership, and progress in one place.</p></div>
        <dl className="flex flex-wrap gap-2 text-xs"><div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><dt className="text-slate-500">Open</dt><dd className="text-lg font-bold tabular-nums">{tasks.length - completedCount}</dd></div><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><dt className="text-red-700">Overdue</dt><dd className="text-lg font-bold tabular-nums text-red-900">{overdueCount}</dd></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><dt className="text-emerald-700">Done</dt><dd className="text-lg font-bold tabular-nums text-emerald-900">{completedCount}</dd></div></dl>
      </header>

      <section aria-label="Task controls" className="flex flex-col gap-3 py-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label htmlFor="due-filter" className="mb-1 block text-xs font-bold text-slate-600">Due date</label><select id="due-filter" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="any">Any due date</option><option value="dated">Has due date</option><option value="undated">No due date</option></select></div>
          <div><label htmlFor="due-sort" className="mb-1 block text-xs font-bold text-slate-600">Sort</label><select id="due-sort" value={dueSort} onChange={(event) => setDueSort(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="none">Default order</option><option value="asc">Due date: soonest</option><option value="desc">Due date: latest</option></select></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-1" aria-label="Task layout"><button type="button" onClick={() => changeView("list")} aria-pressed={view === "list"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "list" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><List aria-hidden="true" className="size-4" />List</button><button type="button" onClick={() => changeView("board")} aria-pressed={view === "board"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "board" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><Columns3 aria-hidden="true" className="size-4" />Board</button></div>
          <button type="button" onClick={openCreate} disabled={isProjectsLoading || projects.length === 0} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus aria-hidden="true" className="size-4" />Add task</button>
        </div>
      </section>
      {!isProjectsLoading && projects.length === 0 ? <p className="mb-4 text-sm text-slate-600">Create a <Link to="/projects" className="font-bold text-emerald-800 underline">project</Link> before adding tasks.</p> : null}

      <section aria-labelledby="task-list-heading" className={view === "list" ? "bg-white shadow-sm ring-1 ring-slate-200" : ""}>
        <h2 id="task-list-heading" className="sr-only">{viewLabels[filter] || "Tasks"}</h2>
        {isLoading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading tasks...</div> : loadError ? <div className="grid min-h-44 place-items-center text-center"><div><p role="alert" className="font-semibold">{loadError}</p><button type="button" onClick={loadTasks} className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold focus-visible:outline-3 focus-visible:outline-emerald-800">Try again</button></div></div> : visibleTasks.length === 0 ? <div className="grid min-h-44 place-items-center bg-white px-5 text-center ring-1 ring-slate-200"><div>{filter === "overdue" ? <AlertTriangle aria-hidden="true" className="mx-auto size-8 text-emerald-700" /> : <Inbox aria-hidden="true" className="mx-auto size-8 text-slate-400" />}<p className="mt-3 font-semibold">No tasks in this view</p><p className="mt-1 text-sm text-slate-500">Try another planning view or due-date filter.</p></div></div> : view === "board" ? <TaskBoard tasks={visibleTasks} onStatusChange={updateStatus} onEdit={openEditor} onDelete={setTaskToDelete} updatingTaskId={updatingTaskId} /> : (
          <ul className="divide-y divide-slate-200">
            {visibleTasks.map((task) => <li key={task.id} className="flex items-start gap-2 px-2 py-3 sm:px-4"><button type="button" disabled={updatingTaskId === task.id} onClick={() => updateStatus(task, normalizeTaskStatus(task) === "done" ? "backlog" : "done")} aria-label={normalizeTaskStatus(task) === "done" ? `Move ${task.title} to backlog` : `Mark ${task.title} done`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-wait">{normalizeTaskStatus(task) === "done" ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}</button><div className="min-w-0 flex-1 py-1.5"><p className={`break-words text-sm font-semibold ${normalizeTaskStatus(task) === "done" ? "text-slate-500 line-through" : "text-slate-900"}`}>{task.title}</p>{task.description ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-500">{task.description}</p> : null}<div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={normalizeTaskStatus(task)} /><DueDateBadge dueDate={task.due_date} state={getDueDateState(task)} /><AssigneeBadge assignee={getTaskAssignee(task)} /><PriorityBadge priority={task.priority} /><TaskTags tags={task.tags} /></div><p className="mt-2 text-xs font-semibold text-emerald-800">{task.project_name || "Project task"}</p><dl className="mt-1.5 flex flex-col gap-1 text-[11px] text-slate-500 lg:flex-row lg:gap-4"><div className="flex items-center gap-1.5"><UserRound aria-hidden="true" className="size-3.5" /><dt className="sr-only">Created by</dt><dd>Created by {getTaskUserName(task.created_by)} · {formatDateTime(task.created_at)}</dd></div><div className="flex items-center gap-1.5"><RefreshCw aria-hidden="true" className="size-3.5" /><dt className="sr-only">Updated by</dt><dd>Updated by {getTaskUserName(task.updated_by)} · {formatDateTime(task.updated_at)}</dd></div></dl></div><button type="button" onClick={() => openEditor(task)} aria-label={`Edit ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button><button type="button" onClick={() => setTaskToDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button></li>)}
          </ul>
        )}
      </section>

      {isCreateOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeCreate(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><section role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="max-h-[calc(100svh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">New task</p><h2 id="create-task-title" className="text-lg font-semibold">Plan a task</h2></div><button type="button" onClick={closeCreate} disabled={isSubmitting} aria-label="Close task form" className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed"><X aria-hidden="true" className="size-5" /></button></header><form onSubmit={saveTask} className="p-5">{formContents}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeCreate} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:cursor-not-allowed">Cancel</button><button type="submit" disabled={isSubmitting || !form.title.trim() || !form.projectId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}{isSubmitting ? "Saving..." : "Add task"}</button></div></form></section></div> : null}

      {editingTask ? <div className={`fixed inset-0 z-50 flex justify-end bg-slate-950/45 transition-opacity motion-reduce:transition-none ${isEditorVisible ? "opacity-100" : "opacity-0"}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><aside role="dialog" aria-modal="true" aria-labelledby="edit-task-drawer-title" onKeyDown={(event) => { if (event.key === "Escape") closeEditor(); }} className={`flex h-svh w-full max-w-xl transform-gpu flex-col bg-white shadow-2xl transition-transform duration-300 motion-reduce:transition-none ${isEditorVisible ? "translate-x-0" : "translate-x-full"}`}><header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Task details</p><h2 id="edit-task-drawer-title" className="text-lg font-semibold">Edit task</h2></div><button type="button" onClick={closeEditor} disabled={isSubmitting} aria-label="Close task editor" className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed"><X aria-hidden="true" className="size-5" /></button></header><form onSubmit={saveTask} className="flex min-h-0 flex-1 flex-col"><div className="flex-1 overflow-y-auto p-5 sm:p-7">{formContents}</div><footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeEditor} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold disabled:cursor-not-allowed">Cancel</button><button type="submit" disabled={isSubmitting || !form.title.trim() || !form.projectId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}{isSubmitting ? "Saving..." : "Save changes"}</button></footer></form></aside></div> : null}

      {taskToDelete ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskToDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"><h2 id="delete-task-title" className="text-lg font-semibold">Delete task?</h2><p className="mt-2 text-sm leading-6 text-slate-600">“{taskToDelete.title}” will be permanently removed.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTaskToDelete(null)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold">Cancel</button><button type="button" onClick={deleteTask} className="min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 text-sm font-bold text-white">Delete task</button></div></section></div> : null}
    </main>
  );
};

export default Task;
