import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Edit3, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, UserX } from "lucide-react";

import { ENDPOINTS, instance } from "../api";
import AdminConfirmDialog from "./AdminConfirmDialog";
import { getApiError, getPagination, getName } from "./adminUtils";
import { getAssignableRoles, hasPermission } from "./adminPermissions";
import { UserActions, UserFormDrawer } from "./AdminUserForm";

const inputClass = "min-h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800";
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

const getProvider = (user) => user.has_password && user.google_linked ? "Password + Google" : user.has_password ? "Password" : user.google_linked ? "Google" : "None";
const hasFilter = (params) => ["search", "status", "role_id", "provider", "profile_complete"].some((key) => params.get(key));
const UserStatus = ({ status }) => <span className={`inline-flex items-center gap-1.5 text-xs font-bold capitalize ${status === "active" ? "text-emerald-700" : status === "disabled" ? "text-amber-700" : "text-slate-500"}`}><span aria-hidden="true" className={`size-2 rounded-full ${status === "active" ? "bg-emerald-600" : status === "disabled" ? "bg-amber-500" : "bg-slate-400"}`} />{status}</span>;

const UserRecord = ({ user, permissions, onEdit, onAction }) => {
  const canUpdate = hasPermission(permissions, "users.update") && user.status !== "deleted";
  return <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(0,1fr)_auto] md:items-center">
    <div className="min-w-0"><Link to={`/admin/users/${user.id}`} className="font-semibold text-slate-900 underline-offset-3 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">{getName(user)}</Link><p className="truncate text-xs text-slate-500">{user.email ?? "Identity anonymized"}</p></div>
    <div><p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase md:hidden">Status</p><UserStatus status={user.status} /></div>
    <div className="text-sm text-slate-600"><p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase md:hidden">Provider</p>{getProvider(user)}</div>
    <div className="flex flex-wrap gap-1">{user.roles.length ? user.roles.map((role) => <span key={role.id} className="bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900">{role.name}</span>) : <span className="text-xs text-slate-500">No roles</span>}</div>
    <div className="flex flex-wrap gap-1.5 md:justify-end"><Link to={`/admin/users/${user.id}`} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Details</Link>{canUpdate ? <button type="button" onClick={onEdit} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><Edit3 aria-hidden="true" className="size-3.5" />Edit</button> : null}<UserActions user={user} permissions={permissions} onAction={onAction} /></div>
  </div>;
};


const AdminUsers = () => {
  const { adminPermissions, isSuperAdmin } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const canAssignRoles = hasPermission(adminPermissions, "users.assign_roles");
  const canReadRoles = hasPermission(adminPermissions, "roles.read");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 25, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rolesError, setRolesError] = useState("");
  const [isRolesLoading, setIsRolesLoading] = useState(() => canReadRoles);
  const [refreshCount, setRefreshCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const editButtonRef = useRef(null);
  const createButtonRef = useRef(null);
  const actionTriggerRef = useRef(null);
  const assignableRoles = getAssignableRoles(roles, adminPermissions, isSuperAdmin);
  const roleCatalogError = rolesError || (canAssignRoles && !canReadRoles ? "Your current permissions cannot load the role catalog." : "");
  const queryKey = searchParams.toString();

  useEffect(() => {
    if (!canReadRoles) return undefined;
    let isCurrent = true;
    instance.get(ENDPOINTS.GET_ADMIN_ROLES()).then((response) => { if (isCurrent) { setRoles(response.data); setRolesError(""); } }).catch((requestError) => { if (isCurrent) setRolesError(getApiError(requestError, "Role filters are unavailable.").message); }).finally(() => { if (isCurrent) setIsRolesLoading(false); });
    return () => { isCurrent = false; };
  }, [adminPermissions, canReadRoles]);

  useEffect(() => {
    let isCurrent = true;
    const params = Object.fromEntries(new URLSearchParams(queryKey));
    instance.get(ENDPOINTS.GET_ADMIN_USERS(params)).then((response) => {
      if (!isCurrent) return;
      setUsers(response.data);
      setPagination(getPagination(response));
    }).catch((requestError) => { if (isCurrent) setError(getApiError(requestError, "We couldn't load users.").message); }).finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [queryKey, refreshCount]);

  const updateQuery = (key, value) => {
    setIsLoading(true);
    setError("");
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };
  const submitSearch = (event) => { event.preventDefault(); updateQuery("search", searchInput.trim()); };
  const clearFilters = () => { setIsLoading(true); setError(""); setSearchInput(""); setSearchParams({}); };
  const openCreate = () => { setEditingUser(null); setIsDrawerOpen(true); };
  const openEdit = (user, event) => { editButtonRef.current = event.currentTarget; setEditingUser(user); setIsDrawerOpen(true); };
  const closeDrawer = () => { setIsDrawerOpen(false); setEditingUser(null); };
  const afterSave = (_, isCreate) => { closeDrawer(); setIsLoading(true); setStatusMessage(isCreate ? "User created." : "User changes saved."); setRefreshCount((count) => count + 1); };
  const onAction = (action, event) => { actionTriggerRef.current = event?.currentTarget ?? null; setActionError(""); setPendingAction(action); };

  const confirmAction = async () => {
    const { type, user } = pendingAction;
    setIsActionBusy(true);
    setActionError("");
    try {
      if (type === "status") await instance.patch(ENDPOINTS.UPDATE_ADMIN_USER(user.id), { status: user.status === "active" ? "disabled" : "active" });
      if (type === "revoke") await instance.post(ENDPOINTS.REVOKE_ADMIN_USER_SESSIONS(user.id));
      if (type === "delete") await instance.delete(ENDPOINTS.DELETE_ADMIN_USER(user.id));
      setPendingAction(null);
      setStatusMessage(type === "status" ? `User ${user.status === "active" ? "disabled" : "activated"}.` : type === "revoke" ? "Sessions revoked." : "User anonymized.");
      setIsLoading(true);
      setRefreshCount((count) => count + 1);
    } catch (requestError) {
      const apiError = getApiError(requestError, "The action could not be completed.");
      setActionError(apiError.message);
    } finally { setIsActionBusy(false); }
  };

  const actionText = pendingAction ? pendingAction.type === "status" ? `${pendingAction.user.status === "active" ? "Disable" : "Activate"} ${getName(pendingAction.user)}?` : pendingAction.type === "revoke" ? `Revoke all sessions for ${getName(pendingAction.user)}?` : `Anonymize ${getName(pendingAction.user)}?` : "";
  const paramsHaveFilters = hasFilter(searchParams);

  return <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
    <div className="mx-auto w-full max-w-[1500px]">
      <header className="flex flex-col gap-4 border-b border-slate-300 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><ShieldCheck aria-hidden="true" className="size-3.5" />User management</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Workspace users</h1><p className="mt-1 text-sm text-slate-600">Search, review, and safely manage user access.</p></div>{hasPermission(adminPermissions, "users.create") ? <button ref={createButtonRef} type="button" onClick={openCreate} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><Plus aria-hidden="true" className="size-4" />Create user</button> : null}</header>
      {statusMessage ? <p className="mt-4 border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">{statusMessage}</p> : null}
      <section aria-label="User filters" className="mt-5 border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><form onSubmit={submitSearch} className="grid gap-3 lg:grid-cols-[minmax(14rem,2fr)_repeat(5,minmax(8rem,1fr))_auto]"><label className="text-xs font-bold text-slate-600 lg:col-span-1">Search<input className={`${inputClass} mt-1`} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name or email" /></label><label className="text-xs font-bold text-slate-600">Status<select className={`${inputClass} mt-1`} value={searchParams.get("status") ?? ""} onChange={(event) => updateQuery("status", event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="deleted">Deleted</option></select></label><label className="text-xs font-bold text-slate-600">Provider<select className={`${inputClass} mt-1`} value={searchParams.get("provider") ?? ""} onChange={(event) => updateQuery("provider", event.target.value)}><option value="">All providers</option><option value="password">Password</option><option value="google">Google</option></select></label><label className="text-xs font-bold text-slate-600">Profile<select className={`${inputClass} mt-1`} value={searchParams.get("profile_complete") ?? ""} onChange={(event) => updateQuery("profile_complete", event.target.value)}><option value="">Any profile</option><option value="true">Complete</option><option value="false">Incomplete</option></select></label><label className="text-xs font-bold text-slate-600">Sort<select className={`${inputClass} mt-1`} value={searchParams.get("sort_by") ?? "created_at"} onChange={(event) => updateQuery("sort_by", event.target.value)}><option value="created_at">Created</option><option value="updated_at">Updated</option><option value="email">Email</option><option value="first_name">First name</option><option value="last_name">Last name</option><option value="status">Status</option></select></label><label className="text-xs font-bold text-slate-600">Order<select className={`${inputClass} mt-1`} value={searchParams.get("sort_order") ?? "desc"} onChange={(event) => updateQuery("sort_order", event.target.value)}><option value="desc">Newest</option><option value="asc">Oldest</option></select></label><button type="submit" className={`${buttonClass} self-end border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><Search aria-hidden="true" className="size-4" />Search</button></form><div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-xs font-bold text-slate-600">Role<select className="ml-2 min-h-9 border border-slate-300 bg-white px-2 text-xs font-semibold focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800" value={searchParams.get("role_id") ?? ""} onChange={(event) => updateQuery("role_id", event.target.value)} disabled={!roles.length}>{roles.length ? <><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</> : <option value="">{rolesError ? "Unavailable" : "No roles"}</option>}</select></label>{paramsHaveFilters ? <button type="button" onClick={clearFilters} className="cursor-pointer text-xs font-bold text-emerald-800 underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Clear filters</button> : null}</div></section>
      {isLoading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading users...</div> : error ? <div className="grid min-h-60 place-items-center px-5 text-center"><div><UserX aria-hidden="true" className="mx-auto size-8 text-rose-600" /><p className="mt-3 font-semibold">Users unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(""); setRefreshCount((count) => count + 1); }} className={`${buttonClass} mt-4 border-slate-300 bg-white text-slate-700`}><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div> : <>
        <section className="mt-5 border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold tracking-wide text-slate-500 uppercase md:grid"><span>User</span><span>Status</span><span>Provider</span><span>Roles</span><span className="text-right">Actions</span></div>{users.length ? <div className="divide-y divide-slate-200">{users.map((user) => <UserRecord key={user.id} user={user} permissions={adminPermissions} onEdit={(event) => openEdit(user, event)} onAction={onAction} />)}</div> : <div className="grid min-h-56 place-items-center px-5 text-center"><div><Search aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">{paramsHaveFilters ? "No users match these filters" : "No users found"}</p><p className="mt-1 text-sm text-slate-500">{paramsHaveFilters ? "Try changing or clearing your filters." : "Create the first workspace user to begin."}</p></div></div>}<div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>{pagination.total} record{pagination.total === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => updateQuery("page", String(pagination.page - 1))} aria-label="Previous page" className={`${buttonClass} min-h-9 border-slate-300 bg-white text-slate-700`}><ChevronLeft aria-hidden="true" className="size-4" /></button><span className="font-semibold">Page {pagination.page} of {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => updateQuery("page", String(pagination.page + 1))} aria-label="Next page" className={`${buttonClass} min-h-9 border-slate-300 bg-white text-slate-700`}><ChevronRight aria-hidden="true" className="size-4" /></button></div></div></section>
      </>}
    </div>
    <UserFormDrawer key={`${isDrawerOpen}-${editingUser?.id ?? "new"}`} isOpen={isDrawerOpen} user={editingUser} roles={assignableRoles} canAssignRoles={canAssignRoles} isSuperAdmin={isSuperAdmin} isRolesLoading={isRolesLoading} rolesError={roleCatalogError} onClose={closeDrawer} onSuccess={afterSave} returnFocusRef={editingUser ? editButtonRef : createButtonRef} />
    <AdminConfirmDialog isOpen={Boolean(pendingAction)} title={actionText} confirmLabel={pendingAction?.type === "delete" ? "Anonymize user" : pendingAction?.type === "revoke" ? "Revoke sessions" : pendingAction?.user?.status === "active" ? "Disable user" : "Activate user"} isBusy={isActionBusy} onClose={() => setPendingAction(null)} onConfirm={confirmAction} returnFocusRef={actionTriggerRef}>{actionError ? <p className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert">{actionError}</p> : null}{pendingAction?.type === "delete" ? <p>Anonymization removes identity, credentials, role assignments, and memberships. Owned projects must be transferred first; a conflict will leave the account unchanged.</p> : pendingAction?.type === "revoke" ? <p>Every active session will be invalidated. The user will need to sign in again.</p> : <p>This changes the account's ability to sign in. Continue only if you have reviewed the impact.</p>}</AdminConfirmDialog>
  </main>;
};

export default AdminUsers;
