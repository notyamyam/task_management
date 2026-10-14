import axios from "axios";
import { toast } from "react-toastify";

export const ENDPOINTS = {
  LOGIN: () => "/users/login",
  REGISTER: () => "/users/register",
  GET_PROFILE: () => "/users/me",
  UPDATE_PROFILE: () => "/users/me",
  UPDATE_PASSWORD: () => "/users/me/password",
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
