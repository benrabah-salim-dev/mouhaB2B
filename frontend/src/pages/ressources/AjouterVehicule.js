import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";

const AjouterVehicule = () => {
  const { agence_id } = useParams();
  const navigate = useNavigate();

  const [type, setType] = useState("");
  const [marque, setMarque] = useState("");
  const [model, setModel] = useState("");
  const [capacite, setCapacite] = useState("");
  const [annee, setAnnee] = useState("");
  const [immatriculation, setImmatriculation] = useState("");
  const [louable, setLouable] = useState(false); // État pour la case à cocher "louable"
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Vérification si l'immatriculation existe déjà
  const checkImmatriculationExist = async (immatriculation) => {
    try {
      const response = await api.get(`vehicules/?immatriculation=${immatriculation}`);
      return response.data.length > 0; // Retourne true si l'immatriculation existe déjà
    } catch (err) {
      console.error("Erreur lors de la vérification de l'immatriculation", err);
      return false;
    }
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});


    // Validation des champs côté frontend
    if (!capacite || capacite < 1) {
      setFieldErrors((p) => ({ ...p, capacite: "Capacité invalide" }));
      return;
    }
    if (!annee || annee < 1900) {
      setFieldErrors((p) => ({ ...p, annee: "Année invalide" }));
      return;
    }

    // Préparation des données à envoyer
    const payload = {
      type,
      marque: marque.trim(),
      modele: model.trim(),
      capacite: Number(capacite),
      annee: Number(annee),
      immatriculation: immatriculation.trim(),
      agence: Number(agence_id),
      louer_autres_agences: louable, // Inclure l'état de "louable"
    };

    try {
      setSubmitting(true);
      // Soumettre les données pour créer le véhicule
      await api.post("vehicules/", payload); // Base URL + Auth déjà gérés
      // Naviguer vers la page de ressources de l'agence après l'ajout réussi
      navigate(`/agence/${agence_id}/ressources/vehicules`, { replace: true });
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        setFieldErrors(data);
        const nonField =
          data.detail || data.non_field_errors?.[0] || data.error || "Erreur lors de l'ajout du véhicule.";
        setError(nonField);
      } else {
        setError("Erreur lors de l'ajout du véhicule.");
      }
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Afficher les erreurs pour chaque champ
  const FieldError = ({ name }) =>
    fieldErrors?.[name] ? (
      <div className="text-danger small mt-1">
        {Array.isArray(fieldErrors[name]) ? fieldErrors[name].join(", ") : String(fieldErrors[name])}
      </div>
    ) : null;

  return (
    <div className="container mt-4">
      <h2>Ajouter un véhicule</h2>
      {error && <p className="text-danger">{error}</p>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor="type" className="form-label">Type</label>
          <select
            id="type"
            className="form-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="">Choisir un type</option>
            <option value="bus">Bus</option>
            <option value="minibus">Minibus</option>
            <option value="microbus">Microbus</option>
            <option value="4x4">4X4</option>
          </select>
          <FieldError name="type" />
        </div>

        <div className="mb-3">
          <label htmlFor="marque" className="form-label">Marque</label>
          <input
            type="text"
            id="marque"
            className="form-control"
            value={marque}
            onChange={(e) => setMarque(e.target.value)}
            required
          />
          <FieldError name="marque" />
        </div>

        <div className="mb-3">
          <label htmlFor="model" className="form-label">Modèle</label>
          <input
            type="text"
            id="model"
            className="form-control"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
          <FieldError name="model" />
        </div>

        <div className="mb-3">
          <label htmlFor="capacite" className="form-label">Capacité</label>
          <input
            type="number"
            id="capacite"
            className="form-control"
            value={capacite}
            onChange={(e) => setCapacite(e.target.value)}
            required
            min={1}
          />
          <FieldError name="capacite" />
        </div>

        <div className="mb-3">
          <label htmlFor="annee" className="form-label">Année</label>
          <input
            type="number"
            id="annee"
            className="form-control"
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            required
            min={1900}
          />
          <FieldError name="annee" />
        </div>

        <div className="mb-3">
          <label htmlFor="immatriculation" className="form-label">Numéro d'immatriculation</label>
          <input
            type="text"
            id="immatriculation"
            className="form-control"
            value={immatriculation}
            onChange={(e) => setImmatriculation(e.target.value)}
            required
          />
          <FieldError name="immatriculation" />
        </div>

        {/* Case à cocher "Louable" */}
        <div className="mb-3 form-check">
          <input
            type="checkbox"
            id="louable"
            className="form-check-input"
            checked={louable}
            onChange={() => setLouable(!louable)}
          />
          <label className="form-check-label" htmlFor="louable">
            Ce véhicule est louable
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Ajout..." : "Ajouter le véhicule"}
        </button>
      </form>
    </div>
  );
};

export default AjouterVehicule;
