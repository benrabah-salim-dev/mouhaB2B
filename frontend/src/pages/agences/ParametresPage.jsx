import React, { useMemo, useState } from "react";
import api from "../../api/client";

export default function ParametresPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmNewPassword) return false;
    if (newPassword !== confirmNewPassword) return false;
    if (newPassword.length < 8) return false;
    return true;
  }, [currentPassword, newPassword, confirmNewPassword]);

  const validate = () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return "Veuillez remplir tous les champs.";
    }
    if (newPassword.length < 8) {
      return "Le nouveau mot de passe doit contenir au moins 8 caractères.";
    }
    if (newPassword !== confirmNewPassword) {
      return "La confirmation du nouveau mot de passe ne correspond pas.";
    }
    if (newPassword === currentPassword) {
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setLoading(true);
    try {
      /**
       * ⚠️ IMPORTANT :
       * adapte l’URL à ton endpoint Django.
       * Exemples fréquents :
       * - /auth/change-password/
       * - /auth/password/change/
       * - /users/me/change-password/
       */
      await api.post("/auth/change-password/", {
        old_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmNewPassword,
      });

      setSuccess("Mot de passe modifié avec succès.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      // messages propres
      if (status === 400) {
        const detail =
          data?.detail ||
          data?.message ||
          (typeof data === "string" ? data : null) ||
          "Données invalides. Vérifiez les champs.";
        setError(detail);
      } else if (status === 401) {
        setError("Session expirée. Veuillez vous reconnecter.");
      } else if (status >= 500) {
        setError("Serveur indisponible. Réessayez plus tard.");
      } else {
        setError("Impossible de modifier le mot de passe.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 900 }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h4 mb-1">Paramètres</h1>
          <div className="text-muted small">
            Gérez vos informations de compte.
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: 16 }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h2 className="h6 mb-1">Changer le mot de passe</h2>
              <div className="text-muted small">
                Utilisez un mot de passe fort et unique.
              </div>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success py-2" role="alert">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Ancien mdp */}
            <div className="mb-3">
              <label className="form-label">Mot de passe actuel</label>
              <div className="input-group">
                <input
                  type={showCurrent ? "text" : "password"}
                  className="form-control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowCurrent((v) => !v)}
                >
                  {showCurrent ? "Masquer" : "Afficher"}
                </button>
              </div>
            </div>

            {/* Nouveau mdp */}
            <div className="mb-3">
              <label className="form-label">Nouveau mot de passe</label>
              <div className="input-group">
                <input
                  type={showNew ? "text" : "password"}
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? "Masquer" : "Afficher"}
                </button>
              </div>
              <div className="form-text">
                Minimum 8 caractères (recommandé : une phrase + chiffres).
              </div>
            </div>

            {/* Confirmation */}
            <div className="mb-4">
              <label className="form-label">Confirmer le nouveau mot de passe</label>
              <div className="input-group">
                <input
                  type={showConfirm ? "text" : "password"}
                  className="form-control"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? "Masquer" : "Afficher"}
                </button>
              </div>

              {confirmNewPassword && newPassword !== confirmNewPassword && (
                <div className="text-danger small mt-1">
                  La confirmation ne correspond pas.
                </div>
              )}
            </div>

            <div className="d-flex gap-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Enregistrement…
                  </>
                ) : (
                  "Enregistrer"
                )}
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={loading}
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
