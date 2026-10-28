import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Edit3, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { ENDPOINTS, instance } from "../api";
import AdminConfirmDialog from "./AdminConfirmDialog";
import AdminForbidden from "./AdminForbidden";
import { PermissionChecks, RoleFormDrawer } from "./AdminRoles";
import { getApiError } from "./adminUtils";
import { getGrantablePermissions, hasPermission } from "./adminPermissions";

const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

const AdminRoleDetails = () => {
  const { adminPermissions, isSuperAdmin } = useOutletContext();
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const editButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const reviewButtonRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([instance.get(ENDPOINTS.GET_ADMIN_ROLE(roleId)), instance.get(ENDPOINTS.GET_ADMIN_PERMISSIONS())]).then(([roleResponse, permissionResponse]) => { if (isCurrent) { setRole(roleResponse.data); setSelectedPermissions(roleResponse.data.permission_keys); setPermissions(permissionResponse.data); } }).catch((requestError) => { if (isCurrent) setError(getApiError(requestError, "We couldn't load this role.").message); }).finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [refreshCount, roleId]);

  if (!hasPermission(adminPermissions, "roles.read")) return <AdminForbidden title="Role access is restricted" message="Your current administration permissions do not include role records." />;

  const grantablePermissions = getGrantablePermissions(permissions, adminPermissions, isSuperAdmin);
  const setPermissionsAndCloseReview = (key) => setSelectedPermissions((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const changedPermissions = role ? { added: selectedPermissions.filter((key) => !role.permission_keys.includes(key)), removed: role.permission_keys.filter((key) => !selectedPermissions.includes(key)) } : { added: [], removed: [] };
  const hasChanges = changedPermissions.added.length > 0 || changedPermissions.removed.length > 0;
  const reloadRole = () => { setShowReview(false); setIsLoading(true); setError(""); setRefreshCount((count) => count + 1); };
  const savePermissions = async () => {
    setIsSaving(true); setSaveError(null);
    try {
      const response = await instance.put(ENDPOINTS.REPLACE_ADMIN_ROLE_PERMISSIONS(role.id), { version: role.version, permission_keys: selectedPermissions });
      setRole(response.data); setSelectedPermissions(response.data.permission_keys); setShowReview(false);
    } catch (requestError) { const apiError = getApiError(requestError, "The permission changes could not be saved."); setSaveError(apiError); } finally { setIsSaving(false); }
  };
  const deleteRole = async () => {
    setIsDeleting(true); setDeleteError("");
    try { await instance.delete(ENDPOINTS.DELETE_ADMIN_ROLE(role.id)); navigate("/admin/roles"); } catch (requestError) { const apiError = getApiError(requestError, "The role could not be deleted."); setDeleteError(apiError.code ? `${apiError.message} (${apiError.code})` : apiError.message); } finally { setIsDeleting(false); }
  };
  const afterRoleEdit = (updatedRole) => { setRole((current) => ({ ...current, ...updatedRole })); setIsDrawerOpen(false); setRefreshCount((count) => count + 1); };
  const canEdit = hasPermission(adminPermissions, "roles.update") && !role?.is_protected;
  const canSetPermissions = hasPermission(adminPermissions, "roles.set_permissions") && !role?.is_protected && (isSuperAdmin || (role?.permission_keys ?? []).every((key) => adminPermissions.includes(key)));

  return <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7"><div className="mx-auto w-full max-w-[1300px]"><Link to="/admin/roles" className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-emerald-800 underline-offset-3 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><ArrowLeft aria-hidden="true" className="size-4" />Back to roles</Link>{isLoading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading role and permission catalog...</div> : error ? <div className="grid min-h-60 place-items-center text-center"><div><p className="font-semibold">Role unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={reloadRole} className={`${buttonClass} mt-4 border-slate-300 bg-white text-slate-700`}><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div> : role ? <>
      <header className="mt-4 flex flex-col gap-4 border-b border-slate-300 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><ShieldCheck aria-hidden="true" className="size-3.5" />Role details</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{role.name}</h1><p className="mt-1 text-sm text-slate-500">{role.slug} · version {role.version}</p></div><div className="flex flex-wrap gap-2">{canEdit ? <button ref={editButtonRef} type="button" onClick={() => setIsDrawerOpen(true)} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><Edit3 aria-hidden="true" className="size-4" />Edit role</button> : null}{hasPermission(adminPermissions, "roles.delete") && !role.is_protected ? <button ref={deleteButtonRef} type="button" onClick={() => { setDeleteError(""); setPendingDelete(true); }} className={`${buttonClass} border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}><Trash2 aria-hidden="true" className="size-4" />Delete role</button> : null}</div></header>
       <section className="mt-5 border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-800">Permission matrix</h2><p className="mt-1 text-sm text-slate-500">Permissions are loaded from the backend catalog and submitted by exact key.</p></div><span className="text-xs font-bold text-slate-500">{selectedPermissions.length} selected · {role.assignment_count} assignments</span></div>{role.is_protected ? <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">This protected role cannot be edited, deleted, or have permissions replaced.</p> : null}{permissions.length ? grantablePermissions.length ? <PermissionChecks permissions={grantablePermissions} selected={selectedPermissions} onToggle={setPermissionsAndCloseReview} disabled={!canSetPermissions} /> : <p className="mt-5 text-sm text-slate-500">You cannot grant any permissions in this catalog.</p> : <p className="mt-5 text-sm text-slate-500">The permission catalog is empty.</p>}{canSetPermissions ? <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Changes are checked against role version {role.version}.</p><button ref={reviewButtonRef} type="button" disabled={!hasChanges} onClick={() => setShowReview(true)} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}>Review permission changes</button></div>{saveError ? <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800" role="alert"><p>{saveError.message}</p>{saveError.code === "stale_role_version" ? <button type="button" onClick={reloadRole} className="mt-2 cursor-pointer font-bold underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Reload role</button> : null}</div> : null}</div> : null}</section>
      {role.description ? <section className="mt-4 border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><h2 className="text-sm font-bold text-slate-800">Description</h2><p className="mt-2">{role.description}</p></section> : null}
     </> : null}</div><RoleFormDrawer key={`${isDrawerOpen}-${role?.id ?? "none"}`} isOpen={isDrawerOpen} role={role} permissions={grantablePermissions} onClose={() => setIsDrawerOpen(false)} onSuccess={afterRoleEdit} returnFocusRef={editButtonRef} /><AdminConfirmDialog isOpen={pendingDelete} title={`Delete ${role?.name}?`} confirmLabel="Delete role" isBusy={isDeleting} onClose={() => setPendingDelete(false)} onConfirm={deleteRole} returnFocusRef={deleteButtonRef}>{deleteError ? <p className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert">{deleteError}</p> : null}<p>Deleting a role is allowed only when no users are assigned to it. A <code>role_in_use</code> conflict leaves this role unchanged.</p></AdminConfirmDialog><AdminConfirmDialog isOpen={showReview} title="Review permission changes" confirmLabel="Apply changes" isBusy={isSaving} onClose={() => setShowReview(false)} onConfirm={savePermissions} returnFocusRef={reviewButtonRef}>{saveError ? <div className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800"><p>{saveError.message}</p>{saveError.code === "stale_role_version" ? <button type="button" onClick={reloadRole} className="mt-2 cursor-pointer font-bold underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Reload role</button> : null}</div> : null}<p>These exact permission keys will replace the current assignment.</p><div className="mt-3 space-y-2 text-xs">{changedPermissions.added.length ? <div><p className="font-bold text-emerald-800">Added</p><ul className="mt-1 list-disc pl-5">{changedPermissions.added.map((key) => <li key={key}><code>{key}</code></li>)}</ul></div> : null}{changedPermissions.removed.length ? <div><p className="font-bold text-rose-700">Removed</p><ul className="mt-1 list-disc pl-5">{changedPermissions.removed.map((key) => <li key={key}><code>{key}</code></li>)}</ul></div> : null}</div></AdminConfirmDialog></main>;
};

export default AdminRoleDetails;
