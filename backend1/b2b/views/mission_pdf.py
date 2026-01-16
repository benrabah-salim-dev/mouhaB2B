# backend1/b2b/views/mission_pdf.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from django.http import FileResponse
from django.core.files.storage import default_storage
from django.utils.dateparse import parse_datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
)
from reportlab.platypus.tables import LongTable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


# ============================================================
# Config (look & feel like your screenshot)
# ============================================================

# Header background (light blue like the screenshot)
HEADER_BLUE = colors.HexColor("#D7E7F7")
# Borders
BORDER = colors.HexColor("#000000")


# ============================================================
# Utils
# ============================================================


def _normalize_to_str(v) -> str:
    """
    Retourne une string propre (TO) ou "".
    Gère aussi le cas où v est déjà une string issue d'un pandas Series:
    't_o ...\nName: 29, dtype: object'
    """
    if v is None:
        return ""

    # ✅ cas normal
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return ""

        # ✅ cas pandas Series stringifiée (on extrait la vraie valeur)
        if ("dtype:" in s) or ("Name:" in s):
            lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
            cleaned = []
            for ln in lines:
                if ln.startswith("Name:") or "dtype:" in ln:
                    continue
                # enlève le préfixe "t_o"
                if ln.lower().startswith("t_o"):
                    ln = ln[3:].strip()
                # ignore bruit / codes inutiles
                if ln.upper() in {"VONLI"}:
                    continue
                if ln.isdigit():
                    continue
                if ln:
                    cleaned.append(ln)

            # priorité : domaine / valeur lisible
            for cand in cleaned:
                if "." in cand:   # ex: JumbOnline.com
                    return cand
            for cand in cleaned:
                if "-" in cand:   # ex: JT-JUMBONLINEL
                    return cand
            # fallback : dernier élément propre
            return cleaned[-1] if cleaned else ""

        # string normale
        return s

    # ❌ pandas Series / numpy / objets → REFUSÉS
    if hasattr(v, "dtype") or hasattr(v, "values"):
        return ""

    # dict simple
    if isinstance(v, dict):
        for k in ("name", "label", "value"):
            val = v.get(k)
            if isinstance(val, str) and val.strip():
                return val.strip()
        return ""

    # objet Django avec champ texte clair
    for attr in ("name", "nom", "label"):
        if hasattr(v, attr):
            val = getattr(v, attr)
            if isinstance(val, str) and val.strip():
                return val.strip()

    return ""



def _get_tour_operateur(mission, dossier=None) -> str:
    # 1) dossier d'abord
    if dossier is not None:
        for f in ("client_to_name", "client_to", "tour_operateur", "tour_operator", "client", "client_name"):
            if hasattr(dossier, f):
                val = _normalize_to_str(getattr(dossier, f))
                if val:
                    return val

    # 2) mission ensuite
    for f in ("client_to_name", "tour_operateur_name", "tour_operator_name", "client_to", "tour_operateur", "tour_operator"):
        if hasattr(mission, f):
            val = _normalize_to_str(getattr(mission, f))
            if val:
                return val

    return ""





def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^A-Za-z0-9._-]", "", name)
    return name or "OM.pdf"


def _fmt_time(t) -> str:
    if not t:
        return ""
    try:
        return t.strftime("%H:%M")
    except Exception:
        return str(t)[:5]


def _fmt_date(d) -> str:
    if not d:
        return ""
    try:
        return d.strftime("%d-%m-%Y")
    except Exception:
        return str(d)


def _fmt_dt_iso(iso: str) -> str:
    dt = parse_datetime(iso) if iso else None
    if not dt:
        return ""
    return dt.strftime("%d/%m/%Y %H:%M")


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph((text or "").replace("\n", "<br/>"), style)


def _get_logo_bytes(agence) -> Optional[BytesIO]:
    try:
        lf = getattr(agence, "logo_file", None)
        if not lf or not getattr(lf, "name", None):
            return None
        with default_storage.open(lf.name, "rb") as f:
            return BytesIO(f.read())
    except Exception:
        return None


def _mission_kind_label(mission) -> Tuple[str, bool]:
    mk = (getattr(mission, "main_kind", "") or "").upper()
    is_depart = mk.startswith("D") or mk.startswith("S")
    # you asked you can remove "Transfert/Excursion" title; we keep only DEPART/ARRIVEE.
    kind = "Transfert" if getattr(mission, "type", "") == "T" else "Excursion"
    return kind, is_depart


def _norm(s: str) -> str:
    return (s or "").strip().lower()


# ============================================================
# Data helpers (avoid Pax duplication with hotel_schedule)
# ============================================================

def _group_dossiers_by_hotel(fiche) -> Dict[str, List[Any]]:
    out: Dict[str, List[Any]] = {}
    for d in fiche.dossiers.all():
        hname = ""
        hk = getattr(d, "hotel_fk", None)
        if hk and getattr(hk, "nom", None):
            hname = hk.nom
        else:
            hname = getattr(d, "hotel", "") or getattr(d, "hotel_name", "") or ""
        key = _norm(hname) or "__nohotel__"
        out.setdefault(key, []).append(d)
    return out


def _collect_rows_in_order(mission) -> List[Dict[str, Any]]:
    """
    groups = [{heure, hotel, dossiers[]}]
    If hotel_schedule exists: split dossiers by matching hotel name.
    """
    rows: List[Dict[str, Any]] = []

    fiches = (
        mission.fiches
        .filter(is_deleted=False)
        .prefetch_related("dossiers", "dossiers__hotel_fk")
        .order_by("created_at", "id")
    )

    for f in fiches:
        hs = getattr(f, "hotel_schedule", None) or []

        if isinstance(hs, list) and hs:
            dossiers_by_hotel = _group_dossiers_by_hotel(f)
            used_ids = set()

            for item in hs:
                hotel = (item.get("hotel") or item.get("nom") or "—").strip()

                dt_iso = (
                    item.get("datetime_pickup")
                    or item.get("datetime_depot")
                    or item.get("datetime_airport")
                )
                heure = _fmt_dt_iso(dt_iso) if dt_iso else str(item.get("heure", ""))[:5]

                key = _norm(hotel)
                dossiers = dossiers_by_hotel.get(key)

                # fallback: put remaining dossiers on this line (first come)
                if dossiers is None:
                    dossiers = [d for d in f.dossiers.all() if getattr(d, "id", None) not in used_ids]

                for d in dossiers:
                    if getattr(d, "id", None) is not None:
                        used_ids.add(d.id)

                rows.append({"heure": heure, "hotel": hotel, "dossiers": dossiers})

            remaining = [d for d in f.dossiers.all() if getattr(d, "id", None) not in used_ids]
            if remaining:
                rows.append({"heure": "", "hotel": "—", "dossiers": remaining})

        else:
            rows.append({
                "heure": _fmt_time(getattr(f, "horaires", None)) or "",
                "hotel": getattr(getattr(f, "hotel", None), "nom", "—") if getattr(f, "hotel_id", None) else "—",
                "dossiers": list(f.dossiers.all()),
            })

    return rows


def _sum_total_pax(mission) -> int:
    total = 0
    for f in mission.fiches.filter(is_deleted=False).prefetch_related("dossiers"):
        for d in f.dossiers.all():
            total += int(getattr(d, "pax", 0) or 0)
    return total or int(getattr(mission, "total_pax", 0) or 0)


# ============================================================
# Header blocks (like screenshot: title + left/right infos)
# ============================================================

def _get_zone_label(mission) -> str:
    """
    Zone affichée sous OM N° (ex: HAMMAMET NORD).
    Source UNIQUE: MissionRessource (lieu_arrivee puis lieu_depart).
    => évite de récupérer des codes type TUN/ALG depuis mission.provenance/destination.
    """
    try:
        from b2b.models import MissionRessource  # import local pour éviter cycles

        mr = (
            MissionRessource.objects
            .filter(mission_id=mission.id, is_deleted=False)
            .order_by("-id")
            .first()
        )
        if not mr:
            return ""

        z = (getattr(mr, "lieu_arrivee", "") or "").strip()
        if z and z.upper() not in {"TUN", "ALG", "MIR"}:
            return z.upper()

        z = (getattr(mr, "lieu_depart", "") or "").strip()
        if z and z.upper() not in {"TUN", "ALG", "MIR"}:
            return z.upper()

        return ""
    except Exception:
        return ""




def _get_aeroport_label(mission) -> str:
    for f in ("aeroport", "airport", "aeroport_code"):
        v = getattr(mission, f, None)
        if v:
            s = str(v).strip()
            if s:
                return s.upper()
    return ""


def _get_date_label(mission) -> str:
    # prefer mission.date
    d = getattr(mission, "date", None)
    if d:
        return _fmt_date(d)
    # else from created_at
    ca = getattr(mission, "created_at", None)
    if ca:
        try:
            return ca.strftime("%d-%m-%Y")
        except Exception:
            return ""
    return ""


def _build_top_agence_header(agence, s_right: ParagraphStyle):
    """
    Logo top-left, agency coordinates top-right (as you asked).
    """
    logo_io = _get_logo_bytes(agence)
    logo_flowable = ""
    if logo_io:
        try:
            logo_flowable = Image(logo_io, width=48 * mm, height=26 * mm, kind="proportional")

        except Exception:
            logo_flowable = ""

    nom_agence = (getattr(agence, "nom", None) or getattr(agence, "name", None) or "").strip()
    adresse = (getattr(agence, "adresse", None) or getattr(agence, "address", None) or "").strip()
    ville = (getattr(agence, "ville", None) or getattr(agence, "city", None) or "").strip()
    tel = (getattr(agence, "telephone", None) or getattr(agence, "tel", None) or getattr(agence, "phone", None) or "").strip()
    email = (getattr(agence, "email", None) or getattr(agence, "mail", None) or "").strip()

    lines = []
    if nom_agence:
        lines.append(f"<b>{nom_agence}</b>")
    if adresse:
        lines.append(adresse)
    if ville:
        lines.append(ville)
    if tel:
        lines.append(f"Tél : {tel}")
    if email:
        lines.append(f"Email : {email}")

    right_para = _p("<br/>".join(lines), s_right)

    t = Table([[logo_flowable, right_para]], colWidths=[55 * mm, 131 * mm])

    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _build_depart_header_block(mission, ordre, styles):
    """
    Layout like screenshot:
    Row1: OM N° (left) | DEPART/ARRIVEE (center) | Date (right)
    Row2: ZONE (left)  | (blank)                 | Aéroport (right)
    Row3: BUS (left)   | PAX total (center)      | CHAUFFEUR (right)
    """
    S = styles["S"]
    S_R = styles["S_R"]
    S_C = styles["S_C"]
    H = styles["H"]

    kind_label, is_depart = _mission_kind_label(mission)
    subtitle = "DEPART" if is_depart else "ARRIVEE"

    om_ref = getattr(ordre, "reference", "") or getattr(ordre, "ref", "") or "—"
    zone = _get_zone_label(mission)
    bus = str(getattr(mission, "vehicule", "") or "—")
    date_lbl = _get_date_label(mission)
    aeroport = _get_aeroport_label(mission)
    chauffeur = str(getattr(mission, "chauffeur", "") or "—")
    pax_total = _sum_total_pax(mission)

    row1 = [
        _p(f"<b>OM N° :</b> <b>{om_ref}</b>", S),
        _p(f"<b>{subtitle}</b>", H),
        _p(f"<b>Date :</b> <b>{date_lbl}</b>", S_R),
    ]
    row2 = [
        _p(f"<b>{zone}</b>" if zone else "", S),
        _p("", S_C),
        _p(f"<b>Aéroport :</b> <b>{aeroport}</b>" if aeroport else "<b>Aéroport :</b>", S_R),
    ]
    row3 = [
        _p(f"<b>BUS :</b> <b>{bus}</b>", S),
        _p(f"<b>PAX :</b> <b>{pax_total}</b>", S_C),
        _p(f"<b>CHAUFFEUR :</b> <b>{chauffeur}</b>", S_R),
    ]

    t = Table([row1, row2, row3], colWidths=[62 * mm, 62 * mm, 62 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


# ============================================================
# Table (with merged "Vols" header like screenshot)
# ============================================================

def _build_main_table(mission, s_cell: ParagraphStyle, s_cell_center: ParagraphStyle):
    groups = _collect_rows_in_order(mission)

    # 2 header rows with a merged "Vols" spanning 5 columns
    header_row_0 = [
        _p("<b>DATE ET HEURE</b>", s_cell_center),
        _p("<b>HÖTEL</b>", s_cell),
        _p("<b>PAX</b>", s_cell_center),
        _p("<b>VOLS</b>", s_cell_center),  # span (3..7)
        "", "", "", ""
    ]
    header_row_1 = [
        "", "", "",
        _p("<b>NOM</b>", s_cell),
        _p("<b>PAW</b>", s_cell_center),
        _p("<b>N° VOL</b>", s_cell_center),
        _p("<b>H.VOL</b>", s_cell_center),
        _p("<b>AGENCE</b>", s_cell),
    ]

    data: List[List[Any]] = [header_row_0, header_row_1]
    spans: List[Tuple[Tuple[int, int], Tuple[int, int]]] = []
    # span for "Vols"
    spans.append(((3, 0), (7, 0)))

    # keep track of row index in table
    r = 2

    for g in groups:
        dossiers = g["dossiers"] or []
        if not dossiers:
            # one empty line for group
            data.append([
                _p(g["heure"], s_cell_center),
                _p(g["hotel"], s_cell),
                _p("", s_cell_center),
                _p("", s_cell),
                _p("", s_cell_center),
                _p("", s_cell_center),
                _p("", s_cell_center),
                _p("", s_cell),
            ])
            r += 1
            continue

        pax_group = sum(int(getattr(d, "pax", 0) or 0) for d in dossiers)

        start_r = r
        for i, d in enumerate(dossiers):
            titulaire = (getattr(d, "titulaire", "") or "CLIENT").strip()

            pax_d = int(getattr(d, "pax", 0) or 0)
            numero_vol = (getattr(d, "numero_vol", "") or "").strip()
            h_vol = _fmt_time(getattr(d, "horaires", None)) or ""

            # ✅ AGENCE = client_TO (tour operator), as you asked
            client_to = _get_tour_operateur(mission, d)

            data.append([
                _p(g["heure"] if i == 0 else "", s_cell_center),
                _p(g["hotel"] if i == 0 else "", s_cell),
                _p(str(pax_group) if i == 0 else "", s_cell_center),
                _p(titulaire, s_cell),
                _p(str(pax_d), s_cell_center),
                _p(numero_vol, s_cell_center),
                _p(h_vol, s_cell_center),
                _p(client_to, s_cell),
            ])
            r += 1

        # Merge the 3 first columns (Heure/Hôtel/Pax group) across dossier rows like screenshot
        end_r = r - 1
        if end_r > start_r:
            spans.append(((0, start_r), (0, end_r)))
            spans.append(((1, start_r), (1, end_r)))
            spans.append(((2, start_r), (2, end_r)))

    # A4 usable width = 210 - 24 margins = 186mm
    colWidths = [22*mm, 56*mm, 10*mm, 45*mm, 10*mm, 16*mm, 14*mm, 25*mm]


    table = LongTable(data, colWidths=colWidths, repeatRows=2)

    ts = TableStyle([
        # header style
        ("BACKGROUND", (0, 0), (-1, 1), HEADER_BLUE),
        ("ALIGN", (0, 0), (-1, 1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),

        # grid (thicker like screenshot)
        ("BOX", (0, 0), (-1, -1), 1.2, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 1.0, BORDER),

        # body alignment
        ("ALIGN", (0, 2), (0, -1), "CENTER"),  # Heure
        ("ALIGN", (2, 2), (2, -1), "CENTER"),  # Pax group
        ("ALIGN", (4, 2), (6, -1), "CENTER"),  # Vols columns (pax, no, h.vol)

        # padding (tight/pro)
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ])

    # apply spans
    for (a, b) in spans:
        ts.add("SPAN", a, b)

    table.setStyle(ts)
    return table


# ============================================================
# Observations box (like screenshot)
# ============================================================

def _build_observations_box(text: str, s: ParagraphStyle):
    box_title = _p("<b>OBSERVATIONS :</b>", s)
    box_body = _p(text or "", s)

    t = Table([[box_title], [box_body]], colWidths=[186 * mm], rowHeights=[8*mm, 25*mm])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.2, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.0, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


# ============================================================
# PDF FINAL
# ============================================================

def build_om_pdf_response(mission, request=None, *, ordre=None):
    buff = BytesIO()

    doc = SimpleDocTemplate(
        buff,
        pagesize=A4,
        leftMargin=12*mm,
        rightMargin=12*mm,
        topMargin=10*mm,
        bottomMargin=10*mm,
        title="Ordre de mission",
    )

    base = getSampleStyleSheet()

    # Styles tuned for this layout
    S = ParagraphStyle("S", parent=base["Normal"], fontSize=9, leading=11, alignment=TA_LEFT)
    S_R = ParagraphStyle("S_R", parent=S, alignment=TA_RIGHT)
    S_C = ParagraphStyle("S_C", parent=S, alignment=TA_CENTER)

    H = ParagraphStyle("H", parent=base["Heading2"], fontSize=14, leading=16, alignment=TA_CENTER)

    cell = ParagraphStyle("cell", parent=S, fontSize=8, leading=10)
    cell_c = ParagraphStyle("cell_c", parent=cell, alignment=TA_CENTER)

    styles = {"S": S, "S_R": S_R, "S_C": S_C, "H": H}

    agence = getattr(mission, "agence", None)
    om_ref = getattr(ordre, "reference", "") or getattr(ordre, "ref", "") or "—"

    elems = []

    # 1) agency header: logo left / coords right
    if agence:
        elems.append(_build_top_agence_header(agence, S_R))
        elems.append(Spacer(1, 3*mm))

    # 2) main header block: OM + DEPART/ARRIVEE + Date/Aéroport/Chauffeur/Pax
    elems.append(_build_depart_header_block(mission, ordre, styles))
    elems.append(Spacer(1, 6*mm))

    # 3) table (like screenshot)
    elems.append(_build_main_table(mission, cell, cell_c))
    elems.append(Spacer(1, 10*mm))

    # 4) observations box
    elems.append(_build_observations_box(getattr(mission, "observation", "") or "", S))

    doc.build(elems)
    buff.seek(0)

    filename = _safe_filename(f"OM_{om_ref}.pdf")
    return FileResponse(
        buff,
        as_attachment=True,
        filename=filename,
        content_type="application/pdf",
    )
