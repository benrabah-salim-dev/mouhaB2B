import React, { useMemo, useState, useEffect, useRef } from "react";
import api from "../api";
import { 
  Building2, UserCheck, ShieldCheck, CheckCircle2, 
  Upload, FileText, Smartphone, Mail, ArrowRight, ArrowLeft, Loader2, AlertCircle, MapPin, User, Hash
} from "lucide-react";

// --- Configuration ---
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com"];
const SKIP_UPPERCASE = new Set(["company_email", "rep_email", "otp_delivery", "otp_code", "company_address"]);

const steps = [
  { key: "contact",  title: "Entreprise", icon: <Building2 size={20}/> },
  { key: "security", title: "Représentant", icon: <UserCheck size={20}/> },
  { key: "review",   title: "Récapitulatif", icon: <FileText size={20}/> },
  { key: "verify",   title: "Vérification", icon: <ShieldCheck size={20}/> },
];

export default function Inscription() {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState({
    legal_name: "", rne: "", code_fiscal: "", code_categorie: "", etab_secondaire: "",
    logo_file: null, rne_doc_file: null, patente_doc_file: null,
    company_country: "", company_address: "", company_email: "", company_phone: "",
    ville: "", code_postal: "",
    rep_prenom: "", rep_nom: "", rep_cin: "", rep_photo_file: null,
    rep_email: "", rep_phone: "", otp_delivery: "email", otp_code: ""
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [stepIndex]);

  const handleChange = (field) => (e) => {
    let value = e.target.files ? e.target.files[0] : e.target.value;
    if (typeof value === "string" && !SKIP_UPPERCASE.has(field)) value = value.toUpperCase();
    setData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validateStep = () => {
    const e = {};
    const c = steps[stepIndex].key;

    if (c === "contact") {
      ["legal_name", "rne", "code_fiscal", "company_email", "ville", "code_postal"].forEach(f => {
        if (!data[f]?.trim()) e[f] = "Requis";
      });
    }
    if (c === "security") {
      ["rep_prenom", "rep_nom", "rep_cin", "rep_email", "rep_phone"].forEach(f => {
        if (!data[f]?.trim()) e[f] = "Requis";
      });
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSendOtp = async () => {
    setSubmitting(true);
    try {
      await api.post("/public/demandes-inscription/send-otp/", data);
      setStepIndex(3);
    } catch (err) {
      alert(err?.response?.data?.detail || "Erreur d'envoi du code.");
    } finally { setSubmitting(false); }
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    try {
      const form = new FormData();
      Object.keys(data).forEach(key => { if (data[key]) form.append(key, data[key]); });
      await api.post("/public/demandes-inscription/", form);
      window.location.href = "/login?success=true";
    } catch (err) {
      alert("Code incorrect ou erreur serveur.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 850 }}>
      {/* Stepper Header */}
      <div className="mb-5 position-relative d-flex justify-content-between">
        <div className="progress position-absolute top-50 start-0 translate-middle-y w-100" style={{ height: 2, zIndex: 0 }}>
          <div className="progress-bar bg-primary transition-all" style={{ width: `${(stepIndex / (steps.length - 1)) * 100}%` }} />
        </div>
        {steps.map((s, i) => (
          <div key={s.key} className="text-center position-relative" style={{ zIndex: 1, width: 60 }}>
            <div className={`mx-auto mb-2 d-flex align-items-center justify-content-center rounded-circle border-2 transition-all ${i <= stepIndex ? 'bg-primary border-primary text-white shadow' : 'bg-white border-light text-muted'}`} 
                 style={{ width: 42, height: 42 }}>
              {i < stepIndex ? <CheckCircle2 size={20} /> : s.icon}
            </div>
            <span className="x-small fw-bold text-uppercase" style={{ fontSize: '0.65rem' }}>{s.title}</span>
          </div>
        ))}
      </div>

      <div className="card shadow-lg border-0" style={{ borderRadius: 20 }}>
        <div className="card-body p-4 p-md-5">
          {stepIndex === 0 && <StepContact data={data} errors={errors} onChange={handleChange} />}
          {stepIndex === 1 && <StepSecurity data={data} errors={errors} onChange={handleChange} />}
          {stepIndex === 2 && <StepReview data={data} />}
          {stepIndex === 3 && <StepVerify data={data} errors={errors} onChange={handleChange} />}

          <div className="d-flex justify-content-between mt-5 pt-4 border-top">
            <button className="btn btn-link text-muted fw-bold text-decoration-none" 
                    onClick={() => setStepIndex(i => i - 1)} disabled={stepIndex === 0 || submitting}>
              <ArrowLeft size={18} className="me-1"/> RETOUR
            </button>
            
            {stepIndex < 2 ? (
              <button className="btn btn-primary px-4 fw-bold rounded-pill" onClick={() => validateStep() && setStepIndex(i => i + 1)}>
                CONTINUER <ArrowRight size={18} className="ms-1"/>
              </button>
            ) : stepIndex === 2 ? (
              <button className="btn btn-success px-4 fw-bold rounded-pill" onClick={handleSendOtp} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin me-2" size={18}/> : "RECEVOIR LE CODE"}
              </button>
            ) : (
              <button className="btn btn-primary px-4 fw-bold rounded-pill" onClick={handleFinalSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin me-2" size={18}/> : "VÉRIFIER & CRÉER"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SOUS-COMPOSANTS ---

function StepContact({ data, errors, onChange }) {
  return (
    <div className="fade-in">
      <h4 className="fw-bold mb-4">L'Entreprise</h4>
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label small fw-bold">Nom de l'agence (Raison Sociale)</label>
          <input className={`form-control ${errors.legal_name && 'is-invalid'}`} value={data.legal_name} onChange={onChange("legal_name")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">RNE</label>
          <input className="form-control text-uppercase" value={data.rne} onChange={onChange("rne")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Code Fiscal</label>
          <input className="form-control text-uppercase" value={data.code_fiscal} onChange={onChange("code_fiscal")} />
        </div>
        <div className="col-md-6">
          <FileUploadBox label="Logo Agence" field="logo_file" onChange={onChange} fileName={data.logo_file?.name} icon={Building2} />
        </div>
        <div className="col-md-6">
          <FileUploadBox label="Patente / RC (PDF)" field="patente_doc_file" onChange={onChange} fileName={data.patente_doc_file?.name} icon={FileText} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Email de l'agence</label>
          <input className={`form-control ${errors.company_email && 'is-invalid'}`} value={data.company_email} onChange={onChange("company_email")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Ville</label>
          <input className="form-control" value={data.ville} onChange={onChange("ville")} />
        </div>
      </div>
    </div>
  );
}

function StepSecurity({ data, errors, onChange }) {
  return (
    <div className="fade-in">
      <h4 className="fw-bold mb-4">Représentant Légal</h4>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label small fw-bold">Prénom</label>
          <input className={`form-control ${errors.rep_prenom && 'is-invalid'}`} value={data.rep_prenom} onChange={onChange("rep_prenom")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Nom</label>
          <input className={`form-control ${errors.rep_nom && 'is-invalid'}`} value={data.rep_nom} onChange={onChange("rep_nom")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Numéro CIN</label>
          <input className="form-control" value={data.rep_cin} onChange={onChange("rep_cin")} />
        </div>
        <div className="col-md-6">
          <label className="form-label small fw-bold">Téléphone Mobile</label>
          <input className="form-control" value={data.rep_phone} onChange={onChange("rep_phone")} />
        </div>
        <div className="col-12">
          <label className="form-label small fw-bold">Email personnel (pour réception OTP)</label>
          <div className="input-group">
            <span className="input-group-text"><Mail size={16}/></span>
            <input className={`form-control ${errors.rep_email && 'is-invalid'}`} value={data.rep_email} onChange={onChange("rep_email")} placeholder="votre.nom@gmail.com" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepReview({ data }) {
  return (
    <div className="fade-in text-center py-3">
      <h4 className="fw-bold">Confirmez vos infos</h4>
      <p className="text-muted">Cliquez sur "Recevoir le code" pour vérifier votre email.</p>
      <div className="row text-start mt-4 bg-light p-4 rounded-3 g-3">
        <div className="col-md-6">
          <small className="text-muted d-block">Agence</small>
          <span className="fw-bold">{data.legal_name}</span>
        </div>
        <div className="col-md-6">
          <small className="text-muted d-block">Email de réception</small>
          <span className="fw-bold text-primary">{data.rep_email}</span>
        </div>
      </div>
    </div>
  );
}

function StepVerify({ data, errors, onChange }) {
  return (
    <div className="fade-in text-center">
      <div className="mb-4 text-primary"><Smartphone size={48}/></div>
      <h4 className="fw-bold">Saisissez le code</h4>
      <p className="text-muted">Le code à 6 chiffres a été envoyé à {data.rep_email}</p>
      <input 
        className={`form-control form-control-lg text-center mx-auto fw-bold ${errors.otp_code && 'is-invalid'}`} 
        style={{ maxWidth: 200, letterSpacing: 4, fontSize: '1.5rem' }}
        maxLength={6}
        value={data.otp_code}
        onChange={onChange("otp_code")}
        placeholder="000000"
      />
    </div>
  );
}

function FileUploadBox({ label, field, onChange, fileName, icon: Icon }) {
  return (
    <div className="mb-3">
      <label className="form-label x-small fw-bold text-muted text-uppercase">{label}</label>
      <div className={`p-2 border rounded d-flex align-items-center bg-light ${fileName ? 'border-success' : ''}`}>
        <Icon size={18} className="text-muted me-2" />
        <span className="small text-truncate flex-grow-1">{fileName || "Aucun fichier"}</span>
        <label className="btn btn-sm btn-outline-primary mb-0 ms-2">
          <Upload size={14}/>
          <input type="file" className="d-none" onChange={onChange(field)} />
        </label>
      </div>
    </div>
  );
}