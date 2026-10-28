export const hasPermission = (permissions, key) => (
  Array.isArray(permissions) && permissions.includes(key)
);

export const hasAnyAdminPermission = (permissions) => (
  Array.isArray(permissions) && permissions.length > 0
);

export const getGrantablePermissions = (permissions, actorPermissions, isSuperAdmin = false) => {
  if (isSuperAdmin) return permissions;
  const effectivePermissions = new Set(actorPermissions);
  return permissions.filter((permission) => effectivePermissions.has(permission.key));
};

export const getAssignableRoles = (roles, actorPermissions, isSuperAdmin = false) => {
  if (isSuperAdmin) return roles;
  const effectivePermissions = new Set(actorPermissions);
  return roles.filter((role) => (
    !role.is_protected && (role.permission_keys ?? []).every((key) => effectivePermissions.has(key))
  ));
};
