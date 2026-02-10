from django.urls import path, re_path

from .views import healthz_view, spa_view, upload_timetable_file


urlpatterns = [
    path("healthz/", healthz_view, name="healthz"),
    path("upload/", upload_timetable_file, name="upload-exams"),
    re_path(r"^.*$", spa_view, name="spa"),
]
