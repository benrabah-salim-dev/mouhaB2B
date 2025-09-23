# b2b/views/languages.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.generics import ListAPIView

from b2b.models import LanguageMapping
from b2b.serializers import LanguageMappingSerializer

class LanguageMappingListView(ListAPIView):
    """
    Liste publique des mappings de langues utilisés pour l'import / normalisation.
    """
    queryset = LanguageMapping.objects.all()
    serializer_class = LanguageMappingSerializer
    permission_classes = [AllowAny]
