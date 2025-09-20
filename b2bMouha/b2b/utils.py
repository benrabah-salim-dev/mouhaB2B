from datetime import datetime
from django.utils import timezone

def generate_unique_reference(prefix, model):
    """
    Génère une référence unique avec préfixe et incrément si nécessaire
    Exemple : OM-20250906-0001, OM-20250906-0002
    - prefix: préfixe de la référence (ex: "OM", "PRE")
    - model: modèle Django sur lequel vérifier l'unicité
    """
    today_str = timezone.now().strftime("%Y%m%d")
    base = f"{prefix}-{today_str}-"
    counter = 1
    ref = f"{base}{counter:04d}"

    # Boucle tant que la référence existe déjà
    while model.objects.filter(reference=ref).exists():
        counter += 1
        ref = f"{base}{counter:04d}"

    return ref


def fmt_date(dt, fmt="%d-%m-%Y %H:%M"):
    """
    Formate une date ou retourne "—" si None ou invalide
    """
    if not dt:
        return "—"
    try:
        return dt.strftime(fmt)
    except Exception:
        return "—"


def first_nonempty(*vals, default="—"):
    """
    Retourne la première valeur non vide parmi vals
    """
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return default


def get_attr_any(obj, names, default=None):
    """
    Retourne la première valeur trouvée parmi plusieurs attributs possibles
    """
    for n in names:
        if hasattr(obj, n):
            v = getattr(obj, n)
            if v not in [None, ""]:
                return v
    return default
