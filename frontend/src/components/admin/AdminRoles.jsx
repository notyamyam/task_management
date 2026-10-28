import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Copy, Edit3, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { ENDPOINTS, instance } from "../api";
import AdminConfirmDialog from "./AdminConfirmDialog";
import AdminForbidden from "./AdminForbidden";
import { formatLabel, getApiError, getFieldErrors, groupPermissions } from "./adminUtils";
import { getGrantablePermissions, hasPermission } from "./adminPermissions";
import { useAdminFocusTrap } from "./useAdminFocusTrap";

const inputClass = "min-h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800";
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const blankForm = { slug: "", name: "", description: "", permission_keys: [] };
const getInitialForm = (role, cloneOf, permissions) => role ? { slug: role.slug, name: role.name, description: role.description ?? "", permission_keys: role.permission_keys ?? [] } : cloneOf ? { slug: `${cloneOf.slug}-copy`, name: `${cloneOf.name} copy`, description: cloneOf.description ?? "", permission_keys: (cloneOf.permission_keys ?? []).filter((key) => permissions.some((permission) => permission.key === key)) } : blankForm;

const FieldError = ({ message }) => message ? <p className="mt-1 text-xs font-semibold text-rose-700" role="alert">{message}</p> : null;

const PermissionChecks = ({ permissions, selected, onToggle, disabled = false }) => <div className="mt-3 space-y-4">{groupPermissions(permissions).map((group) => <fieldset key={group.module}><legend className="text-xs font-bold tracking-wide text-slate-700 uppercase">{formatLabel(group.module)}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{group.permissions.map((permission) => <label key={permission.key} className={`flex min-h-11 items-start gap-2 border px-3 py-2 text-sm ${disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-emerald-300"}`}><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-emerald-800" checked={selected.includes(permission.key)} onChange={() => onToggle(permission.key)} disabled={disabled} /><span><span className="block font-semibold">{permission.action.replaceAll("_", " ")}</span><span className="block text-xs text-slate-500">{permission.key}</span></span></label>)}</div></fieldset>)}</div>;

const RoleFormDrawer = ({ isOpen, role, cloneOf, permissions, onClose, onSuccess, returnFocusRef }) => {
  const mode = role ? "edit" : cloneOf ? "clone" : "create";
  const [form, setForm] = useState(() => getInitialForm(role, cloneOf, permissions));
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const togglePermission = (key) => setForm((current) => ({ ...current, permission_keys: current.permission_keys.includes(key) ? current.permission_keys.filter((item) => item !== key) : [...current.permission_keys, key] }));
  const close = () => { if (isSaving) return; onClose(); returnFocusRef?.current?.focus(); };
  useAdminFocusTrap({ isOpen, containerRef: drawerRef, initialFocusRef: closeButtonRef, onEscape: close, isBusy: isSaving });

  if (!isOpen) return null;
  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true); setFieldErrors({}); setRequestError("");
    try {
      const response = mode === "edit" ? await instance.patch(ENDPOINTS.UPDATE_ADMIN_ROLE(role.id), { name: form.name, description: form.description || null }) : await instance.post(ENDPOINTS.CREATE_ADMIN_ROLE(), { slug: form.slug, name: form.name, description: form.description || null, permission_keys: form.permission_keys });
      onSuccess(response.data);
    } catch (error) { setFieldErrors(getFieldErrors(error)); setRequestError(getApiError(error, "We couldn't save this role.").message); } finally { setIsSaving(false); }
  };

  return <div className="fixed inset-0 z-40 bg-slate-950/30" role="presentation"><aside ref={drawerRef} aria-labelledby="admin-role-drawer-title" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-[#f8faf7] shadow-2xl shadow-slate-950/25" role="dialog"><div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5"><div><p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{mode === "clone" ? "Role template" : "Role editor"}</p><h2 id="admin-role-drawer-title" className="mt-1 text-xl font-semibold tracking-[-0.03em]">{mode === "create" ? "Create role" : mode === "clone" ? "Clone role" : `Edit ${role.name}`}</h2><p className="mt-1 text-sm text-slate-500">{mode === "edit" ? "Name and description changes are saved separately from permissions." : "Choose the exact permissions this role may grant."}</p></div><button ref={closeButtonRef} type="button" aria-label="Close role drawer" onClick={close} className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><span aria-hidden="true" className="text-2xl leading-none">×</span></button></div><form onSubmit={submit} className="flex flex-1 flex-col"><div className="flex-1 space-y-5 px-5 py-5"><div>{requestError ? <div className="mb-4 border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">{requestError}</div> : null}</div>{mode !== "edit" ? <label className="block text-sm font-semibold text-slate-700">Slug<input className={`${inputClass} mt-1`} value={form.slug} onChange={(event) => updateField("slug", event.target.value)} required aria-invalid={Boolean(fieldErrors.slug)} /><FieldError message={fieldErrors.slug} /></label> : null}<label className="block text-sm font-semibold text-slate-700">Role name<input className={`${inputClass} mt-1`} value={form.name} onChange={(event) => updateField("name", event.target.value)} required aria-invalid={Boolean(fieldErrors.name)} /><FieldError message={fieldErrors.name} /></label><label className="block text-sm font-semibold text-slate-700">Description<textarea className="mt-1 min-h-24 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800" value={form.description} onChange={(event) => updateField("description", event.target.value)} /><FieldError message={fieldErrors.description} /></label>{mode !== "edit" ? <fieldset><legend className="text-sm font-semibold text-slate-700">Permissions</legend><PermissionChecks permissions={permissions} selected={form.permission_keys} onToggle={togglePermission} /></fieldset> : null}</div><div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={isSaving} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Cancel</button><button type="submit" disabled={isSaving} className={`${buttonClass} border-[#173b35} bg-[#173b35] text-white hover:bg-[#204b43]`}>{isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Edit3 aria-hidden="true" className="size-4" />}{isSaving ? "Saving..." : mode === "create" ? "Create role" : mode === "clone" ? "Clone role" : "Save changes"}</button></div></form></aside></div>;
};

const AdminRoles = () => {
  const { adminPermissions, isSuperAdmin } = useOutletContext();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [drawerMode, setDrawerMode] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const createButtonRef = useRef(null);
  const cloneButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([instance.get(ENDPOINTS.GET_ADMIN_ROLES()), instance.get(ENDPOINTS.GET_ADMIN_PERMISSIONS())]).then(([roleResponse, permissionResponse]) => { if (isCurrent) { setRoles(roleResponse.data); setPermissions(permissionResponse.data); } }).catch((requestError) => { if (isCurrent) setError(getApiError(requestError, "We couldn't load roles and permissions.").message); }).finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [refreshCount]);

  if (!hasPermission(adminPermissions, "roles.read")) return <AdminForbidden title="Role access is restricted" message="Your current administration permissions do not include role records." />;
  const grantablePermissions = getGrantablePermissions(permissions, adminPermissions, isSuperAdmin);
  const closeDrawer = () => setDrawerMode(null);
  const afterSave = () => { closeDrawer(); setIsLoading(true); setRefreshCount((count) => count + 1); };
  const deleteRole = async () => { setIsDeleting(true); setDeleteError(""); try { await instance.delete(ENDPOINTS.DELETE_ADMIN_ROLE(pendingDelete.id)); setPendingDelete(null); setIsLoading(true); setRefreshCount((count) => count + 1); } catch (errorResponse) { const apiError = getApiError(errorResponse, "The role could not be deleted."); setDeleteError(apiError.code ? `${apiError.message} (${apiError.code})` : apiError.message); } finally { setIsDeleting(false); } };

  return <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7"><div className="mx-auto w-full max-w-[1300px]"><header className="flex flex-col gap-4 border-b border-slate-300 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><ShieldCheck aria-hidden="true" className="size-3.5" />Access design</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Roles and permissions</h1><p className="mt-1 text-sm text-slate-600">Backend-defined roles with exact permission keys.</p></div>{hasPermission(adminPermissions, "roles.create") ? <button ref={createButtonRef} type="button" onClick={() => setDrawerMode({ type: "create" })} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><Plus aria-hidden="true" className="size-4" />Create role</button> : null}</header>{isLoading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading roles and permission catalog...</div> : error ? <div className="grid min-h-60 place-items-center text-center"><div><p className="font-semibold">Roles unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(""); setRefreshCount((count) => count + 1); }} className={`${buttonClass} mt-4 border-slate-300 bg-white text-slate-700`}><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div> : <section className="mt-5 border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_8rem_8rem_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold tracking-wide text-slate-500 uppercase md:grid"><span>Role</span><span>Permissions</span><span>Assignments</span><span>Type</span><span>Actions</span></div>{roles.length ? <div className="divide-y divide-slate-200">{roles.map((role) => <div key={role.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_8rem_8rem_auto] md:items-center"><div><Link to={`/admin/roles/${role.id}`} className="font-semibold text-slate-900 underline-offset-3 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">{role.name}</Link><p className="text-xs text-slate-500">{role.slug}</p>{role.description ? <p className="mt-1 text-xs text-slate-600">{role.description}</p> : null}</div><div className="flex flex-wrap gap-1">{role.permission_keys.slice(0, 5).map((key) => <code key={key} className="bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600">{key}</code>)}{role.permission_keys.length > 5 ? <span className="px-1 py-1 text-[10px] text-slate-500">+{role.permission_keys.length - 5} more</span> : null}</div><div className="text-sm text-slate-600"><span className="md:hidden">Assignments: </span>{role.assignment_count}</div><div className="text-xs font-bold text-slate-600">{role.is_protected ? "Protected" : role.is_system ? "System" : "Custom"}</div><div className="flex flex-wrap gap-1.5 md:justify-end">{hasPermission(adminPermissions, "roles.create") ? <button type="button" onClick={(event) => { cloneButtonRef.current = event.currentTarget; setDrawerMode({ type: "clone", role }); }} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><Copy aria-hidden="true" className="size-3.5" />Clone</button> : null}{hasPermission(adminPermissions, "roles.update") && !role.is_protected ? <Link to={`/admin/roles/${role.id}`} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><Edit3 aria-hidden="true" className="size-3.5" />Edit</Link> : <Link to={`/admin/roles/${role.id}`} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Details</Link>}{hasPermission(adminPermissions, "roles.delete") && !role.is_protected ? <button type="button" onClick={(event) => { deleteButtonRef.current = event.currentTarget; setDeleteError(""); setPendingDelete(role); }} className={`${buttonClass} border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}><Trash2 aria-hidden="true" className="size-3.5" />Delete</button> : null}</div></div>)}</div> : <div className="grid min-h-56 place-items-center text-center"><p className="text-sm text-slate-500">No roles are available.</p></div>}</section>}</div><RoleFormDrawer key={`${drawerMode?.type ?? "closed"}-${drawerMode?.role?.id ?? "new"}`} isOpen={Boolean(drawerMode)} role={null} cloneOf={drawerMode?.type === "clone" ? drawerMode.role : null} permissions={grantablePermissions} onClose={closeDrawer} onSuccess={afterSave} returnFocusRef={drawerMode?.type === "clone" ? cloneButtonRef : createButtonRef} /><AdminConfirmDialog isOpen={Boolean(pendingDelete)} title={`Delete ${pendingDelete?.name}?`} confirmLabel="Delete role" isBusy={isDeleting} onClose={() => setPendingDelete(null)} onConfirm={deleteRole} returnFocusRef={deleteButtonRef}>{deleteError ? <p className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert">{deleteError}</p> : null}<p>This permanently removes the custom role. Roles assigned to users cannot be deleted; a <code>role_in_use</code> conflict leaves it unchanged.</p></AdminConfirmDialog></main>;
};

export { PermissionChecks, RoleFormDrawer };
export default AdminRoles;
