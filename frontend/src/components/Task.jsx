import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  CalendarClock,
  Circle,
  Inbox,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { useOutletContext } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";

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

const Task = () => {
  const { filter, onFilterChange } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [inputTask, setInputTask] = useState("");
  const [inputDescription, setInputDescription] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editable, setEditable] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const editorCloseTimer = useRef(null);

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
    let isCurrent = true;

    instance
      .get(ENDPOINTS.GET_TASKS())
      .then((response) => {
        if (isCurrent) setTasks(response.data);
      })
      .catch((error) => {
        if (isCurrent) {
          setLoadError(getErrorMessage(error, "We couldn't load your tasks."));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (editable === null) return undefined;

    const animationFrame = window.requestAnimationFrame(() => setIsEditorOpen(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [editable]);

  useEffect(() => () => window.clearTimeout(editorCloseTimer.current), []);

  const addTask = async (event) => {
    event.preventDefault();
    const title = inputTask.trim();
    if (!title) return;

    setIsAdding(true);
    try {
      const response = await instance.post(ENDPOINTS.CREATE_TASK(), {
        title,
        description: inputDescription.trim() || null,
      });
      setTasks((current) => [response.data, ...current]);
      setInputTask("");
      setInputDescription("");
      setIsAddModalOpen(false);
      onFilterChange("all");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't add the task."));
    } finally {
      setIsAdding(false);
    }
  };

  const closeAddModal = () => {
    if (isAdding) return;
    setInputTask("");
    setInputDescription("");
    setIsAddModalOpen(false);
  };

  const startEditing = (task) => {
    window.clearTimeout(editorCloseTimer.current);
    setIsEditorOpen(false);
    setEditable(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
  };

  const finishClosingEditor = () => {
    window.clearTimeout(editorCloseTimer.current);
    setEditable(null);
    setEditTitle("");
    setEditDescription("");
  };

  const animateEditorClosed = () => {
    setIsEditorOpen(false);
    editorCloseTimer.current = window.setTimeout(finishClosingEditor, 300);
  };

  const closeEditor = () => {
    if (isSaving) return;
    animateEditorClosed();
  };

  const saveTask = async (event, task) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) {
      toast.error("Task title cannot be empty.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await instance.put(ENDPOINTS.UPDATE_TASK(task.id), {
        title,
        description: editDescription.trim() || null,
        completed: task.completed,
      });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? response.data : item)),
      );
      animateEditorClosed();
      toast.success("Task updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const completeTask = async (task) => {
    try {
      const response = await instance.put(ENDPOINTS.UPDATE_TASK(task.id), {
        title: task.title,
        description: task.description,
        completed: !task.completed,
      });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? response.data : item)),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the task."));
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;

    try {
      await instance.delete(ENDPOINTS.DELETE_TASK(taskToDelete.id));
      setTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
      if (editable === taskToDelete.id) setEditable(null);
      setTaskToDelete(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the task."));
    }
  };

  let completedCount = 0;
  for (const task of tasks) {
    if (task.completed) completedCount += 1;
  }
  const openCount = tasks.length - completedCount;
  const visibleTasks = tasks.filter((task) => {
    if (filter === "open") return !task.completed;
    if (filter === "completed") return task.completed;
    return true;
  });
  const editingTask = tasks.find((task) => task.id === editable);

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Your workspace</p>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Today&apos;s tasks</h1>
            <p className="mt-1 text-sm text-slate-600">Capture what matters, then work through it.</p>
          </div>
          <dl className="flex gap-3 text-sm sm:justify-end">
            <div className="min-w-22 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <dt className="flex items-center gap-1.5 font-semibold text-amber-800"><Circle aria-hidden="true" className="size-3.5" />Open</dt>
              <dd className="text-lg font-semibold text-amber-950 tabular-nums">{openCount}</dd>
            </div>
            <div className="min-w-22 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <dt className="flex items-center gap-1.5 font-semibold text-emerald-800"><CheckCircle2 aria-hidden="true" className="size-3.5" />Completed</dt>
              <dd className="text-lg font-semibold text-emerald-950 tabular-nums">{completedCount}</dd>
            </div>
          </dl>
        </header>

        <section aria-labelledby="add-task-heading" className="py-4">
          <h2 id="add-task-heading" className="sr-only">Add a task</h2>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-800/40 bg-white px-4 text-sm font-bold text-emerald-900 shadow-sm hover:border-emerald-800 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 sm:ml-auto sm:w-auto"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add task
          </button>
        </section>

        <section aria-labelledby="task-list-heading" className="bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="flex min-h-11 items-center border-b border-slate-200 px-3 py-2 sm:px-4">
            <h2 id="task-list-heading" className="flex items-center gap-2 font-semibold">
              <ListTodo aria-hidden="true" className="size-5 text-emerald-800" />
              {filter === "all" ? "All tasks" : `${filter[0].toUpperCase()}${filter.slice(1)} tasks`}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-slate-600" role="status">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />
              Loading tasks...
            </div>
          ) : loadError ? (
            <div className="flex min-h-40 flex-col items-center justify-center px-5 text-center">
              <p className="font-semibold text-slate-900">{loadError}</p>
              <button type="button" onClick={loadTasks} className="mt-4 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                Try again
              </button>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-5 text-center">
              {filter === "completed" ? <CheckCircle2 aria-hidden="true" className="size-9 text-slate-400" /> : <Inbox aria-hidden="true" className="size-9 text-slate-400" />}
              <p className="mt-4 font-semibold">{tasks.length === 0 ? "No tasks yet" : `No ${filter} tasks`}</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                {tasks.length === 0 ? "Add your first task above to get started." : "Choose another filter to see your tasks."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {visibleTasks.map((task) => (
                <li key={task.id} className="group grid min-h-16 grid-cols-[44px_minmax(0,1fr)] items-start gap-x-2 gap-y-1 px-2 py-2 sm:flex sm:flex-nowrap sm:px-4">
                  <button
                    type="button"
                    onClick={() => completeTask(task)}
                    aria-label={task.completed ? `Mark ${task.title} as open` : `Mark ${task.title} as completed`}
                    className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                  >
                    {task.completed ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}
                  </button>

                  <div className="min-w-0 flex-1 pt-1.5">
                    <div>
                      <p className={`break-words text-[15px] ${task.completed ? "text-slate-500 line-through decoration-slate-400" : "text-slate-800"}`}>
                        {task.title}
                      </p>
                      {task.description ? (
                        <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 ${task.completed ? "text-slate-400" : "text-slate-600"}`}>
                          {task.description}
                        </p>
                      ) : null}
                    </div>

                    <dl className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-slate-500 lg:flex-row lg:gap-4">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock aria-hidden="true" className="size-3.5 flex-none" />
                        <dt className="sr-only">Created</dt>
                        <dd>Created {formatDateTime(task.created_at)}</dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RefreshCw aria-hidden="true" className="size-3.5 flex-none" />
                        <dt className="sr-only">Updated</dt>
                        <dd>Updated {formatDateTime(task.updated_at)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="col-start-2 flex flex-none items-center sm:ml-0">
                    <button type="button" onClick={() => startEditing(task)} aria-label={`Edit ${task.title}`} className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                      <Pencil aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => setTaskToDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isAddModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddModal();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeAddModal();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="add-task-modal-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">New task</p>
                <h2 id="add-task-modal-title" className="text-lg font-semibold text-slate-950">What needs to be done?</h2>
              </div>
              <button type="button" onClick={closeAddModal} disabled={isAdding} aria-label="Close add task dialog" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>

            <form onSubmit={addTask} className="p-5">
              <div>
                <label htmlFor="new-task" className="mb-1.5 block text-sm font-semibold text-slate-800">Task title</label>
                <input
                  id="new-task"
                  type="text"
                  autoFocus
                  required
                  value={inputTask}
                  onChange={(event) => setInputTask(event.target.value)}
                  placeholder="Enter a clear task title"
                  maxLength={255}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                />
              </div>

              <div className="mt-4">
                <label htmlFor="new-task-description" className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Description <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <textarea
                  id="new-task-description"
                  value={inputDescription}
                  onChange={(event) => setInputDescription(event.target.value)}
                  placeholder="Add context, notes, or a definition of done"
                  rows={4}
                  maxLength={1000}
                  className="min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                />
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeAddModal} disabled={isAdding} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isAdding || !inputTask.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {isAdding ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
                  {isAdding ? "Adding..." : "Add task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingTask ? (
          <div
            className={`fixed inset-0 z-50 flex justify-end bg-slate-950/45 transition-opacity duration-200 motion-reduce:transition-none ${isEditorOpen ? "opacity-100" : "opacity-0"}`}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeEditor();
            }}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-task-drawer-title"
              className={`flex h-svh w-full transform-gpu flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:max-w-xl sm:border-l sm:border-slate-200 ${isEditorOpen ? "translate-x-0" : "translate-x-full"}`}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeEditor();
              }}
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget && event.propertyName === "transform" && !isEditorOpen) {
                  finishClosingEditor();
                }
              }}
            >
              <div className="flex min-h-20 items-center justify-between border-b border-slate-200 px-5 sm:px-7">
                <div className="min-w-0 pr-4">
                  <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Task details</p>
                  <h2 id="edit-task-drawer-title" className="truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">Edit task</h2>
                </div>
                <button type="button" onClick={closeEditor} disabled={isSaving} aria-label="Close task editor" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>

              <form onSubmit={(event) => saveTask(event, editingTask)} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
                  <div>
                    <label htmlFor="edit-task-title" className="mb-1.5 block text-sm font-semibold text-slate-800">Task title</label>
                    <input
                      id="edit-task-title"
                      type="text"
                      autoFocus
                      required
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      maxLength={255}
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                    />
                  </div>

                  <div className="mt-6">
                    <label htmlFor="edit-task-description" className="mb-1.5 block text-sm font-semibold text-slate-800">
                      Description <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      id="edit-task-description"
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      placeholder="Add context, notes, or a definition of done"
                      maxLength={1000}
                      className="min-h-52 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
                    />
                    <p className="mt-1.5 text-right text-xs text-slate-500">{editDescription.length}/1000</p>
                  </div>

                  <dl className="mt-8 space-y-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <CalendarClock aria-hidden="true" className="size-4 flex-none" />
                      <dt className="font-semibold text-slate-700">Created</dt>
                      <dd>{formatDateTime(editingTask.created_at)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <RefreshCw aria-hidden="true" className="size-4 flex-none" />
                      <dt className="font-semibold text-slate-700">Updated</dt>
                      <dd>{formatDateTime(editingTask.updated_at)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                  <button type="button" onClick={closeEditor} disabled={isSaving} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isSaving || !editTitle.trim()} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
                    {isSaving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            </aside>
          </div>
      ) : null}

      {taskToDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTaskToDelete(null);
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10">
            <h2 id="delete-task-title" className="text-lg font-semibold text-slate-950">Delete task?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">&quot;{taskToDelete.title}&quot; will be permanently removed. This action cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTaskToDelete(null)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Cancel</button>
              <button type="button" onClick={deleteTask} className="min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-700">Delete task</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default Task;
