from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_usersession"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="is_senior_admin",
            field=models.BooleanField(default=False),
        ),
    ]
