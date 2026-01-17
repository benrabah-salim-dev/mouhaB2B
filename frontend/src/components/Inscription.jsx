// src/components/InscriptionAgenceWizard.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import api from "../api";

const initialData = {
  // Étape 1 - Entreprise
  legal_name: "",
  rne: "",
  code_fiscal: "",
  code_categorie: "",
  etab_secondaire: "",
  logo_file: null,

  // 🚀 Pièces jointes
  rne_doc_file: null,       // PDF/image du RNE
  patente_doc_file: null,   // PDF/image de la patente

  // Contact de l’entreprise
  company_country: "",
  company_address: "",
  company_address_place_id: "",
  company_email: "",
  company_phone: "",

    // Ville et code postal
  ville: "",  // Nouveau champ ajouté
  code_postal: "", // Nouveau champ ajouté

  // Étape 2 - Représentant légal
  rep_prenom: "",
  rep_nom: "",
  rep_cin: "",
  rep_date_naissance: "", // gardé dans le state mais plus affiché
  rep_photo_file: null,

  // Contact représentant légal
  rep_email: "",
  rep_phone: "",
  otp_delivery: "", // "email" | "sms" (pour plus tard)

  // Étape 4 - Vérification
  otp_code: "",
};

const steps = [
  { key: "contact",  title: "Informations de contact" },
  { key: "security", title: "Informations de sécurité" },
  { key: "review",   title: "Validation" },
  { key: "verify",   title: "Vérification du code" },
];

// domaines autorisés
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com"];
const isAllowedEmail = (email) => {
  const m = String(email || "").toLowerCase().match(/^[^@]+@([^@]+)$/);
  if (!m) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(m[1]);
};

// 🔐 Types de fichier autorisés pour RNE / patente
const ALLOWED_DOC_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
];

// Champs à NE PAS passer en uppercase
const SKIP_UPPERCASE = new Set([
  "company_email",
  "rep_email",
  "otp_delivery",
  "otp_code",
  "company_address",          // 👈 adresse laissée telle quelle
]);

export default function InscriptionAgenceWizard({ onSubmitted }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const current = steps[stepIndex];

  const canGoPrev = stepIndex > 0;
  const canGoNext = stepIndex < steps.length - 1;

  const handleChange = (field) => (e) => {
    let value;

    if (e?.target?.files) {
      // fichiers (logo, RNE, patente, photo)
      value = e.target.files[0];
    } else {
      value = e.target.value;
      // Uppercase pour tous les champs texte sauf emails & exceptions
      if (typeof value === "string" && !SKIP_UPPERCASE.has(field)) {
        value = value.toUpperCase();
      }
    }

    setData((d) => ({ ...d, [field]: value }));
    setErrors((err) => ({ ...err, [field]: undefined }));
  };

  const handleAddressSelected = (formattedAddress, placeId) => {
    setData((d) => ({
      ...d,
      company_address: formattedAddress,
      company_address_place_id: placeId || "",
    }));
    setErrors((err) => ({ ...err, company_address: undefined }));
  };

  const validateStep = () => {
    const e = {};

    if (current.key === "contact") {
      // Entreprise
      if (!data.legal_name?.trim()) e.legal_name = "Valeur requise";
      if (!data.rne?.trim()) e.rne = "Valeur requise";
      if (!data.code_fiscal?.trim()) e.code_fiscal = "Valeur requise";
      if (!data.code_categorie?.trim()) e.code_categorie = "Valeur requise";
      if (!data.etab_secondaire?.trim()) e.etab_secondaire = "Valeur requise";

      if (data.logo_file) {
        const ok = ["image/png", "image/jpeg"].includes(data.logo_file.type);
        if (!ok) e.logo_file = "Formats acceptés : .png, .jpeg";
      }

      // Docs RNE + patente
      if (data.rne_doc_file) {
        if (!ALLOWED_DOC_MIMES.includes(data.rne_doc_file.type)) {
          e.rne_doc_file = "Formats acceptés : PDF, PNG, JPEG";
        }
      }
      if (data.patente_doc_file) {
        if (!ALLOWED_DOC_MIMES.includes(data.patente_doc_file.type)) {
          e.patente_doc_file = "Formats acceptés : PDF, PNG, JPEG";
        }
      }

      // Contact entreprise
      if (!data.company_country?.trim()) e.company_country = "Valeur requise";

      // ✅ Assoupli : on exige seulement une adresse non vide
      //    place_id (Google) devient optionnel si Maps ne trouve pas la rue
      if (!data.company_address?.trim()) {
        e.company_address = "Adresse requise";
      }

      
    // Validation ville et code postal
    if (!data.ville?.trim()) e.ville = "Ville requise";
    if (!data.code_postal?.trim()) e.code_postal = "Code postal requis";

      if (!data.company_email?.trim()) e.company_email = "Valeur requise";
      else if (!isAllowedEmail(data.company_email))
        e.company_email = `Domaines autorisés : ${ALLOWED_EMAIL_DOMAINS.join(", ")}`;

      if (!data.company_phone?.trim()) e.company_phone = "Valeur requise";
    }

    if (current.key === "security") {
      // Identité représentant
      if (!data.rep_prenom?.trim()) e.rep_prenom = "Valeur requise";
      if (!data.rep_nom?.trim()) e.rep_nom = "Valeur requise";
      if (!data.rep_cin?.trim()) e.rep_cin = "Valeur requise";

      if (data.rep_photo_file) {
        const ok = ["image/png", "image/jpeg"].includes(data.rep_photo_file.type);
        if (!ok) e.rep_photo_file = "Formats acceptés : .png, .jpeg";
      }
      // Contact représentant + canal
      if (!data.rep_email?.trim()) e.rep_email = "Valeur requise";
      else if (!isAllowedEmail(data.rep_email))
        e.rep_email = `Domaines autorisés : ${ALLOWED_EMAIL_DOMAINS.join(", ")}`;
      if (!data.rep_phone?.trim()) e.rep_phone = "Valeur requise";
      if (!data.otp_delivery?.trim()) e.otp_delivery = "Choisissez un mode de réception";
    }

    if (current.key === "verify") {
      if (!data.otp_code?.trim()) e.otp_code = "Code de vérification requis";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (canGoNext) setStepIndex((i) => i + 1);
  };
  const prev = () => canGoPrev && setStepIndex((i) => i - 1);

  // 1) Envoi du code OTP (AUCUNE création en base)
  const handleSendOtp = async () => {
    if (submitting) return;
    setErrors({});
    setSubmitting(true);

    try {
      await api.post("/public/demandes-inscription/send-otp/", {
        rep_email: data.rep_email,
        company_email: data.company_email,
        rep_prenom: data.rep_prenom,
        rep_nom: data.rep_nom,
        legal_name: data.legal_name,
      });

      alert(
        "Un code de vérification vous a été envoyé par e-mail. " +
        "Merci de le saisir à l'étape suivante."
      );
      setStepIndex((i) => i + 1); // étape 'verify'
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail ||
        "Impossible d'envoyer le code de vérification. Merci de réessayer.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 2) Finalisation : vérifie l'OTP et crée la demande (statut 'en_attente')
  const handleFinalSubmit = async () => {
    if (submitting) return;

    if (!data.otp_code?.trim()) {
      setErrors((e) => ({ ...e, otp_code: "Code requis" }));
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const form = new FormData();
      // Étape 1
      form.append("legal_name", data.legal_name);
      form.append("rne", data.rne);
      form.append("code_fiscal", data.code_fiscal);
      form.append("code_categorie", data.code_categorie);
      form.append("etab_secondaire", data.etab_secondaire);
      if (data.logo_file) form.append("logo_file", data.logo_file);

      // Fichiers RNE + patente
      if (data.rne_doc_file) form.append("rne_doc_file", data.rne_doc_file);
      if (data.patente_doc_file) form.append("patente_doc_file", data.patente_doc_file);

      form.append("company_country", data.company_country);
      form.append("company_address", data.company_address);
      form.append("company_email", data.company_email);
      form.append("company_phone", data.company_phone);
      // Étape 2
      form.append("rep_prenom", data.rep_prenom);
      form.append("rep_nom", data.rep_nom);
      form.append("rep_cin", data.rep_cin);
      // on continue d'envoyer rep_date_naissance mais vide (non affiché)
      form.append("rep_date_naissance", data.rep_date_naissance || "");
      if (data.rep_photo_file) form.append("rep_photo_file", data.rep_photo_file);
      form.append("rep_email", data.rep_email);
      form.append("rep_phone", data.rep_phone);
      form.append("otp_delivery", data.otp_delivery);
      
      
      form.append("ville", data.ville);        // Ajoute la ville
      form.append("code_postal", data.code_postal);  // Ajoute le code postal

      // Code OTP
      form.append("otp_code", data.otp_code);

      await api.post("/public/demandes-inscription/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert(
        "Votre demande d'inscription a été enregistrée.\n\n" +
        "Elle sera examinée par un administrateur. " +
        "Vous recevrez vos identifiants par e-mail une fois la demande approuvée."
      );

      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail ||
        "Échec de l'inscription. Merci de réessayer.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container my-4" style={{ maxWidth: 980 }}>
      {/* ====== Stepper ====== */}
      <div className="card shadow-sm border-0 mb-3" style={{ borderRadius: 16 }}>
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <div className="text-muted small">Current Progress</div>
              <h5 className="m-0">
                Étape {stepIndex + 1} / {steps.length}
              </h5>
            </div>
            <ol className="list-unstyled d-flex align-items-center m-0 gap-3 flex-wrap">
              {steps.map((s, i) => {
                const state = i === stepIndex ? "active" : i < stepIndex ? "done" : "todo";
                return (
                  <li key={s.key} className="d-flex align-items-center gap-2">
                    <span
                      className={`badge rounded-pill ${
                        state === "active"
                          ? "bg-primary"
                          : state === "done"
                          ? "bg-success"
                          : "bg-secondary"
                      }`}
                      style={{
                        width: 28,
                        height: 28,
                        display: "inline-grid",
                        placeItems: "center",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className={state === "active" ? "fw-semibold" : "text-muted"}>
                      {s.title}
                    </span>
                    {i < steps.length - 1 && <span className="text-muted">›</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      {/* ====== Body ====== */}
      <div className="card shadow border-0" style={{ borderRadius: 16 }}>
        <div className="card-body p-4">
          {current.key === "contact" && (
            <>
              <StepEntreprise data={data} errors={errors} onChange={handleChange} />
              <hr className="my-4" />
              <StepEntrepriseContact
                data={data}
                errors={errors}
                onChange={handleChange}
                onAddressSelected={handleAddressSelected}
              />
            </>
          )}

          {current.key === "security" && (
            <>
              <InfoSecurityIntro />
              <StepRepresentant data={data} errors={errors} onChange={handleChange} />
              <hr className="my-4" />
              <StepRepresentantContact data={data} errors={errors} onChange={handleChange} />
            </>
          )}

          {current.key === "review" && <StepValidation data={data} />}

          {current.key === "verify" && (
            <StepVerification
              data={data}
              errors={errors}
              onChange={handleChange}
            />
          )}

          {/* Actions */}
          <div className="d-flex justify-content-between pt-3">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={prev}
              disabled={!canGoPrev}
            >
              ← PRÉCÉDENT
            </button>

            {current.key === "contact" || current.key === "security" ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                SUIVANT →
              </button>
            ) : current.key === "review" ? (
              <button
                type="button"
                className="btn btn-success"
                onClick={handleSendOtp}
                disabled={submitting}
              >
                {submitting ? "ENVOI DU CODE…" : "ENVOYER LE CODE DE VÉRIFICATION"}
              </button>
            ) : (
              // current.key === "verify"
              <button
                type="button"
                className="btn btn-success"
                onClick={handleFinalSubmit}
                disabled={submitting}
              >
                {submitting ? "VÉRIFICATION…" : "VÉRIFIER ET FINALISER L'INSCRIPTION"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Étape 1 — Entreprise ================= */
function StepEntreprise({ data, errors, onChange }) {
  return (
    <>
      <h5 className="mb-3">Coordonnées de l'entreprise</h5>

      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label form-required">
            Nom légal de l'entreprise (Raison sociale)
          </label>
          <input
            type="text"
            className={`form-control ${errors.legal_name ? "is-invalid" : ""}`}
            value={data.legal_name}
            onChange={onChange("legal_name")}
            required
          />
          {errors.legal_name && <div className="invalid-feedback">{errors.legal_name}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">N° RNE</label>
          <input
            type="text"
            className={`form-control ${errors.rne ? "is-invalid" : ""}`}
            value={data.rne}
            onChange={onChange("rne")}
            required
          />
          {errors.rne && <div className="invalid-feedback">{errors.rne}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label form-required">Code fiscal</label>
          <input
            type="text"
            className={`form-control ${errors.code_fiscal ? "is-invalid" : ""}`}
            value={data.code_fiscal}
            onChange={onChange("code_fiscal")}
            required
          />
          {errors.code_fiscal && <div className="invalid-feedback">{errors.code_fiscal}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label form-required">Code catégorie</label>
          <input
            type="text"
            className={`form-control ${errors.code_categorie ? "is-invalid" : ""}`}
            value={data.code_categorie}
            onChange={onChange("code_categorie")}
            required
          />
          {errors.code_categorie && (
            <div className="invalid-feedback">{errors.code_categorie}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label form-required">N° Établissement Secondaire</label>
          <input
            type="text"
            className={`form-control ${errors.etab_secondaire ? "is-invalid" : ""}`}
            value={data.etab_secondaire}
            onChange={onChange("etab_secondaire")}
            required
          />
          {errors.etab_secondaire && (
            <div className="invalid-feedback">{errors.etab_secondaire}</div>
          )}
        </div>

        <div className="col-12">
          <label className="form-label form-required">Logo de l'entreprise (PNG/JPEG)</label>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className={`form-control ${errors.logo_file ? "is-invalid" : ""}`}
            onChange={onChange("logo_file")}
          />
          {errors.logo_file && <div className="invalid-feedback">{errors.logo_file}</div>}
          {data.logo_file && (
            <div className="form-text">Fichier sélectionné : {data.logo_file.name}</div>
          )}
        </div>

        {/* Pièces jointes RNE + Patente */}
        <div className="col-md-6">
          <label className="form-label">
            Document RNE (PDF / image)
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={`form-control ${errors.rne_doc_file ? "is-invalid" : ""}`}
            onChange={onChange("rne_doc_file")}
          />
          {errors.rne_doc_file && (
            <div className="invalid-feedback">{errors.rne_doc_file}</div>
          )}
          {data.rne_doc_file && (
            <div className="form-text">
              Fichier sélectionné : {data.rne_doc_file.name}
            </div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Patente / Registre de commerce (PDF / image)
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={`form-control ${errors.patente_doc_file ? "is-invalid" : ""}`}
            onChange={onChange("patente_doc_file")}
          />
          {errors.patente_doc_file && (
            <div className="invalid-feedback">{errors.patente_doc_file}</div>
          )}
          {data.patente_doc_file && (
            <div className="form-text">
              Fichier sélectionné : {data.patente_doc_file.name}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StepEntrepriseContact({ data, errors, onChange, onAddressSelected }) {
  return (
    <>
      <h5 className="mb-3">Contact de l'entreprise</h5>
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label form-required">Pays</label>
          <input
            type="text"
            className={`form-control ${errors.company_country ? "is-invalid" : ""}`}
            value={data.company_country}
            onChange={onChange("company_country")}
            required
          />
          {errors.company_country && (
            <div className="invalid-feedback">{errors.company_country}</div>
          )}
        </div>

        <div className="col-md-8">
          <label className="form-label form-required">Adresse</label>
          <AddressAutocomplete
            value={data.company_address}
            error={errors.company_address}
            onAddressSelected={onAddressSelected}
          />
        </div>
           {/* Nouveau champ pour la Ville */}
        <div className="col-md-6">
          <label className="form-label form-required">Ville</label>
          <input
            type="text"
            className={`form-control ${errors.ville ? "is-invalid" : ""}`}
            value={data.ville}
            onChange={onChange("ville")}
            required
          />
          {errors.ville && <div className="invalid-feedback">{errors.ville}</div>}
        </div>

        {/* Nouveau champ pour le Code Postal */}
        <div className="col-md-6">
          <label className="form-label form-required">Code postal</label>
          <input
            type="text"
            className={`form-control ${errors.code_postal ? "is-invalid" : ""}`}
            value={data.code_postal}
            onChange={onChange("code_postal")}
            required
          />
          {errors.code_postal && <div className="invalid-feedback">{errors.code_postal}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">
            E-mail <small className="text-muted"></small>
          </label>
          <input
            type="email"
            className={`form-control ${errors.company_email ? "is-invalid" : ""}`}
            value={data.company_email}
            onChange={onChange("company_email")}
            required
          />
          {errors.company_email && (
            <div className="invalid-feedback">{errors.company_email}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">Téléphone</label>
          <input
            type="tel"
            className={`form-control ${errors.company_phone ? "is-invalid" : ""}`}
            value={data.company_phone}
            onChange={onChange("company_phone")}
            required
          />
          {errors.company_phone && (
            <div className="invalid-feedback">{errors.company_phone}</div>
          )}
        </div>
      </div>
    </>
  );
}

/* ====== Composant AddressAutocomplete (Google Places) ====== */
function AddressAutocomplete({ value, error, onAddressSelected }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      console.warn("Google Maps Places API non chargé");
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["geocode"],
      // componentRestrictions: { country: "tn" }, // 👈 si tu veux filtrer sur un pays
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place || !place.formatted_address || !place.place_id) {
        return;
      }
      onAddressSelected(place.formatted_address, place.place_id);
    });

    return () => {
      // pas de destroy officiel, on laisse le GC gérer
    };
  }, [onAddressSelected]);

  const handleManualChange = (e) => {
    const newVal = e.target.value;
    // On met à jour l'adresse, mais sans place_id => la validation n'impose plus place_id
    onAddressSelected(newVal, "");
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className={`form-control ${error ? "is-invalid" : ""}`}
        placeholder="Saisissez l'adresse "
        value={value}
        onChange={handleManualChange}
        autoComplete="off"
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </>
  );
}

/* ================= Étape 2 — Représentant légal ================= */
function InfoSecurityIntro() {
  return (
    <div className="alert alert-info mb-4">
      Afin de protéger votre compte, SMEKS veut s'assurer que c'est bien vous qui essayez
      de vous inscrire. Un code de vérification vous sera envoyé.
    </div>
  );
}

function StepRepresentant({ data, errors, onChange }) {
  return (
    <>
      <h5 className="mb-3">Coordonnées du représentant légal</h5>

      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label form-required">Prénom du représentant autorisé</label>
          <input
            type="text"
            className={`form-control ${errors.rep_prenom ? "is-invalid" : ""}`}
            value={data.rep_prenom}
            onChange={onChange("rep_prenom")}
            required
          />
          {errors.rep_prenom && <div className="invalid-feedback">{errors.rep_prenom}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">Nom du représentant autorisé</label>
          <input
            type="text"
            className={`form-control ${errors.rep_nom ? "is-invalid" : ""}`}
            value={data.rep_nom}
            onChange={onChange("rep_nom")}
            required
          />
          {errors.rep_nom && <div className="invalid-feedback">{errors.rep_nom}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">Carte nationale d'identité (CIN)</label>
          <input
            type="text"
            className={`form-control ${errors.rep_cin ? "is-invalid" : ""}`}
            value={data.rep_cin}
            onChange={onChange("rep_cin")}
            required
          />
          {errors.rep_cin && <div className="invalid-feedback">{errors.rep_cin}</div>}
        </div>

        {/* Date de naissance retirée de l'UI */}
        <div className="col-12">
          <label className="form-label">Photo de la personne (PNG/JPEG)</label>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className={`form-control ${errors.rep_photo_file ? "is-invalid" : ""}`}
            onChange={onChange("rep_photo_file")}
          />
          {errors.rep_photo_file && (
            <div className="invalid-feedback">{errors.rep_photo_file}</div>
          )}
          {data.rep_photo_file && (
            <div className="form-text">Fichier sélectionné : {data.rep_photo_file.name}</div>
          )}
        </div>
      </div>
    </>
  );
}

function StepRepresentantContact({ data, errors, onChange }) {
  return (
    <>
      <h5 className="mb-3">Contact du représentant légal</h5>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label form-required">
            E-mail <small className="text-muted">(gmail/outlook/yahoo)</small>
          </label>
          <input
            type="email"
            className={`form-control ${errors.rep_email ? "is-invalid" : ""}`}
            value={data.rep_email}
            onChange={onChange("rep_email")}
            required
          />
          {errors.rep_email && <div className="invalid-feedback">{errors.rep_email}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label form-required">Cellulaire</label>
          <input
            type="tel"
            className={`form-control ${errors.rep_phone ? "is-invalid" : ""}`}
            value={data.rep_phone}
            onChange={onChange("rep_phone")}
            required
          />
          {errors.rep_phone && <div className="invalid-feedback">{errors.rep_phone}</div>}
        </div>

        <div className="col-12">
          <label className="form-label form-required">
            Comment voulez-vous recevoir le code de vérification ?
          </label>
          <div className={`d-flex gap-3 ${errors.otp_delivery ? "is-invalid" : ""}`}>
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="otp_delivery"
                id="otp_email"
                value="email"
                checked={data.otp_delivery === "email"}
                onChange={onChange("otp_delivery")}
              />
              <label htmlFor="otp_email" className="form-check-label">
                Envoyer le code par e-mail
              </label>
            </div>
            {/* Option future : SMS */}
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="otp_delivery"
                id="otp_sms"
                value="sms"
                checked={data.otp_delivery === "sms"}
                onChange={onChange("otp_delivery")}
                disabled
              />
              <label htmlFor="otp_sms" className="form-check-label text-muted">
                Envoyer le code par SMS (bientôt disponible)
              </label>
            </div>
          </div>
          {errors.otp_delivery && (
            <div className="text-danger small mt-1">{errors.otp_delivery}</div>
          )}
        </div>
      </div>
    </>
  );
}

/* ================= Étape 3 — Validation ================= */
function StepValidation({ data }) {
  const rows = useMemo(
    () => [
      // Entreprise
      ["Raison sociale", data.legal_name || "—"],
      ["N° RNE", data.rne || "—"],
      ["Code fiscal", data.code_fiscal || "—"],
      ["Code catégorie", data.code_categorie || "—"],
      ["N° Établissement secondaire", data.etab_secondaire || "—"],
      ["Logo", data.logo_file?.name || "—"],
      // Docs joints
      ["Document RNE", data.rne_doc_file?.name || "—"],
      ["Patente / RC", data.patente_doc_file?.name || "—"],
      // Contact entreprise
      ["Pays", data.company_country || "—"],
      ["Adresse", data.company_address || "—"],
      ["E-mail (entreprise)", data.company_email || "—"],
      ["Téléphone (entreprise)", data.company_phone || "—"],
      // Représentant
      ["Prénom représentant", data.rep_prenom || "—"],
      ["Nom représentant", data.rep_nom || "—"],
      ["CIN", data.rep_cin || "—"],
      // Date de naissance retirée du récap
      ["Photo représent.", data.rep_photo_file?.name || "—"],
      // Contact représentant
      ["E-mail (représentant)", data.rep_email || "—"],
      ["Cellulaire (représentant)", data.rep_phone || "—"],
      [
        "Réception du code",
        data.otp_delivery === "sms"
          ? "Texto"
          : data.otp_delivery === "email"
          ? "E-mail"
          : "—",
      ],
    ],
    [data]
  );

  return (
    <>
      <h5 className="mb-3">Validation des informations</h5>
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th className="text-muted fw-normal" style={{ width: 320 }}>
                  {k}
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert alert-secondary d-flex align-items-center gap-2">
        <input id="agree" type="checkbox" className="form-check-input me-2" required />
        <label htmlFor="agree" className="m-0">
          Je certifie l'exactitude des informations fournies et j’accepte le traitement de
          mes données pour la gestion de mon inscription.
        </label>
      </div>
    </>
  );
}

/* ================= Étape 4 — Vérification du code ================= */
function StepVerification({ data, errors, onChange }) {
  const target = data.rep_email || data.company_email || "votre e-mail";

  return (
    <>
      <h5 className="mb-2">Vérification de votre inscription</h5>
      <p className="text-muted mb-3">
        Un code de vérification à 6 chiffres vous a été envoyé à :{" "}
        <strong>{target}</strong>.
        <br />
        Merci de le saisir ci-dessous pour finaliser votre inscription.
      </p>

      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label form-required">Code de vérification</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className={`form-control ${errors.otp_code ? "is-invalid" : ""}`}
            value={data.otp_code}
            onChange={onChange("otp_code")}
            placeholder="••••••"
          />
          {errors.otp_code && <div className="invalid-feedback">{errors.otp_code}</div>}
        </div>
      </div>
    </>
  );
}
