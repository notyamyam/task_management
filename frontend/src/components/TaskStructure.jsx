import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Circle, GitBranch, Link2, ListChecks, LoaderCircle, Plus, Trash2, UserRound } from "lucide-react";

import { ENDPOINTS, instance } from "./api";
import { normalizeTaskStatus } from "./taskPlanning";
import { getTaskUserName } from "./taskUtils";

const getErrorMessage = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;
const getDependencyTask = (dependency) => dependency.blocked_by_task || dependency.blocking_task || dependency.blocker_task || dependency.task;
const isSubtaskDone = (subtask) => subtask.completed === true || subtask.status === "done";
const getSummary = (subtasks, dependencies) => ({
  subtask_count: subtasks.length,
  completed_subtask_count: subtasks.filter(isSubtaskDone).length,
  unresolved_dependency_count: dependencies.filter((item) => normalizeTaskStatus(getDependencyTask(item)) !== "done").length,
});

export const TaskStructureBadges = ({ task }) => {
  const total = Number(task.subtask_count ?? task.subtasks_total ?? 0);
  const completed = Number(task.completed_subtask_count ?? task.subtasks_completed ?? 0);
  const unresolved = Number(task.unresolved_dependency_count ?? task.blocked_by_count ?? 0);
  return (total || unresolved) ? <>
    {total ? <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700"><ListChecks aria-hidden="true" className="size-3" />{completed}/{total} subtasks</span> : null}
    {unresolved ? <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900"><GitBranch aria-hidden="true" className="size-3" />Blocked by {unresolved}</span> : null}
  </> : null;
};

const TaskStructure = ({ task, members = [], onSummaryChange }) => {
  const summaryCallbackRef = useRef(onSummaryChange);
  const [subtasks, setSubtasks] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("");
  const [subtaskDueDate, setSubtaskDueDate] = useState("");
  const [blockingTaskId, setBlockingTaskId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const publishSummary = (nextSubtasks, nextDependencies) => summaryCallbackRef.current?.(getSummary(nextSubtasks, nextDependencies));

  useEffect(() => {
    summaryCallbackRef.current = onSummaryChange;
  }, [onSummaryChange]);

  const loadStructure = async () => {
    setIsLoading(true);
    setError("");
    const [subtaskResult, dependencyResult, taskResult] = await Promise.allSettled([
      instance.get(ENDPOINTS.GET_TASK_SUBTASKS(task.id)),
      instance.get(ENDPOINTS.GET_TASK_DEPENDENCIES(task.id)),
      instance.get(ENDPOINTS.GET_TASKS(task.project_id)),
    ]);
    const nextSubtasks = subtaskResult.status === "fulfilled" ? subtaskResult.value.data : [];
    const rawDependencies = dependencyResult.status === "fulfilled" ? dependencyResult.value.data : [];
    const nextDependencies = Array.isArray(rawDependencies) ? rawDependencies : rawDependencies.blocked_by || [];
    if (subtaskResult.status === "fulfilled") setSubtasks(nextSubtasks);
    if (dependencyResult.status === "fulfilled") setDependencies(nextDependencies);
    if (taskResult.status === "fulfilled") setProjectTasks(taskResult.value.data);
    const rejected = [subtaskResult, dependencyResult, taskResult].find((result) => result.status === "rejected");
    if (rejected) setError(getErrorMessage(rejected.reason, "We couldn't load subtasks and dependencies."));
    publishSummary(nextSubtasks, nextDependencies);
    setIsLoading(false);
  };

  useEffect(() => {
    let current = true;
    Promise.allSettled([
      instance.get(ENDPOINTS.GET_TASK_SUBTASKS(task.id)),
      instance.get(ENDPOINTS.GET_TASK_DEPENDENCIES(task.id)),
      instance.get(ENDPOINTS.GET_TASKS(task.project_id)),
    ]).then(([subtaskResult, dependencyResult, taskResult]) => {
      if (!current) return;
      const nextSubtasks = subtaskResult.status === "fulfilled" ? subtaskResult.value.data : [];
      const rawDependencies = dependencyResult.status === "fulfilled" ? dependencyResult.value.data : [];
      const nextDependencies = Array.isArray(rawDependencies) ? rawDependencies : rawDependencies.blocked_by || [];
      setSubtasks(nextSubtasks);
      setDependencies(nextDependencies);
      if (taskResult.status === "fulfilled") setProjectTasks(taskResult.value.data);
      const rejected = [subtaskResult, dependencyResult, taskResult].find((result) => result.status === "rejected");
      if (rejected) setError(getErrorMessage(rejected.reason, "We couldn't load subtasks and dependencies."));
      summaryCallbackRef.current?.(getSummary(nextSubtasks, nextDependencies));
      setIsLoading(false);
    });
    return () => { current = false; };
  }, [task.id, task.project_id]);

  const addSubtask = async (event) => {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    setBusyKey("add-subtask");
    setError("");
    try {
      const response = await instance.post(ENDPOINTS.CREATE_TASK_SUBTASK(task.id), {
        title,
        assignee_user_id: subtaskAssigneeId ? Number(subtaskAssigneeId) : null,
        due_date: subtaskDueDate || null,
      });
      const next = [...subtasks, response.data];
      setSubtasks(next);
      setSubtaskTitle(""); setSubtaskAssigneeId(""); setSubtaskDueDate("");
      publishSummary(next, dependencies);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't add the subtask."));
    } finally { setBusyKey(""); }
  };

  const updateSubtask = async (subtask, updates) => {
    setBusyKey(`subtask-${subtask.id}`);
    setError("");
    try {
      const response = await instance.patch(ENDPOINTS.UPDATE_TASK_SUBTASK(task.id, subtask.id), {
        title: subtask.title,
        completed: isSubtaskDone(subtask),
        assignee_user_id: subtask.assignee_user_id ?? subtask.assignee?.id ?? null,
        due_date: subtask.due_date || null,
        ...updates,
      });
      const next = subtasks.map((item) => item.id === subtask.id ? response.data : item);
      setSubtasks(next);
      publishSummary(next, dependencies);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't update the subtask."));
    } finally { setBusyKey(""); }
  };

  const addDependency = async (event) => {
    event.preventDefault();
    if (!blockingTaskId) return;
    setBusyKey("add-dependency");
    setError("");
    try {
      const response = await instance.post(ENDPOINTS.CREATE_TASK_DEPENDENCY(task.id), { blocked_by_task_id: Number(blockingTaskId) });
      const next = [...dependencies, response.data];
      setDependencies(next);
      setBlockingTaskId("");
      publishSummary(subtasks, next);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't add this dependency."));
    } finally { setBusyKey(""); }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusyKey(`delete-${pendingDelete.kind}-${pendingDelete.item.id}`);
    setError("");
    try {
      if (pendingDelete.kind === "subtask") {
        await instance.delete(ENDPOINTS.DELETE_TASK_SUBTASK(task.id, pendingDelete.item.id));
        const next = subtasks.filter((item) => item.id !== pendingDelete.item.id);
        setSubtasks(next); publishSummary(next, dependencies);
      } else {
        await instance.delete(ENDPOINTS.DELETE_TASK_DEPENDENCY(task.id, pendingDelete.item.id));
        const next = dependencies.filter((item) => item.id !== pendingDelete.item.id);
        setDependencies(next); publishSummary(subtasks, next);
      }
      setPendingDelete(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, `We couldn't remove this ${pendingDelete.kind}.`));
    } finally { setBusyKey(""); }
  };

  const selectedDependencyIds = new Set(dependencies.map((item) => Number(getDependencyTask(item)?.id)));
  const dependencyOptions = projectTasks.filter((item) => item.id !== task.id && !selectedDependencyIds.has(Number(item.id)));
  const completedCount = subtasks.filter(isSubtaskDone).length;
  const progress = subtasks.length ? Math.round((completedCount / subtasks.length) * 100) : 0;

  return (
    <section aria-labelledby={`task-structure-${task.id}`} className="mt-8 border-t border-slate-200 pt-6">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Break down the work</p><h3 id={`task-structure-${task.id}`} className="mt-0.5 text-base font-semibold">Subtasks & dependencies</h3></div>{subtasks.length ? <p className="text-xs font-bold text-slate-600">{completedCount}/{subtasks.length} complete</p> : null}</div>
      {subtasks.length ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Subtask completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="h-full rounded-full bg-emerald-700 transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
      {error ? <div role="alert" className="mt-4 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800"><p>{error}</p><button type="button" onClick={loadStructure} className="mt-1 min-h-9 cursor-pointer font-bold underline focus-visible:outline-2 focus-visible:outline-red-700">Try again</button></div> : null}
      {isLoading ? <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Loading task plan...</div> : <>
        <div className="mt-5"><h4 className="flex items-center gap-2 text-sm font-bold"><ListChecks aria-hidden="true" className="size-4 text-emerald-800" />Checklist</h4>
          {subtasks.length ? <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-200">{subtasks.map((subtask) => <li key={subtask.id} className="py-3"><div className="flex items-start gap-2"><button type="button" disabled={Boolean(busyKey)} onClick={() => updateSubtask(subtask, { completed: !isSubtaskDone(subtask) })} aria-label={isSubtaskDone(subtask) ? `Reopen ${subtask.title}` : `Complete ${subtask.title}`} className="grid size-10 flex-none cursor-pointer place-items-center rounded-lg text-emerald-800 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-50">{isSubtaskDone(subtask) ? <Check aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}</button><div className="min-w-0 flex-1"><p className={`break-words text-sm font-semibold ${isSubtaskDone(subtask) ? "text-slate-400 line-through" : "text-slate-800"}`}>{subtask.title}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="sr-only" htmlFor={`subtask-assignee-${subtask.id}`}>Assignee for {subtask.title}</label><select id={`subtask-assignee-${subtask.id}`} value={subtask.assignee_user_id ?? subtask.assignee?.id ?? ""} disabled={Boolean(busyKey)} onChange={(event) => updateSubtask(subtask, { assignee_user_id: event.target.value ? Number(event.target.value) : null })} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15 disabled:cursor-wait"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{getTaskUserName(member)}</option>)}</select><label className="sr-only" htmlFor={`subtask-due-${subtask.id}`}>Due date for {subtask.title}</label><input id={`subtask-due-${subtask.id}`} type="date" value={subtask.due_date || ""} disabled={Boolean(busyKey)} onChange={(event) => updateSubtask(subtask, { due_date: event.target.value || null })} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15 disabled:cursor-wait" /></div></div><button type="button" onClick={() => setPendingDelete({ kind: "subtask", item: subtask })} aria-label={`Delete ${subtask.title}`} className="grid size-10 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button></div></li>)}</ul> : <p className="mt-2 border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">No subtasks yet. Add the first checklist item below.</p>}
          <form onSubmit={addSubtask} className="mt-3 rounded-lg bg-slate-50 p-3"><label htmlFor={`new-subtask-${task.id}`} className="text-xs font-bold text-slate-700">New subtask</label><div className="mt-1.5 flex gap-2"><input id={`new-subtask-${task.id}`} required maxLength={255} value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="What needs to be done?" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /><button type="submit" disabled={!subtaskTitle.trim() || Boolean(busyKey)} aria-label="Add subtask" className="grid size-11 cursor-pointer place-items-center rounded-lg bg-[#173b35] text-white focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{busyKey === "add-subtask" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs text-slate-500"><UserRound aria-hidden="true" className="size-4" /><span className="sr-only">Subtask assignee</span><select value={subtaskAssigneeId} onChange={(event) => setSubtaskAssigneeId(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{getTaskUserName(member)}</option>)}</select></label><label className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays aria-hidden="true" className="size-4" /><span className="sr-only">Subtask due date</span><input type="date" value={subtaskDueDate} onChange={(event) => setSubtaskDueDate(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs" /></label></div></form>
        </div>
        <div className="mt-7"><h4 className="flex items-center gap-2 text-sm font-bold"><GitBranch aria-hidden="true" className="size-4 text-amber-700" />Blocked by</h4><p className="mt-1 text-xs leading-5 text-slate-500">This task cannot be completed until every dependency is done.</p>
          {dependencies.length ? <ul className="mt-2 space-y-2">{dependencies.map((dependency) => { const dependencyTask = getDependencyTask(dependency); const resolved = normalizeTaskStatus(dependencyTask) === "done"; return <li key={dependency.id} className="flex min-h-12 items-center gap-3 border border-slate-200 bg-white px-3"><span className={`grid size-7 flex-none place-items-center rounded-md ${resolved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{resolved ? <Check aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{dependencyTask?.title || "Related task"}</span><span className="text-[11px] text-slate-500">{resolved ? "Completed" : "Still open"}</span></span><button type="button" onClick={() => setPendingDelete({ kind: "dependency", item: dependency })} aria-label={`Remove dependency ${dependencyTask?.title || "task"}`} className="grid size-10 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button></li>; })}</ul> : <p className="mt-2 border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">This task has no dependencies.</p>}
          <form onSubmit={addDependency} className="mt-3 flex gap-2"><label htmlFor={`dependency-${task.id}`} className="sr-only">Task that must be completed first</label><select id={`dependency-${task.id}`} value={blockingTaskId} onChange={(event) => setBlockingTaskId(event.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Choose a task that blocks this one</option>{dependencyOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="submit" disabled={!blockingTaskId || Boolean(busyKey)} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Add</span></button></form>
        </div>
      </>}
      {pendingDelete ? <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyKey) setPendingDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-task-structure-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"><h4 id="delete-task-structure-title" className="text-lg font-semibold">Remove {pendingDelete.kind}?</h4><p className="mt-2 text-sm leading-6 text-slate-600">{pendingDelete.kind === "subtask" ? `“${pendingDelete.item.title}” will be permanently removed.` : "The tasks will no longer be linked."}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={Boolean(busyKey)} onClick={() => setPendingDelete(null)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:cursor-not-allowed">Cancel</button><button type="button" disabled={Boolean(busyKey)} onClick={confirmDelete} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{busyKey.startsWith("delete-") ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}Remove</button></div></section></div> : null}
    </section>
  );
};

export default TaskStructure;
