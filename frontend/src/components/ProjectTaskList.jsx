import { useEffect, useState } from "react";
import { Check, Circle, ListTodo, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const ProjectTaskList = ({ projectId, projectName }) => {
  const [taskRequest, setTaskRequest] = useState({ projectId: null, tasks: [], error: "" });
  const [editingTask, setEditingTask] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const tasks = taskRequest.projectId === projectId ? taskRequest.tasks : [];
  const isLoading = taskRequest.projectId !== projectId;

  const openCreateForm = () => {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setIsFormOpen(true);
  };

  const openEditForm = (task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setIsFormOpen(false);
    setEditingTask(null);
    setTitle("");
    setDescription("");
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
      setIsFormOpen(false);
      setEditingTask(null);
      setTitle("");
      setDescription("");
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

  const openCount = tasks.filter((task) => !task.completed).length;

  return (
    <>
      <section aria-labelledby="project-tasks-heading" className="mb-5 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div>
            <h2 id="project-tasks-heading" className="flex items-center gap-2 font-semibold"><ListTodo aria-hidden="true" className="size-5 text-emerald-800" />Project tasks</h2>
            {!isLoading && !taskRequest.error ? <p className="mt-0.5 text-xs text-slate-500">{openCount} open, {tasks.length - openCount} completed</p> : null}
          </div>
          <button type="button" onClick={openCreateForm} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><Plus aria-hidden="true" className="size-4" />Add task</button>
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

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }} onKeyDown={(event) => { if (event.key === "Escape") closeForm(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="project-task-form-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{projectName}</p><h2 id="project-task-form-title" className="text-lg font-semibold">{editingTask ? "Edit task" : "Add project task"}</h2></div><button type="button" onClick={closeForm} disabled={isSubmitting} aria-label="Close task form" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button></div>
            <form onSubmit={saveTask} className="p-5">
              <div><label htmlFor="project-task-title" className="mb-1.5 block text-sm font-semibold">Task title</label><input id="project-task-title" autoFocus required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
              <div className="mt-4"><label htmlFor="project-task-description" className="mb-1.5 block text-sm font-semibold">Description <span className="font-normal text-slate-500">(optional)</span></label><textarea id="project-task-description" rows={4} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeForm} disabled={isSubmitting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting || !title.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : editingTask ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}{isSubmitting ? "Saving..." : editingTask ? "Save changes" : "Add task"}</button></div>
            </form>
          </section>
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
