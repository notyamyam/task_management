import axios from "axios";
import { toast } from "react-toastify";

export const ENDPOINTS = {
  LOGIN: () => "/users/login",
  REGISTER: () => "/users/register",
  GET_PROFILE: () => "/users/me",
  UPDATE_PROFILE: () => "/users/me",
  UPDATE_PASSWORD: () => "/users/me/password",
  UPDATE_TEMPORARY_PASSWORD: () => "/users/me/temporary-password",
  REQUEST_PASSWORD_RESET: () => "/users/password-reset/request",
  CONFIRM_PASSWORD_RESET: () => "/users/password-reset/confirm",
  CREATE_TASK: () => "/tasks/create-task",
  GET_TASKS: (projectId) => projectId ? `/tasks/get-tasks?project_id=${projectId}` : "/tasks/get-tasks",
  GET_MY_TASKS: () => "/tasks/my-tasks",
  GET_TASK_COMMENTS: (id) => `/tasks/${id}/comments`,
  CREATE_TASK_COMMENT: (id) => `/tasks/${id}/comments`,
  UPDATE_TASK_COMMENT: (taskId, commentId) => `/tasks/${taskId}/comments/${commentId}`,
  DELETE_TASK_COMMENT: (taskId, commentId) => `/tasks/${taskId}/comments/${commentId}`,
  GET_TASK_ACTIVITY: (id) => `/tasks/${id}/activity`,
  GET_TASK_SUBTASKS: (id) => `/tasks/${id}/subtasks`,
  CREATE_TASK_SUBTASK: (id) => `/tasks/${id}/subtasks`,
  UPDATE_TASK_SUBTASK: (taskId, subtaskId) => `/tasks/${taskId}/subtasks/${subtaskId}`,
  DELETE_TASK_SUBTASK: (taskId, subtaskId) => `/tasks/${taskId}/subtasks/${subtaskId}`,
  GET_TASK_DEPENDENCIES: (id) => `/tasks/${id}/dependencies`,
  CREATE_TASK_DEPENDENCY: (id) => `/tasks/${id}/dependencies`,
  DELETE_TASK_DEPENDENCY: (taskId, dependencyId) => `/tasks/${taskId}/dependencies/${dependencyId}`,
  GET_TASK_TAG_RECOMMENDATIONS: () => "/tasks/tag-recommendations",
  UPDATE_TASK: (id) => `/tasks/update-task?id=${id}`,
  UPDATE_TASK_STATUS: (id) => `/tasks/update-status?id=${id}`,
  DELETE_TASK: (id) => `/tasks/delete-task?id=${id}`,
  CREATE_PROJECT: () => "/projects/create-project",
  GET_PROJECTS: () => "/projects/get-projects",
  GET_PROJECT: (id) => `/projects/${id}`,
  UPDATE_PROJECT: (id) => `/projects/${id}`,
  DELETE_PROJECT: (id) => `/projects/${id}`,
  GET_AVAILABLE_PROJECT_USERS: (id) => `/projects/${id}/available-users`,
  ADD_PROJECT_MEMBER: (id) => `/projects/${id}/members`,
  GET_NOTIFICATIONS: () => "/notifications",
  MARK_NOTIFICATION_READ: (id) => `/notifications/${id}/read`,
  MARK_ALL_NOTIFICATIONS_READ: () => "/notifications/read-all",
  PROCESS_NOTIFICATION_REMINDERS: () => "/notifications/process-reminders",
  GET_NOTIFICATION_PREFERENCES: () => "/notifications/preferences",
  UPDATE_NOTIFICATION_PREFERENCES: () => "/notifications/preferences",
  AI_CHAT: () => "/ai/chat",
  AI_TASK_EXPORT: (projectId) => projectId ? `/ai/task-export.csv?project_id=${projectId}` : "/ai/task-export.csv",
  AI_PROJECT_TASK_REPORT: (id) => `/ai/projects/${id}/task-report.csv`,
  GOOGLE_LOGIN: () => "/users/google",
  GET_ADMIN_ME: () => "/admin/me",
  GET_ADMIN_SUMMARY: () => "/admin/summary",
  GET_ADMIN_USERS: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/users${query.toString() ? `?${query.toString()}` : ""}`;
  },
  CREATE_ADMIN_USER: () => "/admin/users",
  GET_ADMIN_USER: (id) => `/admin/users/${id}`,
  UPDATE_ADMIN_USER: (id) => `/admin/users/${id}`,
  REPLACE_ADMIN_USER_ROLES: (id) => `/admin/users/${id}/roles`,
  REVOKE_ADMIN_USER_SESSIONS: (id) => `/admin/users/${id}/revoke-sessions`,
  DELETE_ADMIN_USER: (id) => `/admin/users/${id}`,
  GET_ADMIN_ROLES: () => "/admin/roles",
  CREATE_ADMIN_ROLE: () => "/admin/roles",
  GET_ADMIN_ROLE: (id) => `/admin/roles/${id}`,
  UPDATE_ADMIN_ROLE: (id) => `/admin/roles/${id}`,
  DELETE_ADMIN_ROLE: (id) => `/admin/roles/${id}`,
  GET_ADMIN_PERMISSIONS: () => "/admin/permissions",
  REPLACE_ADMIN_ROLE_PERMISSIONS: (id) => `/admin/roles/${id}/permissions`,
  GET_ADMIN_PROJECTS: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/projects${query.toString() ? `?${query.toString()}` : ""}`;
  },
  CREATE_ADMIN_PROJECT: () => "/admin/projects",
  GET_ADMIN_PROJECT: (id) => `/admin/projects/${id}`,
  UPDATE_ADMIN_PROJECT: (id) => `/admin/projects/${id}`,
  TRANSFER_ADMIN_PROJECT: (id) => `/admin/projects/${id}/transfer`,
  DELETE_ADMIN_PROJECT: (id, confirmCascade = false) => `/admin/projects/${id}${confirmCascade ? "?confirm_cascade=true" : ""}`,
  GET_ADMIN_PROJECT_MEMBERS: (id, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/projects/${id}/members${query.toString() ? `?${query.toString()}` : ""}`;
  },
  ADD_ADMIN_PROJECT_MEMBER: (id) => `/admin/projects/${id}/members`,
  DELETE_ADMIN_PROJECT_MEMBER: (projectId, userId) => `/admin/projects/${projectId}/members/${userId}`,
  GET_ADMIN_TASKS: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/tasks${query.toString() ? `?${query.toString()}` : ""}`;
  },
  CREATE_ADMIN_TASK: () => "/admin/tasks",
  GET_ADMIN_TASK: (id) => `/admin/tasks/${id}`,
  UPDATE_ADMIN_TASK: (id) => `/admin/tasks/${id}`,
  DELETE_ADMIN_TASK: (id) => `/admin/tasks/${id}`,
  GET_ADMIN_SUBTASKS: (id) => `/admin/tasks/${id}/subtasks`,
  CREATE_ADMIN_SUBTASK: (id) => `/admin/tasks/${id}/subtasks`,
  UPDATE_ADMIN_SUBTASK: (taskId, subtaskId) => `/admin/tasks/${taskId}/subtasks/${subtaskId}`,
  DELETE_ADMIN_SUBTASK: (taskId, subtaskId) => `/admin/tasks/${taskId}/subtasks/${subtaskId}`,
  GET_ADMIN_DEPENDENCIES: (id) => `/admin/tasks/${id}/dependencies`,
  CREATE_ADMIN_DEPENDENCY: (id) => `/admin/tasks/${id}/dependencies`,
  DELETE_ADMIN_DEPENDENCY: (taskId, dependencyId) => `/admin/tasks/${taskId}/dependencies/${dependencyId}`,
  GET_ADMIN_COMMENTS: (id) => `/admin/tasks/${id}/comments`,
  DELETE_ADMIN_COMMENT: (taskId, commentId) => `/admin/tasks/${taskId}/comments/${commentId}`,
  GET_ADMIN_ACTIVITY: (id) => `/admin/tasks/${id}/activity`,
  GET_ADMIN_NOTIFICATIONS: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/notifications${query.toString() ? `?${query.toString()}` : ""}`;
  },
  GET_ADMIN_NOTIFICATION: (id) => `/admin/notifications/${id}`,
  DELETE_ADMIN_NOTIFICATION: (id) => `/admin/notifications/${id}`,
  GET_ADMIN_NOTIFICATION_PREFERENCES: (userId) => `/admin/users/${userId}/notification-preferences`,
  UPDATE_ADMIN_NOTIFICATION_PREFERENCES: (userId) => `/admin/users/${userId}/notification-preferences`,
  EXPORT_ADMIN_TASKS: (projectId) => projectId ? `/admin/reports/tasks.csv?project_id=${encodeURIComponent(projectId)}` : "/admin/reports/tasks.csv",
  GENERATE_ADMIN_PROJECT_REPORT: (projectId) => `/admin/reports/projects/${projectId}/task-report.csv`,
  GET_ADMIN_AUDIT_LOGS: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return `/admin/audit-logs${query.toString() ? `?${query.toString()}` : ""}`;
  },
  GET_ADMIN_AUDIT_LOG: (id) => `/admin/audit-logs/${id}`,
  GET_ADMIN_INTEGRATION_HEALTH: () => "/admin/integrations/health",
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const instance = axios.create({
  baseURL: `${apiBaseUrl.replace(/\/+$/, "")}/`,
});

instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem("token")) {
      localStorage.removeItem("token");
      toast.error("Invalid Credentials.");
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);
