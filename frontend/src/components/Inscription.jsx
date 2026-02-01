// src/components/InscriptionAgenceWizard.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import api from "../api/client";
import {
  Building2,
  UserCheck,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Upload,
  Mail,
  Phone,
  MapPin,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

/* ===================== CONFIG ===================== */

const initialData = {
  // Étape 1 - Entreprise
  legal_name: "",
  rne: "",
  code_fiscal: "",
  code_categorie: "",
  etab_secondaire: "",
  logo_file: null,

  // Pièces jointes
  rne_doc_file: null,
  patente_doc_file: null,

  // Contact entreprise
  company_country: "",
  company_address: "",
  company_address_place_id: "",
  company_email: "",
  company_phone: "",

  ville: "",
  code_postal: "",

  // Étape 2 - Représentant
  rep_prenom: "",
  rep_nom: "",
  rep_cin: "",
  rep_date_naissance: "", // gardé mais non affiché
  rep_photo_file: null,

  // Contact représentant
  rep_email: "",
  rep_phone: "",
  otp_delivery: "email",

  // OTP
  otp_code: "",
};

const steps = [
  { key: "contact", title: "Entreprise", icon: <Building2 size={18} /> },
  { key: "security", title: "Représentant", icon: <UserCheck size={18} /> },
  { key: "review", title: "Récapitulatif", icon: <FileText size={18} /> },
  { key: "verify", title: "Vérification", icon: <ShieldCheck size={18} /> },
];

// ✅ Validation email (B2B-friendly : aucun blocage de domaine)
const isValidEmail = (email) => {
  const v = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

// ✅ Plus de whitelist : on accepte tous les domaines valides
const isAllowedEmail = (email) => isValidEmail(email);

const ALLOWED_DOC_MIMES = ["application/pdf", "image/png", "image/jpeg"];

const SKIP_UPPERCASE = new Set([
  "company_email",
  "rep_email",
  "otp_delivery",
  "otp_code",
  "company_address",
]);

/* ===================== UI HELPERS ===================== */

function FieldError({ error }) {
  if (!error) return null;
  return <div className="invalid-feedback d-block">{error}</div>;
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h5 className="fw-bold mb-1">{title}</h5>
      {subtitle ? <div className="text-muted small">{subtitle}</div> : null}
    </div>
  );
}

function FilePicker({ label, hint, accept, value, onChange, error }) {
  return (
    <div>
      <label className="form-label fw-semibold">{label}</label>
      {hint ? <div className="text-muted small mb-1">{hint}</div> : null}
      <div
        className={`border rounded-3 p-2 d-flex align-items-center gap-2 ${
          error ? "border-danger" : ""
        }`}
        style={{ background: "#fafafa" }}
      >
        <Upload size={16} className="text-muted" />
        <div className="small text-truncate flex-grow-1">
          {value?.name ? value.name : <span className="text-muted">Aucun fichier sélectionné</span>}
        </div>
        <label className="btn btn-sm btn-outline-primary mb-0">
          Choisir
          <input type="file" className="d-none" accept={accept} onChange={onChange} />
        </label>
      </div>
      <FieldError error={error} />
    </div>
  );
}

function ProgressStepper({ stepIndex }) {
  const pct = (stepIndex / (steps.length - 1)) * 100;

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <div className="text-muted small">Inscription agence</div>
          <div className="fw-bold">
            Étape {stepIndex + 1} / {steps.length} — {steps[stepIndex].title}
          </div>
        </div>
        <div className="text-muted small">SMEKS</div>
      </div>

      <div className="progress" style={{ height: 6 }}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>

      <div className="d-flex justify-content-between mt-3">
        {steps.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <div key={s.key} className="text-center" style={{ width: `${100 / steps.length}%` }}>
              <div
                className={`mx-auto rounded-circle d-flex align-items-center justify-content-center ${
                  done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-light text-muted"
                }`}
                style={{ width: 38, height: 38 }}
              >
                {done ? <CheckCircle2 size={18} /> : s.icon}
              </div>
              <div className={`small mt-1 ${active ? "fw-semibold" : "text-muted"}`}>{s.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== MAIN ===================== */

export default function InscriptionAgenceWizard({ onSubmitted }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const current = steps[stepIndex];
  const canGoPrev = stepIndex > 0;
  const canGoNext = stepIndex < steps.length - 1;

  useEffect(() => window.scrollTo(0, 0), [stepIndex]);

  const handleChange = (field) => (e) => {
    let value;
    if (e?.target?.files) value = e.target.files[0];
    else {
      value = e.target.value;
      if (typeof value === "string" && !SKIP_UPPERCASE.has(field)) value = value.toUpperCase();
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

  const applyBackendErrors = (payload) => {
    // DRF renvoie souvent { field: ["msg"] } ou { detail: "..." }
    if (!payload) return;
    if (payload.detail) {
      setErrors((e) => ({ ...e, _global: payload.detail }));
      return;
    }
    const mapped = {};
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      mapped[k] = Array.isArray(v) ? v[0] : String(v);
    });
    setErrors((e) => ({ ...e, ...mapped }));
  };

  const validateStep = () => {
    const e = {};

    if (current.key === "contact") {
      if (!data.legal_name?.trim()) e.legal_name = "Valeur requise";
      if (!data.rne?.trim()) e.rne = "Valeur requise";
      if (!data.code_fiscal?.trim()) e.code_fiscal = "Valeur requise";
      if (!data.code_categorie?.trim()) e.code_categorie = "Valeur requise";
      if (!data.etab_secondaire?.trim()) e.etab_secondaire = "Valeur requise";

      if (data.logo_file) {
        const ok = ["image/png", "image/jpeg"].includes(data.logo_file.type);
        if (!ok) e.logo_file = "Formats acceptés : PNG, JPEG";
      }

      if (data.rne_doc_file && !ALLOWED_DOC_MIMES.includes(data.rne_doc_file.type)) {
        e.rne_doc_file = "Formats acceptés : PDF, PNG, JPEG";
      }
      if (data.patente_doc_file && !ALLOWED_DOC_MIMES.includes(data.patente_doc_file.type)) {
        e.patente_doc_file = "Formats acceptés : PDF, PNG, JPEG";
      }

      if (!data.company_country?.trim()) e.company_country = "Valeur requise";
      if (!data.company_address?.trim()) e.company_address = "Adresse requise";
      if (!data.ville?.trim()) e.ville = "Ville requise";
      if (!data.code_postal?.trim()) e.code_postal = "Code postal requis";

      if (!data.company_email?.trim()) e.company_email = "Valeur requise";
      else if (!isAllowedEmail(data.company_email)) e.company_email = "Email invalide";

      if (!data.company_phone?.trim()) e.company_phone = "Valeur requise";
    }

    if (current.key === "security") {
      if (!data.rep_prenom?.trim()) e.rep_prenom = "Valeur requise";
      if (!data.rep_nom?.trim()) e.rep_nom = "Valeur requise";
      if (!data.rep_cin?.trim()) e.rep_cin = "Valeur requise";

      if (data.rep_photo_file) {
        const ok = ["image/png", "image/jpeg"].includes(data.rep_photo_file.type);
        if (!ok) e.rep_photo_file = "Formats acceptés : PNG, JPEG";
      }

      if (!data.rep_email?.trim()) e.rep_email = "Valeur requise";
      else if (!isAllowedEmail(data.rep_email)) e.rep_email = "Email invalide";

      if (!data.rep_phone?.trim()) e.rep_phone = "Valeur requise";
      if (!data.otp_delivery?.trim()) e.otp_delivery = "Choisissez un mode";
    }

    if (current.key === "verify") {
      if (!data.otp_code?.trim()) e.otp_code = "Code requis";
      else if (!/^\d{6}$/.test(data.otp_code.trim())) e.otp_code = "Le code doit contenir 6 chiffres";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (canGoNext) setStepIndex((i) => i + 1);
  };
  const prev = () => canGoPrev && setStepIndex((i) => i - 1);

  const handleSendOtp = async () => {
    if (submitting) return;
    if (!validateStep()) return;

    setSubmitting(true);
    setErrors({});

    try {
      await api.post("public/demandes-inscription/send-otp/", {
      rep_email: data.rep_email,
      company_email: data.company_email,
      rep_prenom: data.rep_prenom,
      rep_nom: data.rep_nom,
      legal_name: data.legal_name,
    });


      setStepIndex(3);
    } catch (err) {
      applyBackendErrors(err?.response?.data);
      if (!err?.response?.data) alert("Impossible d'envoyer le code. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    if (!validateStep()) return;

    setSubmitting(true);
    setErrors({});

    try {
      const form = new FormData();

      form.append("legal_name", data.legal_name);
      form.append("rne", data.rne);
      form.append("code_fiscal", data.code_fiscal);
      form.append("code_categorie", data.code_categorie);
      form.append("etab_secondaire", data.etab_secondaire);

      if (data.logo_file) form.append("logo_file", data.logo_file);
      if (data.rne_doc_file) form.append("rne_doc_file", data.rne_doc_file);
      if (data.patente_doc_file) form.append("patente_doc_file", data.patente_doc_file);

      form.append("company_country", data.company_country);
      form.append("company_address", data.company_address);
      form.append("company_email", data.company_email);
      form.append("company_phone", data.company_phone);
      form.append("ville", data.ville);
      form.append("code_postal", data.code_postal);

      form.append("rep_prenom", data.rep_prenom);
      form.append("rep_nom", data.rep_nom);
      form.append("rep_cin", data.rep_cin);
      form.append("rep_date_naissance", data.rep_date_naissance || "");

      if (data.rep_photo_file) form.append("rep_photo_file", data.rep_photo_file);

      form.append("rep_email", data.rep_email);
      form.append("rep_phone", data.rep_phone);
      form.append("otp_delivery", data.otp_delivery);

      form.append("otp_code", data.otp_code);

      await api.post("public/demandes-inscription/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });


      if (onSubmitted) onSubmitted();
      window.location.href = "/login?success=true";
    } catch (err) {
      applyBackendErrors(err?.response?.data);
      if (!err?.response?.data) alert("Erreur serveur. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const recapRows = useMemo(() => {
    const rows = [
      ["Raison sociale", data.legal_name || "—"],
      ["RNE", data.rne || "—"],
      ["Code fiscal", data.code_fiscal || "—"],
      ["Code catégorie", data.code_categorie || "—"],
      ["Établissement secondaire", data.etab_secondaire || "—"],
      ["Pays", data.company_country || "—"],
      ["Adresse", data.company_address || "—"],
      ["Ville", data.ville || "—"],
      ["Code postal", data.code_postal || "—"],
      ["Email entreprise", data.company_email || "—"],
      ["Téléphone entreprise", data.company_phone || "—"],
      ["Prénom représentant", data.rep_prenom || "—"],
      ["Nom représentant", data.rep_nom || "—"],
      ["CIN", data.rep_cin || "—"],
      ["Email représentant", data.rep_email || "—"],
      ["Téléphone représentant", data.rep_phone || "—"],
      ["Réception OTP", data.otp_delivery === "email" ? "E-mail" : "SMS"],
      ["Logo", data.logo_file?.name || "—"],
      ["Doc RNE", data.rne_doc_file?.name || "—"],
      ["Patente/RC", data.patente_doc_file?.name || "—"],
      ["Photo représentant", data.rep_photo_file?.name || "—"],
    ];
    return rows;
  }, [data]);

  return (
    <div className="container my-4" style={{ maxWidth: 980 }}>
      <ProgressStepper stepIndex={stepIndex} />

      <div className="card border-0 shadow-sm" style={{ borderRadius: 16 }}>
        <div className="card-body p-4 p-md-5">
          {errors._global ? <div className="alert alert-danger mb-4">{errors._global}</div> : null}

          {current.key === "contact" && (
            <>
              <SectionTitle
                title="Informations entreprise"
                subtitle="Renseignez les informations légales et les coordonnées de l’agence."
              />
              <StepEntreprise data={data} errors={errors} onChange={handleChange} />
              <hr className="my-4" />
              <SectionTitle
                title="Contact entreprise"
                subtitle="Adresse et coordonnées de contact (email + téléphone)."
              />
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
              <div className="alert alert-info">
                <strong>Sécurité</strong> — Un code OTP sera envoyé pour valider l’inscription.
              </div>
              <SectionTitle title="Représentant légal" subtitle="Informations d’identité et documents éventuels." />
              <StepRepresentant data={data} errors={errors} onChange={handleChange} />
              <hr className="my-4" />
              <SectionTitle title="Contact du représentant" subtitle="Cet email recevra le code OTP." />
              <StepRepresentantContact data={data} errors={errors} onChange={handleChange} />
            </>
          )}

          {current.key === "review" && (
            <>
              <SectionTitle
                title="Vérifiez vos informations"
                subtitle="Avant d’envoyer le code, vérifiez que tout est correct."
              />
              <StepReview rows={recapRows} />
            </>
          )}

          {current.key === "verify" && (
            <>
              <SectionTitle
                title="Saisissez le code OTP"
                subtitle={`Un code à 6 chiffres a été envoyé à ${data.rep_email || data.company_email}.`}
              />
              <StepVerify data={data} errors={errors} onChange={handleChange} />
            </>
          )}

          {/* ACTIONS */}
          <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={prev}
              disabled={!canGoPrev || submitting}
            >
              <ArrowLeft size={16} className="me-1" />
              Précédent
            </button>

            {current.key === "contact" || current.key === "security" ? (
              <button type="button" className="btn btn-primary" onClick={next} disabled={submitting}>
                Suivant
                <ArrowRight size={16} className="ms-1" />
              </button>
            ) : current.key === "review" ? (
              <button type="button" className="btn btn-success" onClick={handleSendOtp} disabled={submitting}>
                {submitting ? <Loader2 className="me-2 animate-spin" size={16} /> : null}
                Envoyer le code
              </button>
            ) : (
              <button type="button" className="btn btn-success" onClick={handleFinalSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="me-2 animate-spin" size={16} /> : null}
                Vérifier & finaliser
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== STEPS ===================== */

function StepEntreprise({ data, errors, onChange }) {
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <label className="form-label fw-semibold">Raison sociale</label>
        <input
          type="text"
          className={`form-control ${errors.legal_name ? "is-invalid" : ""}`}
          value={data.legal_name}
          onChange={onChange("legal_name")}
          placeholder="Nom de l'agence"
        />
        <FieldError error={errors.legal_name} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">RNE</label>
        <input
          type="text"
          className={`form-control ${errors.rne ? "is-invalid" : ""}`}
          value={data.rne}
          onChange={onChange("rne")}
          placeholder=""
        />
        <FieldError error={errors.rne} />
      </div>

      <div className="col-md-4">
        <label className="form-label fw-semibold">Code fiscal</label>
        <input
          type="text"
          className={`form-control ${errors.code_fiscal ? "is-invalid" : ""}`}
          value={data.code_fiscal}
          onChange={onChange("code_fiscal")}
          placeholder=""
        />
        <FieldError error={errors.code_fiscal} />
      </div>

      <div className="col-md-4">
        <label className="form-label fw-semibold">Code catégorie</label>
        <input
          type="text"
          className={`form-control ${errors.code_categorie ? "is-invalid" : ""}`}
          value={data.code_categorie}
          onChange={onChange("code_categorie")}
          placeholder=""
        />
        <FieldError error={errors.code_categorie} />
      </div>

      <div className="col-md-4">
        <label className="form-label fw-semibold">Établissement secondaire</label>
        <input
          type="text"
          className={`form-control ${errors.etab_secondaire ? "is-invalid" : ""}`}
          value={data.etab_secondaire}
          onChange={onChange("etab_secondaire")}
          placeholder=""
        />
        <FieldError error={errors.etab_secondaire} />
      </div>

      <div className="col-12">
        <FilePicker
          label="Logo (PNG/JPEG)"
          required
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          value={data.logo_file}
          onChange={onChange("logo_file")}
          error={errors.logo_file}
        />
      </div>

      <div className="col-md-6">
        <FilePicker
          label="Document RNE (PDF/PNG/JPEG)"
          required
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          value={data.rne_doc_file}
          onChange={onChange("rne_doc_file")}
          error={errors.rne_doc_file}
        />
      </div>

      <div className="col-md-6">
        <FilePicker
          label="Patente / Registre (PDF/PNG/JPEG)"
          required
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          value={data.patente_doc_file}
          onChange={onChange("patente_doc_file")}
          error={errors.patente_doc_file}
        />
      </div>
    </div>
  );
}

function StepEntrepriseContact({ data, errors, onChange, onAddressSelected }) {
  return (
    <div className="row g-3">
      <div className="col-md-4">
        <label className="form-label fw-semibold">Pays</label>
        <input
          type="text"
          className={`form-control ${errors.company_country ? "is-invalid" : ""}`}
          value={data.company_country}
          onChange={onChange("company_country")}
          placeholder=""
        />
        <FieldError error={errors.company_country} />
      </div>

      <div className="col-md-8">
        <label className="form-label fw-semibold">Adresse</label>
        <AddressAutocomplete
          value={data.company_address}
          error={errors.company_address}
          onAddressSelected={onAddressSelected}
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Ville</label>
        <div className="input-group">
          <span className="input-group-text">
            <MapPin size={16} />
          </span>
          <input
            type="text"
            className={`form-control ${errors.ville ? "is-invalid" : ""}`}
            value={data.ville}
            onChange={onChange("ville")}
          />
        </div>
        <FieldError error={errors.ville} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Code postal</label>
        <input
          type="text"
          className={`form-control ${errors.code_postal ? "is-invalid" : ""}`}
          value={data.code_postal}
          onChange={onChange("code_postal")}
        />
        <FieldError error={errors.code_postal} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Email entreprise</label>
        <div className="input-group">
          <span className="input-group-text">
            <Mail size={16} />
          </span>
          <input
            type="email"
            className={`form-control ${errors.company_email ? "is-invalid" : ""}`}
            value={data.company_email}
            onChange={onChange("company_email")}
            placeholder="contact@entreprise.com"
          />
        </div>
        <FieldError error={errors.company_email} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Téléphone entreprise</label>
        <div className="input-group">
          <span className="input-group-text">
            <Phone size={16} />
          </span>
          <input
            type="tel"
            className={`form-control ${errors.company_phone ? "is-invalid" : ""}`}
            value={data.company_phone}
            onChange={onChange("company_phone")}
            placeholder="Ex : +216 20 000 000"
          />
        </div>
        <FieldError error={errors.company_phone} />
      </div>
    </div>
  );
}

function AddressAutocomplete({ value, error, onAddressSelected }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!window.google || !window.google.maps || !window.google.maps.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["geocode"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place || !place.formatted_address) return;
      onAddressSelected(place.formatted_address, place.place_id || "");
    });
  }, [onAddressSelected]);

  const handleManualChange = (e) => onAddressSelected(e.target.value, "");

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className={`form-control ${error ? "is-invalid" : ""}`}
        placeholder="Ex : 12 Rue Habib Bourguiba, Tunis"
        value={value}
        onChange={handleManualChange}
        autoComplete="off"
      />
      <FieldError error={error} />
    </>
  );
}

function StepRepresentant({ data, errors, onChange }) {
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <label className="form-label fw-semibold">Prénom</label>
        <input
          type="text"
          className={`form-control ${errors.rep_prenom ? "is-invalid" : ""}`}
          value={data.rep_prenom}
          onChange={onChange("rep_prenom")}
        />
        <FieldError error={errors.rep_prenom} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Nom</label>
        <input
          type="text"
          className={`form-control ${errors.rep_nom ? "is-invalid" : ""}`}
          value={data.rep_nom}
          onChange={onChange("rep_nom")}
        />
        <FieldError error={errors.rep_nom} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">CIN</label>
        <input
          type="text"
          className={`form-control ${errors.rep_cin ? "is-invalid" : ""}`}
          value={data.rep_cin}
          onChange={onChange("rep_cin")}
        />
        <FieldError error={errors.rep_cin} />
      </div>

      <div className="col-md-6">
        <FilePicker
          label="Photo (PNG/JPEG)"
          hint="Optionnel"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          value={data.rep_photo_file}
          onChange={onChange("rep_photo_file")}
          error={errors.rep_photo_file}
        />
      </div>
    </div>
  );
}

function StepRepresentantContact({ data, errors, onChange }) {
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <label className="form-label fw-semibold">Email (réception OTP)</label>
        <div className="input-group">
          <span className="input-group-text">
            <Mail size={16} />
          </span>
          <input
            type="email"
            className={`form-control ${errors.rep_email ? "is-invalid" : ""}`}
            value={data.rep_email}
            onChange={onChange("rep_email")}
          />
        </div>
        <FieldError error={errors.rep_email} />
      </div>

      <div className="col-md-6">
        <label className="form-label fw-semibold">Téléphone</label>
        <div className="input-group">
          <span className="input-group-text">
            <Phone size={16} />
          </span>
          <input
            type="tel"
            className={`form-control ${errors.rep_phone ? "is-invalid" : ""}`}
            value={data.rep_phone}
            onChange={onChange("rep_phone")}
          />
        </div>
        <FieldError error={errors.rep_phone} />
      </div>

      <div className="col-12">
        <label className="form-label fw-semibold">Mode de réception</label>
        <div className="d-flex gap-4">
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
            <label className="form-check-label" htmlFor="otp_email">
              E-mail
            </label>
          </div>

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
            <label className="form-check-label text-muted" htmlFor="otp_sms">
              SMS (bientôt)
            </label>
          </div>
        </div>
        <FieldError error={errors.otp_delivery} />
      </div>
    </div>
  );
}

function StepReview({ rows }) {
  return (
    <div className="row g-3">
      {rows.map(([k, v]) => (
        <div key={k} className="col-md-6">
          <div className="border rounded-3 p-3 h-100" style={{ background: "#fafafa" }}>
            <div className="text-muted small">{k}</div>
            <div className="fw-semibold text-break">{v}</div>
          </div>
        </div>
      ))}

      <div className="col-12">
        <div className="alert alert-secondary mt-2 mb-0">
          En cliquant sur <strong>“Envoyer le code”</strong>, vous recevrez un OTP pour finaliser l’inscription.
        </div>
      </div>
    </div>
  );
}

function StepVerify({ data, errors, onChange }) {
  return (
    <div className="text-center">
      <div
        className="mx-auto mb-3 d-inline-flex align-items-center justify-content-center rounded-circle bg-light"
        style={{ width: 64, height: 64 }}
      >
        <ShieldCheck size={28} className="text-primary" />
      </div>

      <div className="mb-3 text-muted">
        Saisissez le <strong>code à 6 chiffres</strong> reçu par email.
      </div>

      <div className="d-flex justify-content-center">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          className={`form-control text-center fw-bold ${errors.otp_code ? "is-invalid" : ""}`}
          style={{ width: 220, letterSpacing: 6, fontSize: "1.4rem" }}
          value={data.otp_code}
          onChange={onChange("otp_code")}
          placeholder="••••••"
        />
      </div>
      <div className="d-flex justify-content-center">
        <div style={{ width: 220 }}>
          <FieldError error={errors.otp_code} />
        </div>
      </div>
    </div>
  );
}
