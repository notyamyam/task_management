import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, FolderKanban, LoaderCircle, Plus, RefreshCw, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { ENDPOINTS, instance } from "../api";
import AdminConfirmDialog from "./AdminConfirmDialog";
import AdminForbidden from "./AdminForbidden";
import { hasPermission } from "./adminPermissions";
import { getApiError, getPagination, getName } from "./adminUtils";
import { useAdminFocusTrap } from "./useAdminFocusTrap";

const inputClass = "min-h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-100";
const buttonClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border px-3 text-sm font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const ProjectDrawer = ({ isOpen, project, users, usersLoading, usersError, onClose, onSuccess, returnFocusRef }) => {
  const isCreate = !project;
  const [form, setForm] = useState(() => ({ name: project?.name ?? "", description: project?.description ?? "", owner_id: project?.owner_id ? String(project.owner_id) : "" }));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const drawerRef = useRef(null);
  const closeRef = useRef(null);

  const close = () => { if (isSaving) return; onClose(); returnFocusRef?.current?.focus(); };
  useAdminFocusTrap({ isOpen, containerRef: drawerRef, initialFocusRef: closeRef, onEscape: close, isBusy: isSaving });
  if (!isOpen) return null;

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true); setError(""); setFieldErrors({});
    try {
      const payload = isCreate
        ? { name: form.name, description: form.description || null, owner_id: Number(form.owner_id) }
        : { name: form.name, description: form.description || null };
      const response = isCreate
        ? await instance.post(ENDPOINTS.CREATE_ADMIN_PROJECT(), payload)
        : await instance.patch(ENDPOINTS.UPDATE_ADMIN_PROJECT(project.id), payload);
      onSuccess(response.data);
    } catch (requestError) {
      setError(getApiError(requestError, "We couldn't save this project.").message);
      const detail = requestError.response?.data?.detail;
      if (Array.isArray(detail)) setFieldErrors(detail.reduce((result, item) => ({ ...result, [item.loc?.at(-1)]: item.msg }), {}));
    } finally { setIsSaving(false); }
  };

  return <div className="fixed inset-0 z-40 bg-slate-950/30" role="presentation"><aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="admin-project-drawer-title" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-[#f8faf7] shadow-2xl shadow-slate-950/25"><div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5"><div><p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Project editor</p><h2 id="admin-project-drawer-title" className="mt-1 text-xl font-semibold">{isCreate ? "Create project" : `Edit ${project.name}`}</h2><p className="mt-1 text-sm text-slate-500">Project names are unique across the workspace.</p></div><button ref={closeRef} type="button" onClick={close} aria-label="Close project drawer" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-5" /></button></div><form onSubmit={submit} className="flex flex-1 flex-col"><div className="flex-1 space-y-5 px-5 py-5">{error ? <p className="border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">{error}</p> : null}<label className="block text-sm font-semibold text-slate-700">Project name<input required maxLength={255} className={`${inputClass} mt-1`} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name ? <span className="mt-1 block text-xs text-rose-700" role="alert">{fieldErrors.name}</span> : null}</label><label className="block text-sm font-semibold text-slate-700">Description <span className="font-normal text-slate-500">(optional)</span><textarea maxLength={1000} rows={5} className={`${inputClass} mt-1 resize-y py-2.5`} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>{isCreate ? <label className="block text-sm font-semibold text-slate-700">Active owner<select required className={`${inputClass} mt-1`} value={form.owner_id} onChange={(event) => setForm((current) => ({ ...current, owner_id: event.target.value }))} disabled={usersLoading || Boolean(usersError)}><option value="">{usersLoading ? "Loading active users..." : usersError ? "Active user catalog unavailable" : "Choose an active owner"}</option>{users.map((user) => <option key={user.id} value={user.id}>{getName(user)} · {user.email}</option>)}</select>{usersError ? <span className="mt-1 block text-xs text-amber-800">{usersError} Project creation needs a verified active owner.</span> : <span className="mt-1 block text-xs text-slate-500">Disabled and deleted accounts are not offered.</span>}</label> : null}</div><div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><button type="button" disabled={isSaving} onClick={close} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Cancel</button><button type="submit" disabled={isSaving || (isCreate && (!form.owner_id || usersLoading || Boolean(usersError)))} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}>{isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}{isSaving ? "Saving..." : isCreate ? "Create project" : "Save changes"}</button></div></form></aside></div>;
};

const ProjectRow = ({ project, selected, onSelect, onEdit, onDelete, canUpdate, canDelete }) => <article className={`border-b border-slate-200 p-4 transition last:border-0 ${selected ? "bg-emerald-50/60" : "bg-white hover:bg-slate-50"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onSelect} className="min-w-0 cursor-pointer text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><h2 className="truncate font-semibold text-slate-950">{project.name}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-500">{project.description || "No description"}</p></button><div className="flex shrink-0 flex-wrap gap-2"><span className="text-xs text-slate-500">Owner #{project.owner_id}</span>{canUpdate ? <button type="button" data-admin-project-edit={project.id} onClick={onEdit} aria-label={`Edit ${project.name}`} className={`${buttonClass} min-h-10 border-slate-300 bg-white text-slate-700`}><Edit3 aria-hidden="true" className="size-3.5" />Edit</button> : null}{canDelete ? <button type="button" onClick={onDelete} aria-label={`Delete ${project.name}`} className={`${buttonClass} min-h-10 border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}><Trash2 aria-hidden="true" className="size-3.5" />Delete</button> : null}</div></div><p className="mt-3 text-xs text-slate-400">Updated {dateFormatter.format(new Date(project.updated_at))}</p></article>;

const AdminProjects = () => {
  const { adminPermissions } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersError, setMembersError] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const createRef = useRef(null);
  const editRef = useRef(null);
  const actionRef = useRef(null);
  const focusAfterSaveRef = useRef(null);
  const canRead = hasPermission(adminPermissions, "projects.read");
  const canReadUsers = hasPermission(adminPermissions, "users.read");
  const queryKey = searchParams.toString();

  useEffect(() => {
    if (!canReadUsers) return undefined;
    let current = true;
    instance.get(ENDPOINTS.GET_ADMIN_USERS({ status: "active", page_size: 100, sort_by: "first_name", sort_order: "asc" })).then((response) => { if (current) { setUsers(response.data); setUsersError(""); } }).catch((requestError) => { if (current) setUsersError(getApiError(requestError, "Active user catalog unavailable.").message); }).finally(() => { if (current) setUsersLoading(false); });
    return () => { current = false; };
  }, [canReadUsers]);

  useEffect(() => {
    let current = true;
    instance.get(ENDPOINTS.GET_ADMIN_PROJECTS(Object.fromEntries(new URLSearchParams(queryKey)))).then((response) => { if (current) { setProjects(response.data); setPagination(getPagination(response)); setError(""); } }).catch((requestError) => { if (current) setError(getApiError(requestError, "We couldn't load projects.").message); }).finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [queryKey, refresh]);

  useEffect(() => {
    if (!selectedProject || !hasPermission(adminPermissions, "project_members.read")) return undefined;
    let current = true;
    instance.get(ENDPOINTS.GET_ADMIN_PROJECT_MEMBERS(selectedProject.id, { page_size: 100 })).then((response) => { if (current) { setMembers(response.data); setMembersError(""); } }).catch((requestError) => { if (current) setMembersError(getApiError(requestError, "We couldn't load project members.").message); }).finally(() => { if (current) setMembersLoading(false); });
    return () => { current = false; };
  }, [adminPermissions, selectedProject, refresh]);

  useEffect(() => {
    const pending = focusAfterSaveRef.current;
    if (!pending || isLoading) return;
    const trigger = (pending.selector && document.querySelector(pending.selector)) ?? pending.ref.current;
    const target = trigger?.isConnected ? trigger : document.querySelector(pending.fallbackSelector);
    if (!target?.isConnected) return;
    target.focus();
    focusAfterSaveRef.current = null;
  }, [isLoading, projects]);

  if (!canRead) return <AdminForbidden title="Project access is restricted" message="Your current administration permissions do not include project records." />;

  const updateQuery = (key, value) => { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); setError(""); setSearchParams(next); };
  const submitSearch = (event) => { event.preventDefault(); updateQuery("search", searchInput.trim()); };
  const reload = () => { setIsLoading(true); setError(""); setMembersError(""); if (selectedProject) setMembersLoading(true); setRefresh((count) => count + 1); };
  const openDelete = (project, event) => { actionRef.current = event.currentTarget; setActionError(""); setPendingAction({ type: "delete", project }); };
  const closeDrawer = (focusTarget) => { if (focusTarget) focusAfterSaveRef.current = focusTarget; setDrawer(null); };
  const afterSave = (saved) => { const isEdit = projects.some((item) => item.id === saved.id); setStatusMessage(isEdit ? "Project changes saved." : "Project created."); setSelectedProject(saved); reload(); closeDrawer(isEdit ? { ref: editRef, selector: `button[data-admin-project-edit="${saved.id}"]`, fallbackSelector: "[data-admin-project-page-heading]" } : { ref: createRef, fallbackSelector: "[data-admin-project-page-heading]" }); };
  const refreshAfterAction = () => { setPendingAction(null); setStatusMessage("Project change saved."); reload(); };
  const confirmAction = async () => {
    setIsActionBusy(true); setActionError("");
    try {
      if (pendingAction.type === "delete") {
        await instance.delete(ENDPOINTS.DELETE_ADMIN_PROJECT(pendingAction.project.id, pendingAction.cascade));
        setSelectedProject(null); refreshAfterAction(); return;
      }
      if (pendingAction.type === "transfer") {
        const response = await instance.post(ENDPOINTS.TRANSFER_ADMIN_PROJECT(pendingAction.project.id), { new_owner_id: Number(pendingAction.userId) });
        setSelectedProject(response.data);
      }
      if (pendingAction.type === "add-member") await instance.post(ENDPOINTS.ADD_ADMIN_PROJECT_MEMBER(pendingAction.project.id), { user_id: Number(pendingAction.userId) });
      if (pendingAction.type === "remove-member") await instance.delete(ENDPOINTS.DELETE_ADMIN_PROJECT_MEMBER(pendingAction.project.id, pendingAction.userId));
      refreshAfterAction();
    } catch (requestError) {
      const apiError = getApiError(requestError, "The project change could not be completed.");
      if (pendingAction.type === "delete" && apiError.code === "cascade_confirmation_required") {
        const detail = requestError.response?.data?.detail ?? {};
        setPendingAction((current) => ({ ...current, cascade: true, impact: { taskCount: detail.task_count ?? 0, memberCount: detail.member_count ?? 0 } }));
      } else setActionError(apiError.code ? `${apiError.message} (${apiError.code})` : apiError.message);
    } finally { setIsActionBusy(false); }
  };
  const selectedMemberIds = new Set(members.map((member) => member.user_id));
  const availableMembers = users.filter((user) => user.id !== selectedProject?.owner_id && !selectedMemberIds.has(user.id));
  const hasFilters = Boolean(searchParams.get("search") || searchParams.get("owner_id"));

  return <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7"><div className="mx-auto w-full max-w-[1500px]"><header className="flex flex-col gap-4 border-b border-slate-300 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><FolderKanban aria-hidden="true" className="size-3.5" />Project administration</p><h1 tabIndex={-1} data-admin-project-page-heading className="text-2xl font-semibold tracking-[-0.035em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 sm:text-3xl">Workspace projects</h1><p className="mt-1 text-sm text-slate-600">Manage global project records, owners, and memberships.</p></div>{hasPermission(adminPermissions, "projects.create") ? <button ref={createRef} type="button" onClick={() => setDrawer({ type: "create" })} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><Plus aria-hidden="true" className="size-4" />Create project</button> : null}</header>{statusMessage ? <p className="mt-4 border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">{statusMessage}</p> : null}<form onSubmit={submitSearch} className="mt-5 grid gap-3 border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)] sm:grid-cols-[minmax(0,1fr)_12rem_10rem_10rem_auto]"><label className="text-xs font-bold text-slate-600">Search<input className={`${inputClass} mt-1`} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name or description" /></label><label className="text-xs font-bold text-slate-600">Owner ID<input className={`${inputClass} mt-1`} type="number" min="1" value={searchParams.get("owner_id") ?? ""} onChange={(event) => updateQuery("owner_id", event.target.value)} placeholder="Any owner" /></label><label className="text-xs font-bold text-slate-600">Sort<select className={`${inputClass} mt-1`} value={searchParams.get("sort_by") ?? "name"} onChange={(event) => updateQuery("sort_by", event.target.value)}><option value="name">Name</option><option value="created_at">Created</option><option value="updated_at">Updated</option></select></label><label className="text-xs font-bold text-slate-600">Order<select className={`${inputClass} mt-1`} value={searchParams.get("sort_order") ?? "asc"} onChange={(event) => updateQuery("sort_order", event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><button type="submit" className={`${buttonClass} self-end border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><Search aria-hidden="true" className="size-4" />Search</button></form>{isLoading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading projects...</div> : error ? <div className="grid min-h-60 place-items-center text-center"><div><p className="font-semibold">Projects unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={reload} className={`${buttonClass} mt-4 border-slate-300 bg-white text-slate-700`}><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div> : <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]"><section className="border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]" aria-label="Project records">{projects.length ? projects.map((project) => <ProjectRow key={project.id} project={project} selected={selectedProject?.id === project.id} onSelect={() => { setMembersError(""); setMembers([]); setSelectedProject(project); setMembersLoading(true); }} onEdit={(event) => { editRef.current = event.currentTarget; setDrawer({ type: "edit", project }); }} onDelete={(event) => openDelete(project, event)} canUpdate={hasPermission(adminPermissions, "projects.update")} canDelete={hasPermission(adminPermissions, "projects.delete")} />) : <div className="grid min-h-56 place-items-center px-5 text-center"><div><Search aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">{hasFilters ? "No projects match these filters" : "No projects found"}</p><p className="mt-1 text-sm text-slate-500">{hasFilters ? "Try changing or clearing the filters." : "Create the first project to begin."}</p></div></div>}<div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>{pagination.total} record{pagination.total === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => updateQuery("page", String(pagination.page - 1))} aria-label="Previous project page" className={`${buttonClass} min-h-9 border-slate-300 bg-white text-slate-700`}><ChevronLeft aria-hidden="true" className="size-4" /></button><span className="font-semibold">Page {pagination.page} of {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => updateQuery("page", String(pagination.page + 1))} aria-label="Next project page" className={`${buttonClass} min-h-9 border-slate-300 bg-white text-slate-700`}><ChevronRight aria-hidden="true" className="size-4" /></button></div></div></section><ProjectDetail project={selectedProject} members={members} membersLoading={membersLoading} membersError={membersError} users={users} usersLoading={canReadUsers && usersLoading} usersError={usersError || (!canReadUsers ? "Users read permission is required to verify active users." : "")} permissions={adminPermissions} availableMembers={availableMembers} onTransfer={(userId) => setPendingAction({ type: "transfer", project: selectedProject, userId })} onAddMember={(userId) => setPendingAction({ type: "add-member", project: selectedProject, userId })} onRemoveMember={(userId, event) => { actionRef.current = event.currentTarget; setPendingAction({ type: "remove-member", project: selectedProject, userId }); }} /></div>}
      </div><ProjectDrawer key={`${drawer?.type ?? "closed"}-${drawer?.project?.id ?? "new"}`} isOpen={Boolean(drawer)} project={drawer?.project} users={users} usersLoading={canReadUsers && usersLoading} usersError={usersError || (!canReadUsers ? "Users read permission is required to verify active owners." : "")} onClose={() => closeDrawer()} onSuccess={afterSave} returnFocusRef={drawer?.type === "edit" ? editRef : createRef} /><AdminConfirmDialog isOpen={Boolean(pendingAction)} title={pendingAction?.type === "delete" ? pendingAction.cascade ? `Delete ${pendingAction.project.name} and related data?` : `Delete ${pendingAction.project.name}?` : pendingAction?.type === "transfer" ? "Transfer project ownership?" : pendingAction?.type === "add-member" ? "Add project member?" : "Remove project member?"} confirmLabel={pendingAction?.type === "delete" ? pendingAction.cascade ? "Delete project and tasks" : "Delete project" : pendingAction?.type === "transfer" ? "Transfer ownership" : pendingAction?.type === "add-member" ? "Add member" : "Remove member"} isBusy={isActionBusy} onClose={() => setPendingAction(null)} onConfirm={confirmAction} returnFocusRef={actionRef}>{actionError ? <p className="mb-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{actionError}</p> : null}{pendingAction?.type === "delete" ? <p>{pendingAction.cascade ? `This will delete ${pendingAction.impact?.taskCount ?? 0} task(s) and remove ${pendingAction.impact?.memberCount ?? 0} membership(s). This cannot be undone.` : "Deleting this project also removes all project memberships. If this project contains tasks, a second impact confirmation will be required."}</p> : pendingAction?.type === "transfer" ? <p>The new owner must be active. The current owner becomes a member and the new owner is removed from memberships.</p> : pendingAction?.type === "add-member" ? <p>Only active users who are not the owner or an existing member can be added.</p> : <p>Removing a membership does not delete the user or project.</p>}</AdminConfirmDialog></main>;
};

const ProjectDetail = ({ project, members, membersLoading, membersError, users, usersLoading, usersError, permissions, availableMembers, onTransfer, onAddMember, onRemoveMember }) => {
  const [transferId, setTransferId] = useState("");
  const [memberId, setMemberId] = useState("");
  if (!project) return <section className="grid min-h-72 place-items-center border border-dashed border-slate-300 bg-white px-5 text-center"><div><FolderKanban aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">Select a project</p><p className="mt-1 text-sm text-slate-500">Project details, members, and ownership actions appear here.</p></div></section>;
  return <section className="border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]"><header className="border-b border-slate-200 px-5 py-5"><p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Project detail</p><h2 className="mt-1 break-words text-xl font-semibold">{project.name}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{project.description || "No description"}</p></header><div className="space-y-6 px-5 py-5"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Owner</dt><dd className="mt-1 font-semibold">User #{project.owner_id}</dd></div><div><dt className="text-xs text-slate-500">Created</dt><dd className="mt-1 font-semibold">{dateFormatter.format(new Date(project.created_at))}</dd></div></dl>{hasPermission(permissions, "projects.transfer") ? <fieldset className="border-t border-slate-200 pt-5"><legend className="flex items-center gap-2 text-sm font-bold"><Users aria-hidden="true" className="size-4 text-emerald-800" />Transfer ownership</legend><p className="mt-1 text-xs text-slate-500">Only active users are offered. The impact is confirmed before the request is sent.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={transferId} onChange={(event) => setTransferId(event.target.value)} disabled={usersLoading || Boolean(usersError) || !users.length} className={`${inputClass} sm:flex-1`}><option value="">{usersLoading ? "Loading active users..." : usersError ? "Active user catalog unavailable" : "Choose new owner"}</option>{users.filter((user) => user.id !== project.owner_id).map((user) => <option key={user.id} value={user.id}>{getName(user)} · {user.email}</option>)}</select><button type="button" disabled={!transferId || usersLoading || Boolean(usersError)} onClick={() => { onTransfer(transferId); setTransferId(""); }} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}>Transfer</button></div></fieldset> : null}{hasPermission(permissions, "project_members.read") ? <fieldset className="border-t border-slate-200 pt-5"><legend className="flex items-center gap-2 text-sm font-bold"><Users aria-hidden="true" className="size-4 text-emerald-800" />Memberships</legend>{membersLoading ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Loading members...</p> : membersError ? <p className="mt-3 text-sm text-rose-700" role="alert">{membersError}</p> : members.length ? <ul className="mt-3 divide-y divide-slate-100 border border-slate-200">{members.map((member) => { const user = users.find((item) => item.id === member.user_id); return <li key={member.user_id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm"><span className="min-w-0 truncate">{user ? getName(user) : `User #${member.user_id}`}</span>{hasPermission(permissions, "project_members.delete") ? <button type="button" onClick={(event) => onRemoveMember(member.user_id, event)} className={`${buttonClass} min-h-9 border-rose-200 bg-white text-rose-700`}><Trash2 aria-hidden="true" className="size-3.5" />Remove</button> : null}</li>; })}</ul> : <p className="mt-3 text-sm text-slate-500">No members. The owner is not represented as a membership.</p>}{hasPermission(permissions, "project_members.create") ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={memberId} onChange={(event) => setMemberId(event.target.value)} disabled={usersLoading || Boolean(usersError) || membersLoading || Boolean(membersError) || !availableMembers.length} className={`${inputClass} sm:flex-1`}><option value="">{usersLoading ? "Loading active users..." : usersError ? "Active user catalog unavailable" : membersLoading ? "Loading membership catalog..." : membersError ? "Membership catalog unavailable" : availableMembers.length ? "Choose active member" : "No eligible active users"}</option>{availableMembers.map((user) => <option key={user.id} value={user.id}>{getName(user)} · {user.email}</option>)}</select><button type="button" disabled={!memberId || usersLoading || Boolean(usersError) || membersLoading || Boolean(membersError)} onClick={() => { onAddMember(memberId); setMemberId(""); }} className={`${buttonClass} border-[#173b35] bg-[#173b35] text-white hover:bg-[#204b43]`}><UserPlus aria-hidden="true" className="size-4" />Add member</button></div> : null}</fieldset> : null}{!hasPermission(permissions, "project_members.read") ? <p className="border-t border-slate-200 pt-5 text-sm text-slate-500">Membership details are hidden because project membership read permission is not granted.</p> : null}</div></section>;
};

export default AdminProjects;
