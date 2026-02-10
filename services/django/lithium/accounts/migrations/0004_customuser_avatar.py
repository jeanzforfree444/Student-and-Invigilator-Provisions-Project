from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_customuser_phone"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="avatar",
            field=models.TextField(blank=True, null=True),
        ),
    ]
