import axios from "axios";
import { toast } from "react-toastify";

export const ENDPOINTS = {
  LOGIN: () => "/users/login",
  CREATE_TASK: () => "/tasks/create-task",
  GET_TASKS: () => "/tasks/get-tasks",
  UPDATE_TASK: (id) => `/tasks/update-task?id=${id}`,
  DELETE_TASK: (id) => `/tasks/delete-task?id=${id}`,
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
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      toast.error("Invalid Credentials.");
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);
