import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, FolderKanban, LoaderCircle, Plus, UserRound, Users, X } from "lucide-react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";
import ProjectTaskList from "./ProjectTaskList";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const displayName = (user) => {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.email;
};

const initials = (user) => {
  const value = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`;
  return value.toUpperCase() || user.email[0].toUpperCase();
};

const ProjectDetails = () => {
  const { projectId } = useParams();
  const { onProjectUpdated } = useOutletContext();
  const [projectRequest, setProjectRequest] = useState({ projectId: null, data: null, error: "" });
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    instance.get(ENDPOINTS.GET_PROJECT(projectId))
      .then((response) => {
        if (isCurrent) setProjectRequest({ projectId, data: response.data, error: "" });
      })
      .catch((requestError) => {
        if (isCurrent) {
          setProjectRequest({
            projectId,
            data: null,
            error: getErrorMessage(requestError, "We couldn't load this project."),
          });
        }
      });

    return () => { isCurrent = false; };
  }, [projectId]);

  const isLoading = projectRequest.projectId !== projectId;
  const project = isLoading ? null : projectRequest.data;
  const error = isLoading ? "" : projectRequest.error;

  const openMemberDialog = async () => {
    setIsMemberDialogOpen(true);
    setIsUsersLoading(true);
    setSelectedUserId("");
    try {
      const response = await instance.get(ENDPOINTS.GET_AVAILABLE_PROJECT_USERS(projectId));
      setAvailableUsers(response.data);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Couldn't load available users."));
      setIsMemberDialogOpen(false);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    if (!selectedUserId) return;

    setIsAddingMember(true);
    try {
      const response = await instance.post(ENDPOINTS.ADD_PROJECT_MEMBER(projectId), {
        user_id: Number(selectedUserId),
      });
      setProjectRequest((current) => ({
        ...current,
        data: {
          ...current.data,
          members: [...current.data.members, response.data],
          member_count: current.data.member_count + 1,
        },
      }));
      setAvailableUsers((current) => current.filter((user) => user.id !== response.data.id));
      onProjectUpdated(projectId, { member_count: project.member_count + 1 });
      setSelectedUserId("");
      setIsMemberDialogOpen(false);
      toast.success(`${displayName(response.data)} added to the project.`);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Couldn't add this user."));
    } finally {
      setIsAddingMember(false);
    }
  };

  if (isLoading) {
    return <main className="grid min-w-0 flex-1 place-items-center bg-[#f4f6f2] text-sm text-slate-600" role="status"><span className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading project...</span></main>;
  }

  if (error || !project) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-[#f4f6f2] px-5 text-center">
        <div><h1 className="text-xl font-semibold text-slate-950">Project unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><Link to="/projects" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800"><ArrowLeft aria-hidden="true" className="size-4" />Back to projects</Link></div>
      </main>
    );
  }

  const people = [project.owner, ...project.members];

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <div className="w-full">
        <Link to="/projects" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><ArrowLeft aria-hidden="true" className="size-4" />All projects</Link>

        <header className="mt-2 border-b border-slate-300 pb-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="mt-0.5 grid size-11 flex-none place-items-center rounded-xl bg-[#173b35] text-[#dce993]"><FolderKanban aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Project details</p>
              <h1 className="mt-0.5 break-words text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{project.name}</h1>
              {project.description ? <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{project.description}</p> : null}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock aria-hidden="true" className="size-3.5" />Created {DATE_FORMATTER.format(new Date(project.created_at))}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ProjectTaskList projectId={projectId} projectName={project.name} />

          <section aria-labelledby="members-heading" className="self-start bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 lg:sticky lg:top-5">
            <div className="flex min-h-14 items-center justify-between gap-2 border-b border-slate-200 px-4">
              <h2 id="members-heading" className="flex items-center gap-2 font-semibold"><Users aria-hidden="true" className="size-5 text-emerald-800" />Project people</h2>
              {project.is_owner ? <button type="button" onClick={openMemberDialog} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-3 focus-visible:outline-emerald-800"><Plus aria-hidden="true" className="size-4" />Add</button> : null}
            </div>
            <ul className="divide-y divide-slate-100">
              {people.map((user, index) => <li key={user.id} className="flex items-center gap-3 px-4 py-3"><span className="grid size-9 flex-none place-items-center rounded-full bg-emerald-50 text-xs font-black text-emerald-900">{initials(user)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{displayName(user)}</span><span className="block truncate text-xs text-slate-500">{user.email}</span></span>{index === 0 ? <span className="text-[10px] font-bold tracking-wider text-emerald-800 uppercase">Owner</span> : null}</li>)}
            </ul>
          </section>
        </div>
      </div>

      {isMemberDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isAddingMember) setIsMemberDialogOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-member-title" className="w-full max-w-md bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5"><div><p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Project access</p><h2 id="add-member-title" className="text-lg font-semibold">Add a member</h2></div><button type="button" disabled={isAddingMember} onClick={() => setIsMemberDialogOpen(false)} aria-label="Close add member dialog" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button></div>
            <form onSubmit={addMember} className="p-5">
              {isUsersLoading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Loading users...</div> : availableUsers.length === 0 ? <div className="flex min-h-32 flex-col items-center justify-center text-center"><UserRound aria-hidden="true" className="size-7 text-slate-400" /><p className="mt-3 text-sm font-semibold">Everyone is already included</p><p className="mt-1 text-xs text-slate-500">There are no available users to add.</p></div> : <div><label htmlFor="project-member" className="mb-1.5 block text-sm font-semibold text-slate-800">User</label><select id="project-member" required value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="">Select a user</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{displayName(user)} ({user.email})</option>)}</select></div>}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isAddingMember} onClick={() => setIsMemberDialogOpen(false)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button><button type="submit" disabled={isUsersLoading || isAddingMember || !selectedUserId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isAddingMember ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}{isAddingMember ? "Adding..." : "Add member"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default ProjectDetails;
