import { useRef, useState } from "react";
import { GripVertical, Pencil, RefreshCw, Trash2, UserRound } from "lucide-react";

import { AssigneeBadge, DueDateBadge, PriorityBadge, TaskTags } from "./TaskAttributes";
import { getDueDateState, getTaskAssignee, normalizeTaskStatus, TASK_STATUSES } from "./taskPlanning";
import { getTaskUserName } from "./taskUtils";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? DATE_TIME_FORMATTER.format(new Date(value)) : "Not available";

const TaskBoard = ({ tasks, onStatusChange, onEdit, onDelete, updatingTaskId }) => {
  const dragRef = useRef(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);

  const getStatusAtPoint = (clientX, clientY) => (
    document.elementFromPoint(clientX, clientY)?.closest("[data-task-status]")?.dataset.taskStatus ?? null
  );

  const clearDrag = () => {
    dragRef.current = null;
    setDraggedTaskId(null);
    setDropStatus(null);
    setDragPreview(null);
  };

  const handlePointerDown = (event, task) => {
    if (updatingTaskId === task.id || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { task, pointerId: event.pointerId };
    setDraggedTaskId(task.id);
    setDropStatus(normalizeTaskStatus(task));
    setDragPreview({ task, x: event.clientX, y: event.clientY, pointerType: event.pointerType });
  };

  const handlePointerMove = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextStatus = getStatusAtPoint(event.clientX, event.clientY);
    setDropStatus((current) => current === nextStatus ? current : nextStatus);
    setDragPreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
  };

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const { task } = dragRef.current;
    const nextStatus = getStatusAtPoint(event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearDrag();
    if (nextStatus && normalizeTaskStatus(task) !== nextStatus) onStatusChange(task, nextStatus);
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-cols-1 gap-3 md:min-w-[64rem] md:grid-cols-4" aria-label="Task board">
        {TASK_STATUSES.map((column) => {
          const columnTasks = tasks.filter((task) => normalizeTaskStatus(task) === column.value);
          return (
            <section
              key={column.value}
              aria-labelledby={`board-${column.value}`}
              data-task-status={column.value}
              className={`min-h-64 bg-slate-100/80 ring-1 transition ${dropStatus === column.value && draggedTaskId !== null ? "ring-2 ring-emerald-700" : "ring-slate-200"}`}
            >
              <header className="flex min-h-12 items-center justify-between border-b border-slate-200 bg-white px-3">
                <h3 id={`board-${column.value}`} className="flex items-center gap-2 text-sm font-bold"><span className={`size-2.5 rounded-full ${column.dot}`} />{column.label}</h3>
                <span className="text-xs font-bold tabular-nums text-slate-500">{columnTasks.length}</span>
              </header>
              <ul className="space-y-2 p-2.5">
                {columnTasks.map((task) => (
                  <li
                    key={task.id}
                    className={`bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md ${draggedTaskId === task.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        onPointerDown={(event) => handlePointerDown(event, task)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={clearDrag}
                        title={`Drag ${task.title}`}
                        className={`-m-2 mt-[-0.375rem] grid size-8 flex-none touch-none place-items-center text-slate-400 select-none ${updatingTaskId === task.id ? "cursor-wait opacity-50" : "cursor-grab active:cursor-grabbing"}`}
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-slate-900">{task.title}</p>
                        {task.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</p> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <DueDateBadge dueDate={task.due_date} state={getDueDateState(task)} />
                      <AssigneeBadge assignee={getTaskAssignee(task)} />
                      <PriorityBadge priority={task.priority} />
                      <TaskTags tags={task.tags} />
                    </div>
                    <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">
                      <div className="flex items-start gap-1.5"><UserRound aria-hidden="true" className="mt-0.5 size-3.5 flex-none" /><dt className="sr-only">Created by</dt><dd>Created by {getTaskUserName(task.created_by)} · {formatDateTime(task.created_at)}</dd></div>
                      <div className="flex items-start gap-1.5"><RefreshCw aria-hidden="true" className="mt-0.5 size-3.5 flex-none" /><dt className="sr-only">Updated by</dt><dd>Updated by {getTaskUserName(task.updated_by)} · {formatDateTime(task.updated_at)}</dd></div>
                    </dl>
                    <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
                      <label htmlFor={`board-status-${task.id}`} className="sr-only">Move {task.title} to status</label>
                      <select
                        id={`board-status-${task.id}`}
                        value={normalizeTaskStatus(task)}
                        disabled={updatingTaskId === task.id}
                        onChange={(event) => onStatusChange(task, event.target.value)}
                        className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20 disabled:cursor-wait"
                      >
                        {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                      <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} className="grid size-9 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button>
                      <button type="button" onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`} className="grid size-9 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-3 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-4" /></button>
                    </div>
                  </li>
                ))}
                {columnTasks.length === 0 ? <li className="grid min-h-24 place-items-center border border-dashed border-slate-300 px-3 text-center text-xs text-slate-500">Drop tasks here</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Drag tasks by their handles, or use each card&apos;s status menu with a keyboard.</p>
      {dragPreview ? (
        <div
          aria-hidden="true"
          data-drag-preview
          className="pointer-events-none fixed z-[60] w-60 rounded-lg border border-emerald-700/30 bg-white p-3 shadow-2xl ring-2 ring-emerald-700/20"
          style={{
            left: Math.max(8, Math.min(dragPreview.x + 14, window.innerWidth - 256)),
            top: dragPreview.pointerType === "touch" ? Math.max(8, dragPreview.y - 96) : Math.min(dragPreview.y + 14, window.innerHeight - 96),
          }}
        >
          <div className="flex items-start gap-2">
            <GripVertical className="mt-0.5 size-4 flex-none text-emerald-800" />
            <p className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-900">{dragPreview.task.title}</p>
          </div>
          <p className="mt-2 text-xs font-bold text-emerald-800">
            {dropStatus ? `Move to ${TASK_STATUSES.find((status) => status.value === dropStatus)?.label}` : "Move over a column"}
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default TaskBoard;
