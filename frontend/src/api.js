// src/api.js
import axios from "axios";

/** Construit une base stable depuis .env (prend BASE/URL), et ajoute /api si absent. */
function buildApiBase() {
  let base = (process.env.REACT_APP_API_URL || "").trim(); // ← safe quand non défini
  base = base.replace(/\/+$/, ""); // retire les slashs finaux
  if (!base) return "/api";        // fallback proxy CRA: /api
  if (!/\/api($|\/)/.test(base)) base = base + "/api";
  return base;
}

export const API_BASE = buildApiBase();

/** Endpoints d'auth (DRF SimpleJWT) */
const DEFAULT_LOGIN_ENDPOINT = "token/";         // /api/token/
const DEFAULT_REFRESH_ENDPOINT = "login/refresh/";
const LOGIN_ROUTE = process.env.REACT_APP_LOGIN_ROUTE || "/login";
const DEFAULT_TIMEOUT_MS = 30000;

/* ----------------------- Storage (localStorage + fallback mémoire) ----------------------- */
const _mem = {};
const storage = {
  get(k) {
    try { return window.localStorage.getItem(k); } catch { return _mem[k] ?? null; }
  },
  set(k, v) {
    try { window.localStorage.setItem(k, v); } catch { _mem[k] = v; }
  },
  remove(k) {
    try { window.localStorage.removeItem(k); } catch { delete _mem[k]; }
  },
};

/* ------------- Compat tokens: lit d’abord access/refresh, sinon userData.* -------------- */
export const getTokens = () => {
  const access = storage.get("access");
  const refresh = storage.get("refresh");
  if (access || refresh) return { access, refresh };

  const udRaw = storage.get("userData");
  if (udRaw) {
    try {
      const ud = JSON.parse(udRaw);
      return { access: ud.token || null, refresh: ud.refresh_token || null };
    } catch {}
  }
  return { access: null, refresh: null };
};

export const setTokens = ({ access, refresh }) => {
  if (access) storage.set("access", access);
  if (refresh) storage.set("refresh", refresh);

  // Mets aussi à jour userData si présent (compat avec AuthContext actuel)
  const udRaw = storage.get("userData");
  if (udRaw) {
    try {
      const ud = JSON.parse(udRaw) || {};
      if (access) ud.token = access;
      if (refresh) ud.refresh_token = refresh;
      storage.set("userData", JSON.stringify(ud));
    } catch {}
  }
};

export const clearTokens = () => {
  storage.remove("access");
  storage.remove("refresh");
  // ne touche pas à userData ici: leave it to your logout flow
};

/* ----------------------------- Instance Axios principale ----------------------------- */
const api = axios.create({
  baseURL: API_BASE.endsWith("/") ? API_BASE : API_BASE + "/",
  timeout: 180000, // 3 minutes
  // headers: { Accept: "application/json" },
});


/* ----------------------------- Interceptor: Request ---------------------------------- */
api.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

/* ----------------------- Gestion refresh anti-concurrence ---------------------------- */
let isRefreshing = false;
let subscribers = [];

function notifySubscribers(newAccessOrNull) {
  subscribers.forEach((cb) => { try { cb(newAccessOrNull); } catch {} });
  subscribers = [];
}
function addSubscriber(cb) { subscribers.push(cb); }

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location?.pathname !== LOGIN_ROUTE) {
    window.location.assign(LOGIN_ROUTE);
  }
}

/* --------------------------- Interceptor: Response (401) ----------------------------- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err?.config;
    const status = err?.response?.status;

    if (!original || !err.response) return Promise.reject(err);

    if (status === 401 && !original._retry) {
      original._retry = true;

      const { refresh } = getTokens();
      if (!refresh) {
        clearTokens();
        redirectToLogin();
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addSubscriber((newAccess) => {
            if (!newAccess) return reject(err);
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newAccess}`;
            resolve(api(original));
          });
        });
      }

      try {
        isRefreshing = true;
        // axios "nu" pour éviter boucle d'interceptors
        const resp = await axios.post(
          `${API_BASE}/${DEFAULT_REFRESH_ENDPOINT}`,
          { refresh },
          { timeout: DEFAULT_TIMEOUT_MS }
        );
        const { access: newAccess, refresh: rotatedRefresh } = resp.data || {};

        if (!newAccess) {
          clearTokens();
          notifySubscribers(null);
          redirectToLogin();
          return Promise.reject(err);
        }

        setTokens({ access: newAccess, refresh: rotatedRefresh || refresh });
        notifySubscribers(newAccess);

        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (e) {
        clearTokens();
        notifySubscribers(null);
        redirectToLogin();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

/* ------------------------------- Helpers d'auth ------------------------------------- */

/** /api/login/ custom: renvoie {access, refresh, role?, agence_id?} */
export async function loginCustom({ username, password, agence }) {
  const payload = { username, password };
  if (agence != null) payload.agence = agence;
  const { data } = await axios.post(`${API_BASE}/login/`, payload, { timeout: DEFAULT_TIMEOUT_MS });
  const { access, refresh } = data || {};
  if (!access || !refresh) throw new Error("Jetons JWT manquants (login custom)");
  setTokens({ access, refresh });
  return data;
}

/** /api/token/ (SimpleJWT standard) */
export async function loginSimpleJWT({ username, password }) {
  const { data } = await axios.post(`${API_BASE}/${DEFAULT_LOGIN_ENDPOINT}`, { username, password }, { timeout: DEFAULT_TIMEOUT_MS });
  const { access, refresh } = data || {};
  if (!access || !refresh) throw new Error("Jetons JWT manquants (token/)");
  setTokens({ access, refresh });
  return data;
}

/** Essaie /login/, sinon fallback /token/ */
export async function loginAuto({ username, password, agence }) {
  try {
    return await loginCustom({ username, password, agence });
  } catch (e) {
    const sc = e?.response?.status;
    if (sc === 404 || sc === 405) return await loginSimpleJWT({ username, password });
    throw e;
  }
}

export function getAuthState() {
  const { access, refresh } = getTokens();
  return { isAuthenticated: Boolean(access), hasRefresh: Boolean(refresh) };
}

export function logout() {
  clearTokens();
  redirectToLogin();
}

export default api;
