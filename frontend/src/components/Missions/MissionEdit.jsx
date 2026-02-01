// src/components/Missions/MissionEdit.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaBan, FaDownload, FaSave, FaSyncAlt } from "react-icons/fa";
import api from "../../api/client";

/* ---------------- Utils ---------------- */
function downloadBlobPdf(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "ordre_mission.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export default function MissionEdit() {
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mission, setMission] = useState(null);

  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);

  const [vehiculeId, setVehiculeId] = useState("");
  const [chauffeurId, setChauffeurId] = useState("");

  const agenceId = mission?.agence_id || mission?.agence || ""; // selon ton serializer

  async function loadAll() {
    setLoading(true);
    try {
      const mRes = await api.get(`/missions/${id}/`);
      const m = mRes?.data || null;
      setMission(m);

      // 🔸 pré-sélection (selon serializer : vehicule_id / chauffeur_id)
      setVehiculeId(String(m?.vehicule_id || m?.vehicule?.id || m?.vehicule || ""));
      setChauffeurId(String(m?.chauffeur_id || m?.chauffeur?.id || m?.chauffeur || ""));

      // Lists
      const params = agenceId ? { agence: agenceId } : undefined;
      const [vRes, cRes] = await Promise.all([
        api.get("/vehicules/", { params }).catch(() => ({ data: [] })),
        api.get("/chauffeurs/", { params }).catch(() => ({ data: [] })),
      ]);

      const v = Array.isArray(vRes?.data?.results) ? vRes.data.results : Array.isArray(vRes?.data) ? vRes.data : [];
      const c = Array.isArray(cRes?.data?.results) ? cRes.data.results : Array.isArray(cRes?.data) ? cRes.data : [];
      setVehicules(v);
      setChauffeurs(c);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const header = useMemo(() => {
    if (!mission) return "";
    const ref = mission?.reference ? `#${mission.reference}` : `#${mission.id}`;
    const vol = mission?.numero_vol ? ` — Vol ${mission.numero_vol}` : "";
    return `Mission ${ref}${vol}`;
  }, [mission]);

  async function onDownloadPdf() {
    try {
      const res = await api.get(`/missions/${id}/pdf/`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const dateStr = String(mission?.date || "").slice(0, 10);
      const filename = `OM_${id}_${dateStr}${mission?.numero_vol ? "_" + mission.numero_vol : ""}.pdf`;
      downloadBlobPdf(blob, filename);
    } catch (e) {
      alert("Erreur lors du téléchargement du PDF.");
    }
  }

  async function onReplaceAndRegenerate() {
    setSaving(true);
    try {
      const body = {
        vehicule: vehiculeId ? Number(vehiculeId) : null,
        chauffeur: chauffeurId ? Number(chauffeurId) : null,
      };
      const res = await api.post(`/missions/${id}/replace-om/`, body, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const dateStr = String(mission?.date || "").slice(0, 10);
      const filename = `OM_${id}_${dateStr}${mission?.numero_vol ? "_" + mission.numero_vol : ""}.pdf`;
      downloadBlobPdf(blob, filename);

      // refresh mission
      await loadAll();
    } catch (e) {
      alert("Erreur lors du remplacement / régénération.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveWithoutPdf() {
    // Optionnel: si tu as un endpoint PATCH /missions/<id>/ (sinon supprime ce bouton)
    setSaving(true);
    try {
      const body = {
        vehicule: vehiculeId ? Number(vehiculeId) : null,
        chauffeur: chauffeurId ? Number(chauffeurId) : null,
      };
      await api.patch(`/missions/${id}/`, body);
      await loadAll();
      alert("Mission mise à jour.");
    } catch (e) {
      alert("Impossible de sauvegarder (PATCH /missions/:id absent ?). Utilise 'Remplacer & régénérer'.");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel() {
    if (!window.confirm("Annuler l'OM / désaffecter les ressources pour cette mission ?")) return;
    setSaving(true);
    try {
      await api.post(`/missions/${id}/cancel-om/`);
      alert("Annulé.");
      nav("/missions");
    } catch (e) {
      alert("Erreur lors de l'annulation.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content p-4 bg-light min-vh-100">
        <div className="card border-0 shadow-sm rounded-4 p-4">Chargement...</div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="page-content p-4 bg-light min-vh-100">
        <div className="card border-0 shadow-sm rounded-4 p-4">
          <div className="mb-3">Mission introuvable.</div>
          <button className="btn btn-outline-secondary" onClick={() => nav(-1)}>
            <FaArrowLeft className="me-2" /> Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content p-4 bg-light min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <button className="btn btn-link text-decoration-none px-0" onClick={() => nav(-1)}>
            <FaArrowLeft className="me-2" />
            Retour
          </button>
          <h2 className="fw-bold text-dark mb-1">{header}</h2>
          <div className="text-muted small">
            {fmtDate(mission?.date)} • {mission?.aeroport || "—"}
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={onDownloadPdf} disabled={saving}>
            <FaDownload className="me-2" /> PDF
          </button>
          <button className="btn btn-outline-danger" onClick={onCancel} disabled={saving}>
            <FaBan className="me-2" /> Annuler
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 p-4">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-bold">Véhicule</label>
            <select className="form-select" value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)}>
              <option value="">—</option>
              {vehicules.map((v) => (
                <option key={v.id} value={v.id}>
                  {v?.marque ? `${v.marque} ${v.modele} (${v.immatriculation})` : v?.label || v?.name || `Véhicule #${v.id}`}
                </option>
              ))}
            </select>
            <div className="form-text">Choisis le véhicule puis clique sur “Remplacer & régénérer”.</div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Chauffeur</label>
            <select className="form-select" value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)}>
              <option value="">—</option>
              {chauffeurs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c?.prenom ? `${c.prenom} ${c.nom}` : c?.label || c?.name || `Chauffeur #${c.id}`}
                </option>
              ))}
            </select>
            <div className="form-text">Le backend vérifie l’agence + la dispo via MissionRessource.</div>
          </div>
        </div>

        <hr />

        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={onReplaceAndRegenerate} disabled={saving}>
            <FaSyncAlt className={saving ? "me-2 fa-spin" : "me-2"} />
            Remplacer & régénérer OM
          </button>

          <button className="btn btn-outline-secondary" onClick={onSaveWithoutPdf} disabled={saving}>
            <FaSave className="me-2" />
            Sauver sans PDF (option)
          </button>
        </div>

        <div className="alert alert-info mt-3 mb-0">
          <div className="fw-bold mb-1">Ce que fait “Remplacer & régénérer”</div>
          <ul className="mb-0">
            <li>met à jour la mission (vehicule/chauffeur)</li>
            <li>met à jour/écrase MissionRessource (1 seule ligne)</li>
            <li>supprime l’ancien PDF si existant et régénère + stocke 1 fois</li>
            <li>te renvoie directement le PDF</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
