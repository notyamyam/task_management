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
  UPDATE_TASK: (id) => `/tasks/update-task?id=${id}`,
  DELETE_TASK: (id) => `/tasks/delete-task?id=${id}`,
  CREATE_PROJECT: () => "/projects/create-project",
  GET_PROJECTS: () => "/projects/get-projects",
  GET_PROJECT: (id) => `/projects/${id}`,
  GET_AVAILABLE_PROJECT_USERS: (id) => `/projects/${id}/available-users`,
  ADD_PROJECT_MEMBER: (id) => `/projects/${id}/members`,
  AI_CHAT: () => "/ai/chat",
  AI_TASK_EXPORT: (projectId) => projectId ? `/ai/task-export.csv?project_id=${projectId}` : "/ai/task-export.csv",
  AI_PROJECT_TASK_REPORT: (id) => `/ai/projects/${id}/task-report.csv`,
  GOOGLE_LOGIN: () => "/users/google",
};

export const instance = axios.create({
  baseURL: "http://localhost:8000/",
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
