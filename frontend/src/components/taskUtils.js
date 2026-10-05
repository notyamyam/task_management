export const normalizeTaskTags = (tags = []) => {
  const normalizedTags = [];
  const seen = new Set();
  for (const tag of tags) {
    const name = (typeof tag === "string" ? tag : tag?.name)?.trim();
    const normalizedName = name?.toLocaleLowerCase();
    if (name && !seen.has(normalizedName)) {
      seen.add(normalizedName);
      normalizedTags.push({
        name,
        color: typeof tag === "object" && tag?.color ? tag.color : "slate",
      });
    }
  }
  return normalizedTags;
};

export const validateTaskTags = (tags) => {
  if (tags.length > 10) return "Add no more than 10 tags.";
  if (tags.some((tag) => tag.name.length > 30)) return "Each tag must be 30 characters or fewer.";
  return "";
};

export const getTaskTagSuggestions = (tasks) => {
  const suggestions = [];
  const seen = new Set();
  for (const task of tasks) {
    for (const tag of normalizeTaskTags(task.tags)) {
      const key = tag.name.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push(tag);
      }
    }
  }
  return suggestions.sort((left, right) => left.name.localeCompare(right.name));
};

export const mergeTaskTagSuggestions = (suggestions, tags) => normalizeTaskTags([
  ...normalizeTaskTags(tags),
  ...normalizeTaskTags(suggestions),
]).sort((left, right) => left.name.localeCompare(right.name));

export const getTaskUserName = (user) => {
  if (!user) return "Unknown user";
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email;
};
