from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.generic import TemplateView


class HomePageView(TemplateView):
    template_name = "exams/home.html"


class AboutPageView(TemplateView):
    template_name = "exams/about.html"


def healthz_view(_request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError as exc:
        return JsonResponse(
            {
                "status": "error",
                "services": {
                    "database": {"status": "error", "error": str(exc)},
                },
            },
            status=503,
        )

    return JsonResponse(
        {
            "status": "ok",
            "services": {
                "database": {"status": "ok"},
            },
        }
    )
