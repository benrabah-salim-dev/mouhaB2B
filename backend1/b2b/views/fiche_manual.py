# b2b/views/fiches_manual.py
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from b2b.models import FicheMouvement, AgenceVoyage, Hotel, Zone
from b2b.serializers import FicheMouvementSerializer


class FicheMouvementManualCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data.copy()
        user = request.user

        # Vérifier agence
        agence_id = data.get("agence")
        if not agence_id:
            return Response(
                {"agence": "Champ obligatoire"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            agence = AgenceVoyage.objects.get(id=agence_id)
        except AgenceVoyage.DoesNotExist:
            return Response(
                {"agence": "Agence introuvable"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data["created_by"] = user.id  # obligatoire dans serializer

        # 🔥 Utilise ton serializer existant (FicheMouvementSerializer)
        serializer = FicheMouvementSerializer(data=data)

        if serializer.is_valid():
            fiche = serializer.save()
            return Response(FicheMouvementSerializer(fiche).data, status=201)

        return Response(serializer.errors, status=400)
