export const TASK_STATUSES = [
  { value: "backlog", label: "Backlog", dot: "bg-slate-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-blue-500" },
  { value: "blocked", label: "Blocked", dot: "bg-amber-500" },
  { value: "done", label: "Done", dot: "bg-emerald-600" },
];

export const normalizeTaskStatus = (task) => {
  if (TASK_STATUSES.some((status) => status.value === task?.status)) return task.status;
  return task?.completed ? "done" : "backlog";
};

export const getTaskAssignee = (task) => task?.assignee ?? task?.assigned_to ?? null;

export const getLocalDateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const getDueDateState = (task, now = new Date()) => {
  if (!task?.due_date || normalizeTaskStatus(task) === "done") return null;
  const today = getLocalDateKey(now);
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  const approaching = new Date(now);
  approaching.setDate(approaching.getDate() + 7);
  if (task.due_date <= getLocalDateKey(approaching)) return "approaching";
  return "upcoming";
};

export const taskMatchesPlanningView = (task, view, userId) => {
  const status = normalizeTaskStatus(task);
  const dueState = getDueDateState(task);
  if (view === "open") return status !== "done";
  if (view === "completed") return status === "done";
  if (view === "today") return dueState === "today";
  if (view === "upcoming") return dueState === "approaching" || dueState === "upcoming";
  if (view === "overdue") return dueState === "overdue";
  if (view === "my") return Number(getTaskAssignee(task)?.id ?? task.assignee_user_id) === Number(userId);
  return true;
};

export const sortTasksByDueDate = (tasks, direction) => {
  if (direction === "none") return tasks;
  return [...tasks].sort((left, right) => {
    if (!left.due_date) return 1;
    if (!right.due_date) return -1;
    const result = left.due_date.localeCompare(right.due_date);
    return direction === "asc" ? result : -result;
  });
};

export const buildTaskPayload = (task, overrides = {}) => {
  const status = overrides.status ?? normalizeTaskStatus(task);
  return {
    title: overrides.title ?? task.title,
    description: Object.hasOwn(overrides, "description") ? overrides.description : task.description,
    completed: status === "done",
    project_id: Number(overrides.project_id ?? task.project_id),
    tags: overrides.tags ?? task.tags ?? [],
    priority: overrides.priority ?? task.priority ?? "medium",
    due_date: Object.hasOwn(overrides, "due_date") ? overrides.due_date : task.due_date ?? null,
    assignee_user_id: Object.hasOwn(overrides, "assignee_user_id") ? overrides.assignee_user_id : task.assignee_user_id ?? getTaskAssignee(task)?.id ?? null,
    status,
  };
};
