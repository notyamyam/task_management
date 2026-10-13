import { useEffect, useRef, useState } from "react";
import { Check, Circle, Columns3, FileDown, List, ListTodo, LoaderCircle, Maximize2, Minimize2, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";
import {
  AssigneeBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
  TaskAttributeFields,
  TaskEditableOverview,
  TaskPlanningFields,
  TaskTags,
} from "./TaskAttributes";
import TaskBoard from "./TaskBoard";
import TaskCollaboration from "./TaskCollaboration";
import { buildTaskPayload, getDueDateState, getTaskAssignee, getTaskListBackground, normalizeTaskStatus } from "./taskPlanning";
import {
  getTaskTagSuggestions,
  getTaskUserName,
  mergeTaskTagSuggestions,
  normalizeTaskTags,
  validateTaskTags,
} from "./taskUtils";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : DATE_TIME_FORMATTER.format(date);
};

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const ProjectTaskList = ({ projectId, projectName, members = [], userKey = "user", currentUserId }) => {
  const [taskRequest, setTaskRequest] = useState({ projectId: null, tasks: [], error: "" });
  const [savedTagSuggestions, setSavedTagSuggestions] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isEditDrawerVisible, setIsEditDrawerVisible] = useState(false);
  const [isEditFullscreen, setIsEditFullscreen] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState("idle");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState([]);
  const [priority, setPriority] = useState(null);
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState("backlog");
  const [view, setView] = useState(() => localStorage.getItem(`project-task-view:${userKey}`) || "list");
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const editDrawerCloseTimer = useRef(null);
  const editValuesRef = useRef({ title: "", description: "", tags: [], priority: null, dueDate: "", assigneeId: "", status: "backlog" });
  const autoSaveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let isCurrent = true;

    instance.get(ENDPOINTS.GET_TASKS(projectId))
      .then((response) => {
        if (isCurrent) setTaskRequest({ projectId, tasks: response.data, error: "" });
      })
      .catch((error) => {
        if (isCurrent) {
          setTaskRequest({
            projectId,
            tasks: [],
            error: getErrorMessage(error, "We couldn't load this project's tasks."),
          });
        }
      });

    return () => { isCurrent = false; };
  }, [projectId]);

  useEffect(() => {
    let isCurrent = true;

    instance.get(ENDPOINTS.GET_TASK_TAG_RECOMMENDATIONS())
      .then((response) => {
        if (isCurrent) setSavedTagSuggestions(normalizeTaskTags(response.data));
      })
      .catch(() => {
        // Loaded project tasks still provide local recommendations if this request fails.
      });

    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!editingTask) return undefined;

    const animationFrame = window.requestAnimationFrame(() => setIsEditDrawerVisible(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [editingTask]);

  useEffect(() => () => window.clearTimeout(editDrawerCloseTimer.current), []);

  const tasks = taskRequest.projectId === projectId ? taskRequest.tasks : [];
  const isLoading = taskRequest.projectId !== projectId;

  const openCreateForm = () => {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setTags([]);
    setPriority(null);
    setDueDate("");
    setAssigneeId("");
    setStatus("backlog");
    setIsCreateFormOpen(true);
  };

  const openEditForm = (task) => {
    window.clearTimeout(editDrawerCloseTimer.current);
    setIsEditDrawerVisible(false);
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setTags(normalizeTaskTags(task.tags));
    setPriority(task.priority ?? null);
    setDueDate(task.due_date || "");
    setAssigneeId(String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""));
    setStatus(normalizeTaskStatus(task));
    editValuesRef.current = {
      title: task.title,
      description: task.description || "",
      tags: normalizeTaskTags(task.tags),
      priority: task.priority ?? null,
      dueDate: task.due_date || "",
      assigneeId: String(task.assignee_user_id ?? getTaskAssignee(task)?.id ?? ""),
      status: normalizeTaskStatus(task),
    };
    autoSaveQueue.current = Promise.resolve();
    setAutoSaveState("idle");
    setIsEditFullscreen(false);
  };

  const closeCreateForm = () => {
    if (isSubmitting) return;
    setIsCreateFormOpen(false);
    setTitle("");
    setDescription("");
    setTags([]);
    setPriority(null);
    setDueDate("");
    setAssigneeId("");
    setStatus("backlog");
  };

  const finishClosingEditDrawer = () => {
    window.clearTimeout(editDrawerCloseTimer.current);
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setTags([]);
    setPriority(null);
    setDueDate("");
    setAssigneeId("");
    setStatus("backlog");
  };

  const animateEditDrawerClosed = () => {
    setIsEditDrawerVisible(false);
    editDrawerCloseTimer.current = window.setTimeout(finishClosingEditDrawer, 300);
  };

  const closeEditDrawer = () => {
    animateEditDrawerClosed();
  };

  const applyEditValues = (values) => {
    setTitle(values.title);
    setDescription(values.description);
    setTags(values.tags);
    setPriority(values.priority);
    setDueDate(values.dueDate);
    setAssigneeId(values.assigneeId);
    setStatus(values.status);
  };

  const autoSaveTask = (changes) => {
    if (!editingTask) return;
    const nextValues = { ...editValuesRef.current, ...changes };
    const tagsError = validateTaskTags(nextValues.tags);
    if (tagsError) return toast.error(tagsError);
    if (!nextValues.title.trim()) return;
    if (nextValues.assigneeId && !members.some((member) => Number(member.id) === Number(nextValues.assigneeId))) {
      return toast.error("Choose an assignee who belongs to this project.");
    }

    editValuesRef.current = nextValues;
    applyEditValues(nextValues);
    setAutoSaveState("saving");
    const taskId = editingTask.id;
    const payload = buildTaskPayload(editingTask, {
      title: nextValues.title.trim(),
      description: nextValues.description.trim() || null,
      project_id: Number(projectId),
      tags: nextValues.tags,
      priority: nextValues.priority,
      due_date: nextValues.dueDate || null,
      assignee_user_id: nextValues.assigneeId ? Number(nextValues.assigneeId) : null,
      status: nextValues.status,
    });
    const request = autoSaveQueue.current.catch(() => undefined).then(() => instance.put(ENDPOINTS.UPDATE_TASK(taskId), payload));
    autoSaveQueue.current = request;
    request.then((response) => {
      setTaskRequest((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? response.data : task) }));
      setSavedTagSuggestions((current) => mergeTaskTagSuggestions(current, response.data.tags));
      if (autoSaveQueue.current === request) setAutoSaveState("saved");
    }).catch((error) => {
      if (autoSaveQueue.current === request) setAutoSaveState("error");
      toast.error(getErrorMessage(error, "Couldn't save this change."));
    });
  };

  const saveTask = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const tagsError = validateTaskTags(tags);
    if (tagsError) {
      toast.error(tagsError);
      return;
    }

    setIsSubmitting(true);
    if (assigneeId && !members.some((member) => Number(member.id) === Number(assigneeId))) {
      toast.error("Choose an assignee who belongs to this project.");
      setIsSubmitting(false);
      return;
    }
    const payload = buildTaskPayload({ title: cleanTitle, project_id: projectId }, {
      title: cleanTitle,
      description: description.trim() || null,
      project_id: Number(projectId),
      tags,
      priority,
      due_date: dueDate || null,
      assignee_user_id: assigneeId ? Number(assigneeId) : null,
      status,
    });

    try {
      const response = await instance.post(ENDPOINTS.CREATE_TASK(), payload);
      setTaskRequest((current) => ({
        ...current,
        tasks: [response.data, ...current.tasks],
      }));
      setSavedTagSuggestions((current) => mergeTaskTagSuggestions(current, response.data.tags));
      toast.success("Task added to the project.");
      setIsCreateFormOpen(false);
      setTitle("");
      setDescription("");
      setTags([]);
      setPriority(null);
      setDueDate("");
      setAssigneeId("");
      setStatus("backlog");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the task."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (task, nextStatus) => {
    setUpdatingTaskId(task.id);
    try {
      const response = await instance.patch(ENDPOINTS.UPDATE_TASK_STATUS(task.id), { status: nextStatus });
      setTaskRequest((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? response.data : item),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the task."));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      await instance.delete(ENDPOINTS.DELETE_TASK(taskToDelete.id));
      setTaskRequest((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskToDelete.id),
      }));
      setTaskToDelete(null);
      toast.success("Task deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the task."));
    } finally {
      setIsDeleting(false);
    }
  };

  const retryTasks = async () => {
    setTaskRequest({ projectId: null, tasks: [], error: "" });
    try {
      const response = await instance.get(ENDPOINTS.GET_TASKS(projectId));
      setTaskRequest({ projectId, tasks: response.data, error: "" });
    } catch (error) {
      setTaskRequest({
        projectId,
        tasks: [],
        error: getErrorMessage(error, "We couldn't load this project's tasks."),
      });
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const response = await instance.post(
        ENDPOINTS.AI_PROJECT_TASK_REPORT(projectId),
        null,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      const filename = `${projectName.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "project"}-task-report.csv`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("AI task report downloaded.");
    } catch (error) {
      let message = "Couldn't generate the AI task report.";
      if (error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          if (typeof payload.detail === "string") message = payload.detail;
        } catch {
          // Keep the safe fallback when the blob is not JSON.
        }
      }
      toast.error(message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const openCount = tasks.filter((task) => normalizeTaskStatus(task) !== "done").length;
  const tagSuggestions = mergeTaskTagSuggestions(getTaskTagSuggestions(tasks), savedTagSuggestions);

  return (
    <>
      <section aria-labelledby="project-tasks-heading" className="mb-5 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div>
            <h2 id="project-tasks-heading" className="flex items-center gap-2 font-semibold"><ListTodo aria-hidden="true" className="size-5 text-emerald-800" />Project tasks</h2>
            {!isLoading && !taskRequest.error ? <p className="mt-0.5 text-xs text-slate-500">{openCount} open, {tasks.length - openCount} completed</p> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-1" aria-label="Project task layout">
              <button type="button" onClick={() => { setView("list"); localStorage.setItem(`project-task-view:${userKey}`, "list"); }} aria-pressed={view === "list"} className={`grid size-9 cursor-pointer place-items-center rounded-md focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "list" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><List aria-hidden="true" className="size-4" /><span className="sr-only">List view</span></button>
              <button type="button" onClick={() => { setView("board"); localStorage.setItem(`project-task-view:${userKey}`, "board"); }} aria-pressed={view === "board"} className={`grid size-9 cursor-pointer place-items-center rounded-md focus-visible:outline-3 focus-visible:outline-emerald-800 ${view === "board" ? "bg-[#173b35] text-white" : "text-slate-600 hover:bg-slate-100"}`}><Columns3 aria-hidden="true" className="size-4" /><span className="sr-only">Board view</span></button>
            </div>
            <button type="button" onClick={generateReport} disabled={isGeneratingReport} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              {isGeneratingReport ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <FileDown aria-hidden="true" className="size-4 text-emerald-800" />}
              {isGeneratingReport ? "Generating..." : "AI CSV report"}
            </button>
            <button type="button" onClick={openCreateForm} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><Plus aria-hidden="true" className="size-4" />Add task</button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading project tasks...</div>
        ) : taskRequest.error ? (
          <div className="grid min-h-40 place-items-center px-5 text-center"><div><p className="font-semibold">{taskRequest.error}</p><button type="button" onClick={retryTasks} className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800">Try again</button></div></div>
        ) : tasks.length === 0 ? (
          <div className="grid min-h-44 place-items-center px-5 text-center"><div><ListTodo aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">No tasks in this project</p><p className="mt-1 text-sm text-slate-500">Add the first task for your project team.</p></div></div>
        ) : view === "board" ? (
          <div className="p-3"><TaskBoard tasks={tasks} onStatusChange={updateStatus} onEdit={openEditForm} onDelete={setTaskToDelete} updatingTaskId={updatingTaskId} /></div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {tasks.map((task) => (
              <li key={task.id} className={`flex min-h-16 items-start gap-2 px-2 py-2 transition-colors sm:px-4 ${getTaskListBackground(task)}`}>
                <button type="button" disabled={updatingTaskId === task.id} onClick={() => updateStatus(task, normalizeTaskStatus(task) === "done" ? "backlog" : "done")} aria-label={normalizeTaskStatus(task) === "done" ? `Move ${task.title} to backlog` : `Mark ${task.title} done`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/70 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-wait">{normalizeTaskStatus(task) === "done" ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}</button>
                <div className="min-w-0 flex-1 py-2">
                  <p className={`break-words text-sm font-semibold ${normalizeTaskStatus(task) === "done" ? "text-slate-500 line-through" : "text-slate-800"}`}>{task.title}</p>
                  {task.description ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-500">{task.description}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5"><StatusBadge status={normalizeTaskStatus(task)} /><DueDateBadge dueDate={task.due_date} state={getDueDateState(task)} /><AssigneeBadge assignee={getTaskAssignee(task)} /><PriorityBadge priority={task.priority} /><TaskTags tags={task.tags} /></div>
                  <dl className="mt-2 flex flex-col gap-1 text-[11px] text-slate-500 xl:flex-row xl:gap-4">
                    <div className="flex items-center gap-1.5"><UserRound aria-hidden="true" className="size-3.5 flex-none" /><dt className="sr-only">Created by</dt><dd>Created by {getTaskUserName(task.created_by)} · {formatDateTime(task.created_at)}</dd></div>
                    <div className="flex items-center gap-1.5"><RefreshCw aria-hidden="true" className="size-3.5 flex-none" /><dt className="sr-only">Updated by</dt><dd>Updated by {getTaskUserName(task.updated_by)} · {formatDateTime(task.updated_at)}</dd></div>
                  </dl>
                </div>
                <button type="button" onClick={() => openEditForm(task)} aria-label={`Edit ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-white/70 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button>
                <button type="button" onClick={() => setTaskToDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCreateFormOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateForm(); }} onKeyDown={(event) => { if (event.key === "Escape") closeCreateForm(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="project-task-form-title" className="max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{projectName}</p><h2 id="project-task-form-title" className="text-lg font-semibold">Add project task</h2></div><button type="button" onClick={closeCreateForm} disabled={isSubmitting} aria-label="Close task form" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button></div>
            <form onSubmit={saveTask} className="p-5">
              <div><label htmlFor="project-task-title" className="mb-1.5 block text-sm font-semibold">Task title</label><input id="project-task-title" autoFocus required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
              <div className="mt-4"><label htmlFor="project-task-description" className="mb-1.5 block text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span></label><textarea id="project-task-description" rows={4} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
              <TaskPlanningFields idPrefix="project-task" dueDate={dueDate} onDueDateChange={setDueDate} status={status} onStatusChange={setStatus} assigneeId={assigneeId} onAssigneeChange={setAssigneeId} members={members} />
              <TaskAttributeFields idPrefix="project-task" tags={tags} onTagsChange={setTags} tagSuggestions={tagSuggestions} priority={priority} onPriorityChange={setPriority} />
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeCreateForm} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting || !title.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}{isSubmitting ? "Saving..." : "Add task"}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {editingTask ? (
        <div
          className={`fixed inset-0 z-50 flex justify-end bg-slate-950/45 transition-opacity duration-200 motion-reduce:transition-none ${isEditDrawerVisible ? "opacity-100" : "opacity-0"}`}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditDrawer();
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-project-task-drawer-title"
            className={`flex h-svh w-full transform-gpu flex-col bg-white shadow-2xl transition-[transform,max-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:border-l sm:border-slate-200 ${isEditFullscreen ? "max-w-none" : "sm:max-w-xl"} ${isEditDrawerVisible ? "translate-x-0" : "translate-x-full"}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeEditDrawer();
            }}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "transform" && !isEditDrawerVisible) {
                finishClosingEditDrawer();
              }
            }}
          >
            <div className="flex min-h-20 items-center justify-between border-b border-slate-200 px-5 sm:px-7">
              <div className="min-w-0 pr-4">
                <p className="truncate text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{projectName}</p>
                <div className="flex items-center gap-2"><h2 id="edit-project-task-drawer-title" className="text-xl font-semibold tracking-[-0.025em] text-slate-950">Edit task</h2><span role="status" className={`text-[11px] font-semibold ${autoSaveState === "error" ? "text-red-700" : "text-slate-400"}`}>{autoSaveState === "saving" ? "Saving..." : autoSaveState === "saved" ? "Saved" : autoSaveState === "error" ? "Save failed" : "Autosaves"}</span></div>
              </div>
              <div className="flex"><button type="button" onClick={() => setIsEditFullscreen((current) => !current)} aria-label={isEditFullscreen ? "Exit fullscreen task view" : "Open fullscreen task view"} title={isEditFullscreen ? "Exit fullscreen" : "Fullscreen"} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">{isEditFullscreen ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}</button><button type="button" onClick={closeEditDrawer} aria-label="Close task editor" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-5" /></button></div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className={`flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8 ${isEditFullscreen ? "mx-auto w-full max-w-5xl" : ""}`}>
                <TaskEditableOverview idPrefix="edit-project-task" title={title} description={description} onTitleChange={(nextTitle) => autoSaveTask({ title: nextTitle })} onDescriptionChange={(nextDescription) => autoSaveTask({ description: nextDescription })} priority={priority} onPriorityChange={(nextPriority) => autoSaveTask({ priority: nextPriority })} />
                <TaskPlanningFields idPrefix="edit-project-task" dueDate={dueDate} onDueDateChange={(nextDueDate) => autoSaveTask({ dueDate: nextDueDate })} status={status} onStatusChange={(nextStatus) => autoSaveTask({ status: nextStatus })} assigneeId={assigneeId} onAssigneeChange={(nextAssigneeId) => autoSaveTask({ assigneeId: nextAssigneeId })} members={members} compactStatus />
                <TaskAttributeFields idPrefix="edit-project-task" tags={tags} onTagsChange={(nextTags) => autoSaveTask({ tags: nextTags })} tagSuggestions={tagSuggestions} priority={priority} onPriorityChange={(nextPriority) => autoSaveTask({ priority: nextPriority })} showPriority={false} compactTags />
                <dl className="mt-8 space-y-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
                  <div className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Created by</dt><dd>{getTaskUserName(editingTask.created_by)} · {formatDateTime(editingTask.created_at)}</dd></div>
                  <div className="flex items-center gap-2"><RefreshCw aria-hidden="true" className="size-4 flex-none" /><dt className="font-semibold text-slate-700">Updated by</dt><dd>{getTaskUserName(editingTask.updated_by)} · {formatDateTime(editingTask.updated_at)}</dd></div>
                </dl>
                <TaskCollaboration key={editingTask.id} taskId={editingTask.id} members={members} currentUserId={currentUserId} />
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {taskToDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setTaskToDelete(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-project-task-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10"><h2 id="delete-project-task-title" className="text-lg font-semibold">Delete task?</h2><p className="mt-2 text-sm leading-6 text-slate-600">&quot;{taskToDelete.title}&quot; will be permanently removed from this project.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setTaskToDelete(null)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="button" disabled={isDeleting} onClick={deleteTask} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-3 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}{isDeleting ? "Deleting..." : "Delete task"}</button></div></section>
        </div>
      ) : null}
    </>
  );
};

export default ProjectTaskList;
