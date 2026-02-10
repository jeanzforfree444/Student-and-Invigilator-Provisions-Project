from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_create_default_admin"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="phone",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
