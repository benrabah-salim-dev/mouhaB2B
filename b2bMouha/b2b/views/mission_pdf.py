# b2b/views/mission_pdf.py
# -*- coding: utf-8 -*-
from __future__ import annotations
from io import BytesIO
from datetime import timedelta

from django.http import FileResponse
from django.utils.timezone import localtime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors

def _kv(p: canvas.Canvas, x, y, label: str, value: str, w_label=36*mm, w_value=120*mm, lh=6.2*mm):
    """Affiche une ligne 'Label : Value' proprement alignée ; retourne le y suivant."""
    p.setFont("Helvetica-Bold", 10)
    p.drawString(x, y, f"{label}:")
    p.setFont("Helvetica", 10)
    p.drawString(x + w_label, y, value or "—")
    return y - lh

def _hline(p: canvas.Canvas, x1, x2, y):
    p.setStrokeColor(colors.HexColor("#C8CCD1"))
    p.setLineWidth(0.6)
    p.line(x1, y, x2, y)

def _block_title(p: canvas.Canvas, title: str, x, y):
    p.setFillColor(colors.black)
    p.setFont("Helvetica-Bold", 11)
    p.drawString(x, y, title)

def _fmt_dt(dt):
    if not dt:
        return "—"
    dt = localtime(dt)
    return dt.strftime("%d/%m/%Y %H:%M")

def _fmt_d(d):
    if not d:
        return "—"
    return d.strftime("%d/%m/%Y")

def build_om_pdf_response(ordre) -> FileResponse:
    """
    Construit un PDF d'ordre de mission (propre, A4, en-têtes/blocs/signatures).
    Retourne un FileResponse prêt à être renvoyé par la vue.
    """
    buff = BytesIO()
    p = canvas.Canvas(buff, pagesize=A4)

    W, H = A4
    margin = 18*mm
    xL = margin
    xR = W - margin
    y = H - margin

    mission = ordre.mission
    pre = mission.premission if hasattr(mission, "premission") else None
    agence = getattr(pre, "agence", None)
    veh = ordre.vehicule
    chf = ordre.chauffeur

    # ====== En-tête ======
    # Titre
    p.setFont("Helvetica-Bold", 16)
    p.drawString(xL, y, "ORDRE DE MISSION")
    p.setFont("Helvetica", 10)
    p.setFillColor(colors.HexColor("#444"))
    p.drawRightString(xR, y, f"Référence : {ordre.reference}")
    y -= 10*mm
    _hline(p, xL, xR, y)
    y -= 7*mm

    # Agence / Infos côté gauche
    _block_title(p, "Agence", xL, y)
    y -= 5.8*mm
    if agence:
        p.setFont("Helvetica-Bold", 10)
        p.drawString(xL, y, agence.nom or "—")
        p.setFont("Helvetica", 10)
        y -= 5.2*mm
        if getattr(agence, "adresse", ""):
            p.drawString(xL, y, agence.adresse[:90])
            y -= 5.2*mm
        ligne_ag = []
        if getattr(agence, "email", ""):
            ligne_ag.append(agence.email)
        if getattr(agence, "telephone", ""):
            ligne_ag.append(agence.telephone)
        if ligne_ag:
            p.drawString(xL, y, " | ".join(ligne_ag))
            y -= 5.2*mm
    else:
        p.setFont("Helvetica", 10)
        p.drawString(xL, y, "—")
        y -= 5.2*mm

    y -= 4*mm

    # ====== Bloc Mission ======
    _block_title(p, "Détails de la mission", xL, y)
    y -= 6.5*mm
    start_s = _fmt_dt(mission.date_debut)
    end_s   = _fmt_dt(mission.date_fin)
    duree = "—"
    if mission.date_debut and mission.date_fin:
        delta: timedelta = mission.date_fin - mission.date_debut
        hours = int(delta.total_seconds() // 3600)
        mins = int((delta.total_seconds() % 3600) // 60)
        duree = f"{hours} h {mins:02d}"
    y = _kv(p, xL, y, "Date départ", start_s)
    y = _kv(p, xL, y, "Date retour", end_s)
    y = _kv(p, xL, y, "Durée estimée", duree)

    trajet = getattr(mission, "premission", None).trajet_prevu if hasattr(mission, "premission") and mission.premission else ""
    # fallback éventuel : certaines intégrations fixent le trajet directement dans l’OM
    if getattr(ordre, "trajet", ""):
        trajet = ordre.trajet or trajet
    y = _kv(p, xL, y, "Trajet", trajet or "—")

    # Indication liée à la fiche (si présent dans le pré-mission / dossier)
    aeroport = None
    if pre and getattr(pre, "dossier", None):
        d = pre.dossier
        # Choix heuristique : si on a un vol d'arrivée/départ
        aeroport = d.aeroport_arrivee or d.aeroport_depart
    if aeroport:
        y = _kv(p, xL, y, "Aéroport", str(aeroport))

    y -= 3*mm
    _hline(p, xL, xR, y)
    y -= 6*mm

    # ====== Bloc Véhicule & Chauffeur ======
    _block_title(p, "Ressources affectées", xL, y)
    y -= 6.5*mm

    # Véhicule
    veh_line = "—"
    if veh:
        parts = []
        if veh.type: parts.append(veh.type)
        if veh.marque: parts.append(veh.marque)
        if getattr(veh, "model", None): parts.append(veh.model)
        if veh.immatriculation: parts.append(f"({veh.immatriculation})")
        veh_line = " ".join(parts)
    y = _kv(p, xL, y, "Véhicule", veh_line)

    cap = ""
    if veh and getattr(veh, "capacite", None):
        cap = f"{veh.capacite} places"
        y = _kv(p, xL, y, "Capacité", cap)

    # Chauffeur
    ch_line = "—"
    if chf:
        nom = f"{getattr(chf, 'nom', '')} {getattr(chf, 'prenom', '')}".strip()
        cin = getattr(chf, "cin", None)
        ch_line = f"{nom}" + (f"  —  CIN: {cin}" if cin else "")
    y = _kv(p, xL, y, "Chauffeur", ch_line)

    y -= 3*mm
    _hline(p, xL, xR, y)
    y -= 6*mm

    # ====== Bloc Dossier (si présent) ======
    if pre and getattr(pre, "dossier", None):
        d = pre.dossier
        _block_title(p, "Informations Passagers / Dossier", xL, y)
        y -= 6.5*mm
        y = _kv(p, xL, y, "Référence dossier", getattr(d, "reference", "—"))
        y = _kv(p, xL, y, "Nom réservation", getattr(d, "nom_reservation", "—"))
        h = getattr(d, "hotel", None)
        y = _kv(p, xL, y, "Hôtel", getattr(h, "nom", None) if h else (getattr(d, "hotel", None) or "—"))
        # Pax indicatif (arrivée/départ)
        pax_a = getattr(d, "nombre_personnes_arrivee", None)
        pax_d = getattr(d, "nombre_personnes_retour", None)
        pax_line = "—"
        if pax_a is not None or pax_d is not None:
            pax_line = f"Arrivée: {pax_a or 0} | Départ: {pax_d or 0}"
        y = _kv(p, xL, y, "Pax", pax_line)
        y -= 3*mm
        _hline(p, xL, xR, y)
        y -= 6*mm

    # ====== Observations ======
    obs = getattr(mission, "details", "") or ""
    _block_title(p, "Observations", xL, y)
    y -= 6.5*mm
    p.setFont("Helvetica", 10)
    if not obs:
        p.drawString(xL, y, "—")
        y -= 6*mm
    else:
        # Simple wrapping manuel (une vraie mise en forme utiliserait Paragraph de reportlab.platypus)
        max_chars = 95
        for i in range(0, len(obs), max_chars):
            p.drawString(xL, y, obs[i:i+max_chars])
            y -= 5.2*mm
    y -= 2*mm
    _hline(p, xL, xR, y)
    y -= 10*mm

    # ====== Signatures ======
    p.setFont("Helvetica", 10)
    p.drawString(xL, y, "Signature Responsable")
    p.drawString(xR - 55*mm, y, "Signature Chauffeur")
    y -= 25*mm
    _hline(p, xL, xL + 60*mm, y)
    _hline(p, xR - 60*mm, xR, y)

    # Pied de page
    p.setFont("Helvetica", 8)
    p.setFillColor(colors.HexColor("#888"))
    p.drawRightString(xR, 12*mm, f"OM {ordre.reference} — généré par b2bMouha")

    p.showPage()
    p.save()
    buff.seek(0)
    return FileResponse(buff, as_attachment=True, filename=f"ordre_mission_{ordre.reference}.pdf")
