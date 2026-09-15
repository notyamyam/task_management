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
  GET_TASKS: () => "/tasks/get-tasks",
  UPDATE_TASK: (id) => `/tasks/update-task?id=${id}`,
  DELETE_TASK: (id) => `/tasks/delete-task?id=${id}`,
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
