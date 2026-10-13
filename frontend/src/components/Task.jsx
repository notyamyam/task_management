import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Circle, Columns3, Inbox, List, LoaderCircle, Maximize2, Minimize2, Pencil, Plus, RefreshCw, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "react-toastify";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";
import TaskBoard from "./TaskBoard";
import TaskCollaboration from "./TaskCollaboration";
import { AssigneeBadge, DueDateBadge, PriorityBadge, StatusBadge, TaskAttributeFields, TaskEditableOverview, TaskPlanningFields, TaskTags } from "./TaskAttributes";
import { getTaskTagSuggestions, getTaskUserName, mergeTaskTagSuggestions, normalizeTaskTags, validateTaskTags } from "./taskUtils";
import { buildTaskPayload, getDueDateState, getTaskAssignee, getTaskListBackground, normalizeTaskStatus, sortTasksByDueDate, taskMatchesPlanningView } from "./taskPlanning";

const getErrorMessage = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;
const emptyForm = { title: "", description: "", projectId: "", tags: [], priority: null, dueDate: "", assigneeId: "", status: "backlog" };
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? DATE_TIME_FORMATTER.format(new Date(value)) : "Not available";

const buildTaskRequest = (queryKey, filter) => {
  const params = Object.fromEntries(new URLSearchParams(queryKey).entries());
  const page = Number(params.page) || 1;
  const [sortBy = "updated_at", sortOrder = "desc"] = (params.sort || "updated_at:desc").split(":");
  delete params.sort;
  if (filter !== "open") {
    params.page = page;
    params.page_size = 12;
  } else {
    delete params.page;
  }
  params.sort_by = sortBy;
  params.sort_order = sortOrder;
  if (params.assignee === "unassigned") params.unassigned = true;
  else if (params.assignee) params.assignee_user_id = params.assignee;
  delete params.assignee;
  if (filter === "my") {
    delete params.assignee_user_id;
    delete params.unassigned;
  }
  if (filter === "completed") params.status = "done";
  return { endpoint: filter === "my" ? ENDPOINTS.GET_MY_TASKS() : ENDPOINTS.GET_TASKS(), params, page };
};

const Task = () => {
  const { filter, onFilterChange, profile, projects, isProjectsLoading } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [savedTagSuggestions, setSavedTagSuggestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState("idle");
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("search") || "");
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 12, totalPages: 1 });
  const [filterMembers, setFilterMembers] = useState([]);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [membersRequest, setMembersRequest] = useState({ projectId: "", members: [], loading: false });
  const [view, setView] = useState(() => localStorage.getItem(`task-view:${profile?.id ?? profile?.email ?? "user"}`) || "list");
  const editorTimer = useRef(null);
  const memberRequestId = useRef(0);
  const editFormRef = useRef(emptyForm);
  const autoSaveQueue = useRef(Promise.resolve());
  const queryKey = searchParams.toString();
  const projectFilter = searchParams.get("project_id") || "";

  const setQueryValue = (name, value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value); else next.delete(name);
      if (name !== "page") next.delete("page");
      return next;
    });
  };

  const setFacetedQueryValue = (name, value) => {
    if (name === "status" && ["open", "completed"].includes(filter)) onFilterChange("all");
    setQueryValue(name, value);
  };

  const setProjectValue = (value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("project_id", value); else next.delete("project_id");
      next.delete("assignee");
      next.delete("page");
      return next;
    });
  };

  const loadTasks = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const request = buildTaskRequest(queryKey, filter);
      const response = await instance.get(request.endpoint, { params: request.params });
      setTasks(response.data);
      setPagination({
        total: Number(response.headers["x-total-count"]) || response.data.length,
        page: Number(response.headers["x-page"]) || request.page,
        pageSize: Number(response.headers["x-page-size"]) || 12,
        totalPages: Math.max(1, Number(response.headers["x-total-pages"]) || 1),
      });
    } catch (error) {
      setLoadError(getErrorMessage(error, "We couldn't load your tasks."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let current = true;
    const request = buildTaskRequest(queryKey, filter);
    Promise.resolve().then(() => {
      if (current) {
        setIsLoading(true);
        setLoadError("");
      }
    });
    Promise.allSettled([
      instance.get(request.endpoint, { params: request.params }),
      instance.get(ENDPOINTS.GET_TASK_TAG_RECOMMENDATIONS()),
    ]).then(([taskResult, tagResult]) => {
      if (!current) return;
      if (taskResult.status === "fulfilled") {
        setTasks(taskResult.value.data);
        setPagination({
          total: Number(taskResult.value.headers["x-total-count"]) || taskResult.value.data.length,
          page: Number(taskResult.value.headers["x-page"]) || request.page,
          pageSize: Number(taskResult.value.headers["x-page-size"]) || 12,
          totalPages: Math.max(1, Number(taskResult.value.headers["x-total-pages"]) || 1),
        });
      }
      else setLoadError(getErrorMessage(taskResult.reason, "We couldn't load your tasks."));
      if (tagResult.status === "fulfilled") setSavedTagSuggestions(normalizeTaskTags(tagResult.value.data));
      setIsLoading(false);
    });
    return () => { current = false; };
  }, [filter, queryKey]);

  useEffect(() => {
    const syncSearchFromHistory = () => {
      setSearchDraft(new URLSearchParams(window.location.search).get("search") || "");
    };
    window.addEventListener("popstate", syncSearchFromHistory);
    return () => window.removeEventListener("popstate", syncSearchFromHistory);
  }, []);

  useEffect(() => {
    if (!projectFilter) return undefined;
    let current = true;
    instance.get(ENDPOINTS.GET_PROJECT(projectFilter)).then((response) => {
      if (current) setFilterMembers([response.data.owner, ...(response.data.members || [])].filter(Boolean));
    }).catch(() => {
      if (current) setFilterMembers([]);
    });
    return () => { current = false; };
  }, [projectFilter]);

  useEffect(() => {
    if (projects.length === 0) return undefined;
    let current = true;
    Promise.all(projects.map((project) => instance.get(ENDPOINTS.GET_PROJECT(project.id))))
      .then((responses) => {
        if (!current) return;
        const people = responses.flatMap((response) => [response.data.owner, ...(response.data.members || [])]).filter(Boolean);
        setWorkspaceMembers([...new Map(people.map((user) => [user.id, user])).values()]);
      })
      .catch(() => {
        // Assignees visible on the current task page remain available if a project detail request fails.
      });
    return () => { current = false; };
  }, [projects]);

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
    const nextForm = {
      title: task.title,
      description: task.description || "",
      projectId: String(task.project_id || ""),
      tags: normalizeTaskTags(task.tags),
      priority: task.priority ?? null,
      dueDate: task.due_date || "",
      assigneeId: String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""),
      status: normalizeTaskStatus(task),
    };
    editFormRef.current = nextForm;
    autoSaveQueue.current = Promise.resolve();
    setForm(nextForm);
    setEditingId(task.id);
    setAutoSaveState("idle");
    setIsEditorFullscreen(false);
    setIsEditorVisible(false);
    if (task.project_id) loadProjectMembers(task.project_id, String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""));
    window.requestAnimationFrame(() => setIsEditorVisible(true));
  };

  const closeEditor = () => {
    setIsEditorVisible(false);
    editorTimer.current = window.setTimeout(() => { setEditingId(null); resetForm(); }, 300);
  };

  const autoSaveTask = (changes, allowedMembers = membersRequest.members) => {
    if (!editingId) return;
    const nextForm = { ...editFormRef.current, ...changes };
    const tagsError = validateTaskTags(nextForm.tags);
    if (tagsError) return toast.error(tagsError);
    if (!nextForm.title.trim() || !nextForm.projectId) return;
    if (nextForm.assigneeId && allowedMembers.length > 0 && !allowedMembers.some((member) => Number(member.id) === Number(nextForm.assigneeId))) {
      return toast.error("Choose an assignee who belongs to this project.");
    }

    editFormRef.current = nextForm;
    setForm(nextForm);
    setAutoSaveState("saving");
    const taskId = editingId;
    const payload = buildTaskPayload({ title: nextForm.title.trim(), project_id: nextForm.projectId }, {
      description: nextForm.description.trim() || null,
      tags: nextForm.tags,
      priority: nextForm.priority,
      due_date: nextForm.dueDate || null,
      assignee_user_id: nextForm.assigneeId ? Number(nextForm.assigneeId) : null,
      status: nextForm.status,
    });
    const request = autoSaveQueue.current.catch(() => undefined).then(() => instance.put(ENDPOINTS.UPDATE_TASK(taskId), payload));
    autoSaveQueue.current = request;
    request.then((response) => {
      setTasks((current) => current.map((task) => task.id === taskId ? response.data : task));
      setSavedTagSuggestions((current) => mergeTaskTagSuggestions(current, response.data.tags));
      if (autoSaveQueue.current === request) setAutoSaveState("saved");
    }).catch((error) => {
      if (autoSaveQueue.current === request) setAutoSaveState("error");
      toast.error(getErrorMessage(error, "Couldn't save this change."));
    });
  };

  const changeEditingProject = async (projectId) => {
    if (!projectId) return;
    const requestId = memberRequestId.current + 1;
    memberRequestId.current = requestId;
    setMembersRequest({ projectId: String(projectId), members: [], loading: true });
    try {
      const response = await instance.get(ENDPOINTS.GET_PROJECT(projectId));
      if (memberRequestId.current !== requestId) return;
      const members = [response.data.owner, ...(response.data.members || [])].filter(Boolean);
      const currentAssigneeId = editFormRef.current.assigneeId;
      const assigneeId = members.some((member) => Number(member.id) === Number(currentAssigneeId)) ? currentAssigneeId : "";
      setMembersRequest({ projectId: String(projectId), members, loading: false });
      autoSaveTask({ projectId: String(projectId), assigneeId }, members);
    } catch (error) {
      if (memberRequestId.current === requestId) setMembersRequest({ projectId: String(projectId), members: [], loading: false });
      toast.error(getErrorMessage(error, "Couldn't change the task project."));
    }
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
      const response = await instance.post(ENDPOINTS.CREATE_TASK(), payload);
      setTasks((current) => [response.data, ...current]);
      setSavedTagSuggestions((current) => mergeTaskTagSuggestions(current, response.data.tags));
      toast.success("Task added.");
      await loadTasks();
      setIsSubmitting(false);
      closeCreate();
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
      await loadTasks();
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
      await loadTasks();
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the task."));
    }
  };

  const completedCount = tasks.filter((task) => normalizeTaskStatus(task) === "done").length;
  const overdueCount = tasks.filter((task) => getDueDateState(task) === "overdue").length;
  let visibleTasks = tasks.filter((task) => taskMatchesPlanningView(task, filter, profile?.id));
  visibleTasks = sortTasksByDueDate(visibleTasks, "none");
  const editingTask = tasks.find((task) => task.id === editingId);
  const tagSuggestions = mergeTaskTagSuggestions(getTaskTagSuggestions(tasks), savedTagSuggestions);
  const assigneeOptions = projectFilter
    ? filterMembers
    : [...new Map([profile, ...workspaceMembers, ...tasks.map(getTaskAssignee)].filter(Boolean).map((user) => [user.id, user])).values()];
  const viewLabels = { all: "All tasks", my: "My Tasks", open: "Open tasks", completed: "Completed tasks" };

  const planningFields = <TaskPlanningFields idPrefix={editingId ? "edit-task" : "new-task"} dueDate={form.dueDate} onDueDateChange={(dueDate) => editingId ? autoSaveTask({ dueDate }) : setForm((current) => ({ ...current, dueDate }))} status={form.status} onStatusChange={(status) => editingId ? autoSaveTask({ status }) : setForm((current) => ({ ...current, status }))} assigneeId={form.assigneeId} onAssigneeChange={(assigneeId) => editingId ? autoSaveTask({ assigneeId }) : setForm((current) => ({ ...current, assigneeId }))} members={membersRequest.members} isMembersLoading={membersRequest.loading} compactStatus={Boolean(editingId)} />;
  const attributeFields = <TaskAttributeFields idPrefix={editingId ? "edit-task" : "new-task"} tags={form.tags} onTagsChange={(tags) => editingId ? autoSaveTask({ tags }) : setForm((current) => ({ ...current, tags }))} tagSuggestions={tagSuggestions} priority={form.priority} onPriorityChange={(priority) => editingId ? autoSaveTask({ priority }) : setForm((current) => ({ ...current, priority }))} showPriority={!editingId} compactTags={Boolean(editingId)} />;

  const formContents = (
    <>
      {editingId ? <TaskEditableOverview idPrefix="edit-task" title={form.title} description={form.description} onTitleChange={(title) => autoSaveTask({ title })} onDescriptionChange={(description) => autoSaveTask({ description })} priority={form.priority} onPriorityChange={(priority) => autoSaveTask({ priority })} /> : <div><label htmlFor="new-task-title" className="mb-1.5 block text-sm font-semibold">Task title</label><input id="new-task-title" autoFocus required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>}
      <div className="mt-4"><label htmlFor={editingId ? "edit-task-project" : "new-task-project"} className="mb-1.5 block text-sm font-semibold">Project</label><select id={editingId ? "edit-task-project" : "new-task-project"} required value={form.projectId} onChange={(event) => editingId ? changeEditingProject(event.target.value) : loadProjectMembers(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
      {!editingId ? <div className="mt-4"><label htmlFor="new-task-description" className="mb-1.5 block text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span></label><textarea id="new-task-description" rows={4} maxLength={1000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div> : null}
      {planningFields}{attributeFields}
      {editingTask ? (
        <dl className="mt-8 space-y-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <div className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Created by</dt><dd>{getTaskUserName(editingTask.created_by)} · {formatDateTime(editingTask.created_at)}</dd></div>
          <div className="flex items-center gap-2"><RefreshCw aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Updated by</dt><dd>{getTaskUserName(editingTask.updated_by)} · {formatDateTime(editingTask.updated_at)}</dd></div>
        </dl>
      ) : null}
      {editingTask ? <TaskCollaboration key={editingTask.id} taskId={editingTask.id} members={membersRequest.members} currentUserId={profile?.id} /> : null}
    </>
  );

  return (
    <main className="min-w-0 flex-1 overflow-x-hidden bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <header className="flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Planning workspace</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{viewLabels[filter] || "Tasks"}</h1><p className="mt-1 text-sm text-slate-600">Plan deadlines, ownership, and progress in one place.</p></div>
        <dl className="flex flex-wrap gap-2 text-xs"><div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><dt className="text-slate-500">Matches</dt><dd className="text-lg font-bold tabular-nums">{pagination.total}</dd></div><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><dt className="text-red-700">Overdue here</dt><dd className="text-lg font-bold tabular-nums text-red-900">{overdueCount}</dd></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><dt className="text-emerald-700">Done here</dt><dd className="text-lg font-bold tabular-nums text-emerald-900">{completedCount}</dd></div></dl>
      </header>

      <section aria-label="Task controls" className="flex flex-col gap-3 py-4 xl:flex-row xl:items-end xl:justify-between">
        <form onSubmit={(event) => { event.preventDefault(); setQueryValue("search", searchDraft.trim()); }} className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2"><label htmlFor="task-search" className="mb-1 block text-xs font-bold text-slate-600">Search tasks</label><div className="flex"><input id="task-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Title or description" className="h-11 min-w-0 flex-1 rounded-l-lg border border-r-0 border-slate-300 bg-white px-3 text-sm outline-none focus:z-10 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /><button type="submit" aria-label="Search tasks" className="grid size-11 cursor-pointer place-items-center rounded-r-lg bg-[#173b35] text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><Search aria-hidden="true" className="size-4" /></button></div></div>
          <div><label htmlFor="project-filter" className="mb-1 block text-xs font-bold text-slate-600">Project</label><select id="project-filter" value={projectFilter} onChange={(event) => setProjectValue(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
          <div><label htmlFor="assignee-filter" className="mb-1 block text-xs font-bold text-slate-600">Assignee</label><select id="assignee-filter" value={filter === "my" ? String(profile?.id || "") : searchParams.get("assignee") || ""} disabled={filter === "my"} onChange={(event) => setQueryValue("assignee", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">Anyone</option><option value="unassigned">Unassigned</option>{assigneeOptions.map((member) => <option key={member.id} value={member.id}>{getTaskUserName(member)}</option>)}</select></div>
          <div><label htmlFor="status-filter" className="mb-1 block text-xs font-bold text-slate-600">Status</label><select id="status-filter" value={filter === "open" ? "__open" : filter === "completed" ? "done" : searchParams.get("status") || ""} onChange={(event) => setFacetedQueryValue("status", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Any status</option>{filter === "open" ? <option value="__open">Any open status</option> : null}<option value="backlog">Backlog</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div>
          <div><label htmlFor="priority-filter" className="mb-1 block text-xs font-bold text-slate-600">Priority</label><select id="priority-filter" value={searchParams.get("priority") || ""} onChange={(event) => setQueryValue("priority", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Any priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
          <div><label htmlFor="tag-filter" className="mb-1 block text-xs font-bold text-slate-600">Tag</label><select id="tag-filter" value={searchParams.get("tag") || ""} onChange={(event) => setQueryValue("tag", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Any tag</option>{savedTagSuggestions.map((tag) => <option key={tag.name.toLocaleLowerCase()} value={tag.name}>{tag.name}</option>)}</select></div>
          <div><label htmlFor="due-filter" className="mb-1 block text-xs font-bold text-slate-600">Due date</label><select id="due-filter" value={searchParams.get("due") || ""} onChange={(event) => setFacetedQueryValue("due", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Any due date</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="overdue">Overdue</option><option value="dated">Has due date</option><option value="undated">No due date</option></select></div>
          <div><label htmlFor="task-sort" className="mb-1 block text-xs font-bold text-slate-600">Sort</label><select id="task-sort" value={searchParams.get("sort") || "updated_at:desc"} onChange={(event) => setQueryValue("sort", event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="updated_at:desc">Recently updated</option><option value="created_at:desc">Newest created</option><option value="due_date:asc">Due date: soonest</option><option value="priority:desc">Priority: highest</option><option value="status:asc">Status</option><option value="title:asc">Title A–Z</option></select></div>
          {queryKey ? <button type="button" onClick={() => { setSearchDraft(""); setSearchParams({}); }} className="min-h-11 cursor-pointer self-end rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800">Clear filters</button> : null}
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-1" aria-label="Task layout"><button type="button" onClick={() => changeView("list")} aria-pressed={view === "list"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "list" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><List aria-hidden="true" className="size-4" />List</button><button type="button" onClick={() => changeView("board")} aria-pressed={view === "board"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "board" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><Columns3 aria-hidden="true" className="size-4" />Board</button></div>
          <button type="button" onClick={openCreate} disabled={isProjectsLoading || projects.length === 0} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus aria-hidden="true" className="size-4" />Add task</button>
        </div>
      </section>

      {!isProjectsLoading && projects.length === 0 ? <p className="mb-4 text-sm text-slate-600">Create a <Link to="/projects" className="font-bold text-emerald-800 underline">project</Link> before adding tasks.</p> : null}

      <section aria-labelledby="task-list-heading" className={view === "list" ? "bg-white shadow-sm ring-1 ring-slate-200" : ""}>
        <h2 id="task-list-heading" className="sr-only">{viewLabels[filter] || "Tasks"}</h2>
        {isLoading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading tasks...</div> : loadError ? <div className="grid min-h-44 place-items-center text-center"><div><p role="alert" className="font-semibold">{loadError}</p><button type="button" onClick={loadTasks} className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold focus-visible:outline-3 focus-visible:outline-emerald-800">Try again</button></div></div> : visibleTasks.length === 0 ? <div className="grid min-h-44 place-items-center bg-white px-5 text-center ring-1 ring-slate-200"><div>{searchParams.get("due") === "overdue" ? <AlertTriangle aria-hidden="true" className="mx-auto size-8 text-emerald-700" /> : <Inbox aria-hidden="true" className="mx-auto size-8 text-slate-400" />}<p className="mt-3 font-semibold">No tasks in this view</p><p className="mt-1 text-sm text-slate-500">Try another planning view or due-date filter.</p></div></div> : view === "board" ? <TaskBoard tasks={visibleTasks} onStatusChange={updateStatus} onEdit={openEditor} onDelete={setTaskToDelete} updatingTaskId={updatingTaskId} /> : (
          <ul className="divide-y divide-slate-200">
            {visibleTasks.map((task) => <li key={task.id} className={`flex items-start gap-2 px-2 py-3 transition-colors sm:px-4 ${getTaskListBackground(task)}`}><button type="button" disabled={updatingTaskId === task.id} onClick={() => updateStatus(task, normalizeTaskStatus(task) === "done" ? "backlog" : "done")} aria-label={normalizeTaskStatus(task) === "done" ? `Move ${task.title} to backlog` : `Mark ${task.title} done`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/70 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-wait">{normalizeTaskStatus(task) === "done" ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}</button><div className="min-w-0 flex-1 py-1.5"><p className={`break-words text-sm font-semibold ${normalizeTaskStatus(task) === "done" ? "text-slate-500 line-through" : "text-slate-900"}`}>{task.title}</p>{task.description ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-500">{task.description}</p> : null}<div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={normalizeTaskStatus(task)} /><DueDateBadge dueDate={task.due_date} state={getDueDateState(task)} /><AssigneeBadge assignee={getTaskAssignee(task)} /><PriorityBadge priority={task.priority} /><TaskTags tags={task.tags} /></div><p className="mt-2 text-xs font-semibold text-emerald-800">{task.project_name || "Project task"}</p><dl className="mt-1.5 flex flex-col gap-1 text-[11px] text-slate-500 lg:flex-row lg:gap-4"><div className="flex items-center gap-1.5"><UserRound aria-hidden="true" className="size-3.5" /><dt className="sr-only">Created by</dt><dd>Created by {getTaskUserName(task.created_by)} · {formatDateTime(task.created_at)}</dd></div><div className="flex items-center gap-1.5"><RefreshCw aria-hidden="true" className="size-3.5" /><dt className="sr-only">Updated by</dt><dd>Updated by {getTaskUserName(task.updated_by)} · {formatDateTime(task.updated_at)}</dd></div></dl></div><button type="button" onClick={() => openEditor(task)} aria-label={`Edit ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-white/70 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button><button type="button" onClick={() => setTaskToDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button></li>)}
          </ul>
        )}
      </section>
      {!isLoading && !loadError && pagination.totalPages > 1 ? <nav aria-label="Task pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pt-4"><p className="text-xs text-slate-600">Page <strong className="text-slate-900">{pagination.page}</strong> of {pagination.totalPages} · {pagination.total} tasks</p><div className="flex gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => setQueryValue("page", String(pagination.page - 1))} className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft aria-hidden="true" className="size-4" />Previous</button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setQueryValue("page", String(pagination.page + 1))} className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight aria-hidden="true" className="size-4" /></button></div></nav> : null}

      {isCreateOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeCreate(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><section role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="max-h-[calc(100svh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">New task</p><h2 id="create-task-title" className="text-lg font-semibold">Plan a task</h2></div><button type="button" onClick={closeCreate} disabled={isSubmitting} aria-label="Close task form" className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed"><X aria-hidden="true" className="size-5" /></button></header><form onSubmit={saveTask} className="p-5">{formContents}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeCreate} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:cursor-not-allowed">Cancel</button><button type="submit" disabled={isSubmitting || !form.title.trim() || !form.projectId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}{isSubmitting ? "Saving..." : "Add task"}</button></div></form></section></div> : null}

      {editingTask ? <div className={`fixed inset-0 z-50 flex justify-end bg-slate-950/45 transition-opacity motion-reduce:transition-none ${isEditorVisible ? "opacity-100" : "opacity-0"}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><aside role="dialog" aria-modal="true" aria-labelledby="edit-task-drawer-title" onKeyDown={(event) => { if (event.key === "Escape") closeEditor(); }} className={`flex h-svh w-full transform-gpu flex-col bg-white shadow-2xl transition-[transform,max-width] duration-300 motion-reduce:transition-none ${isEditorFullscreen ? "max-w-none" : "max-w-xl"} ${isEditorVisible ? "translate-x-0" : "translate-x-full"}`}><header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Task details</p><div className="flex items-center gap-2"><h2 id="edit-task-drawer-title" className="text-lg font-semibold">Edit task</h2><span role="status" className={`text-[11px] font-semibold ${autoSaveState === "error" ? "text-red-700" : "text-slate-400"}`}>{autoSaveState === "saving" ? "Saving..." : autoSaveState === "saved" ? "Saved" : autoSaveState === "error" ? "Save failed" : "Autosaves"}</span></div></div><div className="flex"><button type="button" onClick={() => setIsEditorFullscreen((current) => !current)} aria-label={isEditorFullscreen ? "Exit fullscreen task view" : "Open fullscreen task view"} title={isEditorFullscreen ? "Exit fullscreen" : "Fullscreen"} className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800">{isEditorFullscreen ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}</button><button type="button" onClick={closeEditor} aria-label="Close task editor" className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-5" /></button></div></header><div className={`flex-1 overflow-y-auto p-5 sm:p-7 ${isEditorFullscreen ? "mx-auto w-full max-w-5xl" : ""}`}>{formContents}</div></aside></div> : null}

      {taskToDelete ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskToDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"><h2 id="delete-task-title" className="text-lg font-semibold">Delete task?</h2><p className="mt-2 text-sm leading-6 text-slate-600">“{taskToDelete.title}” will be permanently removed.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTaskToDelete(null)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold">Cancel</button><button type="button" onClick={deleteTask} className="min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 text-sm font-bold text-white">Delete task</button></div></section></div> : null}
    </main>
  );
};

export default Task;
