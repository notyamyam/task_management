import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Edit3, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

import { ENDPOINTS, instance } from "../api";
import AdminConfirmDialog from "./AdminConfirmDialog";
import AdminForbidden from "./AdminForbidden";
import { UserActions, UserFormDrawer } from "./AdminUserForm";
import { getApiError, getName } from "./adminUtils";
import { getAssignableRoles, hasPermission } from "./adminPermissions";

const AdminUserDetails = () => {
  const { adminPermissions, isSuperAdmin } = useOutletContext();
  const { userId } = useParams();
  const navigate = useNavigate();
  const canAssignRoles = hasPermission(adminPermissions, "users.assign_roles");
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [isRolesLoading, setIsRolesLoading] = useState(() => canAssignRoles && hasPermission(adminPermissions, "roles.read"));
  const [rolesError, setRolesError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const editButtonRef = useRef(null);
  const actionTriggerRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    instance.get(ENDPOINTS.GET_ADMIN_USER(userId)).then((response) => { if (isCurrent) setUser(response.data); }).catch((requestError) => { if (isCurrent) setError(getApiError(requestError, "We couldn't load this user.").message); }).finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [refreshCount, userId]);

  useEffect(() => {
    if (!canAssignRoles || !hasPermission(adminPermissions, "roles.read")) return undefined;
    let isCurrent = true;
    instance.get(ENDPOINTS.GET_ADMIN_ROLES()).then((response) => { if (isCurrent) { setRoles(response.data); setRolesError(""); } }).catch((requestError) => { if (isCurrent) setRolesError(getApiError(requestError, "Role catalog unavailable.").message); }).finally(() => { if (isCurrent) setIsRolesLoading(false); });
    return () => { isCurrent = false; };
  }, [adminPermissions, canAssignRoles]);

  if (!hasPermission(adminPermissions, "users.read")) return <AdminForbidden title="User access is restricted" message="Your current administration permissions do not include user records." />;

  const openAction = (action, event) => { actionTriggerRef.current = event?.currentTarget ?? null; setActionError(""); setPendingAction(action); };
  const closeDrawer = () => setIsDrawerOpen(false);
  const afterSave = (savedUser) => { setUser((current) => ({ ...current, ...savedUser })); closeDrawer(); setIsLoading(true); setRefreshCount((count) => count + 1); };
  const confirmAction = async () => {
    const { type, user: target } = pendingAction;
    setIsActionBusy(true);
    setActionError("");
    try {
      if (type === "status") await instance.patch(ENDPOINTS.UPDATE_ADMIN_USER(target.id), { status: target.status === "active" ? "disabled" : "active" });
      if (type === "revoke") await instance.post(ENDPOINTS.REVOKE_ADMIN_USER_SESSIONS(target.id));
      if (type === "delete") await instance.delete(ENDPOINTS.DELETE_ADMIN_USER(target.id));
      setPendingAction(null);
      if (type === "delete") navigate("/admin/users"); else { setIsLoading(true); setRefreshCount((count) => count + 1); }
    } catch (requestError) { setActionError(getApiError(requestError, "The action could not be completed.").message); } finally { setIsActionBusy(false); }
  };

  const actionTitle = pendingAction ? pendingAction.type === "status" ? `${pendingAction.user.status === "active" ? "Disable" : "Activate"} ${getName(pendingAction.user)}?` : pendingAction.type === "revoke" ? `Revoke all sessions for ${getName(pendingAction.user)}?` : `Anonymize ${getName(pendingAction.user)}?` : "";

  const assignableRoles = getAssignableRoles(roles, adminPermissions, isSuperAdmin);
  const roleCatalogError = rolesError || (canAssignRoles && !hasPermission(adminPermissions, "roles.read") ? "Your current permissions cannot load the role catalog." : "");

  return <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
    <div className="mx-auto w-full max-w-[1200px]">
      <Link to="/admin/users" className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-emerald-800 underline-offset-3 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><ArrowLeft aria-hidden="true" className="size-4" />Back to users</Link>
      {isLoading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading user...</div> : error ? <div className="grid min-h-60 place-items-center px-5 text-center"><div><p className="font-semibold">User unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(""); setRefreshCount((count) => count + 1); }} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div> : user ? <>
        <header className="mt-4 flex flex-col gap-4 border-b border-slate-300 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><ShieldCheck aria-hidden="true" className="size-3.5" />User details</p><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{getName(user)}</h1><p className="mt-1 text-sm text-slate-500">{user.email ?? "Identity anonymized"}</p></div><div className="flex flex-wrap gap-2"><button ref={editButtonRef} type="button" disabled={!hasPermission(adminPermissions, "users.update") || user.status === "deleted"} onClick={() => setIsDrawerOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Edit3 aria-hidden="true" className="size-4" />Edit user</button><UserActions user={user} permissions={adminPermissions} onAction={openAction} /></div></header>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(15rem,1fr)]"><section className="border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><h2 className="text-sm font-bold text-slate-800">Identity and access</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 font-semibold capitalize">{user.status}</dd></div><div><dt className="text-xs text-slate-500">Profile</dt><dd className="mt-1 font-semibold">{user.profile_complete ? "Complete" : "Incomplete"}</dd></div><div><dt className="text-xs text-slate-500">Providers</dt><dd className="mt-1 font-semibold">{user.has_password && user.google_linked ? "Password + Google" : user.has_password ? "Password" : user.google_linked ? "Google" : "None"}</dd></div><div><dt className="text-xs text-slate-500">Roles</dt><dd className="mt-1 flex flex-wrap gap-1">{user.roles.length ? user.roles.map((role) => <span key={role.id} className="bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">{role.name}</span>) : "No roles"}</dd></div></dl></section><section className="border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><h2 className="text-sm font-bold text-slate-800">Permission-filtered activity</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Owned projects</dt><dd className="font-semibold">{user.owned_projects ? user.owned_projects.count : "Not available"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Project memberships</dt><dd className="font-semibold">{user.project_memberships ? user.project_memberships.count : "Not available"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Tasks created</dt><dd className="font-semibold">{user.task_activity ? user.task_activity.created_count : "Not available"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Tasks assigned</dt><dd className="font-semibold">{user.task_activity ? user.task_activity.assigned_count : "Not available"}</dd></div></dl></section></div>
        <section className="mt-4 border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><h2 className="text-sm font-bold text-slate-800">Effective permissions</h2><div className="mt-3 flex flex-wrap gap-2">{user.effective_permissions.length ? user.effective_permissions.map((permission) => <code key={permission} className="bg-slate-100 px-2 py-1 text-xs text-slate-700">{permission}</code>) : <p className="text-sm text-slate-500">No effective permissions.</p>}</div></section>
      </> : null}
    </div>
     {user ? <UserFormDrawer key={`${isDrawerOpen}-${user.id}`} isOpen={isDrawerOpen} user={user} roles={assignableRoles} canAssignRoles={canAssignRoles} isSuperAdmin={isSuperAdmin} isRolesLoading={isRolesLoading} rolesError={roleCatalogError} onClose={closeDrawer} onSuccess={afterSave} returnFocusRef={editButtonRef} /> : null}
    <AdminConfirmDialog isOpen={Boolean(pendingAction)} title={actionTitle} confirmLabel={pendingAction?.type === "delete" ? "Anonymize user" : pendingAction?.type === "revoke" ? "Revoke sessions" : pendingAction?.user?.status === "active" ? "Disable user" : "Activate user"} isBusy={isActionBusy} onClose={() => setPendingAction(null)} onConfirm={confirmAction} returnFocusRef={actionTriggerRef}>{actionError ? <p className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert">{actionError}</p> : null}{pendingAction?.type === "delete" ? <p>{user?.owned_projects?.count ? `This account owns ${user.owned_projects.count} project${user.owned_projects.count === 1 ? "" : "s"}; transfer them before anonymizing.` : "Anonymization removes identity, credentials, role assignments, and memberships. A project ownership conflict will leave the account unchanged."}</p> : pendingAction?.type === "revoke" ? <p>Every active session will be invalidated. The user will need to sign in again.</p> : <p>This changes the account&apos;s ability to sign in. Continue only if you have reviewed the impact.</p>}</AdminConfirmDialog>
  </main>;
};

export default AdminUserDetails;
