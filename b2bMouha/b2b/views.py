from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from .models import AgenceVoyage, Vehicule, Chauffeur, Dossier, PreMission, Mission, OrdreMission, Touriste, Hotel
from .serializers import (
    AgenceVoyageSerializer, VehiculeSerializer, ChauffeurSerializer, DossierSerializer,
    PreMissionSerializer, MissionSerializer, OrdreMissionSerializer, UserSerializer
)
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from .utils import generate_unique_reference
from django.contrib.auth.models import User
from django.http import HttpResponse
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework import status
import pandas as pd
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from datetime import datetime

# Fonction utilitaire pour enrichir les infos d'hôtel via Nominatim (OpenStreetMap)
def get_hotel_info_from_nominatim(hotel_name, country='Tunisie'):
    query = hotel_name
    if country:
        query += f", {country}"
        
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': hotel_name,
        'format': 'json',
        'limit': 1,
        'addressdetails': 1,
        'accept-language': 'fr'
    }
    headers = {
        "User-Agent": "mouhaB2B/1.0"
    }
    try:
        response = requests.get(url, params=params, headers=headers)
        data = response.json()
        if not data:
            return None, (None, None)
        return data[0]['display_name'], (data[0]['lat'], data[0]['lon'])
    except Exception:
        return None, (None, None)


class LoginView(APIView):
    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = User.objects.filter(username=username).first()
        if not user or not user.check_password(password):
            return Response({"detail": "Nom d'utilisateur ou mot de passe incorrect"}, status=401)

        refresh = RefreshToken.for_user(user)

        # Valeurs par défaut
        role = 'superadmin' if user.is_superuser else 'adminagence'
        agence_id = None

        if hasattr(user, 'profile'):
            if user.profile.role:
                role = user.profile.role
            if user.profile.agence:
                agence_id = user.profile.agence.id

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": role,
            "agence_id": agence_id,
        })



class UserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_data = {
            'username': request.user.username,
            'email': request.user.email,
        }
        return Response(user_data)

class AgenceVoyageViewSet(viewsets.ModelViewSet):
    serializer_class = AgenceVoyageSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return AgenceVoyage.objects.all()

class UserMeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class VehiculeViewSet(viewsets.ModelViewSet):
    serializer_class = VehiculeSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Vehicule.objects.all()

class ChauffeurViewSet(viewsets.ModelViewSet):
    serializer_class = ChauffeurSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        agence_id = self.request.query_params.get('agence')
        if agence_id:
            return Chauffeur.objects.filter(agence_id=agence_id)
        return Chauffeur.objects.all()

class DossierViewSet(viewsets.ModelViewSet):
    serializer_class = DossierSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if hasattr(user, 'profile') and user.profile.role == 'adminagence':
            return Dossier.objects.filter(agence=user.profile.agence)

        return Dossier.objects.all()  # superadmin

class PreMissionViewSet(viewsets.ModelViewSet):
    serializer_class = PreMissionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        agence_id = self.request.query_params.get('agence')
        if agence_id:
            return PreMission.objects.filter(agence_id=agence_id)
        return PreMission.objects.all()

class MissionViewSet(viewsets.ModelViewSet):
    serializer_class = MissionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        premission_id = self.request.query_params.get('premission')
        if premission_id:
            return Mission.objects.filter(premission_id=premission_id)
        return Mission.objects.all()

class OrdreMissionViewSet(viewsets.ModelViewSet):
    queryset = OrdreMission.objects.all()
    serializer_class = OrdreMissionSerializer
    permission_classes = [AllowAny]

def ordre_mission_pdf(request, ordre_id):
    try:
        ordre = OrdreMission.objects.get(id=ordre_id)
    except OrdreMission.DoesNotExist:
        return HttpResponse("Ordre de mission non trouvé.", status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="ordre_{ordre.reference}.pdf"'

    p = canvas.Canvas(response, pagesize=A4)
    width, height = A4

    # En-tête : Nom et adresse de l'agence
    agence = ordre.mission.premission.agence
    p.setFont("Helvetica-Bold", 14)
    p.drawString(2 * cm, height - 2 * cm, agence.nom)
    p.setFont("Helvetica", 12)
    p.drawString(2 * cm, height - 2.7 * cm, agence.adresse)

    # Ligne horizontale pour séparer l'en-tête
    p.line(2 * cm, height - 3 * cm, width - 2 * cm, height - 3 * cm)

    # Contenu principal (ordre de mission)
    p.setFont("Helvetica-Bold", 12)
    y = height - 4 * cm
    p.drawString(2 * cm, y, f"Ordre de mission : {ordre.reference}")
    y -= 1 * cm
    p.setFont("Helvetica", 11)
    p.drawString(2 * cm, y, f"Mission : {ordre.mission.reference}")
    y -= 0.7 * cm
    p.drawString(2 * cm, y, f"Vehicule : {ordre.Vehicule}")
    y -= 0.7 * cm
    p.drawString(2 * cm, y, f"Chauffeur : {ordre.chauffeur}")
    y -= 0.7 * cm
    p.drawString(2 * cm, y, f"Trajet : {ordre.trajet}")
    y -= 0.7 * cm
    p.drawString(2 * cm, y, f"Date départ : {ordre.date_depart.strftime('%d/%m/%Y %H:%M')}")
    y -= 0.7 * cm
    p.drawString(2 * cm, y, f"Date retour : {ordre.date_retour.strftime('%d/%m/%Y %H:%M')}")

    # Signature en bas à droite
    p.setFont("Helvetica-Oblique", 10)
    signature_text = "Signature de l'agence"
    p.drawString(width - 7 * cm, 2 * cm, signature_text)
    p.line(width - 9 * cm, 1.8 * cm, width - 3 * cm, 1.8 * cm)

    p.showPage()
    p.save()

    return response






class ImporterDossierAPIView(APIView):
    parser_classes = [MultiPartParser]

    def detect_type_da(self, valeur):
        if not valeur:
            return None
        val = str(valeur).strip().upper()
        if val in ['D', 'DEPART', 'DEPARTURE', 'S', 'SALIDA', 'P', 'PARTENZA']:
            return 'D'  # Départ
        elif val in ['A', 'ARRIVEE', 'ARRIVAL', 'L', 'LLEGADA']:
            return 'A'  # Arrivée
        else:
            return None

    def to_datetime_or_none(self, val):
        dt = pd.to_datetime(val, errors='coerce')
        if pd.isna(dt):
            return None
        return dt

    def post(self, request, *args, **kwargs):
        fichier_excel = request.FILES.get('file')
        if not fichier_excel:
            return Response({'error': 'Aucun fichier envoyé.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.read_excel(fichier_excel)
        except Exception as e:
            return Response({'error': f'Erreur lecture fichier Excel: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        dossiers_crees = []

        for index, row in df.iterrows():
            # Recherche colonne D/A (fr) ou L/S (es) ou variantes
            da_val = None
            for col_da in ['L/S', 'A/D', 'AD', 'D/A', 'DA', 'Tipo', 'Tipo_Vuelo']:
                if col_da in df.columns and pd.notna(row.get(col_da)):
                    da_val = row.get(col_da)
                    break
            da = self.detect_type_da(da_val)

            if da is None:
                print(f"Ligne {index}: type D/A non détecté, ligne ignorée")
                continue

            # Recherche ville : plusieurs colonnes possibles
            ville = None
            for col_ville in ['Ciudad', 'Ville', 'ville', 'City']:
                if col_ville in df.columns and pd.notna(row.get(col_ville)):
                    ville = str(row.get(col_ville)).strip()
                    break

            # Recherche pays : priorité sur 'Ciudad', sinon 'Org'
            pays = None
            for col_pays in ['Ciudad', 'pays', 'Pays', 'Org','PROVENANCE']:
                if col_pays in df.columns and pd.notna(row.get(col_pays)):
                    pays = str(row.get(col_pays)).strip()
                    break
            if not pays:
                print(f"Ligne {index}: pas de pays détecté, ligne ignorée")
                continue

            # Recherche référence unique
            ref = None
            for col_ref in ['Ref.T.O.', 'Ntra.Ref', 'reference', 'Reference', 'REF']:
                if col_ref in df.columns and pd.notna(row.get(col_ref)):
                    ref = str(row.get(col_ref)).strip()
                    break
            if not ref:
                print(f"Ligne {index}: pas de référence valide, ligne ignorée")
                continue

  # Recherche hôtel
            hotel_nom = None
            for col_hotel in ['Hotel.1', 'Hotel', 'hotel']:
                if col_hotel in df.columns and pd.notna(row.get(col_hotel)):
                    hotel_nom = str(row.get(col_hotel)).strip()
                    break
            hotel = None
            if hotel_nom:
                adresse, (lat, lon) = get_hotel_info_from_nominatim(hotel_nom, country=pays)
                hotel, created = Hotel.objects.get_or_create(nom=hotel_nom)
            if not created and (not hotel.adresse and adresse):
                hotel.adresse = adresse
                hotel.save()



            
            
            date_val = row.get('Dia') if 'Dia' in df.columns else None
            horaire_val = None
            for col_horaire in ['HORAIRES', 'Hora', 'Horaire', 'horaire', 'Fecha Formalización']:
                if col_horaire in df.columns and pd.notna(row.get(col_horaire)):
                    horaire_val = row.get(col_horaire)
                    break

            datetime_val = None
            try:
                if date_val is not None and horaire_val is not None:
                    datetime_str = f"{date_val} {horaire_val}"
                    datetime_val = pd.to_datetime(datetime_str, errors='coerce')
                elif date_val is not None:
                    datetime_val = pd.to_datetime(date_val, errors='coerce')
                elif horaire_val is not None:
                    datetime_val = pd.to_datetime(horaire_val, errors='coerce')
            except Exception as e:
                print(f"Ligne {index}: erreur conversion date+heure : {e}")
                datetime_val = None

            # Initialisation
            heure_arrivee = None
            heure_depart = None
            aeroport_arrivee = None
            aeroport_depart = None
            num_vol_arrivee = ""
            num_vol_retour = ""
            nombre_personnes_arrivee = 0
            nombre_personnes_retour = 0

            if da == 'A':  # Inversion: on remplit les champs DEPART ici
                heure_depart = datetime_val
                aeroport_depart = row.get('Dst') or ""
                num_vol_retour = row.get('Vuelo') or row.get('num_vol_retour') or ""
                nombre_personnes_retour = int(row.get('Pax') or 0)

                heure_arrivee = None
                aeroport_arrivee = row.get('Org') or ""
                num_vol_arrivee = ""
                nombre_personnes_arrivee = 0

            elif da == 'D':  # Inversion: on remplit les champs ARRIVEE ici
                heure_arrivee = datetime_val
                aeroport_arrivee = row.get('Org') or ""
                num_vol_arrivee = row.get('Vuelo') or row.get('num_vol_arrivee') or ""
                nombre_personnes_arrivee = int(row.get('Pax') or 0)

                heure_depart = None
                aeroport_depart = row.get('Dst') or ""
                num_vol_retour = ""
                nombre_personnes_retour = 0

            else:
                print(f"Ligne {index}: type D/A inconnu, ligne ignorée")
                continue

            dossier_data = {
                'agence': None,
                'ville': ville or "",
                'aeroport_arrivee': aeroport_arrivee or "Aucun",
                'num_vol_arrivee': num_vol_arrivee,
                'heure_arrivee': heure_arrivee,
                'hotel': hotel,
                'nombre_personnes_arrivee': nombre_personnes_arrivee,
                'nom_reservation': row.get('Titular') or row.get('nom_reservation') or "",
                'aeroport_depart': aeroport_depart or "",
                'heure_depart': heure_depart,
                'num_vol_retour': num_vol_retour,
                'nombre_personnes_retour': nombre_personnes_retour,
            }

            try:
                obj, created = Dossier.objects.update_or_create(
                    reference=ref,
                    defaults=dossier_data
                )
                if created:
                    dossiers_crees.append(ref)
                    print(f"Ligne {index}: Dossier créé : {ref}")
                else:
                    print(f"Ligne {index}: Dossier mis à jour : {ref}")
            except Exception as e:
                print(f"Ligne {index}: erreur création/modification : {e}")

        return Response({'message': 'Importation terminée', 'dossiers_crees': dossiers_crees}, status=status.HTTP_200_OK)


class CreerFicheMouvementAPIView(APIView):
    def post(self, request):
        # Récupérer les données envoyées dans le body JSON
        dossier_refs = request.data.get('dossier_references', [])
        trajet = request.data.get('trajet')
        date_debut_str = request.data.get('date_debut')
        date_fin_str = request.data.get('date_fin')
        vehicule_id = request.data.get('vehicule_id')
        chauffeur_id = request.data.get('chauffeur_id')

        # Vérification des champs obligatoires
        if not all([trajet, date_debut_str, date_fin_str, vehicule_id, chauffeur_id]) or not isinstance(dossier_refs, list) or not dossier_refs:
            return Response({'error': 'Tous les champs sont obligatoires et au moins un dossier doit être sélectionné.'}, status=status.HTTP_400_BAD_REQUEST)

        # Conversion des chaînes de caractères en objets datetime
        try:
            date_debut = datetime.fromisoformat(date_debut_str)
            date_fin = datetime.fromisoformat(date_fin_str)
        except Exception as e:
            return Response({'error': f'Format date invalide: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        # Récupération des objets véhicule et chauffeur
        vehicule = get_object_or_404(Vehicule, id=vehicule_id)
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id)

        created_ordres = []

        # Boucle sur chaque référence de dossier sélectionnée
        for ref in dossier_refs:
            try:
                dossier = Dossier.objects.get(reference=ref)
            except Dossier.DoesNotExist:
                continue  # Si la référence de dossier est invalide, on l'ignore

            # Création de la fiche de mouvement (PreMission)
            premission = PreMission.objects.create(
                reference=generate_unique_reference(prefix="PRE-"),
                agence=dossier.agence,
                dossier=dossier,
                trajet_prevu=trajet,
                remarques=""
            )

            # Création de la mission associée
            mission = premission.creer_mission(
                date_debut=date_debut,
                date_fin=date_fin,
                details=f"Mission pour le dossier {dossier.reference}"
            )

            # Création de l'ordre de mission avec véhicule et chauffeur
            ordre = mission.creer_ordre_mission(
                vehicule=vehicule,
                chauffeur=chauffeur,
                date_depart=date_debut,
                date_retour=date_fin,
                trajet=trajet
            )

            created_ordres.append(ordre.reference)

        return Response({
            'message': 'Fiches de mouvement, missions et ordres de mission créés avec succès',
            'ordres_mission': created_ordres
        }, status=status.HTTP_201_CREATED)