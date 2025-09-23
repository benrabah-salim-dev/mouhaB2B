# b2b/views/fiches.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
from io import BytesIO
from datetime import datetime, time as time_cls
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.http import HttpResponse, FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from django.db import transaction
from django.core.paginator import Paginator
from django.db.models import Q, Prefetch

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets

# PDF (ReportLab)
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from b2b.models import (
    Dossier, Hotel, PreMission, Mission, OrdreMission,
    FicheMouvement, FicheMouvementItem, Vehicule, Chauffeur, AgenceVoyage,
)
from b2b.serializers import (
    FicheMouvementSerializer, FicheMouvementItemSerializer,
)
from .helpers import (
    _user_role, _user_agence,
    _ensure_same_agence_or_superadmin,
    generate_unique_reference,
)

# ---------------------------------------------------------------------
# Utils internes
# ---------------------------------------------------------------------
def _to_aware(dt):
    if not dt:
        return None
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

def _parse_dt(s):
    if not s:
        return None
    dt = parse_datetime(s)
    if not dt:
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            dt = None
    return _to_aware(dt) if dt else None

def _infer_type(dossier):
    if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None):
        return "D"
    if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None):
        return "A"
    return None

def _unique_or_none(iterable):
    s = {x for x in iterable if x}
    return list(s)[0] if len(s) == 1 else None

def _bounds_from_dossiers(dossiers, type_code, given_date=None):
    if type_code == "A":
        times = [d.heure_arrivee for d in dossiers if d.heure_arrivee]
    else:
        times = [d.heure_depart for d in dossiers if d.heure_depart]
    times = [_to_aware(t) for t in times if t]
    if times:
        return (min(times), max(times))
    if given_date:
        d = parse_date(given_date)
        if d:
            start = timezone.make_aware(datetime.combine(d, time_cls.min))
            end = timezone.make_aware(datetime.combine(d, time_cls.max))
            return (start, end)
    return (None, None)

# ---------------------------------------------------------------------
# Liste “plate” des fiches/missions pour le front
# ---------------------------------------------------------------------
class FichesMouvementListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def _display_reference(self, mission):
        try:
            dt = getattr(mission, "date_debut", None)
            if dt:
                d = dt.date()
                return f"M_{d.isoformat()}"
        except Exception:
            pass
        return getattr(mission, "reference", None)

    def _first_nonempty(self, *vals):
        for v in vals:
            if v is None:
                continue
            s = str(v).strip()
            if s and s.lower() not in {"nan", "none", "null", "-"}:
                return s
        return None

    def _format_clients(self, dossier):
        if not dossier:
            return ""
        raw = self._first_nonempty(
            getattr(dossier, "nom_reservation", None),
            getattr(dossier, "nom", None),
            getattr(dossier, "name", None),
            getattr(dossier, "titulaire", None),
            getattr(dossier, "titular", None),
            getattr(dossier, "clients", None),
        )
        if not raw:
            return ""
        return re.sub(r"\s+", " ", str(raw)).strip()

    def get(self, request):
        qs = (
            Mission.objects.all()
            .select_related("premission", "premission__dossier", "premission__dossier__hotel")
            .prefetch_related(
                Prefetch(
                    "ordres_mission",
                    queryset=OrdreMission.objects.select_related("vehicule", "chauffeur")
                )
            )
        )

        role = _user_role(request.user)
        if role == "adminagence":
            qs = qs.filter(premission__agence=_user_agence(request.user))
        elif role != "superadmin":
            return Response({"results": [], "count": 0, "page": 1, "page_size": 20, "total_pages": 0}, status=200)

        search = (request.query_params.get("search") or "").strip()
        type_code = (request.query_params.get("type") or "").strip().upper()
        aeroport_filter = (request.query_params.get("aeroport") or "").strip().upper()
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(premission__dossier__reference__icontains=search)
                | Q(details__icontains=search)
                | Q(ordres_mission__vehicule__immatriculation__icontains=search)
                | Q(ordres_mission__chauffeur__nom__icontains=search)
                | Q(ordres_mission__chauffeur__prenom__icontains=search)
                | Q(premission__dossier__nom_reservation__icontains=search)
            ).distinct()

        if date_from:
            try:
                df = timezone.make_aware(datetime.fromisoformat(date_from + "T00:00:00"))
                qs = qs.filter(date_debut__gte=df)
            except Exception:
                pass
        if date_to:
            try:
                dt_ = timezone.make_aware(datetime.fromisoformat(date_to + "T23:59:59.999999"))
                qs = qs.filter(date_fin__lte=dt_)
            except Exception:
                pass

        rows = []
        for m in qs.order_by("-date_debut"):
            pre = getattr(m, "premission", None)
            dossier = getattr(pre, "dossier", None) if pre else None
            ordre = m.ordres_mission.all().first()

            t = _infer_type(dossier) if dossier else None
            apt = dossier.aeroport_arrivee if (dossier and t == "A") else dossier.aeroport_depart if (dossier and t == "D") else None

            if type_code in ("A", "D") and t != type_code:
                continue
            if aeroport_filter and (apt or "").strip().upper() != aeroport_filter:
                continue

            ville = getattr(dossier, "ville", "") if dossier else ""
            hotel_name = getattr(getattr(dossier, "hotel", None), "nom", "") if dossier else ""
            ref_display = self._display_reference(m)
            obs = (getattr(dossier, "observation", "") or "").strip()
            clients_disp = self._format_clients(dossier)

            rows.append(
                {
                    "id": getattr(m, "id", None),
                    "reference": ref_display,
                    "type": t,
                    "aeroport": apt,
                    "trajet": ville,
                    "ville": ville,
                    "hotel": hotel_name,
                    "date_debut": getattr(m, "date_debut", None),
                    "date_fin": getattr(m, "date_fin", None),
                    "vehicule": getattr(getattr(ordre, "vehicule", None), "immatriculation", None) if ordre else None,
                    "chauffeur": (
                        f"{getattr(getattr(ordre, 'chauffeur', None), 'prenom', '')} {getattr(getattr(ordre, 'chauffeur', None), 'nom', '')}".strip()
                        if ordre and getattr(ordre, "chauffeur", None)
                        else None
                    ),
                    "dossier_reference": getattr(dossier, "reference", None) if dossier else None,
                    "pax": (
                        getattr(dossier, "nombre_personnes_arrivee", None) if t == "A"
                        else getattr(dossier, "nombre_personnes_retour", None)
                    ) if dossier else None,
                    "created_at": getattr(pre, "date_creation", None) if pre else None,
                    "observation": obs,
                    "clients": clients_disp,
                }
            )

        paginator = Paginator(rows, page_size)
        page_obj = paginator.get_page(page)
        return Response(
            {
                "results": list(page_obj.object_list),
                "count": paginator.count,
                "page": page_obj.number,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
            },
            status=200,
        )

# ---------------------------------------------------------------------
# Création groupée des fiches/missions + (optionnel) ordres
# ---------------------------------------------------------------------
class CreerFicheMouvementAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        data = request.data
        dossier_ids = data.get("dossier_ids", []) or []
        type_code = data.get("type")
        date_key = data.get("date")
        aeroport = data.get("aeroport")
        dossier_refs = data.get("dossier_references", []) or []
        trajet = data.get("trajet")
        date_debut_str = data.get("date_debut")
        date_fin_str = data.get("date_fin")
        vehicule_id = data.get("vehicule_id")
        chauffeur_id = data.get("chauffeur_id")

        role = _user_role(request.user)
        if role not in ("superadmin", "adminagence"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Accès refusé.")

        qs = Dossier.objects.all()
        if role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))
        if dossier_ids:
            qs = qs.filter(id__in=dossier_ids)
        if dossier_refs:
            qs = qs | Dossier.objects.filter(reference__in=dossier_refs)
        dossiers = list(qs.distinct())
        if not dossiers:
            return Response({"error": "Aucun dossier valide trouvé."}, status=400)

        if not type_code:
            inferred = {_infer_type(d) for d in dossiers}
            inferred.discard(None)
            if len(inferred) == 1:
                type_code = inferred.pop()
            else:
                return Response({"error": "Impossible de déduire un type unique (A/D)."}, status=400)
        else:
            type_code = str(type_code).strip().upper()
            if type_code not in ("A", "D"):
                return Response({"error": "Type invalide (A/D)."}, status=400)

        if not aeroport:
            aeroport = _unique_or_none([d.aeroport_arrivee for d in dossiers]) if type_code == "A" else _unique_or_none([d.aeroport_depart for d in dossiers])

        date_debut = _parse_dt(date_debut_str) if date_debut_str else None
        date_fin = _parse_dt(date_fin_str) if date_fin_str else None
        if not date_debut or not date_fin:
            calc_start, calc_end = _bounds_from_dossiers(dossiers, type_code, given_date=date_key)
            date_debut = date_debut or calc_start
            date_fin = date_fin or calc_end
        if not date_debut or not date_fin:
            return Response({"error": "Aucune plage temporelle exploitable."}, status=400)

        vehicule = get_object_or_404(Vehicule, id=vehicule_id) if vehicule_id else None
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id) if chauffeur_id else None
        if vehicule:
            _ensure_same_agence_or_superadmin(request, vehicule.agence)
        if chauffeur:
            _ensure_same_agence_or_superadmin(request, chauffeur.agence)

        obs_list = data.get("observations") or []
        obs_by_hotel = data.get("observations_par_hotel") or {}

        def _fmt_line(ref, txt, pax=None):
            ref_s = str(ref).strip() if ref is not None else "—"
            pax_s = f" ({pax} pax)" if pax not in (None, "", 0) else ""
            txt_s = str(txt).strip()
            return f"[{ref_s}{pax_s}] {txt_s}" if txt_s else ""

        obs_lines = []
        for o in obs_list:
            line = _fmt_line(o.get("ref"), o.get("obs"), None)
            if line:
                obs_lines.append(line)
        for hotel, items in (obs_by_hotel or {}).items():
            hotel = (hotel or "").strip() or "(Sans hôtel)"
            hotel_lines = []
            for it in items or []:
                l = _fmt_line(it.get("ref"), it.get("obs"), it.get("pax"))
                if l:
                    hotel_lines.append(l)
            if hotel_lines:
                obs_lines.append(f"{hotel}: " + " | ".join(hotel_lines))
        remarques_text = " ; ".join(obs_lines).strip()

        created_premissions, created_missions, created_ordres = [], [], []
        for dossier in dossiers:
            if role == "adminagence":
                _ensure_same_agence_or_superadmin(request, dossier.agence)
            premission = PreMission.objects.create(
                reference=generate_unique_reference("PRE", PreMission),
                agence=dossier.agence,
                dossier=dossier,
                trajet_prevu=trajet or aeroport or "",
                remarques=remarques_text or "",
            )
            created_premissions.append(premission.reference)

            mission = premission.creer_mission(
                date_debut=date_debut,
                date_fin=date_fin,
                details=f"Mission {('Arrivée' if type_code=='A' else 'Départ')} – Dossier {dossier.reference} – APT: {aeroport or '-'}",
            )
            created_missions.append(getattr(mission, "reference", None))

            if vehicule and chauffeur:
                ordre = mission.creer_ordre_mission(
                    vehicule=vehicule,
                    chauffeur=chauffeur,
                    date_depart=mission.date_debut,
                    date_retour=mission.date_fin,
                    trajet=mission.premission.trajet_prevu or mission.premission.dossier.ville
                )
                created_ordres.append(getattr(ordre, "reference", None))

        return Response(
            {
                "message": "Fiches de mouvement / missions créées avec succès" + ("" if not created_ordres else " (ordres de mission inclus)"),
                "type": type_code,
                "aeroport": aeroport,
                "date_debut": date_debut.isoformat(),
                "date_fin": date_fin.isoformat(),
                "premissions": created_premissions,
                "missions": [r for r in created_missions if r],
                "ordres_mission": [r for r in created_ordres if r],
                "count": {
                    "premissions": len(created_premissions),
                    "missions": len([r for r in created_missions if r]),
                    "ordres": len([r for r in created_ordres if r]),
                },
            },
            status=201,
        )

# ---------------------------------------------------------------------
# Génération PDF d’un ordre de mission
# ---------------------------------------------------------------------
def ordre_mission_pdf(request, ordre_id):
    try:
        ordre = (
            OrdreMission.objects
            .select_related(
                "mission",
                "mission__premission",
                "mission__premission__agence",
                "mission__premission__dossier",
                "mission__premission__dossier__hotel",
                "vehicule",
                "chauffeur",
            )
            .get(id=ordre_id)
        )
    except OrdreMission.DoesNotExist:
        return HttpResponse("Ordre de mission non trouvé.", status=404)

    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    agence = getattr(pre, "agence", None)
    dossier = getattr(pre, "dossier", None)
    vehicule = ordre.vehicule
    chauffeur = ordre.chauffeur

    def fmt_dt(dt, fmt="%d-%m-%Y %H:%M"):
        try:
            return dt.strftime(fmt) if dt else "—"
        except Exception:
            return "—"

    def first_nonempty(*vals, default="—"):
        for v in vals:
            if v is None:
                continue
            s = str(v).strip()
            if s:
                return s
        return default

    def get_attr_any(obj, names, default=None):
        for n in names:
            if hasattr(obj, n):
                v = getattr(obj, n)
                if v not in [None, ""]:
                    return v
        return default

    def infer_type(d):
        if not d:
            return None
        if getattr(d, "heure_depart", None) and not getattr(d, "heure_arrivee", None):
            return "D"
        if getattr(d, "heure_arrivee", None) and not getattr(d, "heure_depart", None):
            return "A"
        details = (mission.details or "").lower()
        if "arriv" in details:
            return "A"
        if "départ" in details or "depart" in details:
            return "D"
        return None

    type_code = infer_type(dossier) or "D"

    hotel_nom = first_nonempty(getattr(getattr(dossier, "hotel", None), "nom", None))
    ville = first_nonempty(getattr(dossier, "ville", None), hotel_nom)
    trajet_affiche = first_nonempty(getattr(pre, "trajet_prevu", None), ville)

    if type_code == "A":
        aeroport = first_nonempty(getattr(dossier, "aeroport_arrivee", None))
        pax = getattr(dossier, "nombre_personnes_arrivee", 0) or 0
        num_vol = first_nonempty(getattr(dossier, "num_vol_arrivee", None))
        h_vol = fmt_dt(getattr(dossier, "heure_arrivee", None), "%H:%M")
        heure_ligne = fmt_dt(getattr(dossier, "heure_arrivee", None), "%H:%M")
    else:
        aeroport = first_nonempty(getattr(dossier, "aeroport_depart", None))
        pax = getattr(dossier, "nombre_personnes_retour", 0) or 0
        num_vol = first_nonempty(getattr(dossier, "num_vol_retour", None))
        h_vol = fmt_dt(getattr(dossier, "heure_depart", None), "%H:%M")
        heure_ligne = fmt_dt(getattr(dossier, "heure_depart", None), "%H:%M")

    tour_operateur = first_nonempty(
        getattr(dossier, "tour_operateur", None),
        getattr(dossier, "nom_reservation", None),
        default="-",
    )

    km_depart = get_attr_any(ordre, ["km_depart", "kilometrage_depart", "km_debut", "km_start"])
    km_retour = get_attr_any(ordre, ["km_retour", "kilometrage_retour", "km_fin", "km_end"])
    try:
        km_total = (km_retour or 0) - (km_depart or 0) if (km_depart is not None and km_retour is not None) else None
    except Exception:
        km_total = None

    styles = getSampleStyleSheet()
    style_normal = styles["Normal"]
    style_small_right = ParagraphStyle("small_right", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=10, leading=12)
    style_subtle = ParagraphStyle("subtle", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    style_title = ParagraphStyle("title", parent=styles["Heading1"], alignment=TA_CENTER, fontSize=16, spaceAfter=8)
    style_h2 = ParagraphStyle("h2", parent=styles["Heading2"], alignment=TA_LEFT, fontSize=12, textColor=colors.HexColor("#111827"))

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="ordre_{ordre.reference}.pdf"'
    doc = SimpleDocTemplate(response, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.4*cm, bottomMargin=1.4*cm)
    elements = []

    logo = Paragraph("", style_normal)
    try:
        logo_path = os.path.join(settings.BASE_DIR, "b2b", "static", "b2b", "logo_agence.png")
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=3.2 * cm, height=3.2 * cm)
    except Exception:
        pass

    agence_nom = first_nonempty(getattr(agence, "nom", None))
    agence_adresse = first_nonempty(getattr(agence, "adresse", None))
    agence_tel = first_nonempty(getattr(agence, "telephone", None))
    agence_email = first_nonempty(getattr(agence, "email", None))

    agence_info = Paragraph(
        f"<b>{agence_nom}</b><br/>{agence_adresse}<br/>"
        f"Tél : {agence_tel} &nbsp;&nbsp;|&nbsp;&nbsp; Email : {agence_email}",
        style_small_right,
    )
    header = Table([[logo, agence_info]], colWidths=[6.5 * cm, 11.5 * cm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header)
    elements.append(Spacer(1, 6))
    elements.append(Table([[""]], colWidths=[18*cm], style=TableStyle([("LINEBELOW", (0,0), (-1,0), 0.5, colors.HexColor("#e5e7eb"))])))
    elements.append(Spacer(1, 6))

    titre = "ARRIVÉE" if type_code == "A" else "DEPART"
    elements.append(Paragraph(titre, style_title))
    elements.append(Spacer(1, 6))

    l1 = [
        Paragraph(f"<b>OM N° :</b> {ordre.reference}", style_normal),
        Paragraph(f"<b>Date :</b> {fmt_dt(ordre.date_depart, '%d-%m-%Y')}", style_normal),
    ]
    l2 = [
        Paragraph(f"<b>{trajet_affiche}</b>", style_normal),
        Paragraph(f"<b>Aéroport :</b> {aeroport}", style_normal),
    ]
    veh_label = f"{getattr(vehicule, 'marque', '')} {getattr(vehicule, 'model', '')} ({getattr(vehicule, 'immatriculation', '')})"
    l3 = [
        Paragraph(f"<b>BUS :</b> {veh_label}", style_normal),
        Paragraph(f"<b>TOTAL :</b> {pax}", style_normal),
        Paragraph(f"<b>CHAUFFEUR :</b> {getattr(chauffeur,'nom','')} {getattr(chauffeur,'prenom','')}", style_normal),
    ]

    infos_tbl = Table([l1, l2], colWidths=[9 * cm, 9 * cm], style=TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    l3_tbl = Table([l3], colWidths=[7.2 * cm, 4.2 * cm, 6.6 * cm], style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elements.append(infos_tbl)
    elements.append(l3_tbl)
    elements.append(Spacer(1, 10))

    table_data = [[
        Paragraph("<b>Heure</b>", style_normal),
        Paragraph("<b>Hôtel</b>", style_normal),
        Paragraph("<b>PAX</b>", style_normal),
        Paragraph("<b>N° VOL</b>", style_normal),
        Paragraph("<b>H. VOL</b>", style_normal),
        Paragraph("<b>Tour Opérateur</b>", style_normal),
    ]]
    table_data.append([heure_ligne, ville, str(pax), num_vol, h_vol, tour_operateur])

    passagers_tbl = Table(table_data, colWidths=[2.6*cm, 5.4*cm, 1.8*cm, 3.0*cm, 2.6*cm, 4.4*cm])
    passagers_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#111827")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
    ]))
    elements.append(passagers_tbl)
    elements.append(Spacer(1, 10))

    km_rows = [[
        Paragraph("<b>Kilométrage départ</b>", style_normal),
        Paragraph(str(km_depart) if km_depart is not None else "—", style_normal),
        Paragraph("<b>Kilométrage retour</b>", style_normal),
        Paragraph(str(km_retour) if km_retour is not None else "—", style_normal),
        Paragraph("<b>Total</b>", style_normal),
        Paragraph(str(km_total) if km_total is not None else "—", style_normal),
    ]]
    km_tbl = Table(km_rows, colWidths=[4.2*cm, 2.0*cm, 4.2*cm, 2.0*cm, 2.0*cm, 2.6*cm])
    km_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#9ca3af")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(km_tbl)
    elements.append(Spacer(1, 8))

    obs_pre = (getattr(pre, "remarques", "") or "").strip()
    obs_dossier = (
        getattr(dossier, "observation", None)
        or getattr(dossier, "observations", None)
        or getattr(dossier, "remarques", None)
        or getattr(dossier, "notes", None)
        or getattr(dossier, "commentaires", None)
        or ""
    )
    obs_dossier = (obs_dossier or "").strip()
    parts = []
    for p_ in (obs_pre, obs_dossier):
        if p_ and p_ not in parts:
            parts.append(p_)
    observations = " | ".join(parts) if parts else "—"

    elements.append(Paragraph("Observations :", style_h2))
    obs_box = Table([[Paragraph(observations if observations != "—" else "&nbsp;", style_subtle)]], colWidths=[18*cm])
    obs_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fcfcfd")),
        ("MINROWHEIGHT", (0, 0), (-1, -1), 2.2*cm),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(obs_box)

    elements.append(Spacer(1, 12))
    sign_tbl = Table(
        [[Paragraph("Signature Chauffeur", style_subtle), Paragraph("Cachet & Signature Responsable", style_subtle)]],
        colWidths=[9*cm, 9*cm]
    )
    sign_tbl.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 28),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LINEABOVE", (0, 0), (0, 0), 0.4, colors.HexColor("#9ca3af")),
        ("LINEABOVE", (1, 0), (1, 0), 0.4, colors.HexColor("#9ca3af")),
    ]))
    elements.append(sign_tbl)

    doc.build(elements)
    return response

# ---------------------------------------------------------------------
# CRUD Fiche Mouvement / Items
# ---------------------------------------------------------------------
class FicheMouvementViewSet(viewsets.ModelViewSet):
    serializer_class = FicheMouvementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvement.objects.all().select_related('agence', 'created_by').prefetch_related('items__dossier')
        role = _user_role(self.request.user)
        agence_id = self.request.query_params.get('agence')
        if role == 'superadmin':
            return qs if not agence_id else qs.filter(agence_id=agence_id)
        if role == 'adminagence':
            return qs.filter(agence=_user_agence(self.request.user))
        return FicheMouvement.objects.none()

    def _validate_dossiers_same_agence(self, agence, dossier_ids):
        if not dossier_ids:
            return []
        dossiers = list(Dossier.objects.filter(id__in=dossier_ids))
        if len(dossiers) != len(set(dossier_ids)):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Certains dossiers sont introuvables.")
        for d in dossiers:
            if d.agence_id != getattr(agence, 'id', None):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(f"Dossier {d.reference} appartient à une autre agence.")
        return dossiers

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        role = _user_role(request.user)
        user_agence = _user_agence(request.user)

        body_agence_id = request.data.get('agence') or request.query_params.get('agence')
        if role == 'superadmin':
            if not body_agence_id:
                return Response({"error": "agence requise pour superadmin."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=body_agence_id)
        else:
            if not user_agence:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Aucune agence associée.")
            agence = user_agence

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', [])
        dossiers = self._validate_dossiers_same_agence(agence, dossier_ids)

        fiche = FicheMouvement.objects.create(
            agence=agence,
            name=serializer.validated_data.get('name', ''),
            type=serializer.validated_data['type'],
            date=serializer.validated_data['date'],
            aeroport=serializer.validated_data.get('aeroport', ''),
            created_by=request.user,
        )

        for d in dossiers:
            FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        out = self.get_serializer(fiche)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=201, headers=headers)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(fiche, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', None)

        for f in ['name', 'type', 'date', 'aeroport']:
            if f in serializer.validated_data:
                setattr(fiche, f, serializer.validated_data[f])
        fiche.save()

        if dossier_ids is not None:
            dossiers = self._validate_dossiers_same_agence(fiche.agence, dossier_ids)
            FicheMouvementItem.objects.filter(fiche=fiche).delete()
            for d in dossiers:
                FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        return Response(self.get_serializer(fiche).data)

    def destroy(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        return super().destroy(request, *args, **kwargs)

class FicheMouvementItemViewSet(viewsets.ModelViewSet):
    serializer_class = FicheMouvementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvementItem.objects.select_related('fiche', 'fiche__agence', 'dossier')
        role = _user_role(self.request.user)
        if role == 'superadmin':
            return qs.all()
        if role == 'adminagence':
            return qs.filter(fiche__agence=_user_agence(self.request.user))
        return FicheMouvementItem.objects.none()

    def perform_create(self, serializer):
        fiche = serializer.validated_data.get('fiche')
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_update(self, serializer):
        fiche = serializer.instance.fiche
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_same_agence_or_superadmin(self.request, instance.fiche.agence)
        instance.delete()
