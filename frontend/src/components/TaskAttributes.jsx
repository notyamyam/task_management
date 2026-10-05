import { useId, useState } from "react";
import { Check, Flag, Palette, Tag, X } from "lucide-react";

import { normalizeTaskTags } from "./taskUtils";

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

const TAG_COLORS = {
  slate: { label: "Slate", chip: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  emerald: { label: "Emerald", chip: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  blue: { label: "Blue", chip: "border-blue-200 bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  violet: { label: "Violet", chip: "border-violet-200 bg-violet-50 text-violet-800", dot: "bg-violet-600" },
  amber: { label: "Amber", chip: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  rose: { label: "Rose", chip: "border-rose-200 bg-rose-50 text-rose-800", dot: "bg-rose-600" },
};

const getTagStyle = (color) => TAG_COLORS[color] || TAG_COLORS.slate;

export const PriorityBadge = ({ priority = "medium" }) => {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${style.className}`}><Flag aria-hidden="true" className="size-3" />{style.label}</span>;
};

export const TaskTags = ({ tags = [] }) => {
  const normalizedTags = normalizeTaskTags(tags);
  return normalizedTags.length > 0 ? (
    <ul className="flex flex-wrap gap-1.5" aria-label="Task tags">
      {normalizedTags.map((tag) => <li key={tag.name.toLocaleLowerCase()} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${getTagStyle(tag.color).chip}`}><Tag aria-hidden="true" className="size-3" />{tag.name}</li>)}
    </ul>
  ) : null;
};

const TaskTagInput = ({ id, tags, onChange, suggestions = [] }) => {
  const [query, setQuery] = useState("");
  const [colorTag, setColorTag] = useState(null);
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
  };

  const updateColor = (name, color) => {
    onChange(normalizedTags.map((tag) => tag.name === name ? { ...tag, color } : tag));
    setColorTag(null);
  };

  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-emerald-800 focus-within:ring-3 focus-within:ring-emerald-800/15">
        {normalizedTags.map((tag) => (
          <span key={tag.name.toLocaleLowerCase()} className="relative inline-flex">
            <span className={`inline-flex min-h-8 items-center rounded-md border text-xs font-semibold ${getTagStyle(tag.color).chip}`}>
              <button type="button" onClick={() => setColorTag(colorTag === tag.name ? null : tag.name)} aria-label={`Change color for ${tag.name}`} aria-expanded={colorTag === tag.name} className="grid min-h-8 cursor-pointer place-items-center rounded-l-md px-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
                <Palette aria-hidden="true" className="size-3.5" />
              </button>
              <span>{tag.name}</span>
              <button type="button" onClick={() => onChange(normalizedTags.filter((item) => item.name !== tag.name))} aria-label={`Remove ${tag.name}`} className="grid min-h-8 cursor-pointer place-items-center rounded-r-md px-2 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-800">
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
        <input
          id={id}
          type="text"
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
          }}
          placeholder={normalizedTags.length === 0 ? "Type a tag and press Enter" : "Add tag"}
          maxLength={30}
          disabled={normalizedTags.length >= 10}
          autoComplete="off"
          aria-controls={matches.length > 0 && cleanQuery ? listboxId : undefined}
          className="h-8 min-w-36 flex-1 border-0 bg-transparent px-1.5 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
        />
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

export const TaskAttributeFields = ({ idPrefix, tags, onTagsChange, tagSuggestions, priority, onPriorityChange }) => (
  <>
    <div className="mt-5">
      <label htmlFor={`${idPrefix}-tags`} className="mb-1.5 block text-sm font-semibold text-slate-800">Tags <span className="font-normal text-slate-500">(optional)</span></label>
      <TaskTagInput id={`${idPrefix}-tags`} tags={tags} onChange={onTagsChange} suggestions={tagSuggestions} />
      <p className="mt-1.5 text-xs text-slate-500">Press Enter to create a tag. Select its palette icon to change color.</p>
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
