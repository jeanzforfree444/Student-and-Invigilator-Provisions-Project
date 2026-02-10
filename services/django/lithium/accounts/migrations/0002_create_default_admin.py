from django.contrib.auth.hashers import make_password
from django.db import migrations


DEFAULT_USERNAME = "test1"
DEFAULT_EMAIL = "test1@example.com"
DEFAULT_PASSWORD = "test2test2"


def create_default_admin(apps, _schema_editor):
    User = apps.get_model("accounts", "CustomUser")
    Token = apps.get_model("authtoken", "Token")
    user, created = User.objects.get_or_create(
        username=DEFAULT_USERNAME,
        defaults={
            "email": DEFAULT_EMAIL,
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
            "password": make_password(DEFAULT_PASSWORD),
        },
    )
    if not created:
        # Ensure the seeded admin keeps admin privileges and credentials for dev convenience.
        user.email = user.email or DEFAULT_EMAIL
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.password = make_password(DEFAULT_PASSWORD)
        user.save()

    # Pre-create an API token for the admin user (replace any blank/old token).
    Token.objects.filter(user=user).delete()
    Token.objects.create(user=user)


def remove_default_admin(apps, _schema_editor):
    User = apps.get_model("accounts", "CustomUser")
    User.objects.filter(username=DEFAULT_USERNAME, email=DEFAULT_EMAIL).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("authtoken", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_default_admin, remove_default_admin),
    ]
