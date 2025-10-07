# b2b/views/mission_pdf.py
# -*- coding: utf-8 -*-
from __future__ import annotations
from io import BytesIO
from datetime import timedelta
from typing import Any, Dict, List

from django.http import FileResponse
from django.utils.timezone import localtime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors

# ------------------------------- Helpers basiques -------------------------------

def _safe_str(v, default="—"):
    return (str(v).strip() if v is not None and str(v).strip() else default)

def _fmt_dt(dt):
    if not dt:
        return "—"
    dt = localtime(dt)
    return dt.strftime("%d/%m/%Y %H:%M")

def _fmt_d(d):
    if not d:
        return "—"
    return d.strftime("%d-%m-%Y")

def _hline(p: canvas.Canvas, x1, x2, y, w=0.6, col="#C8CCD1"):
    p.setStrokeColor(colors.HexColor(col))
    p.setLineWidth(w)
    p.line(x1, y, x2, y)

def _text(p: canvas.Canvas, x, y, txt, font="Helvetica", size=10, color="#000", right=False):
    p.setFont(font, size)
    p.setFillColor(colors.HexColor(color))
    if right:
        p.drawRightString(x, y, txt)
    else:
        p.drawString(x, y, txt)

def _kv(p: canvas.Canvas, x, y, label, value, label_w=30*mm, val_w=None, size=10):
    p.setFont("Helvetica-Bold", size); p.setFillColor(colors.black)
    p.drawString(x, y, f"{label} :")
    p.setFont("Helvetica", size)
    p.drawString(x + label_w, y, _safe_str(value))
    return y

# ------------------------------- Extraction des données -------------------------------

def _ordre_label_sens(ordre) -> str:
    """
    Essaie de déterminer si l'OM est DEPART ou ARRIVEE.
    Heuristiques: mission.type, mission.trajet, premission.type, ordre.trajet…
    """
    # 1) champs explicites
    for obj in (getattr(ordre, "mission", None), getattr(ordre, "premission", None), ordre):
        sens = getattr(obj, "type", None)
        if isinstance(sens, str) and sens.strip().upper() in {"DEPART", "ARRIVEE"}:
            return sens.strip().upper()
    # 2) heuristique sur le trajet
    trajet = getattr(ordre, "trajet", "") or getattr(getattr(ordre, "mission", None), "trajet", "") \
             or getattr(getattr(ordre, "mission", None), "premission", None) and getattr(ordre.mission.premission, "trajet_prevu", "") or ""
    t = str(trajet).lower()
    if "aéroport" in t or "airport" in t or "mir" in t or "tun" in t:
        # si on voit "vers aéroport" on suppose DEPART, sinon ARRIVEE
        if "->" in t:
            parts = [s.strip() for s in t.split("->")]
            if len(parts) >= 2 and ("aero" in parts[-1].lower() or "air" in parts[-1].lower()):
                return "DEPART"
            if len(parts) >= 2 and ("aero" in parts[0].lower() or "air" in parts[0].lower()):
                return "ARRIVEE"
    # défaut
    return "DEPART"

def _agence_info(ordre):
    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    ag = getattr(pre, "agence", None)
    nom = getattr(ag, "nom", "") if ag else ""
    adr = getattr(ag, "adresse", "") if ag else ""
    tel = getattr(ag, "telephone", "") if ag else ""
    email = getattr(ag, "email", "") if ag else ""
    zone = getattr(ag, "zone", "") if ag else ""  # ex: "HAMMAMET NORD" si tu le stockes là
    return {"nom": nom, "adresse": adr, "tel": tel, "email": email, "zone": zone}

def _airport_code(ordre) -> str:
    # essaie dossier.aeroport_arrivee/depart, sinon texte court détecté dans trajet
    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    d = getattr(pre, "dossier", None)
    for k in ("aeroport_depart", "aeroport_arrivee", "aeroport"):
        v = getattr(d, k, None) if d else None
        if v:
            s = str(v).strip()
            # si l'objet a un code IATA
            code = getattr(v, "code", None)
            return (code or s)[:8]
    # heuristique sur trajet
    trajet = getattr(ordre, "trajet", "") or getattr(mission, "trajet", "") or getattr(pre, "trajet_prevu", "") or ""
    for code in ("MIR", "NBE", "TUN", "DJE", "NBE", "MJI"):
        if code.lower() in trajet.lower():
            return code
    return "—"

def _veh_line(veh):
    if not veh:
        return "—"
    parts = []
    if getattr(veh, "type", None): parts.append(veh.type)
    if getattr(veh, "marque", None): parts.append(veh.marque)
    if getattr(veh, "model", None): parts.append(veh.model)
    if getattr(veh, "immatriculation", None): parts.append(veh.immatriculation)
    return " ".join([p for p in parts if p])

def _chauffeur_line(chf):
    if not chf:
        return "—"
    nom = f"{getattr(chf, 'nom', '')} {getattr(chf, 'prenom', '')}".strip() or "—"
    cin = getattr(chf, "cin", None)
    return nom if not cin else f"{nom}"

def _collect_rows(ordre) -> List[Dict[str, Any]]:
    """
    Retourne une liste de lignes:
      {"heure":"06:00","hotel":"RESIDENCE ROMANE","pax":1,
       "vols":[{"nom":"CLIENT NAME","pax":1,"num_vol":"BJ542","heure_vol":"10:05","agence":"JumbOnline.com"}, ...]}
    Recherche dans:
      - ordre.lignes (si tu as un modèle OMLine/OrdreLigne)
      - mission.premission.ramassages (si tu enregistres les pick-ups)
      - fallback: une unique ligne issue du dossier/hôtel + vol
    """
    rows = []

    # 1) Ordre.lignes (structure libre)
    lignes = getattr(ordre, "lignes", None)
    if lignes:
        for li in getattr(lignes, "all", lambda: lignes)():
            heure = getattr(li, "heure", None)
            htxt = localtime(heure).strftime("%H:%M") if heure else _safe_str(getattr(li, "heure_txt", ""), "")
            hotel = _safe_str(getattr(getattr(li, "hotel", None), "nom", None) or getattr(li, "hotel", None))
            pax = getattr(li, "pax", None) or 0
            # blocs "vols"
            vol_list = []
            items = getattr(li, "vols", None) or []
            for it in getattr(items, "all", lambda: items)():
                vol_list.append({
                    "nom": _safe_str(getattr(it, "nom", None) or getattr(it, "passager", None), ""),
                    "pax": getattr(it, "pax", None) or 1,
                    "num_vol": _safe_str(getattr(it, "numero", None) or getattr(it, "num_vol", None), ""),
                    "heure_vol": _safe_str(getattr(it, "heure_vol", None), ""),
                    "agence": _safe_str(getattr(it, "agence", None), ""),
                })
            rows.append({"heure": htxt, "hotel": hotel, "pax": pax, "vols": vol_list})

    if rows:
        return rows

    # 2) premission.ramassages
    pre = getattr(getattr(ordre, "mission", None), "premission", None)
    ram = getattr(pre, "ramassages", None)
    if ram:
        for ra in getattr(ram, "all", lambda: ram)():
            htxt = _safe_str(getattr(ra, "heure_txt", None) or (localtime(ra.heure).strftime("%H:%M") if getattr(ra, "heure", None) else ""))
            hotel = _safe_str(getattr(getattr(ra, "hotel", None), "nom", None) or getattr(ra, "hotel", None))
            pax = getattr(ra, "pax", None) or 0
            vols = []
            for it in getattr(ra, "passagers", []) or []:
                vols.append({
                    "nom": _safe_str(getattr(it, "nom", None) or getattr(it, "full_name", None), ""),
                    "pax": getattr(it, "pax", None) or 1,
                    "num_vol": _safe_str(getattr(it, "num_vol", None), ""),
                    "heure_vol": _safe_str(getattr(it, "heure_vol", None), ""),
                    "agence": _safe_str(getattr(it, "agence", None), ""),
                })
            rows.append({"heure": htxt, "hotel": hotel, "pax": pax, "vols": vols})

    if rows:
        return rows

    # 3) Fallback minimal depuis le dossier
    d = getattr(pre, "dossier", None) if pre else None
    hotel = _safe_str(getattr(getattr(d, "hotel", None), "nom", None) or getattr(d, "hotel", None))
    pax = getattr(d, "nombre_personnes_arrivee", None) or getattr(d, "nombre_personnes_retour", None) or 0
    num_vol = _safe_str(getattr(d, "num_vol", None) or getattr(d, "numero_vol", None), "")
    h_vol = _safe_str(getattr(d, "heure_vol", None), "")
    agence = _safe_str(getattr(d, "agence", None), "")
    heure_txt = localtime(getattr(ordre.mission, "date_debut", None)).strftime("%H:%M") if getattr(ordre.mission, "date_debut", None) else ""
    rows.append({
        "heure": heure_txt,
        "hotel": hotel,
        "pax": pax,
        "vols": [{"nom": "", "pax": pax or 1, "num_vol": num_vol, "heure_vol": h_vol, "agence": agence}],
    })
    return rows

def _sum_total_pax(rows: List[Dict[str, Any]]) -> int:
    total = 0
    for r in rows:
        if r.get("vols"):
            total += sum(v.get("pax", 0) or 0 for v in r["vols"])
        else:
            total += r.get("pax", 0) or 0
    return total

# ------------------------------- Génération PDF -------------------------------

def build_om_pdf_response(ordre) -> FileResponse:
    """
    A4, layout conforme au modèle de la pièce jointe :
    - Bandeau SENS (DEPART/ARRIVEE) + bloc info OM
    - Tableau: Heure | Hôtel | Pax | Vols (NOM / Pax / N° VOL / H.VOL / AGENCE)
    - Observations + signatures
    """
    buff = BytesIO()
    p = canvas.Canvas(buff, pagesize=A4)
    W, H = A4
    margin = 14 * mm
    xL, xR = margin, W - margin
    y = H - margin

    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    veh = getattr(ordre, "vehicule", None)
    chf = getattr(ordre, "chauffeur", None)

    agence = _agence_info(ordre)
    sens = _ordre_label_sens(ordre)
    aeroport = _airport_code(ordre)
    rows = _collect_rows(ordre)
    total_pax = _sum_total_pax(rows)

    # -------------------- En-tête agence (gauche) --------------------
    _text(p, xL, y, _safe_str(agence["nom"], ""), "Helvetica-Bold", 12)
    y -= 5.2 * mm
    _text(p, xL, y, f"{_safe_str(agence['adresse'],'')}")
    y -= 5.2 * mm
    line = f"{_safe_str(agence['tel'],'')}  Tél :" if agence["tel"] else "Tél :"
    _text(p, xL, y, line)
    y -= 5.2 * mm
    _text(p, xL, y, f"Email : {_safe_str(agence['email'],'')}")
    # bandeau sens (droite)
    p.setFillColor(colors.HexColor("#000"))
    p.setFont("Helvetica-Bold", 18)
    _text(p, xR, H - margin, sens, right=True)

    y -= 7 * mm
    _hline(p, xL, xR, y)
    y -= 6 * mm

    # -------------------- Ligne infos OM (comme le modèle) --------------------
    # OM N° : XXXXX  Date : DD-MM-YYYY
    om_date = _fmt_d(getattr(mission, "date_debut", None) or getattr(mission, "created_at", None))
    _text(p, xL, y, f"OM N° : {_safe_str(getattr(ordre, 'reference', ''))}", "Helvetica-Bold", 11)
    _text(p, xL + 70*mm, y, f"Date : {om_date}", "Helvetica-Bold", 11)

    y -= 6.5 * mm

    # HAMMAMET NORD  Aéroport : MIR
    zone_txt = _safe_str(agence["zone"], "")
    _text(p, xL, y, _safe_str(zone_txt, "").upper(), "Helvetica-Bold", 11)
    _text(p, xL + 70*mm, y, f"Aéroport : {aeroport}", "Helvetica-Bold", 11)

    y -= 6.5 * mm

    # BUS : 185TU8512   TOTAL : 48   CHAUFFEUR : BEN ALI MAAMAR
    bus_line = _veh_line(veh)
    _text(p, xL, y, f"BUS : {bus_line}", "Helvetica-Bold", 11)
    _text(p, xL + 70*mm, y, f"TOTAL : {total_pax}", "Helvetica-Bold", 11)
    _text(p, xL + 100*mm, y, f"CHAUFFEUR : {_chauffeur_line(chf)}", "Helvetica-Bold", 11)

    y -= 8.5 * mm
    _hline(p, xL, xR, y)
    y -= 4.5 * mm

    # -------------------- Tableau --------------------
    # Colonnes: Heure | Hôtel | Pax | Vols (Nom, Pax, N° VOL, H.VOL, AGENCE)
    # Largeurs (approx) pour coller au rendu de la PJ
    col_heure = 18 * mm
    col_hotel = 54 * mm
    col_pax   = 12 * mm
    col_vols_w = (xR - xL) - (col_heure + col_hotel + col_pax)
    # Vols sous-colonnes
    sub_nom   = 42 * mm
    sub_pax   = 10 * mm
    sub_num   = 24 * mm
    sub_hvol  = 22 * mm
    sub_ag    = col_vols_w - (sub_nom + sub_pax + sub_num + sub_hvol)

    # En-têtes
    _text(p, xL + 2, y, "Heure", "Helvetica-Bold", 10)
    _text(p, xL + col_heure + 2, y, "Hôtel", "Helvetica-Bold", 10)
    _text(p, xL + col_heure + col_hotel + 2, y, "Pax", "Helvetica-Bold", 10)
    _text(p, xL + col_heure + col_hotel + col_pax + 2, y, "Vols", "Helvetica-Bold", 10)
    y -= 5.5 * mm
    _hline(p, xL, xR, y)

    y -= 2.5 * mm

    # Ligne des sous-entêtes "Vols"
    vx = xL + col_heure + col_hotel + col_pax
    _text(p, vx + 2, y, "NOM", "Helvetica", 9)
    _text(p, vx + sub_nom + 2, y, "Pax", "Helvetica", 9)
    _text(p, vx + sub_nom + sub_pax + 2, y, "N° VOL", "Helvetica", 9)
    _text(p, vx + sub_nom + sub_pax + sub_num + 2, y, "H.VOL", "Helvetica", 9)
    _text(p, vx + sub_nom + sub_pax + sub_num + sub_hvol + 2, y, "AGENCE", "Helvetica", 9)

    y -= 4.8 * mm
    _hline(p, xL, xR, y)
    y -= 1.8 * mm

    # Lignes
    line_h = 5.2 * mm
    for r in rows:
        # Heure / Hôtel / Pax (peuvent s'afficher sur plusieurs sous-lignes si plusieurs vols)
        heure_txt = _safe_str(r.get("heure", ""), "")
        hotel_txt = _safe_str(r.get("hotel", ""), "")
        pax_txt = str(r.get("pax", "")) if r.get("pax") not in (None, "") else ""

        vols = r.get("vols") or [{}]
        first = True
        for v in vols:
            # Si on dépasse la page, on saute
            if y < 40 * mm:
                # Pied + saut de page
                p.setFont("Helvetica", 8)
                p.setFillColor(colors.HexColor("#888"))
                _text(p, xR, 12 * mm, f"OM {getattr(ordre, 'reference', '')} — généré par b2bMouha", "Helvetica", 8, "#888", right=True)
                p.showPage()
                p.setFont("Helvetica", 10)
                y = H - margin
            # Colonnes fixes (une seule fois par ramassage)
            if first:
                _text(p, xL + 2, y, heure_txt)
                _text(p, xL + col_heure + 2, y, hotel_txt)
                _text(p, xL + col_heure + col_hotel + 2, y, pax_txt)
                first = False
            # Bloc vols
            _text(p, vx + 2, y, _safe_str(v.get("nom", ""), ""))
            _text(p, vx + sub_nom + 2, y, str(v.get("pax", "")) if v.get("pax") not in (None, "") else "")
            _text(p, vx + sub_nom + sub_pax + 2, y, _safe_str(v.get("num_vol", ""), ""))
            _text(p, vx + sub_nom + sub_pax + sub_num + 2, y, _safe_str(v.get("heure_vol", ""), ""))
            _text(p, vx + sub_nom + sub_pax + sub_num + sub_hvol + 2, y, _safe_str(v.get("agence", ""), ""))
            y -= line_h

        _hline(p, xL, xR, y)
        y -= 1.2 * mm

    # -------------------- Observations --------------------
    y -= 4 * mm
    _text(p, xL, y, "OBSERVATIONS :", "Helvetica-Bold", 10)
    y -= 5.2 * mm

    obs = _safe_str(getattr(mission, "details", "") or getattr(ordre, "observations", "") or "", "")
    if not obs:
        _text(p, xL, y, "—")
        y -= 6 * mm
    else:
        p.setFont("Helvetica", 10)
        max_chars = 110
        while obs:
            line = obs[:max_chars]
            _text(p, xL, y, line)
            obs = obs[max_chars:]
            y -= 5.0 * mm

    y -= 8 * mm

    # -------------------- Signatures --------------------
    _text(p, xL, y, _safe_str(_chauffeur_line(chf), "Signature Chauffeur"))
    _text(p, xR, y, _safe_str(agence["nom"], "Signature Responsable"), right=True)

    y -= 18 * mm
    _hline(p, xL, xL + 60 * mm, y)
    _hline(p, xR - 60 * mm, xR, y)

    # -------------------- Pied de page --------------------
    p.setFont("Helvetica", 8)
    p.setFillColor(colors.HexColor("#888"))
    _text(p, xR, 12 * mm, f"OM {getattr(ordre, 'reference', '')} — généré par b2bMouha", "Helvetica", 8, "#888", right=True)

    p.showPage()
    p.save()
    buff.seek(0)
    return FileResponse(buff, as_attachment=True, filename=f"ordre_mission_{ordre.reference}.pdf")
