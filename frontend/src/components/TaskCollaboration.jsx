import { useEffect, useState } from "react";
import { Check, History, LoaderCircle, MessageSquare, Pencil, Send, Trash2, X } from "lucide-react";

import { ENDPOINTS, instance } from "./api";
import { getTaskUserName } from "./taskUtils";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const getErrorMessage = (error, fallback) => (
  typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback
);

const formatDateTime = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? DATE_TIME_FORMATTER.format(date) : "Time unavailable";
};

const readableValue = (value) => {
  if (!value) return "none";
  return value.replaceAll("_", " ");
};

const describeActivity = (activity) => {
  const oldValue = readableValue(activity.old_value);
  const newValue = readableValue(activity.new_value);
  const descriptions = {
    task_created: "created this task",
    comment_added: "added a comment",
    status_changed: `changed status from ${oldValue} to ${newValue}`,
    assignment_changed: `changed the assignee from ${oldValue} to ${newValue}`,
    priority_changed: `changed priority from ${oldValue} to ${newValue}`,
    due_date_changed: `changed the due date from ${oldValue} to ${newValue}`,
  };
  return descriptions[activity.event_type] || "updated this task";
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getMentionName = (member) => member.first_name?.trim() || member.email?.split("@")[0] || "";

const hasMention = (body, member) => {
  const name = getMentionName(member);
  return name ? new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=[\\s.,!?;:]|$)`, "i").test(body) : false;
};

const getMentionedUserIds = (body, members, currentUserId) => {
  const self = members.find((member) => Number(member.id) === Number(currentUserId));
  if (self && hasMention(body, self)) throw new Error("You cannot mention yourself.");
  return members
    .filter((member) => Number(member.id) !== Number(currentUserId) && hasMention(body, member))
    .map((member) => member.id);
};

const TaskCollaboration = ({ taskId, members = [], currentUserId }) => {
  const [activeTab, setActiveTab] = useState("comments");
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const loadCollaboration = async () => {
    setIsLoading(true);
    setError("");
    const [commentsResult, activityResult] = await Promise.allSettled([
      instance.get(ENDPOINTS.GET_TASK_COMMENTS(taskId)),
      instance.get(ENDPOINTS.GET_TASK_ACTIVITY(taskId)),
    ]);
    if (commentsResult.status === "fulfilled") setComments(commentsResult.value.data);
    if (activityResult.status === "fulfilled") setActivity(activityResult.value.data);
    if (commentsResult.status === "rejected" || activityResult.status === "rejected") {
      const requestError = commentsResult.status === "rejected" ? commentsResult.reason : activityResult.reason;
      setError(getErrorMessage(requestError, "We couldn't load this task's collaboration history."));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      instance.get(ENDPOINTS.GET_TASK_COMMENTS(taskId)),
      instance.get(ENDPOINTS.GET_TASK_ACTIVITY(taskId)),
    ]).then(([commentsResponse, activityResponse]) => {
      if (!isCurrent) return;
      setComments(commentsResponse.data);
      setActivity(activityResponse.data);
    }).catch((requestError) => {
      if (isCurrent) setError(getErrorMessage(requestError, "We couldn't load this task's collaboration history."));
    }).finally(() => {
      if (isCurrent) setIsLoading(false);
    });
    return () => { isCurrent = false; };
  }, [taskId]);

  const addComment = async () => {
    const cleanBody = body.trim();
    if (!cleanBody || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const mentionedUserIds = getMentionedUserIds(cleanBody, members, currentUserId);
      const response = await instance.post(ENDPOINTS.CREATE_TASK_COMMENT(taskId), {
        body: cleanBody,
        mentioned_user_ids: mentionedUserIds,
      });
      setComments((current) => [...current, response.data]);
      setBody("");
      const activityResponse = await instance.get(ENDPOINTS.GET_TASK_ACTIVITY(taskId));
      setActivity(activityResponse.data);
    } catch (requestError) {
      setError(requestError.message === "You cannot mention yourself." ? requestError.message : getErrorMessage(requestError, "We couldn't add your comment."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveComment = async (commentId) => {
    const cleanBody = editBody.trim();
    if (!cleanBody || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const mentionedUserIds = getMentionedUserIds(cleanBody, members, currentUserId);
      const response = await instance.put(ENDPOINTS.UPDATE_TASK_COMMENT(taskId, commentId), {
        body: cleanBody,
        mentioned_user_ids: mentionedUserIds,
      });
      setComments((current) => current.map((comment) => comment.id === commentId ? response.data : comment));
      setEditingCommentId(null);
      setEditBody("");
    } catch (requestError) {
      setError(requestError.message === "You cannot mention yourself." ? requestError.message : getErrorMessage(requestError, "We couldn't update your comment."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteComment = async () => {
    if (!commentToDelete || isDeleting) return;
    setIsDeleting(true);
    setError("");
    try {
      await instance.delete(ENDPOINTS.DELETE_TASK_COMMENT(taskId, commentToDelete.id));
      setComments((current) => current.filter((comment) => comment.id !== commentToDelete.id));
      setCommentToDelete(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't delete your comment."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section aria-labelledby={`task-collaboration-${taskId}`} className="mt-8 border-t border-slate-200 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`task-collaboration-${taskId}`} className="text-base font-semibold text-slate-900">Collaboration</h3>
        <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-1" aria-label="Collaboration view">
          <button type="button" onClick={() => setActiveTab("comments")} aria-pressed={activeTab === "comments"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-emerald-800 ${activeTab === "comments" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600"}`}><MessageSquare aria-hidden="true" className="size-3.5" />Comments</button>
          <button type="button" onClick={() => setActiveTab("activity")} aria-pressed={activeTab === "activity"} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-emerald-800 ${activeTab === "activity" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600"}`}><History aria-hidden="true" className="size-3.5" />Activity</button>
        </div>
      </div>

      {error ? <div className="mt-4 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert"><p>{error}</p><button type="button" onClick={loadCollaboration} className="mt-1 min-h-9 cursor-pointer font-bold underline focus-visible:outline-2 focus-visible:outline-red-700">Try again</button></div> : null}
      {isLoading ? <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Loading collaboration...</div> : activeTab === "comments" ? (
        <div className="mt-4">
          {comments.length > 0 ? <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">{comments.map((comment) => {
            const isAuthor = Number(comment.author?.id) === Number(currentUserId);
            const isEditing = editingCommentId === comment.id;
            return <li key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">{getTaskUserName(comment.author)}{isAuthor ? <span className="ml-1 font-normal text-slate-500">(you)</span> : null}</p><time className="text-[11px] text-slate-500" dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time></div>{isAuthor && !isEditing ? <div className="flex"><button type="button" onClick={() => { setEditingCommentId(comment.id); setEditBody(comment.body); }} aria-label="Edit comment" className="grid size-9 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-800"><Pencil aria-hidden="true" className="size-3.5" /></button><button type="button" onClick={() => setCommentToDelete(comment)} aria-label="Delete comment" className="grid size-9 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-700"><Trash2 aria-hidden="true" className="size-3.5" /></button></div> : null}</div>{isEditing ? <div className="mt-2"><textarea autoFocus rows={3} maxLength={5000} value={editBody} onChange={(event) => setEditBody(event.target.value)} aria-label="Edit comment text" className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /><div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => { setEditingCommentId(null); setEditBody(""); }} aria-label="Cancel comment edit" className="grid size-10 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-4" /></button><button type="button" onClick={() => saveComment(comment.id)} disabled={isSubmitting || !editBody.trim()} aria-label="Save comment" className="grid size-10 cursor-pointer place-items-center rounded-md text-emerald-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}</button></div></div> : <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{comment.body}</p>}</li>;
          })}</ol> : <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 px-4 text-center"><div><MessageSquare aria-hidden="true" className="mx-auto size-5 text-slate-400" /><p className="mt-2 text-sm font-semibold">No comments yet</p><p className="text-xs text-slate-500">Start the conversation about this task.</p></div></div>}
          <div className="mt-4"><label htmlFor={`task-comment-${taskId}`} className="mb-1.5 block text-sm font-semibold text-slate-800">Add a comment</label><textarea id={`task-comment-${taskId}`} rows={3} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); addComment(); } }} placeholder="Share an update or ask a question" className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" /></div>
          <div className="mt-2 flex items-start justify-between gap-3"><p className="max-w-xs text-[11px] leading-4 text-slate-500">Mention someone naturally with their first name, for example: Hello @Liam. You cannot mention yourself.</p><button type="button" onClick={addComment} disabled={isSubmitting || !body.trim()} className="flex min-h-10 flex-none cursor-pointer items-center gap-2 rounded-lg bg-[#173b35] px-4 text-xs font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}{isSubmitting ? "Posting..." : "Post comment"}</button></div>
        </div>
      ) : activity.length > 0 ? <ol className="mt-4 space-y-0 border-l border-slate-200 pl-4">{activity.map((item) => <li key={item.id} className="relative pb-4 last:pb-0"><span className="absolute top-1 -left-[1.22rem] size-2 rounded-full bg-emerald-700 ring-4 ring-white" /><p className="text-sm leading-5 text-slate-700"><strong className="font-semibold text-slate-900">{getTaskUserName(item.actor)}</strong> {describeActivity(item)}</p><time className="mt-1 block text-[11px] text-slate-500" dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></li>)}</ol> : <div className="mt-4 grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 text-center"><div><History aria-hidden="true" className="mx-auto size-5 text-slate-400" /><p className="mt-2 text-sm font-semibold">No activity recorded</p></div></div>}
      {commentToDelete ? <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setCommentToDelete(null); }}><section role="dialog" aria-modal="true" aria-labelledby={`delete-comment-${commentToDelete.id}`} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"><h4 id={`delete-comment-${commentToDelete.id}`} className="text-lg font-semibold text-slate-950">Delete comment?</h4><p className="mt-2 text-sm leading-6 text-slate-600">This comment will be permanently removed.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCommentToDelete(null)} disabled={isDeleting} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:cursor-not-allowed">Cancel</button><button type="button" onClick={deleteComment} disabled={isDeleting} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{isDeleting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}{isDeleting ? "Deleting..." : "Delete"}</button></div></section></div> : null}
    </section>
  );
};

export default TaskCollaboration;
