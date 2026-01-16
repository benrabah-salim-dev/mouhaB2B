// -----------------------------------------------------------
// ExcursionsPage.jsx — Modèle + Étapes dans un seul formulaire
// -----------------------------------------------------------

import React, { useEffect, useState } from "react";
import api from "../../api";
import GooglePlacesInput from "./GooglePlacesInput.jsx";

function extractError(err) {
  if (!err || !err.response || !err.response.data) return "Erreur inconnue";
  try {
    return JSON.stringify(err.response.data);
  } catch (e) {
    return "Erreur côté serveur";
  }
}

function ExcursionFormFull({ initialData, onSaved }) {
  const [form, setForm] = useState({
    nom: "",
    description: "",
    type_duree: "HALF",
    nb_jours: 1,
    repas_inclus: false,
    depart_label: "",
    depart_lat: null,
    depart_lng: null,
    depart_place_id: null,
  });

  const [steps, setSteps] = useState([]);

  const [newStep, setNewStep] = useState({
    ordre: 1,
    nom: "",
    adresse: "",
    lat: null,
    lng: null,
    place_id: null,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Chargement des données si édition
  useEffect(() => {
    if (initialData) {
      setForm({
        nom: initialData.nom,
        description: initialData.description,
        type_duree: initialData.type_duree,
        nb_jours: initialData.nb_jours,
        repas_inclus: initialData.repas_inclus,
        depart_label: initialData.depart_label,
        depart_lat: initialData.depart_lat,
        depart_lng: initialData.depart_lng,
        depart_place_id: initialData.depart_place_id,
      });

      loadExistingSteps(initialData.id);
    }
  }, [initialData]);

  const loadExistingSteps = async (templateId) => {
    const resp = await api.get("/excursion-steps/", {
      params: { template: templateId },
    });

    setSteps(resp.data);

    const maxOrdre =
      resp.data.length > 0 ? Math.max(...resp.data.map((s) => s.ordre)) : 0;

    setNewStep({
      ordre: maxOrdre + 1,
      nom: "",
      adresse: "",
      lat: null,
      lng: null,
      place_id: null,
    });
  };

  // Ajout d'étape
  const addStep = () => {
    if (!newStep.nom.trim()) return;

    setSteps((prev) => [...prev, newStep]);

    setNewStep((prev) => ({
      ordre: prev.ordre + 1,
      nom: "",
      adresse: "",
      lat: null,
      lng: null,
      place_id: null,
    }));
  };

  const deleteStep = (i) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Drag & Drop
  const [dragIndex, setDragIndex] = useState(null);

  const onDragStart = (i) => setDragIndex(i);
  const onDragOver = (e) => e.preventDefault();

  const onDrop = (i) => {
    if (dragIndex === null || dragIndex === i) return;

    const reordered = [...steps];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(i, 0, moved);

    const withOrder = reordered.map((s, idx) => ({
      ...s,
      ordre: idx + 1,
    }));

    setSteps(withOrder);
    setDragIndex(null);
  };

  // Enregistrement complet
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        nb_jours: form.type_duree === "MULTI" ? Number(form.nb_jours) : 1,
      };

      let resp;

      if (initialData) {
        resp = await api.put(`/excursion-templates/${initialData.id}/`, payload);
      } else {
        resp = await api.post("/excursion-templates/", payload);
      }

      const templateId = resp.data.id;

      for (const step of steps) {
        await api.post("/excursion-steps/", {
          template: templateId,
          ordre: step.ordre,
          nom: step.nom,
          adresse: step.adresse,
          lat: step.lat,
          lng: step.lng,
          place_id: step.place_id,
          is_meal_stop_matin: false,
          is_meal_stop_midi: false,
          is_meal_stop_soir: false,
          duree_arret_minutes: 0,
        });
      }

      if (onSaved) onSaved(resp.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded p-3">

      <h3>{initialData ? "Modifier l’excursion" : "Nouvelle excursion"}</h3>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Nom */}
      <div className="mb-3">
        <label>Nom *</label>
        <input
          className="form-control"
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
          required
        />
      </div>

      {/* Description */}
      <div className="mb-3">
        <label>Description</label>
        <textarea
          className="form-control"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      {/* Type + Nb jours */}
      <div className="row mb-3">
        <div className="col-md-6">
          <label>Type durée</label>
          <select
            className="form-select"
            value={form.type_duree}
            onChange={(e) => setForm({ ...form, type_duree: e.target.value })}
          >
            <option value="HALF">1/2 journée</option>
            <option value="FULL">Journée</option>
            <option value="MULTI">Multi-jours</option>
          </select>
        </div>

        <div className="col-md-6">
          <label>Nb jours</label>
          <input
            type="number"
            className="form-control"
            disabled={form.type_duree !== "MULTI"}
            min={2}
            value={form.nb_jours}
            onChange={(e) => setForm({ ...form, nb_jours: e.target.value })}
          />
        </div>
      </div>

      {/* Avec repas */}
      <div className="form-check mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          checked={form.repas_inclus}
          onChange={(e) => setForm({ ...form, repas_inclus: e.target.checked })}
        />
        <label className="form-check-label">Avec repas</label>
      </div>

      {/* Point de départ */}
      <div className="mb-3">
        <label>Point de départ</label>
        <GooglePlacesInput
          value={form.depart_label || ""}
          placeholder="Lieu de départ..."
          onSelect={(place) =>
            setForm({
              ...form,
              depart_label: place.label,
              depart_lat: place.lat,
              depart_lng: place.lng,
              depart_place_id: place.place_id,
            })
          }
          onChangeText={(text) =>
            setForm({
              ...form,
              depart_label: text,
              depart_lat: null,
              depart_lng: null,
              depart_place_id: null,
            })
          }
        />
      </div>

      {/* Étapes */}
      <h4 className="mt-4">Étapes de l’excursion</h4>

      <table className="table table-sm table-striped">
        <thead>
          <tr>
            <th>#</th>
            <th>Lieu (Google Maps)</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {steps.map((s, i) => (
            <tr
              key={i}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(i)}
            >
              <td>☰ {s.ordre}</td>
              <td style={{ minWidth: "280px" }}>
                <GooglePlacesInput
                  value={s.nom || ""}
                  placeholder="Chercher un lieu..."
                  onSelect={(place) =>
                    setSteps((prev) =>
                      prev.map((st, idx) =>
                        idx === i
                          ? {
                              ...st,
                              nom: place.label,
                              adresse: place.address,
                              lat: place.lat,
                              lng: place.lng,
                              place_id: place.place_id,
                            }
                          : st
                      )
                    )
                  }
                  onChangeText={(text) =>
                    setSteps((prev) =>
                      prev.map((st, idx) =>
                        idx === i
                          ? {
                              ...st,
                              nom: text,
                              adresse: text,
                              lat: null,
                              lng: null,
                              place_id: null,
                            }
                          : st
                      )
                    )
                  }
                />
              </td>
              <td className="text-end">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => deleteStep(i)}
                >
                  X
                </button>
              </td>
            </tr>
          ))}

          {/* Ajout d'une nouvelle étape */}
          <tr>
            <td>{newStep.ordre}</td>
            <td style={{ minWidth: "280px" }}>
              <GooglePlacesInput
                value={newStep.nom}
                placeholder="Ajouter une étape..."
                onSelect={(place) =>
                  setNewStep((prev) => ({
                    ...prev,
                    nom: place.label,
                    adresse: place.address,
                    lat: place.lat,
                    lng: place.lng,
                    place_id: place.place_id,
                  }))
                }
                onChangeText={(text) =>
                  setNewStep((prev) => ({
                    ...prev,
                    nom: text,
                    adresse: text,
                    lat: null,
                    lng: null,
                    place_id: null,
                  }))
                }
              />
            </td>
            <td className="text-end">
              <button
                className="btn btn-sm btn-primary"
                type="button"
                onClick={addStep}
              >
                Ajouter
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="text-end">
        <button className="btn btn-success" disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer l’excursion"}
        </button>
      </div>
    </form>
  );
}

export default function ExcursionsPage() {
  return (
    <div className="container">
      <h2 className="mb-3">Créer une excursion</h2>
      <ExcursionFormFull />
    </div>
  );
}
