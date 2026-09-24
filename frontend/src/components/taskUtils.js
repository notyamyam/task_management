export const parseTaskTags = (value) => {
  const tags = [];
  const seen = new Set();
  for (const item of value.split(",")) {
    const tag = item.trim();
    const normalizedTag = tag.toLocaleLowerCase();
    if (tag && !seen.has(normalizedTag)) {
      seen.add(normalizedTag);
      tags.push(tag);
    }
  }
  return tags;
};

export const validateTaskTags = (tags) => {
  if (tags.length > 10) return "Add no more than 10 tags.";
  if (tags.some((tag) => tag.length > 30)) return "Each tag must be 30 characters or fewer.";
  return "";
};

export const taskTagsToInput = (tags) => (tags || []).join(", ");

export const getTaskUserName = (user) => {
  if (!user) return "Unknown user";
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email;
};
