import { Flag, Tag } from "lucide-react";

const PRIORITIES = [
  { value: "low", label: "Low", flag: "Green flag", color: "text-emerald-700", selected: "border-emerald-600 bg-emerald-50" },
  { value: "medium", label: "Medium", flag: "Yellow flag", color: "text-amber-600", selected: "border-amber-500 bg-amber-50" },
  { value: "high", label: "High", flag: "Red flag", color: "text-red-700", selected: "border-red-600 bg-red-50" },
];

const PRIORITY_STYLES = {
  low: { label: "Low priority", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  medium: { label: "Medium priority", className: "border-amber-200 bg-amber-50 text-amber-800" },
  high: { label: "High priority", className: "border-red-200 bg-red-50 text-red-800" },
};

export const PriorityBadge = ({ priority = "medium" }) => {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${style.className}`}><Flag aria-hidden="true" className="size-3" />{style.label}</span>;
};

export const TaskTags = ({ tags = [] }) => tags.length > 0 ? (
  <ul className="flex flex-wrap gap-1.5" aria-label="Task tags">
    {tags.map((tag) => <li key={tag.toLocaleLowerCase()} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"><Tag aria-hidden="true" className="size-3" />{tag}</li>)}
  </ul>
) : null;

export const TaskAttributeFields = ({ idPrefix, tags, onTagsChange, priority, onPriorityChange }) => (
  <>
    <div className="mt-5">
      <label htmlFor={`${idPrefix}-tags`} className="mb-1.5 block text-sm font-semibold text-slate-800">Tags <span className="font-normal text-slate-500">(optional)</span></label>
      <input id={`${idPrefix}-tags`} type="text" value={tags} onChange={(event) => onTagsChange(event.target.value)} placeholder="design, customer, release" aria-describedby={`${idPrefix}-tags-help`} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
      <p id={`${idPrefix}-tags-help`} className="mt-1.5 text-xs text-slate-500">Separate up to 10 tags with commas. Each tag can contain up to 30 characters.</p>
    </div>
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-semibold text-slate-800">Priority</legend>
      <div className="grid grid-cols-3 gap-2">
        {PRIORITIES.map((option) => (
          <label key={option.value} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-emerald-800 ${priority === option.value ? option.selected : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            <input type="radio" name={`${idPrefix}-priority`} value={option.value} checked={priority === option.value} onChange={(event) => onPriorityChange(event.target.value)} className="sr-only" />
            <span className={`flex items-center gap-1 text-sm font-bold ${option.color}`}><Flag aria-hidden="true" className="size-4" />{option.label}</span>
            <span className="text-[10px] text-slate-500">{option.flag}</span>
          </label>
        ))}
      </div>
    </fieldset>
  </>
);
