# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import timedelta
import os
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

# ====== Sécurité / Environnement ======
SECRET_KEY = 'django-insecure-_)$+#)m-deh&1z8-go@+4k5iy_36--cfys@n6@_eei$rv0chd3'
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ====== Apps ======
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
        "django_extensions",
            "b2b.apps.B2BConfig",
]

# ====== Middleware ======
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",  
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "b2b.middleware.current_user.CurrentUserMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "b2bMouha.urls"

# ====== Templates (React build en prod si tu sers via Django) ======
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [os.path.join(BASE_DIR, "frontend", "build")],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "b2bMouha.wsgi.application"

# ====== Base de données (ajuste si tu utilises MySQL en local) ======
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": config("DB_NAME", default="b2b"),
        "USER": config("DB_USER", default="root"),
        "PASSWORD": config("DB_PASSWORD", default="root"),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# ====== Password validators ======
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ====== Internationalisation ======
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Tunis"
USE_TZ = True
USE_I18N = True

# ====== Static (React + Django) ======
STATIC_URL = "/static/"
from pathlib import Path as _Path
STATICFILES_DIRS = []
_FRONT_BUILD_STATIC = _Path(BASE_DIR) / "frontend" / "build" / "static"
if _FRONT_BUILD_STATIC.exists():
    STATICFILES_DIRS = [str(_FRONT_BUILD_STATIC)]
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")


# ====== CORS (dev) ======
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=True, cast=bool)
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000,http://127.0.0.1:3000",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True

# ====== DRF / Auth ======
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=4),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Pour imports massifs
DATA_UPLOAD_MAX_NUMBER_FIELDS = int(config("DATA_UPLOAD_MAX_NUMBER_FIELDS", default=10000))


# En DEV : juste afficher le mail dans la console
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True

EMAIL_HOST_USER = "benrabah.salim.dev@gmail.Com"
EMAIL_HOST_PASSWORD = "bqbd waxq mchj xkcg"

DEFAULT_FROM_EMAIL = "SMEKS <tonmail@gmail.com>"


MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "AIzaSyB9oNOHHMOeYYUFXERyHkGlF2Y3_wFZESA")