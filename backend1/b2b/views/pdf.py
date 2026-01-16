# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from django.conf import settings
from django.http import HttpResponse

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
)

from b2b.models import OrdreMission


def ordre_mission_pdf(request, ordre_id):
    try:
        ordre = (
            OrdreMission.objects
            .select_related("mission", "mission__agence")
            .prefetch_related(
                "mission__fiches",
                "mission__affectations__vehicule",
                "mission__affectations__chauffeur",
            )
            .get(id=ordre_id)
        )
    except OrdreMission.DoesNotExist:
        return HttpResponse("Ordre de mission non trouvé.", status=404)

    mission = ordre.mission
    agence = getattr(mission, "agence", None)

    # ===== Styles =====
    styles = getSampleStyleSheet()
    style_normal = styles["Normal"]
    style_small_right = ParagraphStyle(
        "small_right",
        parent=styles["Normal"],
        alignment=TA_RIGHT,
        fontSize=10,
        leading=12,
    )
    style_title = ParagraphStyle(
        "title",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=16,
        spaceAfter=8,
    )
    style_table_header = ParagraphStyle(
        "table_header",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=9,
        leading=11,
        spaceAfter=0,
        spaceBefore=0,
    )
    style_table_cell = ParagraphStyle(
        "table_cell",
        parent=styles["Normal"],
        fontSize=9,
        leading=11,
    )

    # ===== Réponse HTTP / doc =====
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="ordre_{ordre.reference}.pdf"'
    doc = SimpleDocTemplate(
        response,
        pagesize=A4,
        leftMargin=1.7 * cm,
        rightMargin=1.7 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.4 * cm,
    )
    elements = []

    # ===== En-tête agence + logo =====
    logo = Paragraph("", style_normal)
    try:
        logo_path = os.path.join(
            settings.BASE_DIR, "b2b", "static", "b2b", "logo_agence.png"
        )
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=3.2 * cm, height=3.2 * cm)
    except Exception:
        pass

    agence_nom = getattr(agence, "nom", "—") or "—"
    agence_adresse = getattr(agence, "adresse", "—") or "—"
    agence_tel = getattr(agence, "telephone", "—") or "—"
    agence_email = getattr(agence, "email", "—") or "—"

    agence_info = Paragraph(
        f"<b>{agence_nom}</b><br/>{agence_adresse}<br/>"
        f"Tél : {agence_tel} &nbsp;&nbsp;|&nbsp;&nbsp; Email : {agence_email}",
        style_small_right,
    )
    header = Table([[logo, agence_info]], colWidths=[6.5 * cm, 11.5 * cm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header)
    elements.append(Spacer(1, 6))

    # ===== Titre =====
    elements.append(Paragraph("ORDRE DE MISSION", style_title))
    elements.append(Spacer(1, 8))

    # ===== Infos mission (entête OM) =====
    date_mission = getattr(mission, "date", None) or "—"
    numero_vol = getattr(mission, "numero_vol", None) or "—"
    heure_vol = getattr(mission, "heure_vol", None) or "—"
    aeroport = getattr(mission, "aeroport", None) or "—"

    # Récup véhicule / chauffeur via affectations
    affect = list(
        mission.affectations
        .select_related("vehicule", "chauffeur")
        .all()
    )
    vehicule = affect[0].vehicule if affect and affect[0].vehicule_id else None
    chauffeur = affect[0].chauffeur if affect and affect[0].chauffeur_id else None

    vehicule_label = (
        f"{vehicule.marque} {vehicule.modele} ({vehicule.immatriculation})"
        if vehicule else "—"
    )
    chauffeur_label = str(chauffeur) if chauffeur else "—"

    fiches = mission.fiches.all().order_by("horaires", "hotel")
    total_pax = sum(f.pax or 0 for f in fiches)

    elements.append(Paragraph(f"Référence : {ordre.reference}", style_normal))
    elements.append(Paragraph(f"Date mission : {date_mission}", style_normal))
    elements.append(Paragraph(f"Vol : {numero_vol}", style_normal))
    elements.append(Paragraph(f"Heure vol : {heure_vol}", style_normal))
    elements.append(Paragraph(f"Aéroport : {aeroport}", style_normal))
    elements.append(Paragraph(f"Véhicule : {vehicule_label}", style_normal))
    elements.append(Paragraph(f"Chauffeur : {chauffeur_label}", style_normal))
    elements.append(Paragraph(f"Total pax : {total_pax}", style_normal))
    elements.append(Spacer(1, 12))

    # ===== Tableau des ramassages (fiches mouvement) =====
    data = [
        [
            Paragraph("Heure", style_table_header),
            Paragraph("Hôtel", style_table_header),
            Paragraph("Pax", style_table_header),
            Paragraph("N° vol", style_table_header),
            Paragraph("H. vol", style_table_header),
            Paragraph("Agence", style_table_header),
        ]
    ]

    def _fmt_time(t):
        if not t:
            return ""
        s = str(t)
        # gère TimeField ou string "HH:MM[:SS]"
        if len(s) >= 5 and s[2] == ":":
            return s[:5]
        return s

    for f in fiches:
        heure = _fmt_time(getattr(f, "horaires", None))
        hotel = f.hotel or (f.hotel_fk.nom if f.hotel_fk_id else "")
        pax = f.pax or 0
        num_vol = f.numero_vol or numero_vol or ""
        h_vol = heure_vol or ""
        agence_client = f.client_to or ""

        data.append(
            [
                Paragraph(heure or "—", style_table_cell),
                Paragraph(hotel or "—", style_table_cell),
                Paragraph(str(pax), style_table_cell),
                Paragraph(num_vol or "—", style_table_cell),
                Paragraph(h_vol or "—", style_table_cell),
                Paragraph(agence_client or "—", style_table_cell),
            ]
        )

    table = Table(
        data,
        colWidths=[2.2 * cm, 6.2 * cm, 1.4 * cm, 3.0 * cm, 2.2 * cm, 4.0 * cm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.25, colors.black),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (2, 1), (2, -1), "CENTER"),  # Pax centré
            ]
        )
    )
    elements.append(table)

    # ===== Génération PDF =====
    doc.build(elements)
    return response
