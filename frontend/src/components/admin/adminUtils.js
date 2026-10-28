export const getPagination = (response) => {
  const header = (name, fallback) => Number(response.headers?.get?.(name) ?? response.headers?.[name] ?? fallback);
  return {
    total: header("x-total-count", 0),
    page: header("x-page", 1),
    pageSize: header("x-page-size", 25),
    totalPages: header("x-total-pages", 1),
  };
};

export const groupPermissions = (permissions) => {
  const grouped = new Map();
  permissions.forEach((permission) => {
    if (!grouped.has(permission.module)) grouped.set(permission.module, []);
    grouped.get(permission.module).push(permission);
  });

  return [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([module, entries]) => ({
      module,
      permissions: entries.toSorted((first, second) => first.key.localeCompare(second.key)),
    }));
};

export const getApiError = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return { code: "", message: detail };
  if (detail && typeof detail === "object") return { code: detail.code ?? "", message: detail.message ?? fallback };
  return { code: "", message: fallback };
};

export const getFieldErrors = (error) => {
  const detail = error.response?.data?.detail;
  if (!Array.isArray(detail)) return {};
  return detail.reduce((errors, item) => {
    const field = item.loc?.at(-1);
    if (field) errors[field] = item.msg;
    return errors;
  }, {});
};

export const formatLabel = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export const getName = (user) => [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Deleted user";
