import axios from "axios";

export const TOKEN_KEY = "jp_token";
export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Publish the API base so the browser extension's bridge content script can read
// the exact base this app uses (alongside jp_token) and auto-connect — the user
// never copies a token. Harmless for the app itself.
try {
  if (typeof localStorage !== "undefined") localStorage.setItem("jp_api_base", BASE);
} catch {
  /* ignore (private mode / SSR) */
}

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
