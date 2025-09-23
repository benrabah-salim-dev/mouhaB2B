// src/api.js
import axios from "axios";

/** Construit une base stable depuis .env (prend BASE ou URL), et ajoute /api si absent */
function buildApiBase() {
  let base =
     process.env.REACT_APP_API_URL ;
  base = base.replace(/\/+$/, ""); // pas de slash final
  // Si /api n'est pas présent à la fin, on l'ajoute
  if (!/\/api($|\/)/.test(base)) base = base + "/api";
  return base;
}

export const API_BASE = buildApiBase();

/** Endpoints d'auth par défaut (DRF SimpleJWT) */
const DEFAULT_LOGIN_ENDPOINT = "token/";         // /api/token/ (username+password)
const DEFAULT_REFRESH_ENDPOINT = "token/refresh/";

/** Route SPA de login (pour redirection client) */
const LOGIN_ROUTE = process.env.REACT_APP_LOGIN_ROUTE || "/login";

/** Timeout réseau */
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

export const getTokens = () => ({
  access: storage.get("access"),
  refresh: storage.get("refresh"),
});

export const setTokens = ({ access, refresh }) => {
  if (access) storage.set("access", access);
  if (refresh) storage.set("refresh", refresh);
};

export const clearTokens = () => {
  storage.remove("access");
  storage.remove("refresh");
};

/* ----------------------------- Instance Axios principale ----------------------------- */
const api = axios.create({
  baseURL: API_BASE + "/",          // ex: http://127.0.0.1:8000/api/
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { Accept: "application/json" },
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
  subscribers.forEach((cb) => {
    try { cb(newAccessOrNull); } catch { /* noop */ }
  });
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

    // Pas de réponse/Config -> propage
    if (!original || !err.response) return Promise.reject(err);

    // On ne tente qu'une seule fois par requête
    if (status === 401 && !original._retry) {
      original._retry = true;

      const { refresh } = getTokens();
      if (!refresh) {
        clearTokens();
        redirectToLogin();
        return Promise.reject(err);
      }

      // Si un refresh tourne, on met en file d'attente
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
        // Utiliser axios "nu" pour éviter d'entrer dans cet interceptor
        const resp = await axios.post(`${API_BASE}/${DEFAULT_REFRESH_ENDPOINT}`, { refresh }, { timeout: DEFAULT_TIMEOUT_MS });
        const { access: newAccess, refresh: rotatedRefresh } = resp.data || {};

        if (!newAccess) {
          clearTokens();
          notifySubscribers(null);
          redirectToLogin();
          return Promise.reject(err);
        }

        // Support rotation: si le serveur renvoie un refresh, on le stocke
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

    // Autres erreurs -> propage
    return Promise.reject(err);
  }
);

/* ------------------------------- Helpers d'auth ------------------------------------- */

/**
 * loginCustom: POST /api/login/ (ta LoginView custom)
 * Doit renvoyer {access, refresh, role?, agence_id?}
 */
export async function loginCustom({ username, password, agence }) {
  const payload = { username, password };
  if (agence != null) payload.agence = agence;
  const { data } = await axios.post(`${API_BASE}/login/`, payload, { timeout: DEFAULT_TIMEOUT_MS });

  const { access, refresh } = data || {};
  if (!access || !refresh) throw new Error("Jetons JWT manquants (login custom)");
  setTokens({ access, refresh });
  return data;
}

/**
 * loginSimpleJWT: POST /api/token/ (SimpleJWT standard)
 * Renvoie {access, refresh}
 */
export async function loginSimpleJWT({ username, password }) {
  const { data } = await axios.post(`${API_BASE}/${DEFAULT_LOGIN_ENDPOINT}`, { username, password }, { timeout: DEFAULT_TIMEOUT_MS });
  const { access, refresh } = data || {};
  if (!access || !refresh) throw new Error("Jetons JWT manquants (token/)");
  setTokens({ access, refresh });
  return data;
}

/**
 * loginAuto: tente /login/ puis fallback /token/ (pratique quand tu switches)
 */
export async function loginAuto({ username, password, agence }) {
  try {
    return await loginCustom({ username, password, agence });
  } catch (e) {
    const sc = e?.response?.status;
    // si l'endpoint custom n'existe pas (404) ou n'accepte pas GET (405) côté test manuel
    if (sc === 404 || sc === 405) {
      return await loginSimpleJWT({ username, password });
    }
    throw e;
  }
}

/** Vérifie l’auth côté UI */
export function getAuthState() {
  const { access, refresh } = getTokens();
  return { isAuthenticated: Boolean(access), hasRefresh: Boolean(refresh) };
}

/** Déconnexion */
export function logout() {
  clearTokens();
  redirectToLogin();
}

export default api;
