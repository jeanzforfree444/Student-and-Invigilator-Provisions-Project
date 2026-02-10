import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/dev/howto/deployment/checklist/

# https://docs.djangoproject.com/en/dev/ref/settings/#secret-key
# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret-key-change-me")

# https://docs.djangoproject.com/en/dev/ref/settings/#debug
# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env_flag("DJANGO_DEBUG", "true")
if not DEBUG and SECRET_KEY == "dev-secret-key-change-me":
    raise ValueError("DJANGO_SECRET_KEY must be set in production.")

# https://docs.djangoproject.com/en/dev/ref/settings/#allowed-hosts
ALLOWED_HOSTS = os.getenv(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,0.0.0.0,127.0.0.1,django,psd-jh03.netlify.app,student-and-invigilator-provisions-project-production-0434.up.railway.app",
).split(",")


# Application definition
# https://docs.djangoproject.com/en/dev/ref/settings/#installed-apps
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "allauth",
    "allauth.account",
    "crispy_forms",
    "crispy_bootstrap5",
    "debug_toolbar",
    "corsheaders",
    # Local
    "accounts",
    "timetabling_system",
]

# https://docs.djangoproject.com/en/dev/ref/settings/#middleware
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # WhiteNoise
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "debug_toolbar.middleware.DebugToolbarMiddleware",  # Django Debug Toolbar
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",  # django-allauth
]

# https://docs.djangoproject.com/en/dev/ref/settings/#root-urlconf
ROOT_URLCONF = "django_project.urls"

# https://docs.djangoproject.com/en/dev/ref/settings/#wsgi-application
WSGI_APPLICATION = "django_project.wsgi.application"

# https://docs.djangoproject.com/en/dev/ref/settings/#templates
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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

# https://docs.djangoproject.com/en/dev/ref/settings/#databases
_DB_NAME = os.getenv("DJANGO_DB_NAME", "postgres")
_DB_USER = os.getenv("DJANGO_DB_USER", "postgres")
_DB_PASSWORD = os.getenv("DJANGO_DB_PASSWORD", "postgres")
_DB_HOST = os.getenv("DJANGO_DB_HOST", "student-and-invigilator-provisions-project-production.up.railway.app")
_DB_PORT = os.getenv("DJANGO_DB_PORT", "5432")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _DB_NAME,
        "USER": _DB_USER,
        "PASSWORD": _DB_PASSWORD,
        "HOST": _DB_HOST,
        "PORT": _DB_PORT,
    }
}

if not DEBUG and _DB_PASSWORD in {"", "postgres"}:
    raise ValueError("DJANGO_DB_PASSWORD must be set to a strong value in production.")

# Password validation
# https://docs.djangoproject.com/en/dev/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
    {
        "NAME": "accounts.validators.ComplexityPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/dev/topics/i18n/
# https://docs.djangoproject.com/en/dev/ref/settings/#language-code
LANGUAGE_CODE = "en-us"

# https://docs.djangoproject.com/en/dev/ref/settings/#time-zone
TIME_ZONE = "UTC"

# https://docs.djangoproject.com/en/dev/ref/settings/#std:setting-USE_I18N
USE_I18N = True

# https://docs.djangoproject.com/en/dev/ref/settings/#use-tz
USE_TZ = True

# https://docs.djangoproject.com/en/dev/ref/settings/#locale-paths
LOCALE_PATHS = [BASE_DIR / "locale"]

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

# https://docs.djangoproject.com/en/dev/ref/settings/#static-root
STATIC_ROOT = BASE_DIR / "staticfiles"

# https://docs.djangoproject.com/en/dev/ref/settings/#static-url
STATIC_URL = "/static/"

# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#std:setting-STATICFILES_DIRS
STATICFILES_DIRS = [BASE_DIR / "static"]

# https://whitenoise.readthedocs.io/en/latest/django.html
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Default primary key field type
# https://docs.djangoproject.com/en/stable/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# django-crispy-forms
# https://django-crispy-forms.readthedocs.io/en/latest/install.html#template-packs
CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap5"
CRISPY_TEMPLATE_PACK = "bootstrap5"

# https://docs.djangoproject.com/en/dev/ref/settings/#email-backend
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "false").lower() == "true"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "false").lower() == "true"

# https://docs.djangoproject.com/en/dev/ref/settings/#default-from-email
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "root@localhost")

# django-debug-toolbar
# https://django-debug-toolbar.readthedocs.io/en/latest/installation.html
# https://docs.djangoproject.com/en/dev/ref/settings/#internal-ips
INTERNAL_IPS = ["127.0.0.1"]

# https://docs.djangoproject.com/en/dev/topics/auth/customizing/#substituting-a-custom-user-model
AUTH_USER_MODEL = "accounts.CustomUser"

# django-allauth config
# https://docs.djangoproject.com/en/dev/ref/settings/#site-id
SITE_ID = 1

# https://docs.djangoproject.com/en/dev/ref/settings/#login-redirect-url
LOGIN_REDIRECT_URL = "home"

# https://django-allauth.readthedocs.io/en/latest/views.html#logout-account-logout
ACCOUNT_LOGOUT_REDIRECT_URL = "home"

# https://django-allauth.readthedocs.io/en/latest/installation.html?highlight=backends
AUTHENTICATION_BACKENDS = (
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
)
# https://django-allauth.readthedocs.io/en/latest/configuration.html
ACCOUNT_SESSION_REMEMBER = True
ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE = False
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = "email"
ACCOUNT_EMAIL_REQUIRED = True

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.UserSessionAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "timetabling_system.api.throttles.AdminBypassUserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Override via env if needed.
        "anon": os.getenv("DRF_THROTTLE_ANON_RATE", "50/min"),
        "user": os.getenv("DRF_THROTTLE_USER_RATE", "200/min"),
        "login": os.getenv("DRF_THROTTLE_LOGIN_RATE", "10/min"),
    },
}

# Allow bulk admin actions (e.g., deleting many ExamVenue rows) without hitting the
# default per-request field cap.
DATA_UPLOAD_MAX_NUMBER_FIELDS = int(os.getenv("DJANGO_DATA_UPLOAD_MAX_NUMBER_FIELDS", "50000"))
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_ADAPTER = "accounts.adapters.AccountAdapter"

# Toggle to block resigned invigilators from logging in.
BLOCK_RESIGNED_INVIGILATORS = False

# CORS setup for local frontend
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True

# https://docs.djangoproject.com/en/dev/ref/settings/#csrf-trusted-origins
_cors_env = env_list("DJANGO_CORS_ALLOWED_ORIGINS")
_csrf_env = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

CORS_ALLOWED_ORIGINS = _cors_env or [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CSRF_TRUSTED_ORIGINS = _csrf_env or [
    "http://localhost:8000",  # Default Django dev server
    "http://127.0.0.1:8000",  # Alternative local address
    "http://localhost:3000",  # React dev server
    "http://127.0.0.1:3000",  # Alternative React dev server
]

# CSRF & cookie hardening (toggle secure cookies via env to keep local dev workable)
DJANGO_SECURE_COOKIES = env_flag("DJANGO_SECURE_COOKIES", "false")
CSRF_COOKIE_SECURE = DJANGO_SECURE_COOKIES
SESSION_COOKIE_SECURE = DJANGO_SECURE_COOKIES
CSRF_COOKIE_HTTPONLY = env_flag("DJANGO_CSRF_HTTPONLY", "true")
SESSION_COOKIE_SAMESITE = os.getenv("DJANGO_SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.getenv("DJANGO_CSRF_COOKIE_SAMESITE", "Lax")
SECURE_SSL_REDIRECT = env_flag("DJANGO_SECURE_SSL_REDIRECT", "false")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
