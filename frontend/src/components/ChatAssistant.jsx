import { useState } from "react";
import { Bot, CheckCircle2, FileDown, LoaderCircle, MessageSquareText, Send, X } from "lucide-react";

import { ENDPOINTS, instance } from "./api";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const makeMessage = (role, content, action = null) => ({
  id: crypto.randomUUID(),
  role,
  content,
  action,
});

const CsvDownloadCard = ({ messageId, projects, currentProjectId, currentProjectName }) => {
  const numericCurrentProjectId = currentProjectId ? Number(currentProjectId) : null;
  const hasCurrentProject = projects.some((project) => project.id === numericCurrentProjectId);
  const projectOptions = numericCurrentProjectId && !hasCurrentProject
    ? [{ id: numericCurrentProjectId, name: currentProjectName || "Current project" }, ...projects]
    : projects;
  const [selectedScope, setSelectedScope] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState(null);
  const [downloadError, setDownloadError] = useState("");

  const downloadCsv = async () => {
    if (!selectedScope || isDownloading) return;

    setIsDownloading(true);
    setDownloadError("");
    try {
      const selectedProjectId = selectedScope === "all" ? null : Number(selectedScope);
      const response = await instance.get(ENDPOINTS.AI_TASK_EXPORT(selectedProjectId), {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] || "task-export.csv";
      const taskCount = Number(response.headers["x-report-task-count"] || 0);
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDownloadedFile({ filename, taskCount });
    } catch (error) {
      let errorMessage = "The task CSV couldn't be downloaded.";
      if (error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          if (typeof payload.detail === "string") errorMessage = payload.detail;
        } catch {
          // Keep the safe fallback when the response is not JSON.
        }
      }
      setDownloadError(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left">
      <div className="flex items-start gap-2">
        <FileDown aria-hidden="true" className="mt-0.5 size-4 flex-none text-emerald-800" />
        <div>
          <p className="text-sm font-bold text-emerald-950">Task CSV export</p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-900/75">Choose the scope each time before downloading.</p>
        </div>
      </div>
      <label htmlFor={`csv-scope-${messageId}`} className="mt-3 block text-xs font-bold text-emerald-950">Report scope</label>
      <select
        id={`csv-scope-${messageId}`}
        value={selectedScope}
        onChange={(event) => {
          setSelectedScope(event.target.value);
          setDownloadedFile(null);
          setDownloadError("");
        }}
        className="mt-1 h-11 w-full rounded-lg border border-emerald-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15"
      >
        <option value="">Select report scope</option>
        <option value="all">All accessible projects</option>
        {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <button type="button" onClick={downloadCsv} disabled={!selectedScope || isDownloading} className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#173b35] px-4 text-sm font-bold text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
        {isDownloading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <FileDown aria-hidden="true" className="size-4" />}
        {isDownloading ? "Preparing CSV..." : downloadedFile ? "Download again" : "Download CSV"}
      </button>
      {downloadedFile ? <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-900" role="status"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 flex-none" /><span><strong>{downloadedFile.filename}</strong> downloaded with {downloadedFile.taskCount} tasks.</span></p> : null}
      {downloadError ? <p className="mt-2 text-xs text-red-700" role="alert">{downloadError}</p> : null}
    </div>
  );
};

const ChatAssistant = ({ projectId = null, projectName = "", projects = [] }) => {
  const scopeLabel = projectId ? projectName || "Current project" : "Your workspace";
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(() => [makeMessage(
    "assistant",
    projectId
      ? `Ask me about ${scopeLabel}'s tasks, progress, project people, or request a task CSV.`
      : "Ask me about the projects and tasks available in your workspace, or request a task CSV.",
  )]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const sendMessage = async (event) => {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage || isSending) return;

    const userMessage = makeMessage("user", cleanMessage);
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setError("");
    setIsSending(true);

    try {
      const response = await instance.post(ENDPOINTS.AI_CHAT(), {
        message: cleanMessage,
        history,
        project_id: projectId ? Number(projectId) : null,
      });
      setMessages((current) => [...current, makeMessage("assistant", response.data.answer, response.data.action)]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "The assistant couldn't answer right now."));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Open AI assistant for ${scopeLabel}`}
        className="fixed right-4 bottom-4 z-40 flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-[#173b35] px-4 text-sm font-bold text-white shadow-[0_12px_32px_rgba(15,23,42,0.28)] hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-800 sm:right-6 sm:bottom-6"
      >
        <MessageSquareText aria-hidden="true" className="size-5 text-[#dce993]" />
        Ask AI
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <aside role="dialog" aria-modal="true" aria-labelledby="ai-assistant-title" className="flex h-svh w-full flex-col bg-[#f7f8f4] shadow-2xl sm:max-w-md sm:border-l sm:border-slate-200" onKeyDown={(event) => {
            if (event.key === "Escape") setIsOpen(false);
          }}>
            <header className="flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-5">
              <div className="min-w-0 pr-3">
                <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-800 uppercase">Read-only assistant</p>
                <h2 id="ai-assistant-title" className="truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">{scopeLabel}</h2>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close AI assistant" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
                <X aria-hidden="true" className="size-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
              {messages.map((item) => (
                <div key={item.id} className={`flex items-start gap-2.5 ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                  {item.role === "assistant" ? <span className="grid size-8 flex-none place-items-center rounded-lg bg-[#173b35] text-[#dce993]"><Bot aria-hidden="true" className="size-4" /></span> : null}
                  {item.role === "user" ? (
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-xl bg-emerald-100 px-3.5 py-2.5 text-sm leading-6 text-emerald-950 shadow-sm">{item.content}</p>
                  ) : (
                    <div className="max-w-[86%] rounded-xl bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-700 shadow-sm ring-1 ring-slate-200">
                      <p className="whitespace-pre-wrap">{item.content}</p>
                      {item.action?.type === "choose_task_csv_scope" ? <CsvDownloadCard messageId={item.id} projects={projects} currentProjectId={projectId} currentProjectName={projectName} /> : null}
                    </div>
                  )}
                </div>
              ))}
              {isSending ? <div className="flex items-center gap-2 text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin text-emerald-800" />Reviewing authorized workspace data...</div> : null}
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4">
              {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
              <label htmlFor="ai-chat-message" className="sr-only">Message the AI assistant</label>
              <div className="flex items-end gap-2">
                <textarea id="ai-chat-message" rows={2} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about tasks or progress" className="min-h-12 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-slate-400 focus:border-emerald-800 focus:ring-3 focus:ring-emerald-800/15" />
                <button type="submit" disabled={isSending || !message.trim()} aria-label="Send message" className="grid size-12 flex-none cursor-pointer place-items-center rounded-lg bg-[#173b35] text-white hover:bg-[#204b43] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Answers use only data you are authorized to access. AI can make mistakes.</p>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default ChatAssistant;
