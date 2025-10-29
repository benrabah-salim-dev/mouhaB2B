// src/pages/LoginPage.jsx
import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom"; // 👈 ajout Link
import { AuthContext } from "../context/AuthContext";
import logoUrl from "../assets/SMEKSLogoLogin.png";

export default function LoginPage() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  // UI state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const userInputRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("rememberedUsername");
    if (savedUser) {
      setUsername(savedUser);
      setRemember(true);
      setTimeout(() => document.getElementById("password")?.focus(), 0);
    } else {
      setTimeout(() => userInputRef.current?.focus(), 0);
    }
  }, []);

  const handleKeyEvent = (e) => {
    const caps = e.getModifierState && e.getModifierState("CapsLock");
    setCapsOn(!!caps);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setSubmitting(true);

    try {
      const u = username.trim();
      await login(u, password);

      if (remember) localStorage.setItem("rememberedUsername", u);
      else localStorage.removeItem("rememberedUsername");

      const saved = JSON.parse(localStorage.getItem("userData") || "{}");
      if (saved?.role === "superadmin") {
        navigate("/dashboard/superadmin", { replace: true });
      } else if (saved?.agence_id) {
        navigate(`/agence/${saved.agence_id}/dashboard`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setError("Nom d’utilisateur ou mot de passe incorrect.");
      else if (status === 429) setError("Trop de tentatives. Réessayez dans quelques instants.");
      else if (status >= 500) setError("Serveur indisponible. Veuillez réessayer.");
      else setError("Impossible de vous connecter. Vérifiez vos informations.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{
        background: "linear-gradient(135deg, rgba(13,110,253,0.08), rgba(25,135,84,0.08))",
        padding: "24px",
      }}
    >
      <div
        className="card shadow-lg border-0"
        style={{ width: "100%", maxWidth: 440, borderRadius: "20px", backdropFilter: "blur(10px)" }}
      >
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-3">
            <img
              src={logoUrl}
              alt="SMEKS"
              height={48}
              className="mb-3"
              style={{ objectFit: "contain", userSelect: "none" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <h2 className="mb-1">Connexion</h2>
          </div>

          {error && (
            <div className="alert alert-danger py-2" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="username" className="form-label">Nom d’utilisateur</label>
              <input
                id="username"
                ref={userInputRef}
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyUp={handleKeyEvent}
                autoComplete="username"
                required
                aria-invalid={!!error}
              />
            </div>

            <div className="mb-2">
              <label htmlFor="password" className="form-label">Mot de passe</label>
              <div className="input-group">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={handleKeyEvent}
                  autoComplete="current-password"
                  required
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? "Masquer" : "Afficher"}
                </button>
              </div>
              {capsOn && <div className="form-text text-warning">Attention : Verr. Maj activée.</div>}
            </div>

            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="form-check">
                <input
                  id="remember"
                  type="checkbox"
                  className="form-check-input"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <label htmlFor="remember" className="form-check-label">Se souvenir de moi</label>
              </div>
              <a className="link-primary small" href="/forgot-password">Mot de passe oublié ?</a>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          {/* --- Bloc Inscription agence --- */}
          <div className="text-center mt-3">
            <small className="text-muted d-block">Nouvelle agence ?</small>

            

             <button
              type="button"
              className="btn btn-outline-secondary btn-sm mt-2"
              onClick={() => navigate('/inscription-agence')}
            >
              Créer un compte agence
            </button> 
            </div>

          <div className="text-center mt-3">
            <small className="text-muted">Besoin d’aide ? Contactez votre administrateur.</small>
          </div>
        </div>
      </div>
    </div>
  );
}
