import axios from "axios";

export const TOKEN_KEY = "jp_token";
export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
