import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Inbox,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { useOutletContext } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const Task = () => {
  const { filter, onFilterChange } = useOutletContext();
  const [tasks, setTasks] = useState([]);
  const [inputTask, setInputTask] = useState("");
  const [editable, setEditable] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [loadError, setLoadError] = useState("");

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

  const addTask = async (event) => {
    event.preventDefault();
    const title = inputTask.trim();
    if (!title) return;

    setIsAdding(true);
    try {
      const response = await instance.post(ENDPOINTS.CREATE_TASK(), { title });
      setTasks((current) => [response.data, ...current]);
      setInputTask("");
      onFilterChange("all");
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't add the task."));
    } finally {
      setIsAdding(false);
    }
  };

  const startEditing = (task) => {
    setEditable(task.id);
    setEditTitle(task.title);
  };

  const saveTask = async (task) => {
    const title = editTitle.trim();
    if (!title) {
      toast.error("Task title cannot be empty.");
      return;
    }

    try {
      const response = await instance.put(ENDPOINTS.UPDATE_TASK(task.id), {
        ...task,
        title,
      });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? response.data : item)),
      );
      setEditable(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the task."));
    }
  };

  const completeTask = async (task) => {
    try {
      const response = await instance.put(ENDPOINTS.UPDATE_TASK(task.id), {
        ...task,
        completed: !task.completed,
      });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? response.data : item)),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the task."));
    }
  };

  const deleteTask = async (id) => {
    try {
      await instance.delete(ENDPOINTS.DELETE_TASK(id));
      setTasks((current) => current.filter((task) => task.id !== id));
      if (editable === id) setEditable(null);
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

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 border-b border-slate-300 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.14em] text-emerald-800 uppercase">Your workspace</p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Today&apos;s tasks</h1>
            <p className="mt-2 text-sm text-slate-600">Capture what matters, then work through it.</p>
          </div>
          <dl className="flex gap-6 text-sm sm:justify-end">
            <div>
              <dt className="text-slate-500">Open</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{openCount}</dd>
            </div>
            <div className="border-l border-slate-300 pl-6">
              <dt className="text-slate-500">Completed</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{completedCount}</dd>
            </div>
          </dl>
        </header>

        <section aria-labelledby="add-task-heading" className="py-7">
          <h2 id="add-task-heading" className="sr-only">Add a task</h2>
          <form onSubmit={addTask} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="new-task" className="sr-only">Task title</label>
            <input
              id="new-task"
              type="text"
              value={inputTask}
              onChange={(event) => setInputTask(event.target.value)}
              placeholder="What needs to be done?"
              maxLength={255}
              className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
            />
            <button
              type="submit"
              disabled={isAdding || !inputTask.trim()}
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#173b35] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAdding ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
              {isAdding ? "Adding..." : "Add task"}
            </button>
          </form>
        </section>

        <section aria-labelledby="task-list-heading" className="bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="flex items-center border-b border-slate-200 px-4 py-4 sm:px-5">
            <h2 id="task-list-heading" className="flex items-center gap-2 font-semibold">
              <ListTodo aria-hidden="true" className="size-5 text-emerald-800" />
              {filter === "all" ? "All tasks" : `${filter[0].toUpperCase()}${filter.slice(1)} tasks`}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-600" role="status">
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />
              Loading tasks...
            </div>
          ) : loadError ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <p className="font-semibold text-slate-900">{loadError}</p>
              <button type="button" onClick={loadTasks} className="mt-4 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                Try again
              </button>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              {filter === "completed" ? <CheckCircle2 aria-hidden="true" className="size-9 text-slate-400" /> : <Inbox aria-hidden="true" className="size-9 text-slate-400" />}
              <p className="mt-4 font-semibold">{tasks.length === 0 ? "No tasks yet" : `No ${filter} tasks`}</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                {tasks.length === 0 ? "Add your first task above to get started." : "Choose another filter to see your tasks."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {visibleTasks.map((task) => (
                <li key={task.id} className="group flex min-h-16 items-center gap-3 px-3 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => completeTask(task)}
                    aria-label={task.completed ? `Mark ${task.title} as open` : `Mark ${task.title} as completed`}
                    className="grid size-11 flex-none place-items-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                  >
                    {task.completed ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}
                  </button>

                  {editable === task.id ? (
                    <input
                      type="text"
                      aria-label="Edit task title"
                      autoFocus
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditable(null);
                      }}
                      maxLength={255}
                      className="h-11 min-w-0 flex-1 rounded-md border border-emerald-800 bg-white px-3 outline-none ring-3 ring-emerald-800/15"
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 break-words text-[15px] ${task.completed ? "text-slate-500 line-through decoration-slate-400" : "text-slate-800"}`}>
                      {task.title}
                    </span>
                  )}

                  <div className="flex flex-none items-center">
                    {editable === task.id ? (
                      <>
                        <button type="button" onClick={() => saveTask(task)} aria-label="Save task" className="grid size-11 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                          <Save aria-hidden="true" className="size-4" />
                        </button>
                        <button type="button" onClick={() => setEditable(null)} aria-label="Cancel editing" className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => startEditing(task)} aria-label={`Edit ${task.title}`} className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                        <Pencil aria-hidden="true" className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`} className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
};

export default Task;
