// src/api/client.js
import axios from "axios";

function buildApiBase() {
  let base = (process.env.REACT_APP_API_URL || "").trim();
  base = base.replace(/\/+$/, "");
  if (!base) return "/api";
  if (!/\/api($|\/)/.test(base)) base = base + "/api";
  return base;
}

export const API_BASE = buildApiBase();
const LOGIN_ROUTE = process.env.REACT_APP_LOGIN_ROUTE || "/login";

const storageKey = "access";
export const getAccess = () => {
  try { return window.localStorage.getItem(storageKey); } catch { return null; }
};
export const setAccess = (token) => {
  try { window.localStorage.setItem(storageKey, token); } catch {}
};
export const clearAccess = () => {
  try { window.localStorage.removeItem(storageKey); } catch {}
};

const api = axios.create({
  baseURL: API_BASE.endsWith("/") ? API_BASE : API_BASE + "/",
  timeout: 180000,
  withCredentials: true, // cookie refresh_token
});

api.interceptors.request.use((config) => {
  const access = getAccess();
  if (access) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let isRefreshing = false;
let waiters = [];

function notify(newAccess) {
  waiters.forEach((cb) => { try { cb(newAccess); } catch {} });
  waiters = [];
}

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location?.pathname !== LOGIN_ROUTE) {
    window.location.assign(LOGIN_ROUTE);
  }
}

export async function refreshAccess() {
  const resp = await axios.post(
    `${API_BASE}/auth/refresh/`,
    {},
    { withCredentials: true, timeout: 20000 }
  );
  return resp?.data?.access || null;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err?.config;
    const status = err?.response?.status;

    if (!original || !err.response) return Promise.reject(err);

    if (status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          waiters.push((newAccess) => {
            if (!newAccess) return reject(err);
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newAccess}`;
            resolve(api(original));
          });
        });
      }

      try {
        isRefreshing = true;
        const newAccess = await refreshAccess();
        if (!newAccess) {
          clearAccess();
          notify(null);
          redirectToLogin();
          return Promise.reject(err);
        }
        setAccess(newAccess);
        notify(newAccess);

        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (e) {
        clearAccess();
        notify(null);
        redirectToLogin();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default api;
