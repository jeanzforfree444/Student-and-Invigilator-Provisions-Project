from django.contrib.auth.decorators import login_required
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST
from django.views.generic import TemplateView

from .services import ingest_upload_result
from .utils.excel_parser import parse_excel_file
from .utils.venue_ingest import upsert_venues


class HomePageView(TemplateView):
    template_name = "timetabling_system/home.html"


class AboutPageView(TemplateView):
    template_name = "timetabling_system/about.html"


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


@csrf_protect
@login_required
@require_POST
def upload_timetable_file(request):
    upload = request.FILES.get("file")
    if not upload:
        return JsonResponse(
            {"status": "error", "message": "No file uploaded."}, status=400
        )

    if hasattr(upload, "seek"):
        upload.seek(0)

    try:
        result = parse_excel_file(upload)
    except Exception as exc:  # pragma: no cover - defensive fallback
        return JsonResponse(
            {
                "status": "error",
                "message": "Failed to parse uploaded file.",
                "details": str(exc),
            },
            status=400,
        )

    if result.get("status") == "ok":
        ingest_summary = ingest_upload_result(
            result,
            file_name=getattr(upload, "name", "uploaded_file"),
            uploaded_by=request.user,
        )
        if ingest_summary:
            result["ingest"] = ingest_summary
            result["records_created"] = ingest_summary.get("created", 0)
            result["records_updated"] = ingest_summary.get("updated", 0)

    status_code = 200 if result.get("status") == "ok" else 400
    return JsonResponse(result, status=status_code)
