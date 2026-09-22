import { useEffect, useRef, useState } from "react";
import { Check, Circle, FileDown, ListTodo, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const ProjectTaskList = ({ projectId, projectName }) => {
  const [taskRequest, setTaskRequest] = useState({ projectId: null, tasks: [], error: "" });
  const [editingTask, setEditingTask] = useState(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isEditDrawerVisible, setIsEditDrawerVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const editDrawerCloseTimer = useRef(null);

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
    setIsCreateFormOpen(true);
  };

  const openEditForm = (task) => {
    window.clearTimeout(editDrawerCloseTimer.current);
    setIsEditDrawerVisible(false);
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
  };

  const closeCreateForm = () => {
    if (isSubmitting) return;
    setIsCreateFormOpen(false);
    setTitle("");
    setDescription("");
  };

  const finishClosingEditDrawer = () => {
    window.clearTimeout(editDrawerCloseTimer.current);
    setEditingTask(null);
    setTitle("");
    setDescription("");
  };

  const animateEditDrawerClosed = () => {
    setIsEditDrawerVisible(false);
    editDrawerCloseTimer.current = window.setTimeout(finishClosingEditDrawer, 300);
  };

  const closeEditDrawer = () => {
    if (isSubmitting) return;
    animateEditDrawerClosed();
  };

  const saveTask = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setIsSubmitting(true);
    const payload = {
      title: cleanTitle,
      description: description.trim() || null,
      completed: editingTask?.completed || false,
      project_id: Number(projectId),
    };

    try {
      const response = editingTask
        ? await instance.put(ENDPOINTS.UPDATE_TASK(editingTask.id), payload)
        : await instance.post(ENDPOINTS.CREATE_TASK(), payload);
      setTaskRequest((current) => ({
        ...current,
        tasks: editingTask
          ? current.tasks.map((task) => task.id === editingTask.id ? response.data : task)
          : [response.data, ...current.tasks],
      }));
      toast.success(editingTask ? "Task updated." : "Task added to the project.");
      if (editingTask) {
        animateEditDrawerClosed();
      } else {
        setIsCreateFormOpen(false);
        setTitle("");
        setDescription("");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the task."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      const response = await instance.put(ENDPOINTS.UPDATE_TASK(task.id), {
        title: task.title,
        description: task.description,
        completed: !task.completed,
        project_id: Number(projectId),
      });
      setTaskRequest((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? response.data : item),
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the task."));
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

  const openCount = tasks.filter((task) => !task.completed).length;

  return (
    <>
      <section aria-labelledby="project-tasks-heading" className="mb-5 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div>
            <h2 id="project-tasks-heading" className="flex items-center gap-2 font-semibold"><ListTodo aria-hidden="true" className="size-5 text-emerald-800" />Project tasks</h2>
            {!isLoading && !taskRequest.error ? <p className="mt-0.5 text-xs text-slate-500">{openCount} open, {tasks.length - openCount} completed</p> : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
        ) : (
          <ul className="divide-y divide-slate-200">
            {tasks.map((task) => (
              <li key={task.id} className="flex min-h-16 items-start gap-2 px-2 py-2 sm:px-4">
                <button type="button" onClick={() => toggleTask(task)} aria-label={task.completed ? `Mark ${task.title} as open` : `Mark ${task.title} as completed`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-emerald-800">{task.completed ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}</button>
                <div className="min-w-0 flex-1 py-2"><p className={`break-words text-sm font-semibold ${task.completed ? "text-slate-500 line-through" : "text-slate-800"}`}>{task.title}</p>{task.description ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-500">{task.description}</p> : null}</div>
                <button type="button" onClick={() => openEditForm(task)} aria-label={`Edit ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button>
                <button type="button" onClick={() => setTaskToDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCreateFormOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateForm(); }} onKeyDown={(event) => { if (event.key === "Escape") closeCreateForm(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="project-task-form-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{projectName}</p><h2 id="project-task-form-title" className="text-lg font-semibold">Add project task</h2></div><button type="button" onClick={closeCreateForm} disabled={isSubmitting} aria-label="Close task form" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button></div>
            <form onSubmit={saveTask} className="p-5">
              <div><label htmlFor="project-task-title" className="mb-1.5 block text-sm font-semibold">Task title</label><input id="project-task-title" autoFocus required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
              <div className="mt-4"><label htmlFor="project-task-description" className="mb-1.5 block text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span></label><textarea id="project-task-description" rows={4} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
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
            className={`flex h-svh w-full transform-gpu flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:max-w-xl sm:border-l sm:border-slate-200 ${isEditDrawerVisible ? "translate-x-0" : "translate-x-full"}`}
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
                <h2 id="edit-project-task-drawer-title" className="text-xl font-semibold tracking-[-0.025em] text-slate-950">Edit task</h2>
              </div>
              <button type="button" onClick={closeEditDrawer} disabled={isSubmitting} aria-label="Close task editor" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>

            <form onSubmit={saveTask} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
                <div>
                  <label htmlFor="edit-project-task-title" className="mb-1.5 block text-sm font-semibold text-slate-800">Task title</label>
                  <input id="edit-project-task-title" type="text" autoFocus required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base shadow-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                </div>
                <div className="mt-6">
                  <label htmlFor="edit-project-task-description" className="mb-1.5 block text-sm font-semibold text-slate-800">Description <span className="font-normal text-slate-500">(optional)</span></label>
                  <textarea id="edit-project-task-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, notes, or a definition of done" maxLength={1000} className="min-h-52 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                  <p className="mt-1.5 text-right text-xs text-slate-500">{description.length}/1000</p>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button type="button" onClick={closeEditDrawer} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting || !title.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
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
