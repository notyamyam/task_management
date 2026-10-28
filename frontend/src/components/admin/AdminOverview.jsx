import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, LoaderCircle, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { ENDPOINTS, instance } from "../api";

const SECTION_LABELS = {
  users: "Users",
  roles: "Roles",
  projects: "Projects",
  project_members: "Project memberships",
  tasks: "Tasks",
  subtasks: "Subtasks",
  task_dependencies: "Task dependencies",
  task_comments: "Task comments",
  task_activity: "Task activity",
  notifications: "Notifications",
  notification_preferences: "Notification preferences",
  audit_logs: "Audit logs",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : "We couldn't load the administration summary.";
};

const SummaryCard = ({ name, value }) => {
  const label = SECTION_LABELS[name] ?? name.replaceAll("_", " ");
  const isTaskSummary = name === "tasks";
  const isUserSummary = name === "users";
  const statusCounts = isUserSummary && value.status_counts ? Object.entries(value.status_counts) : [];

  return (
    <section aria-labelledby={`admin-summary-${name}`} className="border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`admin-summary-${name}`} className="text-sm font-semibold text-slate-800">{label}</h2>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] tabular-nums text-slate-950">{value.count ?? 0}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
          {isUserSummary ? <Users aria-hidden="true" className="size-5" /> : <Database aria-hidden="true" className="size-5" />}
        </span>
      </div>
      {isTaskSummary ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
          <div><dt className="text-slate-500">Open</dt><dd className="mt-0.5 font-bold tabular-nums text-slate-800">{value.open_count ?? 0}</dd></div>
          <div><dt className="text-slate-500">Overdue</dt><dd className="mt-0.5 font-bold tabular-nums text-amber-700">{value.overdue_count ?? 0}</dd></div>
        </dl>
      ) : null}
      {isUserSummary ? (
        <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs">
          {statusCounts.map(([status, count]) => <div key={status} className="flex justify-between gap-3"><dt className="capitalize text-slate-500">{status}</dt><dd className="font-bold tabular-nums text-slate-800">{count}</dd></div>)}
        </dl>
      ) : null}
      {value.unread_count !== undefined ? <p className="mt-3 text-xs font-semibold text-emerald-800">{value.unread_count} unread</p> : null}
    </section>
  );
};

const IntegrationsCard = ({ integrations }) => {
  const services = [
    ["Email service", integrations.email_configured],
    ["AI service", integrations.ai_configured],
  ];

  return (
    <section aria-labelledby="admin-summary-integrations" className="border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="admin-summary-integrations" className="text-sm font-semibold text-slate-800">System health</h2>
          <p className="mt-1 text-xs text-slate-500">Connected workspace services</p>
        </div>
        <Activity aria-hidden="true" className="size-5 text-emerald-800" />
      </div>
      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        {services.map(([label, isHealthy]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">{label}</span>
            <span className={`flex items-center gap-1.5 text-xs font-bold ${isHealthy ? "text-emerald-700" : "text-amber-700"}`}>
              {isHealthy ? <CheckCircle2 aria-hidden="true" className="size-4" /> : <AlertTriangle aria-hidden="true" className="size-4" />}
              {isHealthy ? "Available" : "Needs attention"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const Warnings = ({ warnings }) => (
  <section aria-labelledby="admin-warnings-heading" className="border border-amber-200 bg-amber-50/70 p-4">
    <h2 id="admin-warnings-heading" className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertTriangle aria-hidden="true" className="size-4" />Workspace warnings</h2>
    {warnings.length ? (
      <ul className="mt-3 space-y-2 text-sm text-amber-950">
        {warnings.map((warning) => <li key={warning.code} className="border-t border-amber-200 pt-2 first:border-0 first:pt-0">{warning.message}</li>)}
      </ul>
    ) : <p className="mt-2 text-sm text-amber-900">No active warnings.</p>}
  </section>
);

const RecentActivity = ({ activities }) => (
  <section aria-labelledby="admin-activity-heading" className="border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
    <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Activity aria-hidden="true" className="size-5 text-emerald-800" /><h2 id="admin-activity-heading" className="font-semibold">Recent activity</h2></div>
    {activities.length ? (
      <ul className="divide-y divide-slate-100">
        {activities.map((activity, index) => <li key={`${activity.timestamp}-${activity.action}-${index}`} className="px-4 py-3 text-sm"><p className="font-semibold text-slate-800">{activity.action}</p><p className="mt-1 text-xs text-slate-500">{activity.actor?.label ?? "System"} · {dateFormatter.format(new Date(activity.timestamp))}</p></li>)}
      </ul>
    ) : <p className="px-4 py-5 text-sm text-slate-500">No recent administration activity.</p>}
  </section>
);

const AdminOverview = () => {
  const { adminPermissions } = useOutletContext();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    instance.get(ENDPOINTS.GET_ADMIN_SUMMARY())
      .then((response) => {
        if (isCurrent) setSummary(response.data);
      })
      .catch((requestError) => {
        if (isCurrent) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [retryCount]);

  const summaryEntries = summary ? Object.entries(summary).filter(([name]) => !["warnings", "recent_activity", "system_integrations"].includes(name)) : [];

  return (
    <main className="min-w-0 flex-1 bg-[#f4f6f2] px-3 py-5 text-slate-950 sm:px-5 sm:py-7 lg:px-7">
      <div className="w-full">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-emerald-800 uppercase"><ShieldCheck aria-hidden="true" className="size-3.5" />Administration overview</p>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Workspace controls</h1>
            <p className="mt-1 text-sm text-slate-600">A permission-filtered view of your workspace.</p>
          </div>
          <p className="text-xs font-semibold text-slate-500">{adminPermissions.length} permission{adminPermissions.length === 1 ? "" : "s"} active</p>
        </header>

        {isLoading ? (
          <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-600" role="status"><LoaderCircle aria-hidden="true" className="size-5 animate-spin text-emerald-800" />Loading administration summary...</div>
        ) : error ? (
          <div className="grid min-h-60 place-items-center px-5 text-center"><div><p className="font-semibold">Summary unavailable</p><p className="mt-1 text-sm text-slate-500">{error}</p><button type="button" onClick={() => { setIsLoading(true); setError(""); setRetryCount((count) => count + 1); }} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"><RefreshCw aria-hidden="true" className="size-4" />Try again</button></div></div>
        ) : !summary || Object.keys(summary).length === 0 ? (
          <div className="grid min-h-60 place-items-center px-5 text-center"><div><ShieldCheck aria-hidden="true" className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">No summary data available</p><p className="mt-1 text-sm text-slate-500">Your current permissions do not expose any administration summary sections.</p></div></div>
        ) : (
          <div className="mt-5 space-y-5">
            {summary.warnings ? <Warnings warnings={summary.warnings} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{summaryEntries.map(([name, value]) => <SummaryCard key={name} name={name} value={value} />)}{summary.system_integrations ? <IntegrationsCard integrations={summary.system_integrations} /> : null}</div>
            {summary.recent_activity ? <RecentActivity activities={summary.recent_activity} /> : null}
          </div>
        )}
      </div>
    </main>
  );
};

export default AdminOverview;
