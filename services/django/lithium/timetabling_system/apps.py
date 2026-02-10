from django.apps import AppConfig


class TimetablingSystemConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'timetabling_system'

    def ready(self):
        # Import signal handlers
        from timetabling_system import signals  # noqa: F401
