# b2b/views/helpers.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Iterable, Optional
from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework.permissions import BasePermission


# ---------- Rôles / agence ----------
def _user_role(user) -> Optional[str]:
    """Retourne 'superadmin', 'adminagence' ou None."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return "superadmin"
    # profile.role si disponible
    prof = getattr(user, "profile", None)
    return getattr(prof, "role", None)


def _user_agence(user):
    """Retourne l'agence associée au profil (ou None)."""
    prof = getattr(user, "profile", None)
    return getattr(prof, "agence", None)


class IsSuperAdminRole(BasePermission):
    """Permission DRF: autorise seulement les superadmins (ou superuser Django)."""
    def has_permission(self, request, view) -> bool:
        return _user_role(request.user) == "superadmin"


def _ensure_same_agence_or_superadmin(request, agence_obj_or_id: Any):
    """
    Lève PermissionDenied si l'utilisateur n'est pas superadmin et
    que l'agence ciblée est différente de la sienne.
    """
    role = _user_role(request.user)
    if role == "superadmin":
        return
    if role != "adminagence":
        raise PermissionDenied("Accès refusé.")
    my_agence = _user_agence(request.user)
    if not my_agence:
        raise PermissionDenied("Aucune agence associée au compte.")
    target_id = getattr(agence_obj_or_id, "id", agence_obj_or_id)
    if int(my_agence.id) != int(target_id):
        raise PermissionDenied("Vous n'avez pas accès à cette agence.")


# ---------- Références ----------
def generate_unique_reference(prefix: str, model_cls) -> str:
    """
    Génère une référence unique 'PREFIX-YYYYmmddHHMMSS' (avec suffixe -i si collision).
    """
    base = f"{prefix}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
    if not model_cls.objects.filter(reference=base).exists():
        return base
    i = 2
    while True:
        ref = f"{base}-{i}"
        if not model_cls.objects.filter(reference=ref).exists():
            return ref
        i += 1


# ---------- Fuzzy 'find_best_match' light ----------
def find_best_match(keywords: Iterable[str], columns: Iterable[str], min_score: float = 0.30) -> Optional[str]:
    """
    Version légère: tente d'abord une égalité insensible à la casse/espaces,
    puis un 'substring contains'. Pas d'embeddings requis.
    """
    if not keywords or not columns:
        return None

    # Normalisation
    def norm(s: str) -> str:
        return "".join(ch for ch in str(s).strip().lower())

    kw_norm = [norm(k) for k in keywords if k]
    cols = list(columns)

    # 1) égalité stricte normalisée
    for c in cols:
        cn = norm(c)
        if any(cn == k for k in kw_norm):
            return c

    # 2) substring
    for c in cols:
        cn = norm(c)
        if any(k in cn for k in kw_norm):
            return c

    return None


def _parse_int_cell(v: Any) -> int:
    """Retourne un entier >=0 depuis une cellule qui peut contenir texte/float/None."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0
    s = str(v).strip()
    if not s or s.lower() in {"nan", "none", "null", "-"}:
        return 0
    # garde uniquement chiffres (gère '12 pax', 'BB: 1', '03', etc.)
    m = re.findall(r"\d+", s)
    if not m:
        try:
            return max(0, int(float(s)))
        except Exception:
            return 0
    try:
        return max(0, int(m[0]))
    except Exception:
        return 0
