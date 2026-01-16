# b2b/apps.py
from django.apps import AppConfig


class B2BConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "b2b"

    def ready(self):
        import b2b.signals_audit  # noqa
        import b2b.signals_profiles  # noqa
