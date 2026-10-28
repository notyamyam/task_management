import test from "node:test";
import assert from "node:assert/strict";
import { hasAnyAdminPermission, hasPermission } from "./adminPermissions.js";
import { groupPermissions, getPagination } from "./adminUtils.js";
import { getAssignableRoles, getGrantablePermissions } from "./adminPermissions.js";

test("uses exact permission keys", () => {
  assert.equal(hasPermission(["users.read"], "users.read"), true);
  assert.equal(hasPermission(["users.read"], "users.update"), false);
});

test("does not show admin navigation to users with no permissions", () => {
  assert.equal(hasAnyAdminPermission([]), false);
});

test("groups catalog entries by module and keeps exact permission keys", () => {
  const groups = groupPermissions([
    { key: "users.read", module: "users", action: "read" },
    { key: "users.assign_roles", module: "users", action: "assign_roles" },
    { key: "roles.read", module: "roles", action: "read" },
  ]);

  assert.deepEqual(groups, [
    {
      module: "roles",
      permissions: [{ key: "roles.read", module: "roles", action: "read" }],
    },
    {
      module: "users",
      permissions: [
        { key: "users.assign_roles", module: "users", action: "assign_roles" },
        { key: "users.read", module: "users", action: "read" },
      ],
    },
  ]);
});

test("reads pagination metadata from response headers", () => {
  const headers = new Map([
    ["x-total-count", "51"],
    ["x-page", "2"],
    ["x-page-size", "25"],
    ["x-total-pages", "3"],
  ]);

  assert.deepEqual(getPagination({ headers }), { total: 51, page: 2, pageSize: 25, totalPages: 3 });
});

test("only exposes permissions the actor can grant unless they are a super administrator", () => {
  const catalog = [
    { key: "roles.read" },
    { key: "roles.delete" },
    { key: "users.read" },
  ];

  assert.deepEqual(getGrantablePermissions(catalog, ["roles.read", "users.read"]), [catalog[0], catalog[2]]);
  assert.deepEqual(getGrantablePermissions(catalog, ["roles.read"], true), catalog);
});

test("only exposes roles whose permissions the actor can assign", () => {
  const roles = [
    { id: 1, permission_keys: ["users.read"], is_protected: false },
    { id: 2, permission_keys: ["users.read", "roles.delete"], is_protected: false },
    { id: 3, permission_keys: ["users.read"], is_protected: true },
  ];

  assert.deepEqual(getAssignableRoles(roles, ["users.read"]), [roles[0]]);
  assert.deepEqual(getAssignableRoles(roles, ["users.read"], true), roles);
});
