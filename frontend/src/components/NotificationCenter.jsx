import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, CheckCheck, LoaderCircle, Settings2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ENDPOINTS, instance } from "./api";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DEFAULT_PREFERENCES = {
  assignment_notifications: true,
  mention_notifications: true,
  status_notifications: true,
  reminder_notifications: true,
  email_reminders: false,
  reminder_days_before: 1,
};

const getErrorMessage = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;
const isUnread = (notification) => !notification.read_at;

const PreferenceToggle = ({ name, label, description, checked, onChange }) => (
  <label className="flex min-h-16 cursor-pointer items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
    <span>
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
    </span>
    <input name={name} type="checkbox" checked={checked} onChange={onChange} className="mt-1 size-5 cursor-pointer accent-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800" />
  </label>
);

const NotificationCenter = () => {
  const navigate = useNavigate();
  const closeTimer = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeView, setActiveView] = useState("notifications");
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = async ({ showLoading = false } = {}) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await instance.get(ENDPOINTS.GET_NOTIFICATIONS());
      setNotifications(response.data);
      setError("");
    } catch (requestError) {
      if (showLoading) setError(getErrorMessage(requestError, "We couldn't load your notifications."));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    let current = true;
    Promise.allSettled([
      instance.get(ENDPOINTS.GET_NOTIFICATIONS()),
      instance.get(ENDPOINTS.GET_NOTIFICATION_PREFERENCES()),
    ]).then(([notificationsResult, preferencesResult]) => {
      if (!current) return;
      if (notificationsResult.status === "fulfilled") setNotifications(notificationsResult.value.data);
      else setError(getErrorMessage(notificationsResult.reason, "We couldn't load your notifications."));
      if (preferencesResult.status === "fulfilled") {
        setPreferences({ ...DEFAULT_PREFERENCES, ...preferencesResult.value.data });
      }
      setIsLoading(false);
      instance.post(ENDPOINTS.PROCESS_NOTIFICATION_REMINDERS()).then(() => instance.get(ENDPOINTS.GET_NOTIFICATIONS())).then((response) => {
        if (current) setNotifications(response.data);
      }).catch(() => {
        // The notification list remains usable if background email delivery is unavailable.
      });
    });
    const interval = window.setInterval(() => loadNotifications(), 60_000);
    return () => {
      current = false;
      window.clearInterval(interval);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  const open = () => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(true);
    setActiveView("notifications");
    window.requestAnimationFrame(() => setIsVisible(true));
    loadNotifications();
  };

  const close = () => {
    setIsVisible(false);
    closeTimer.current = window.setTimeout(() => setIsOpen(false), 250);
  };

  const markRead = async (notification) => {
    if (isUnread(notification)) {
      try {
        const response = await instance.patch(ENDPOINTS.MARK_NOTIFICATION_READ(notification.id));
        setNotifications((current) => current.map((item) => item.id === notification.id ? response.data : item));
      } catch (requestError) {
        setError(getErrorMessage(requestError, "We couldn't update this notification."));
        return;
      }
    }
    close();
    if (notification.task_id) navigate("/tasks");
  };

  const markAllRead = async () => {
    try {
      await instance.patch(ENDPOINTS.MARK_ALL_NOTIFICATIONS_READ());
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't mark notifications as read."));
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const response = await instance.put(ENDPOINTS.UPDATE_NOTIFICATION_PREFERENCES(), preferences);
      setPreferences({ ...DEFAULT_PREFERENCES, ...response.data });
      setActiveView("notifications");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn't save your notification preferences."));
    } finally {
      setIsSaving(false);
    }
  };

  const unreadCount = notifications.filter(isUnread).length;

  return (
    <>
      <button type="button" onClick={open} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative grid size-11 cursor-pointer place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-emerald-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount ? <span className="absolute top-0.5 right-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-emerald-800 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {isOpen ? createPortal(
        <div className={`fixed inset-0 z-50 flex justify-end overflow-hidden bg-slate-950/45 transition-opacity duration-200 motion-reduce:transition-none ${isVisible ? "opacity-100" : "opacity-0"}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside role="dialog" aria-modal="true" aria-labelledby="notification-center-title" onKeyDown={(event) => { if (event.key === "Escape") close(); }} className={`flex h-svh w-full max-w-md transform-gpu flex-col bg-white text-slate-950 shadow-2xl transition-transform duration-300 motion-reduce:transition-none ${isVisible ? "translate-x-0" : "translate-x-full"}`}>
            <header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Stay in the loop</p>
                <h2 id="notification-center-title" className="text-lg font-semibold">{activeView === "notifications" ? "Notifications" : "Notification settings"}</h2>
              </div>
              <button type="button" onClick={close} aria-label="Close notifications" className="grid size-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-emerald-800"><X aria-hidden="true" className="size-5" /></button>
            </header>
            {error ? <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

            {activeView === "notifications" ? (
              <>
                <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-5">
                  <p className="text-xs font-semibold text-slate-500">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
                  <div className="flex">
                    <button type="button" onClick={markAllRead} disabled={!unreadCount} className="flex min-h-10 cursor-pointer items-center gap-1.5 px-2 text-xs font-bold text-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:text-slate-400"><CheckCheck aria-hidden="true" className="size-4" />Read all</button>
                    <button type="button" onClick={() => setActiveView("preferences")} aria-label="Notification settings" className="grid size-10 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-800"><Settings2 aria-hidden="true" className="size-4" /></button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading notifications...</div>
                  ) : notifications.length === 0 ? (
                    <div className="grid min-h-64 place-items-center px-6 text-center"><div><BellOff aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">No notifications yet</p><p className="mt-1 text-sm leading-6 text-slate-500">Assignments, mentions, and task updates will appear here.</p></div></div>
                  ) : (
                    <ol className="divide-y divide-slate-100">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button type="button" onClick={() => markRead(notification)} className={`min-h-20 w-full cursor-pointer px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-emerald-800 ${isUnread(notification) ? "border-l-4 border-emerald-700 bg-emerald-50/60 pl-4" : ""}`}>
                            <span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-slate-900">{notification.title}</span>{isUnread(notification) ? <span className="mt-1 size-2 flex-none rounded-full bg-emerald-700" aria-label="Unread" /> : null}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">{notification.body}</span>
                            <time className="mt-1.5 block text-[11px] text-slate-400" dateTime={notification.created_at}>{DATE_TIME_FORMATTER.format(new Date(notification.created_at))}</time>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={savePreferences} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <fieldset>
                    <legend className="text-xs font-bold tracking-[0.12em] text-emerald-800 uppercase">In-app notifications</legend>
                    <PreferenceToggle name="assignment_notifications" label="Assignments" description="When a task is assigned to you." checked={preferences.assignment_notifications} onChange={(event) => setPreferences((current) => ({ ...current, assignment_notifications: event.target.checked }))} />
                    <PreferenceToggle name="mention_notifications" label="Mentions" description="When a teammate mentions you in a comment." checked={preferences.mention_notifications} onChange={(event) => setPreferences((current) => ({ ...current, mention_notifications: event.target.checked }))} />
                    <PreferenceToggle name="status_notifications" label="Status changes" description="When the status of one of your assigned tasks changes." checked={preferences.status_notifications} onChange={(event) => setPreferences((current) => ({ ...current, status_notifications: event.target.checked }))} />
                    <PreferenceToggle name="reminder_notifications" label="Deadline reminders" description="Show approaching and overdue tasks in the notification center." checked={preferences.reminder_notifications} onChange={(event) => setPreferences((current) => ({ ...current, reminder_notifications: event.target.checked }))} />
                  </fieldset>
                  <fieldset className="mt-6">
                    <legend className="text-xs font-bold tracking-[0.12em] text-emerald-800 uppercase">Email reminders</legend>
                    <PreferenceToggle name="email_reminders" label="Email deadline reminders" description="Email me about approaching and overdue assigned tasks." checked={preferences.email_reminders} onChange={(event) => setPreferences((current) => ({ ...current, email_reminders: event.target.checked }))} />
                    <label htmlFor="reminder-days-before" className="mt-4 block text-sm font-semibold text-slate-800">Remind me before the due date</label>
                    <select id="reminder-days-before" value={preferences.reminder_days_before} onChange={(event) => setPreferences((current) => ({ ...current, reminder_days_before: Number(event.target.value) }))} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"><option value="0">On the due date</option><option value="1">1 day before</option><option value="2">2 days before</option><option value="3">3 days before</option><option value="7">1 week before</option><option value="14">2 weeks before</option><option value="30">30 days before</option></select>
                  </fieldset>
                </div>
                <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <button type="button" onClick={() => setActiveView("notifications")} disabled={isSaving} className="min-h-11 flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed">Cancel</button>
                  <button type="submit" disabled={isSaving} className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}{isSaving ? "Saving..." : "Save preferences"}</button>
                </div>
              </form>
            )}
          </aside>
        </div>,
        document.body,
      ) : null}
    </>
  );
};

export default NotificationCenter;
