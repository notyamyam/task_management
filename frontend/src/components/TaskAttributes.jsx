import { useId, useState } from "react";
import { CalendarDays, Check, Flag, FlagOff, Palette, Pencil, Plus, Tag, UserRound, X } from "lucide-react";

import { normalizeTaskTags } from "./taskUtils";

const PRIORITIES = [
  { value: "", label: "No flag", flag: "No priority", color: "text-slate-400", selected: "border-slate-400 bg-slate-50" },
  { value: "low", label: "Low", flag: "Green flag", color: "text-emerald-700", selected: "border-emerald-600 bg-emerald-50" },
  { value: "medium", label: "Medium", flag: "Yellow flag", color: "text-amber-600", selected: "border-amber-500 bg-amber-50" },
  { value: "high", label: "High", flag: "Red flag", color: "text-red-700", selected: "border-red-600 bg-red-50" },
];

const PRIORITY_STYLES = {
  low: { label: "Low priority", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  medium: { label: "Medium priority", className: "border-amber-200 bg-amber-50 text-amber-800" },
  high: { label: "High priority", className: "border-red-200 bg-red-50 text-red-800" },
};

const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog", className: "border-slate-300 bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "In Progress", className: "border-blue-300 bg-blue-50 text-blue-800" },
  { value: "blocked", label: "Blocked", className: "border-amber-300 bg-amber-50 text-amber-800" },
  { value: "done", label: "Done", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
];

const TAG_COLORS = {
  slate: { label: "Slate", chip: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  emerald: { label: "Emerald", chip: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  blue: { label: "Blue", chip: "border-blue-200 bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  violet: { label: "Violet", chip: "border-violet-200 bg-violet-50 text-violet-800", dot: "bg-violet-600" },
  amber: { label: "Amber", chip: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  rose: { label: "Rose", chip: "border-rose-200 bg-rose-50 text-rose-800", dot: "bg-rose-600" },
};

const getTagStyle = (color) => TAG_COLORS[color] || TAG_COLORS.slate;

export const PriorityBadge = ({ priority }) => {
  const style = PRIORITY_STYLES[priority];
  return style ? <span title={style.label} aria-label={style.label} className={`inline-grid size-7 place-items-center rounded-md border ${style.className}`}><Flag aria-hidden="true" className="size-3.5 fill-current" /></span> : null;
};

export const PriorityFlagControl = ({ priority, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = PRIORITIES.find((option) => option.value === (priority || "")) || PRIORITIES[0];
  return (
    <div className="relative flex-none">
      <button type="button" onClick={() => setIsOpen((current) => !current)} aria-label={priority ? `Change ${selected.label.toLowerCase()} priority flag` : "Add priority flag"} aria-expanded={isOpen} title={priority ? selected.flag : "Add flag"} className={`grid size-11 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${selected.color}`}>
        {priority ? <Flag aria-hidden="true" className="size-5 fill-current" /> : <FlagOff aria-hidden="true" className="size-5" />}
      </button>
      {isOpen ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" role="menu" aria-label="Priority flag">
          {PRIORITIES.map((option) => (
            <button key={option.value || "none"} type="button" role="menuitemradio" aria-checked={(priority || "") === option.value} onClick={() => { onChange(option.value || null); setIsOpen(false); }} className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-800 ${option.color}`}>
              {option.value ? <Flag aria-hidden="true" className="size-4 fill-current" /> : <FlagOff aria-hidden="true" className="size-4" />}
              <span className="flex-1 text-slate-700">{option.label}</span>
              {(priority || "") === option.value ? <Check aria-hidden="true" className="size-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const TaskEditableOverview = ({ idPrefix, title, description, onTitleChange, onDescriptionChange, priority, onPriorityChange }) => {
  const [editingField, setEditingField] = useState(null);
  const [draft, setDraft] = useState("");
  const beginEditing = (field, value) => { setDraft(value); setEditingField(field); };
  const finishEditing = () => {
    if (editingField === "title" && draft.trim()) onTitleChange(draft.trim());
    if (editingField === "description") onDescriptionChange(draft);
    setEditingField(null);
  };

  return (
    <section aria-label="Task summary" className="border-b border-slate-200 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.12em] text-slate-500 uppercase">Task title</p>
          {editingField === "title" ? (
            <div className="mt-1 flex items-center gap-1">
              <input id={`${idPrefix}-title`} autoFocus required maxLength={255} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishEditing(); } }} className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-lg font-semibold outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
              <button type="button" onClick={finishEditing} disabled={!draft.trim()} aria-label="Apply title" className="grid size-11 cursor-pointer place-items-center rounded-lg text-emerald-800 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Check aria-hidden="true" className="size-5" /></button>
              <button type="button" onClick={() => setEditingField(null)} aria-label="Cancel title edit" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-5" /></button>
            </div>
          ) : (
            <div className="flex items-start gap-1">
              <h3 className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-950">{title}</h3>
              <button type="button" onClick={() => beginEditing("title", title)} aria-label="Edit task title" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button>
            </div>
          )}
        </div>
        <PriorityFlagControl priority={priority} onChange={onPriorityChange} />
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold tracking-[0.12em] text-slate-500 uppercase">Description</p>{editingField !== "description" ? <button type="button" onClick={() => beginEditing("description", description)} aria-label="Edit task description" className="grid size-9 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-3 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-4" /></button> : null}</div>
        {editingField === "description" ? <div><textarea id={`${idPrefix}-description`} autoFocus rows={6} maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add context, notes, or a definition of done" className="mt-1 min-h-36 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /><div className="mt-1 flex items-center justify-between"><span className="text-xs text-slate-500">{draft.length}/1000</span><div className="flex"><button type="button" onClick={() => setEditingField(null)} className="min-h-10 cursor-pointer px-3 text-xs font-bold text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-800">Cancel</button><button type="button" onClick={finishEditing} className="min-h-10 cursor-pointer px-3 text-xs font-bold text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-800">Apply</button></div></div></div> : <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${description ? "text-slate-700" : "italic text-slate-400"}`}>{description || "No description added."}</p>}
      </div>
    </section>
  );
};

export const TaskTags = ({ tags = [] }) => {
  const normalizedTags = normalizeTaskTags(tags);
  return normalizedTags.length > 0 ? (
    <ul className="flex flex-wrap gap-1.5" aria-label="Task tags">
      {normalizedTags.map((tag) => <li key={tag.name.toLocaleLowerCase()} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getTagStyle(tag.color).chip}`}><Tag aria-hidden="true" className="size-3" />{tag.name}</li>)}
    </ul>
  ) : null;
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export const StatusBadge = ({ status = "backlog" }) => {
  const labels = { backlog: "Backlog", in_progress: "In Progress", blocked: "Blocked", done: "Done" };
  const styles = { backlog: "border-slate-200 bg-slate-100 text-slate-700", in_progress: "border-blue-200 bg-blue-50 text-blue-800", blocked: "border-amber-200 bg-amber-50 text-amber-800", done: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${styles[status] || styles.backlog}`}>{labels[status] || labels.backlog}</span>;
};

export const DueDateBadge = ({ dueDate, state }) => {
  if (!dueDate) return null;
  const date = new Date(`${dueDate}T12:00:00`);
  const label = Number.isNaN(date.getTime()) ? dueDate : DATE_FORMATTER.format(date);
  const style = state === "overdue" ? "border-red-200 bg-red-50 text-red-800" : state === "today" ? "border-amber-200 bg-amber-50 text-amber-900" : state === "approaching" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600";
  const prefix = state === "overdue" ? "Overdue" : state === "today" ? "Due today" : "Due";
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${style}`}><CalendarDays aria-hidden="true" className="size-3" />{prefix} {label}</span>;
};

export const AssigneeBadge = ({ assignee }) => assignee ? (
  <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-800"><UserRound aria-hidden="true" className="size-3" />{`${assignee.first_name || ""} ${assignee.last_name || ""}`.trim() || assignee.email}</span>
) : <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500"><UserRound aria-hidden="true" className="size-3" />Unassigned</span>;

const TaskTagInput = ({ id, tags, onChange, suggestions = [], compact = false }) => {
  const [query, setQuery] = useState("");
  const [colorTag, setColorTag] = useState(null);
  const [isAdding, setIsAdding] = useState(!compact);
  const listboxId = useId();
  const normalizedTags = normalizeTaskTags(tags);
  const selectedNames = new Set(normalizedTags.map((tag) => tag.name.toLocaleLowerCase()));
  const cleanQuery = query.trim();
  const matches = normalizeTaskTags(suggestions)
    .filter((tag) => !selectedNames.has(tag.name.toLocaleLowerCase()))
    .filter((tag) => !cleanQuery || tag.name.toLocaleLowerCase().includes(cleanQuery.toLocaleLowerCase()))
    .slice(0, 6);

  const addTag = (tag) => {
    const name = (typeof tag === "string" ? tag : tag.name).trim();
    if (!name || name.length > 30 || normalizedTags.length >= 10) return;
    if (!selectedNames.has(name.toLocaleLowerCase())) {
      onChange([...normalizedTags, typeof tag === "string" ? { name, color: "slate" } : tag]);
    }
    setQuery("");
    if (compact) setIsAdding(false);
  };

  const updateColor = (name, color) => {
    onChange(normalizedTags.map((tag) => tag.name === name ? { ...tag, color } : tag));
    setColorTag(null);
  };

  return (
    <div>
      <div className={`flex min-h-11 flex-wrap items-center gap-1.5 ${compact ? "py-1" : "rounded-lg border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-emerald-800 focus-within:ring-3 focus-within:ring-emerald-800/15"}`}>
        {normalizedTags.map((tag) => (
          <span key={tag.name.toLocaleLowerCase()} className="relative inline-flex">
            <span className={`inline-flex min-h-8 items-center rounded-full border text-xs font-semibold ${getTagStyle(tag.color).chip}`}>
              <button type="button" onClick={() => setColorTag(colorTag === tag.name ? null : tag.name)} aria-label={`Change color for ${tag.name}`} aria-expanded={colorTag === tag.name} className="grid min-h-8 cursor-pointer place-items-center rounded-l-full px-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
                <Palette aria-hidden="true" className="size-3.5" />
              </button>
              <span>{tag.name}</span>
              <button type="button" onClick={() => onChange(normalizedTags.filter((item) => item.name !== tag.name))} aria-label={`Remove ${tag.name}`} className="grid min-h-8 cursor-pointer place-items-center rounded-r-full px-2 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
            {colorTag === tag.name ? (
              <div className="absolute top-full left-0 z-30 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-xl" aria-label={`Colors for ${tag.name}`}>
                {Object.entries(TAG_COLORS).map(([color, style]) => (
                  <button key={color} type="button" onClick={() => updateColor(tag.name, color)} aria-label={`Set ${tag.name} to ${style.label}`} title={style.label} className={`grid size-8 cursor-pointer place-items-center rounded-md hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-800 ${tag.color === color ? "bg-slate-100" : ""}`}>
                    <span className={`grid size-4 place-items-center rounded-full ${style.dot}`}>{tag.color === color ? <Check aria-hidden="true" className="size-3 text-white" /> : null}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        ))}
        {!compact || isAdding ? <input
          id={id}
          type="text"
          autoFocus={compact}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(cleanQuery);
            }
            if (event.key === "Backspace" && !query && normalizedTags.length > 0) {
              onChange(normalizedTags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (cleanQuery) addTag(cleanQuery);
            else if (compact) setIsAdding(false);
          }}
          placeholder={normalizedTags.length === 0 ? "Type a tag and press Enter" : "Add tag"}
          maxLength={30}
          disabled={normalizedTags.length >= 10}
          autoComplete="off"
          aria-controls={matches.length > 0 && cleanQuery ? listboxId : undefined}
          className={compact ? "h-9 min-w-36 flex-1 rounded-full border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15 disabled:cursor-not-allowed" : "h-8 min-w-36 flex-1 border-0 bg-transparent px-1.5 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"}
        /> : <button type="button" onClick={() => setIsAdding(true)} disabled={normalizedTags.length >= 10} aria-label="Add tag" className="grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Plus aria-hidden="true" className="size-4" /></button>}
      </div>
      {matches.length > 0 && cleanQuery ? (
        <ul id={listboxId} aria-label="Suggested tags" className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((tag) => (
            <li key={tag.name.toLocaleLowerCase()}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag)} className="flex min-h-10 w-full cursor-pointer items-center gap-2 px-3 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                <span className={`size-2.5 rounded-full ${getTagStyle(tag.color).dot}`} />
                <span className="font-semibold text-slate-700">{tag.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const TaskAttributeFields = ({ idPrefix, tags, onTagsChange, tagSuggestions, priority, onPriorityChange, showPriority = true, compactTags = false }) => (
  <>
    <div className="mt-5">
      <label htmlFor={`${idPrefix}-tags`} className="mb-1.5 block text-sm font-semibold text-slate-800">Tags <span className="font-normal text-slate-500">(optional)</span></label>
      <TaskTagInput id={`${idPrefix}-tags`} tags={tags} onChange={onTagsChange} suggestions={tagSuggestions} compact={compactTags} />
      <p className="mt-1.5 text-xs text-slate-500">{compactTags ? "Use the plus button to add a tag. Select a tag's palette to change color." : "Press Enter to create a tag. Select its palette icon to change color."}</p>
    </div>
    {showPriority ? <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-semibold text-slate-800">Priority</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRIORITIES.map((option) => (
          <label key={option.value || "none"} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-emerald-800 ${(priority || "") === option.value ? option.selected : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            <input type="radio" name={`${idPrefix}-priority`} value={option.value} checked={(priority || "") === option.value} onChange={(event) => onPriorityChange(event.target.value || null)} className="sr-only" />
            <span className={`flex items-center gap-1 text-sm font-bold ${option.color}`}>{option.value ? <Flag aria-hidden="true" className="size-4 fill-current" /> : <FlagOff aria-hidden="true" className="size-4" />}{option.label}</span>
            <span className="text-[10px] text-slate-500">{option.flag}</span>
          </label>
        ))}
      </div>
    </fieldset> : null}
  </>
);

export const TaskPlanningFields = ({ idPrefix, dueDate, onDueDateChange, status, onStatusChange, assigneeId, onAssigneeChange, members = [], isMembersLoading = false, compactStatus = false, completionBlocked = false }) => (
  <div className="mt-5 grid gap-4 sm:grid-cols-2">
    <div>
      <label htmlFor={`${idPrefix}-due-date`} className="mb-1.5 block text-sm font-semibold text-slate-800">Due date <span className="font-normal text-slate-500">(optional)</span></label>
      <input id={`${idPrefix}-due-date`} type="date" value={dueDate} onChange={(event) => onDueDateChange(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
    </div>
    {compactStatus ? <fieldset><legend className="mb-1.5 text-sm font-semibold text-slate-800">Status</legend><div className="flex min-h-11 flex-wrap items-center gap-1.5">{STATUS_OPTIONS.map((option) => <button key={option.value} type="button" disabled={completionBlocked && option.value === "done" && status !== "done"} title={completionBlocked && option.value === "done" ? "Complete blocking tasks first" : undefined} onClick={() => onStatusChange(option.value)} aria-pressed={status === option.value} className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-45 ${status === option.value ? option.className : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>{option.label}</button>)}</div>{completionBlocked ? <p className="mt-1 text-xs font-semibold text-amber-800">Complete blocking tasks before marking this task done.</p> : null}</fieldset> : <div><label htmlFor={`${idPrefix}-status`} className="mb-1.5 block text-sm font-semibold text-slate-800">Status</label><select id={`${idPrefix}-status`} value={status} onChange={(event) => onStatusChange(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="backlog">Backlog</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done" disabled={completionBlocked}>Done{completionBlocked ? " (blocked)" : ""}</option></select>{completionBlocked ? <p className="mt-1 text-xs font-semibold text-amber-800">Complete blocking tasks before marking this task done.</p> : null}</div>}
    <div className="sm:col-span-2">
      <label htmlFor={`${idPrefix}-assignee`} className="mb-1.5 block text-sm font-semibold text-slate-800">Assignee <span className="font-normal text-slate-500">(optional)</span></label>
      <select id={`${idPrefix}-assignee`} value={assigneeId} disabled={isMembersLoading} onChange={(event) => onAssigneeChange(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15 disabled:cursor-wait disabled:bg-slate-100">
        <option value="">{isMembersLoading ? "Loading project members..." : "Unassigned"}</option>
        {members.map((member) => <option key={member.id} value={member.id}>{`${member.first_name || ""} ${member.last_name || ""}`.trim() || member.email}</option>)}
      </select>
      {!isMembersLoading && members.length === 0 ? <p className="mt-1.5 text-xs text-slate-500">Choose a project to load its members.</p> : null}
    </div>
  </div>
);
