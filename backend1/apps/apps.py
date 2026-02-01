# b2b/apps.py
from django.apps import AppConfig


class B2BConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps"

    def ready(self):
        import apps.signals_audit  # noqa
        import apps.signals_profiles  # noqa
