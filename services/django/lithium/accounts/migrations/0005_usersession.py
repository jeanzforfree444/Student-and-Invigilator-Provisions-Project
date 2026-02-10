from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_customuser_avatar"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserSession",
            fields=[
                (
                    "key",
                    models.CharField(
                        default=accounts.models._generate_session_key,
                        editable=False,
                        max_length=40,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen", models.DateTimeField(auto_now=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, null=True)),
                ("ip_address", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
