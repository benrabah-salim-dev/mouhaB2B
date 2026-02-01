import React, { useEffect, useState, useContext } from "react";
import api from "../../api/client";
import Sidebar from "../../layout/Sidebar"; // ✅ Import du Sidebar
import { AuthContext } from "../../auth/AuthContext";
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "");

function OrdresMissionList() {
  const { user, logout } = useContext(AuthContext) || {}; // ✅ Récupère user + logout
  const agence_id = user?.agence_id; // ✅ Récupère l'agence de l'utilisateur connecté

  const [ordres, setOrdres] = useState([]);
  const [agence, setAgence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Charger la liste des OM
  const fetchOrdres = async () => {
    setLoading(true);
    setError("");
    try {
      if (agence_id) {
        const agenceRes = await api.get(`agences/${agence_id}/`);
        setAgence(agenceRes.data);
      }

      const { data } = await api.get("ordres-mission/");
      setOrdres(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error("Erreur chargement OM:", e);
      setError("Impossible de charger la liste des ordres de mission.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdres();
  }, []);

  // Téléchargement direct du PDF
  const downloadPDF = async (id, ref) => {
    try {
      const response = await api.get(`ordres-mission/${id}/pdf/`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ordre_mission_${ref || id}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erreur téléchargement PDF:", e);
    }
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchOrdres();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="d-flex">
      {/* Sidebar réutilisé */}
      <Sidebar
        agenceId={agence_id}
        agenceNom={agence?.nom}
        role={user?.role}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onLogout={() => logout?.(true)}
      />

      <main className="container-fluid" style={{ marginLeft: 270 }}>
        <h2 className="my-3">📄 Ordres de Mission</h2>

        {loading && <div className="alert alert-info">Chargement...</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && (
          <div className="table-responsive shadow-sm rounded bg-white">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-dark">
                <tr>
                  <th>Réf. OM</th>
                  <th>Mission</th>
                  <th>Chauffeur</th>
                  <th>Véhicule</th>
                  <th>Trajet</th>
                  <th>Départ</th>
                  <th>Retour</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {ordres.map((om) => (
                  <tr key={om.id}>
                    <td><strong>{om.reference}</strong></td>
                    <td>{om.mission_reference}</td>
                    <td>{om.chauffeur_nom} {om.chauffeur_prenom}</td>
                    <td>{om.vehicule_marque} ({om.vehicule_immatriculation})</td>
                    <td>{om.trajet}</td>
                    <td>{fmtDate(om.date_depart)}</td>
                    <td>{fmtDate(om.date_retour)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => downloadPDF(om.id, om.reference)}
                      >
                        📥 Télécharger
                      </button>
                    </td>
                  </tr>
                ))}
                {ordres.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center text-muted">
                      Aucun ordre de mission trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default OrdresMissionList;
