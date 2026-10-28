import { useRef, useState } from "react";
import { Edit3, KeyRound, LoaderCircle, Trash2, UserCheck, UserPlus } from "lucide-react";

import { ENDPOINTS, instance } from "../api";
import { getApiError, getFieldErrors, getName } from "./adminUtils";
import { hasPermission } from "./adminPermissions";
import { useAdminFocusTrap } from "./useAdminFocusTrap";

const inputClass = "min-h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800";
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const blankForm = { email: "", first_name: "", last_name: "", temp_password: "", status: "active", role_ids: [] };
const getInitialForm = (user) => user ? { email: user.email ?? "", first_name: user.first_name ?? "", last_name: user.last_name ?? "", temp_password: "", status: user.status === "deleted" ? "disabled" : user.status, role_ids: user.roles?.map((role) => role.id) ?? [] } : blankForm;

const FieldError = ({ message }) => message ? <p className="mt-1 text-xs font-semibold text-rose-700" role="alert">{message}</p> : null;

const UserFormDrawer = ({ isOpen, user, roles = [], canAssignRoles, isSuperAdmin = false, isRolesLoading = false, rolesError = "", onClose, onSuccess, returnFocusRef }) => {
  const isCreate = !user;
  const [form, setForm] = useState(() => getInitialForm(user));
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const roleCatalogReady = !canAssignRoles || (!isRolesLoading && !rolesError);
  const assignableRoleIds = new Set(roles.map((role) => role.id));
  const canEditRoles = canAssignRoles && roleCatalogReady && (isCreate || isSuperAdmin || (user.roles ?? []).every((role) => assignableRoleIds.has(role.id)));
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleRole = (roleId) => setForm((current) => ({ ...current, role_ids: current.role_ids.includes(roleId) ? current.role_ids.filter((id) => id !== roleId) : [...current.role_ids, roleId] }));
  const close = () => { if (isSaving) return; onClose(); returnFocusRef?.current?.focus(); };
  useAdminFocusTrap({ isOpen, containerRef: drawerRef, initialFocusRef: closeButtonRef, onEscape: close, isBusy: isSaving });

  if (!isOpen) return null;
  const submit = async (event) => {
    event.preventDefault(); setIsSaving(true); setFieldErrors({}); setRequestError("");
    try {
      let savedUser;
      if (isCreate) {
        const response = await instance.post(ENDPOINTS.CREATE_ADMIN_USER(), { email: form.email, first_name: form.first_name, last_name: form.last_name, temp_password: form.temp_password, role_ids: canEditRoles ? form.role_ids : [] });
        savedUser = response.data;
      } else {
        const response = await instance.patch(ENDPOINTS.UPDATE_ADMIN_USER(user.id), { email: form.email, first_name: form.first_name, last_name: form.last_name, status: form.status });
        savedUser = response.data;
        const oldRoleIds = (user.roles ?? []).map((role) => role.id).toSorted((a, b) => a - b);
        const newRoleIds = form.role_ids.toSorted((a, b) => a - b);
        if (canEditRoles && oldRoleIds.join(",") !== newRoleIds.join(",")) savedUser = (await instance.put(ENDPOINTS.REPLACE_ADMIN_USER_ROLES(user.id), { role_ids: form.role_ids })).data;
      }
      setForm(blankForm); onSuccess(savedUser, isCreate);
    } catch (error) { setFieldErrors(getFieldErrors(error)); setRequestError(getApiError(error, "We couldn't save this user.").message); } finally { setIsSaving(false); }
  };

  return <div className="fixed inset-0 z-40 bg-slate-950/30" role="presentation"><aside ref={drawerRef} aria-labelledby="admin-user-drawer-title" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-[#f8faf7] shadow-2xl shadow-slate-950/25" role="dialog"><div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5"><div><p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">{isCreate ? "New account" : "Account editor"}</p><h2 id="admin-user-drawer-title" className="mt-1 text-xl font-semibold tracking-[-0.03em]">{isCreate ? "Create user" : `Edit ${getName(user)}`}</h2><p className="mt-1 text-sm text-slate-500">{isCreate ? "The temporary password is shown only in this form." : "Update identity, status, and assignable roles."}</p></div><button ref={closeButtonRef} type="button" aria-label="Close user drawer" onClick={close} className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><span aria-hidden="true" className="text-2xl leading-none">×</span></button></div><form onSubmit={submit} className="flex flex-1 flex-col"><div className="flex-1 space-y-5 px-5 py-5">{requestError ? <div className="border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">{requestError}</div> : null}<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">First name<input className={`${inputClass} mt-1`} value={form.first_name} onChange={(event) => updateField("first_name", event.target.value)} aria-invalid={Boolean(fieldErrors.first_name)} required /><FieldError message={fieldErrors.first_name} /></label><label className="text-sm font-semibold text-slate-700">Last name<input className={`${inputClass} mt-1`} value={form.last_name} onChange={(event) => updateField("last_name", event.target.value)} aria-invalid={Boolean(fieldErrors.last_name)} required /><FieldError message={fieldErrors.last_name} /></label></div><label className="block text-sm font-semibold text-slate-700">Email<input className={`${inputClass} mt-1`} type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} aria-invalid={Boolean(fieldErrors.email)} required /><FieldError message={fieldErrors.email} /></label>{isCreate ? <label className="block text-sm font-semibold text-slate-700">Temporary password<input className={`${inputClass} mt-1`} type="password" autoComplete="new-password" minLength={8} value={form.temp_password} onChange={(event) => updateField("temp_password", event.target.value)} aria-invalid={Boolean(fieldErrors.temp_password)} required /><span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters. It will not be displayed after submission.</span><FieldError message={fieldErrors.temp_password} /></label> : <label className="block text-sm font-semibold text-slate-700">Account status<select className={`${inputClass} mt-1`} value={form.status} onChange={(event) => updateField("status", event.target.value)} disabled={user.status === "deleted"}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>}{canAssignRoles ? <fieldset><legend className="text-sm font-semibold text-slate-700">Assignable roles</legend>{isRolesLoading ? <p className="mt-2 text-xs text-slate-600" role="status">Role catalog is loading. Role assignment will be available when it finishes.</p> : rolesError ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">Role catalog unavailable: {rolesError}</p> : !canEditRoles ? <p className="mt-2 text-xs text-slate-600">Current role assignments include access outside your grant scope, so role assignment is unavailable.</p> : null}<div className="mt-2 grid gap-2 sm:grid-cols-2">{roles.map((role) => <label key={role.id} className={`flex min-h-11 items-center gap-2 border border-slate-200 bg-white px-3 text-sm text-slate-700 ${canEditRoles ? "cursor-pointer hover:border-emerald-300" : "cursor-not-allowed bg-slate-50 text-slate-400"}`}><input type="checkbox" checked={form.role_ids.includes(role.id)} onChange={() => toggleRole(role.id)} disabled={!canEditRoles} className="size-4 accent-emerald-800" />{role.name}{role.is_protected ? <span className="ml-auto text-[10px] font-bold uppercase text-amber-700">Protected</span> : null}</label>)}</div>{!isRolesLoading && !rolesError && roles.length === 0 ? <p className="mt-2 text-xs text-slate-500">No roles are available to assign.</p> : null}</fieldset> : null}</div><div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={isSaving} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Cancel</button><button type="submit" disabled={isSaving || (isCreate && canAssignRoles && !roleCatalogReady)} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}>{isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : isCreate ? <UserPlus aria-hidden="true" className="size-4" /> : <Edit3 aria-hidden="true" className="size-4" />}{isSaving ? "Saving..." : isCreate && canAssignRoles && !roleCatalogReady ? "Waiting for roles..." : isCreate ? "Create user" : "Save changes"}</button></div></form></aside></div>;
};

const UserActions = ({ user, permissions, onAction }) => {
  const canUpdate = hasPermission(permissions, "users.update") && user.status !== "deleted";
  return <>{canUpdate ? <button type="button" onClick={(event) => onAction({ type: "status", user }, event)} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><UserCheck aria-hidden="true" className="size-3.5" />{user.status === "active" ? "Disable" : "Activate"}</button> : null}{hasPermission(permissions, "users.revoke_sessions") && user.status !== "deleted" ? <button type="button" onClick={(event) => onAction({ type: "revoke", user }, event)} aria-label={`Revoke sessions for ${getName(user)}`} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}><KeyRound aria-hidden="true" className="size-3.5" /><span className="sr-only sm:not-sr-only">Revoke</span></button> : null}{hasPermission(permissions, "users.delete") && user.status !== "deleted" ? <button type="button" onClick={(event) => onAction({ type: "delete", user }, event)} aria-label={`Anonymize ${getName(user)}`} className={`${buttonClass} border-rose-200 bg-white px-3 text-rose-700 hover:bg-rose-50`}><Trash2 aria-hidden="true" className="size-3.5" /><span className="sr-only sm:not-sr-only">Anonymize</span></button> : null}</>;
};

export { UserActions, UserFormDrawer };
