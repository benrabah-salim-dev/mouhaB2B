// src/components/GestionSMEKS/Zones/ZonePage.jsx
import React, { useEffect, useRef, useState } from "react";
import api from "../../../api";

export default function ZonesPage() {
  const mapRef = useRef(null); // div DOM
  const gmapRef = useRef(null); // instance google.maps.Map
  const drawingRef = useRef(null); // DrawingManager
  const currentShapeRef = useRef(null); // overlay courant

  const [mapsReady, setMapsReady] = useState(false);
  const [shapeInfo, setShapeInfo] = useState(null);
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState([]);

  const [suggestedCities, setSuggestedCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);

  // 1) Attendre que Google Maps soit chargé (script déjà dans index.html)
  useEffect(() => {
    if (window.google && window.google.maps) {
      setMapsReady(true);
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(interval);
          setMapsReady(true);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  // 2) Init map + DrawingManager quand Maps est prêt
  useEffect(() => {
    if (!mapsReady) return;
    if (!window.google || !window.google.maps) {
      console.warn("Google Maps non chargé malgré mapsReady=true");
      return;
    }

    const google = window.google;

    // 👉 vérifier que l'API drawing est bien chargée
    if (!google.maps.drawing) {
      console.warn(
        "google.maps.drawing est indisponible. Vérifie &libraries=drawing dans ton script."
      );
      return;
    }

    // init map une seule fois
    if (!gmapRef.current && mapRef.current) {
      gmapRef.current = new google.maps.Map(mapRef.current, {
        center: { lat: 36.8065, lng: 10.1815 }, // Tunis
        zoom: 11,
        mapTypeId: "roadmap",
      });
    }

    if (!gmapRef.current) return;

    // init DrawingManager une seule fois
    if (!drawingRef.current) {
      drawingRef.current = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
          fillOpacity: 0.15,
          strokeWeight: 2,
          strokeColor: "#ff5722",
          editable: true,
          draggable: false,
        },
      });

      drawingRef.current.setMap(gmapRef.current);

      google.maps.event.addListener(
        drawingRef.current,
        "overlaycomplete",
        (e) => {
          // on supprime l'ancienne forme
          if (currentShapeRef.current) {
            currentShapeRef.current.setMap(null);
          }
          currentShapeRef.current = e.overlay;

          // on arrête le mode dessin (pour ne pas enchaîner plusieurs polygones)
          drawingRef.current.setDrawingMode(null);

          // on stocke la géométrie
          capturePolygon(e.overlay);

          // listeners pour maj live (si on déplace les points)
          const path = e.overlay.getPath();
          google.maps.event.addListener(path, "set_at", () =>
            capturePolygon(e.overlay)
          );
          google.maps.event.addListener(path, "insert_at", () =>
            capturePolygon(e.overlay)
          );
          google.maps.event.addListener(path, "remove_at", () =>
            capturePolygon(e.overlay)
          );
        }
      );
    }
  }, [mapsReady]);

  // 3) Charger les zones existantes
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("zones/");
        setZones(Array.isArray(data) ? data : data.results || []);
      } catch (e) {
        console.warn("Impossible de charger les zones", e);
      }
    })();
  }, []);

  // ------- util : calcul distance approx (en mètres) -------
  function distanceMeters(lat1, lng1, lat2, lng2) {
    // approximation suffisante pour le rayon, pas besoin de précision GPS
    const R = 6371000; // rayon Terre
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ------- util : capturer le polygone dessiné -------
  const capturePolygon = (overlay) => {
    const google = window.google;
    if (!google || !google.maps) return;
    const path = overlay.getPath();
    if (!path || path.getLength() < 3) {
      setShapeInfo(null);
      setSuggestedCities([]);
      return;
    }

    const points = [];
    let minLat = 90,
      maxLat = -90,
      minLng = 180,
      maxLng = -180;

    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i);
      const lat = p.lat();
      const lng = p.lng();
      points.push({ lat, lng });
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // rayon approx = distance du centre au point le plus éloigné
    let radius = 0;
    for (const p of points) {
      const d = distanceMeters(centerLat, centerLng, p.lat, p.lng);
      if (d > radius) radius = d;
    }

    setShapeInfo({
      type: "polygon",
      center_lat: centerLat,
      center_lng: centerLng,
      radius_m: Math.round(radius),
      bounds: {
        north: maxLat,
        south: minLat,
        east: maxLng,
        west: minLng,
      },
      points, // on garde les points si tu veux les stocker plus tard
    });

    setSuggestedCities([]); // reset suggestions à chaque nouvelle géométrie
  };

  // ------- bouton : repasser en mode "dessin à main levée" -------
  const handleRedraw = () => {
    const google = window.google;
    if (
      !drawingRef.current ||
      !google ||
      !google.maps ||
      !google.maps.drawing
    )
      return;

    // supprimer l'ancien polygone si existe
    if (currentShapeRef.current) {
      currentShapeRef.current.setMap(null);
      currentShapeRef.current = null;
    }
    setShapeInfo(null);
    setSuggestedCities([]);

    drawingRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
  };

  // ------- Récupérer les villes via l'API backend -------
  const fetchCitiesInZone = async () => {
    if (!shapeInfo || shapeInfo.type !== "polygon") {
      alert("Dessine d'abord un territoire (polygone) sur la carte.");
      return;
    }

    try {
      setLoadingCities(true);
      const { center_lat, center_lng, radius_m } = shapeInfo;

      const { data } = await api.get("zones/suggest-villes/", {
        params: {
          lat: center_lat,
          lng: center_lng,
          radius: radius_m,
        },
      });

      setSuggestedCities(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la récupération des villes dans le territoire.");
    } finally {
      setLoadingCities(false);
    }
  };

  // ------- submit backend -------
  const handleSave = async (e) => {
    e.preventDefault();
    if (!nom.trim()) {
      alert("Merci de saisir un nom de zone.");
      return;
    }
    if (!shapeInfo) {
      alert("Dessine d'abord un territoire sur la carte.");
      return;
    }

    // 🟢 construire la liste des villes détectées
    const detectedVilles =
      suggestedCities.length > 0
        ? suggestedCities.map((c) => (c.ville || "").toUpperCase()).filter(Boolean)
        : [];

    // ce qui sera stocké dans le champ `ville` de la Zone
    // ex : "TUNIS | LA MARSA | BEN AROUS"
    const villesString =
      detectedVilles.length > 0
        ? detectedVilles.join(" | ")
        : ville.trim() || null; // fallback : ce que tu as tapé à la main

    const payload = {
      nom: nom.trim().toUpperCase(),
      ville: villesString,                    // 🔴 ICI : on envoie toutes les villes
      type: shapeInfo.type,
      center_lat: shapeInfo.center_lat,
      center_lng: shapeInfo.center_lng,
      radius_m: shapeInfo.radius_m,
      north: shapeInfo.bounds?.north ?? null,
      south: shapeInfo.bounds?.south ?? null,
      east: shapeInfo.bounds?.east ?? null,
      west: shapeInfo.bounds?.west ?? null,
    };

    setSaving(true);
    try {
      const { data } = await api.post("zones/", payload);
      setZones((z) => [data, ...z]);
      setNom("");
      setVille("");
      setShapeInfo(null);
      setSuggestedCities([]);
      if (currentShapeRef.current) {
        currentShapeRef.current.setMap(null);
        currentShapeRef.current = null;
      }
      alert("Zone enregistrée avec succès.");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l’enregistrement de la zone.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="m-0">Zonage par carte</h3>
      </div>

      <div className="row g-3">
        {/* Carte */}
        <div className="col-lg-8">
          <div
            ref={mapRef}
            style={{
              width: "100%",
              height: "500px",
              borderRadius: "12px",
              border: "1px solid #e0e0e0",
              background: mapsReady ? "#f8f9fa" : "#ffffff",
            }}
          />
          {!mapsReady && (
            <div className="mt-2 text-danger small">
              Chargement de Google Maps…
            </div>
          )}
          <div className="mt-2 d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={handleRedraw}
            >
              ✏️ Redessiner un territoire
            </button>
          </div>
        </div>

        {/* Formulaire + liste */}
        <div className="col-lg-4">
          <div className="card mb-3">
            <div className="card-body">
              <h5 className="card-title">Créer une zone</h5>
              <form onSubmit={handleSave} className="vstack gap-2">
                <div>
                  <label className="form-label">Nom de la zone</label>
                  <input
                    type="text"
                    className="form-control"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Ex : HAMMAMET/NABEUL"
                  />
                </div>

                <div>
                  <label className="form-label">Ville (optionnel)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    placeholder="Ex : Hammamet (si tu veux garder un champ texte)"
                  />
                </div>

                <div className="small text-muted">
                  Type de zone :{" "}
                  <strong>{shapeInfo ? "Territoire (polygone)" : "—"}</strong>
                  {!shapeInfo && (
                    <div className="text-danger mt-1">
                      Dessine un territoire avec le stylo sur la carte.
                    </div>
                  )}
                  {shapeInfo && (
                    <>
                      <br />
                      Centre approx. :{" "}
                      <strong>
                        {shapeInfo.center_lat.toFixed(4)} /{" "}
                        {shapeInfo.center_lng.toFixed(4)}
                      </strong>
                      <br />
                      Rayon approx. :{" "}
                      <strong>{shapeInfo.radius_m} m</strong>
                    </>
                  )}
                </div>

                {shapeInfo && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={fetchCitiesInZone}
                      disabled={loadingCities}
                    >
                      {loadingCities
                        ? "Recherche des villes…"
                        : "Détecter les villes dans le territoire"}
                    </button>
                  </div>
                )}

                {suggestedCities.length > 0 && (
                  <div className="mt-2 small">
                    <div className="fw-semibold">
                      Villes détectées (présentes en BD) :
                    </div>
                    <ul className="mb-0">
                      {suggestedCities.map((c) => (
                        <li
                          key={c.ville}
                          style={{ cursor: "pointer" }}
                          onClick={() => setVille(c.ville)}
                          title="Cliquer pour remplir le champ ville si besoin"
                        >
                          {c.ville}
                          {c.code_postal ? ` (${c.code_postal})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary mt-3"
                  disabled={saving}
                >
                  {saving ? "Enregistrement..." : "Enregistrer la zone"}
                </button>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h6 className="card-title">Zones existantes</h6>
              {zones.length === 0 && (
                <div className="text-muted small">
                  Aucune zone enregistrée pour l’instant.
                </div>
              )}
              <ul className="list-group list-group-flush">
                {zones.map((z) => (
                  <li key={z.id} className="list-group-item small">
                    <div className="fw-semibold">{z.nom}</div>
                    <div className="text-muted">
                      {z.ville || "Ville inconnue"} — {z.type}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
