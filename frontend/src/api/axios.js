import axios from "axios";

const API_ROOT = process.env.REACT_APP_API_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8000";

// On utilise un *seul* instance axios pour toute l’app
const http = axios.create({
  baseURL: `${API_ROOT}/api`, // toutes les routes sont sous /api/
  withCredentials: false,
});

// Helpers de gestion de tokens
export function getTokens() {
  try { return JSON.parse(localStorage.getItem("userData") || "{}"); } catch { return {}; }
}
export function setTokens({ access, refresh, role, agence_id }) {
  const prev = getTokens();
  const next = {
    access: access ?? prev.access,
    refresh: refresh ?? prev.refresh,
    role: role ?? prev.role,
    agence_id: agence_id ?? prev.agence_id,
  };
  localStorage.setItem("userData", JSON.stringify(next));
  // met à jour le header pour les futurs appels
  if (next.access) http.defaults.headers.common["Authorization"] = `Bearer ${next.access}`;
  else delete http.defaults.headers.common["Authorization"];
}
export function clearTokens() {
  localStorage.removeItem("userData");
  delete http.defaults.headers.common["Authorization"];
}

// Au boot : si un access est présent, on l’attache
(() => {
  const { access } = getTokens();
  if (access) http.defaults.headers.common["Authorization"] = `Bearer ${access}`;
})();

// Interceptor 401 → on tente un refresh (une fois), puis on rejoue la requête
let isRefreshing = false;
let queue = [];

function flushQueue(error, token = null) {
  queue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  queue = [];
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Si pas 401 ou déjà réessayé → on jette l’erreur
    if (error?.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    const { refresh } = getTokens();
    if (!refresh) return Promise.reject(error);

    if (isRefreshing) {
      // on attend le refresh en cours
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (newAccess) => {
            original.headers["Authorization"] = `Bearer ${newAccess}`;
            resolve(http(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const resp = await axios.post(`${API_ROOT}/api/token/refresh/`, { refresh });
      const newAccess = resp.data?.access;
      if (!newAccess) throw new Error("No access in refresh response");

      // on sauvegarde et on met à jour le header global
      setTokens({ access: newAccess });

      flushQueue(null, newAccess);

      // rejoue la requête d’origine
      original.headers["Authorization"] = `Bearer ${newAccess}`;
      return http(original);
    } catch (e) {
      flushQueue(e, null);
      clearTokens();
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
);

export default http;
