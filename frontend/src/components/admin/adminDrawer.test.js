import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./AdminLayout.jsx", import.meta.url), "utf8");
const confirmSource = await readFile(new URL("./AdminConfirmDialog.jsx", import.meta.url), "utf8");
const rolesSource = await readFile(new URL("./AdminRoles.jsx", import.meta.url), "utf8");
const userFormSource = await readFile(new URL("./AdminUserForm.jsx", import.meta.url), "utf8");
const usersSource = await readFile(new URL("./AdminUsers.jsx", import.meta.url), "utf8");
const userDetailsSource = await readFile(new URL("./AdminUserDetails.jsx", import.meta.url), "utf8");
const projectsSource = await readFile(new URL("./AdminProjects.jsx", import.meta.url), "utf8");
const tasksSource = await readFile(new URL("./AdminTasks.jsx", import.meta.url), "utf8");

test("keeps the mobile admin drawer out of the keyboard tree while closed", () => {
  assert.match(source, /inert=\{isMobileViewport && !isDrawerOpen\}/);
  assert.match(source, /aria-hidden=\{isMobileViewport && !isDrawerOpen\}/);
});

test("moves focus into the drawer and back to its trigger", () => {
  assert.match(source, /drawerCloseButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
});

test("keeps confirmation and editing surfaces keyboard-contained", () => {
  assert.match(confirmSource, /useAdminFocusTrap/);
  assert.match(rolesSource, /useAdminFocusTrap/);
  assert.match(userFormSource, /useAdminFocusTrap/);
  assert.match(confirmSource, /aria-modal="true"/);
  assert.match(rolesSource, /aria-modal="true"/);
  assert.match(userFormSource, /aria-modal="true"/);
});

test("routes drawer Escape through its close helper", () => {
  assert.match(rolesSource, /onEscape: close/);
  assert.match(userFormSource, /onEscape: close/);
  assert.doesNotMatch(rolesSource, /onCloseRef\.current\(\)/);
  assert.doesNotMatch(userFormSource, /onCloseRef\.current\(\)/);
});

test("returns role-list delete focus to the triggering button", () => {
  assert.match(rolesSource, /const deleteButtonRef = useRef\(null\)/);
  assert.match(rolesSource, /deleteButtonRef\.current = event\.currentTarget/);
  assert.match(rolesSource, /returnFocusRef=\{deleteButtonRef\}/);
});

test("passes role catalog state into the user form", () => {
  assert.match(usersSource, /isRolesLoading=\{isRolesLoading\}/);
  assert.match(usersSource, /rolesError=\{roleCatalogError\}/);
  assert.match(userFormSource, /Role catalog is loading/);
  assert.match(userFormSource, /Role catalog unavailable/);
});

test("does not format a missing pending user action", () => {
  assert.match(usersSource, /const actionText = pendingAction \?/);
  assert.match(userDetailsSource, /const actionTitle = pendingAction \?/);
});

test("restores successful project, task, and subtask saves after reload", () => {
  assert.doesNotMatch(projectsSource, /onSuccess\(response\.data\);\s*returnFocusRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(tasksSource, /onSuccess\(response\.data\);\s*returnFocusRef\.current\?\.focus\(\)/);
  assert.match(projectsSource, /focusAfterSaveRef/);
  assert.match(projectsSource, /setSelectedProject\(saved\); reload\(\); closeDrawer\(/);
  assert.match(projectsSource, /document\.querySelector\(pending\.selector\)\) \?\? pending\.ref\.current/);
  assert.match(projectsSource, /document\.querySelector\(pending\.fallbackSelector\)/);
  assert.match(projectsSource, /data-admin-project-page-heading/);
  assert.match(projectsSource, /data-admin-project-edit=\{project\.id\}/);
  assert.match(tasksSource, /focusAfterSaveRef/);
  assert.match(tasksSource, /setStatusMessage\("Task changes saved\."\); reload\(\); closeDrawer\(/);
  assert.match(tasksSource, /setRefresh\(\(count\) => count \+ 1\); closeDrawer\(/);
  assert.match(tasksSource, /document\.querySelector\(pending\.fallbackSelector\)/);
  assert.match(tasksSource, /data-admin-task-page-heading/);
  assert.match(tasksSource, /data-admin-task-edit=\{task\.id\}/);
  assert.match(tasksSource, /data-admin-subtask-create/);
  assert.match(tasksSource, /data-admin-subtask-edit=\{subtask\.id\}/);
});
