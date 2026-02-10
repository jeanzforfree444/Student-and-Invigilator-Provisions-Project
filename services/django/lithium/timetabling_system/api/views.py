import csv
from io import StringIO, BytesIO
import zipfile
from typing import Optional

from rest_framework import permissions, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db import models, transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from datetime import date, timedelta
from django.conf import settings
from django.core.mail import EmailMessage
from django.http import HttpResponse
from django.utils.text import slugify
from django.utils import dateparse
from django.contrib.auth import get_user_model
import calendar
from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    Invigilator,
    InvigilatorAssignment,
    InvigilatorAvailability,
    InvigilatorDietContract,
    InvigilatorRestriction,
    Venue,
    Student,
    StudentExam,
    Provisions,
    Notification,
    Announcement,
    Announcement,
    SlotChoices,
    Diet,
    Diet,
)
from timetabling_system.services import ingest_upload_result
from timetabling_system.services.venue_matching import venue_supports_caps
from timetabling_system.services.upload_processor import (
    _allowed_venue_types,
    _core_exam_timing,
    _extra_time_minutes,
    _exam_requires_computer,
    _needs_accessible_venue,
    _needs_computer,
    _needs_separate_room,
    _required_capabilities,
    compute_exam_date_range,
    rerun_provision_allocation,
)
from timetabling_system.utils.excel_parser import parse_excel_file
from timetabling_system.utils.venue_ingest import upsert_venues
from .serializers import (
    ExamSerializer,
    ExamVenueSerializer,
    ExamVenueWriteSerializer,
    InvigilatorAssignmentSerializer,
    InvigilatorSerializer,
    VenueSerializer,
    VenueWriteSerializer,
    NotificationSerializer,
    AnnouncementSerializer,
    DietSerializer,
    AnnouncementSerializer,
    DietSerializer,
)


class ProvisionExportView(APIView):
    """
    Admin CSV export of provision allocations, optionally filtered by school.
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request, *args, **kwargs):
        school = request.query_params.get("school")
        separate = request.query_params.get("separate")
        admin_user = getattr(request, "user", None)
        provisions_qs = Provisions.objects.select_related("student", "exam")
        if school:
            provisions_qs = provisions_qs.filter(exam__exam_school__iexact=school)

        # Map student+exam to their allocated ExamVenue (with venue)
        student_exam_map = {
            (se.student_id, se.exam_id): se
            for se in StudentExam.objects.select_related("exam_venue__venue", "student", "exam")
        }

        def build_csv(provisions):
            buffer = StringIO()
            writer = csv.writer(buffer)
            writer.writerow(
                [
                    "Date",
                    "Start Time",
                    "End Time",
                    "Exam Code",
                    "Exam Name",
                    "School",
                    "Student Name",
                    "Provisions",
                    "Additional Info",
                    "Venue",
                ]
            )

            for provision in provisions:
                student_exam = student_exam_map.get((provision.student_id, provision.exam_id))
                exam_venue = getattr(student_exam, "exam_venue", None) if student_exam else None
                venue = getattr(exam_venue, "venue", None)
                start = getattr(exam_venue, "start_time", None)
                length = getattr(exam_venue, "exam_length", None)
                end = start + timedelta(minutes=length) if start and length else None

                writer.writerow(
                    [
                        start.date().isoformat() if start else "",
                        start.time().isoformat(timespec="minutes") if start else "",
                        end.time().isoformat(timespec="minutes") if end else "",
                        provision.exam.course_code,
                        provision.exam.exam_name,
                        provision.exam.exam_school,
                        provision.student.student_name,
                        ", ".join(provision.provisions or []),
                        provision.notes or "",
                        venue.venue_name if venue else "",
                    ]
                )
            return buffer.getvalue()

        def admin_display_name(user) -> str:
            if not user:
                return "Administrator"
            first_name = (getattr(user, "first_name", "") or "").strip()
            return first_name or getattr(user, "username", "") or getattr(user, "email", "") or "Administrator"

        def log_export_message(target_label: str):
            Notification.objects.create(
                type=Notification.NotificationType.ADMIN_MESSAGE,
                admin_message=f"{admin_display_name(admin_user)} exported student provisions for {target_label}.",
                invigilator_message="",
                timestamp=timezone.now(),
                triggered_by=admin_user,
            )

        if separate:
            schools = list(
                provisions_qs.values_list("exam__exam_school", flat=True).distinct()
            )
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for school_name in schools:
                    filename_parts = ["provisions_export"]
                    if school_name:
                        filename_parts.append(slugify(str(school_name)))
                    else:
                        filename_parts.append("unspecified")
                    filename = f'{ "_".join(filename_parts) }.csv'
                    school_qs = provisions_qs.filter(exam__exam_school=school_name)
                    zip_file.writestr(filename, build_csv(school_qs))
            response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
            response["Content-Disposition"] = 'attachment; filename="provisions_export_by_school.zip"'
            log_export_message("all schools")
            return response

        csv_body = build_csv(provisions_qs)
        response = HttpResponse(csv_body, content_type="text/csv")
        filename_parts = ["provisions_export"]
        if school:
            filename_parts.append(slugify(str(school)))
        response["Content-Disposition"] = f'attachment; filename="{ "_".join(filename_parts) }.csv"'
        log_export_message(school or "all schools")
        return response


class InvigilatorTimetableExportView(APIView):
    """
    Admin CSV export of invigilator timetables for one or more invigilators.
    """

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        def admin_display_name(user) -> str:
            if not user:
                return "Administrator"
            first_name = (getattr(user, "first_name", "") or "").strip()
            return first_name or getattr(user, "username", "") or getattr(user, "email", "") or "Administrator"

        invigilator_ids = request.data.get("invigilator_ids")
        if invigilator_ids is None:
            invigilator_id = request.data.get("invigilator_id")
            invigilator_ids = [invigilator_id] if invigilator_id is not None else []

        only_confirmed = bool(request.data.get("only_confirmed", False))
        include_cancelled = bool(request.data.get("include_cancelled", False))
        include_provisions = bool(request.data.get("include_provisions", False))

        cleaned_ids = []
        for raw_id in invigilator_ids:
            if not str(raw_id).strip():
                continue
            try:
                cleaned_ids.append(int(raw_id))
            except (TypeError, ValueError):
                return Response(
                    {"detail": f"Invalid invigilator id: {raw_id}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        invigilator_ids = cleaned_ids
        if not invigilator_ids:
            return Response({"detail": "invigilator_ids is required."}, status=status.HTTP_400_BAD_REQUEST)

        assignments = (
            InvigilatorAssignment.objects.select_related(
                "invigilator",
                "invigilator__user",
                "exam_venue__exam",
                "exam_venue__venue",
            )
            .filter(invigilator_id__in=invigilator_ids)
            .order_by("invigilator_id", "assigned_start")
        )

        if only_confirmed:
            assignments = assignments.filter(confirmed=True, cancel=False)
        else:
            assignments = assignments.filter(
                models.Q(cancel=False) | models.Q(cancel=True, confirmed=False)
            )
        if include_cancelled:
            cancelled_qs = (
                InvigilatorAssignment.objects.select_related(
                    "invigilator",
                    "invigilator__user",
                    "exam_venue__exam",
                    "exam_venue__venue",
                )
                .filter(invigilator_id__in=invigilator_ids, cancel=True, confirmed=True)
            )
            assignments = (assignments | cancelled_qs).order_by("invigilator_id", "assigned_start")

        invigilator_map = {
            inv.id: inv
            for inv in Invigilator.objects.filter(id__in=invigilator_ids).select_related("user")
        }
        invigilator_names = [
            (
                getattr(inv.user, "get_full_name", lambda: "")() if inv and inv.user else ""
            )
            or (inv.preferred_name if inv else "")
            or (inv.full_name if inv else "")
            or f"Invigilator #{inv.id}"
            for inv in invigilator_map.values()
        ]
        if len(invigilator_names) == 1:
            target_label = invigilator_names[0]
        else:
            target_label = f"{len(invigilator_names)} invigilators"

        exam_venue_ids = list(
            assignments.values_list("exam_venue_id", flat=True).distinct()
        )
        provisions_by_venue: dict[int, set[str]] = {}
        notes_by_venue: dict[int, list[str]] = {}
        if include_provisions and exam_venue_ids:
            student_exam_rows = list(
                StudentExam.objects.filter(exam_venue_id__in=exam_venue_ids).values(
                    "exam_venue_id",
                    "student_id",
                    "exam_id",
                )
            )
            provision_lookup = {
                (p.student_id, p.exam_id): p
                for p in Provisions.objects.filter(
                    exam_id__in={row["exam_id"] for row in student_exam_rows},
                    student_id__in={row["student_id"] for row in student_exam_rows},
                )
            }

            for row in student_exam_rows:
                provision = provision_lookup.get((row["student_id"], row["exam_id"]))
                if not provision:
                    continue
                venue_id = row["exam_venue_id"]
                if provision.provisions:
                    provisions_by_venue.setdefault(venue_id, set()).update(provision.provisions)
                if provision.notes:
                    notes_by_venue.setdefault(venue_id, []).append(provision.notes)

        def _format_dt(value):
            if not value:
                return ""
            local = timezone.localtime(value) if timezone.is_aware(value) else value
            return local.isoformat(timespec="minutes")

        def _csv_for(assignments_list):
            buffer = StringIO()
            writer = csv.writer(buffer)
            headers = [
                "invigilator_id",
                "invigilator_name",
                "username",
                "assignment_id",
                "assignment_status",
                "exam_venue_id",
                "venue_name",
                "exam_name",
                "course_code",
                "exam_school",
                "exam_start",
                "exam_end",
                "exam_length_minutes",
                "assigned_start",
                "assigned_end",
                "role",
                "break_time_minutes",
                "assignment_notes",
            ]
            if include_provisions:
                headers.extend(["student_provisions", "provision_notes"])
            writer.writerow(headers)

            for assignment in assignments_list:
                invigilator = assignment.invigilator
                exam_venue = assignment.exam_venue
                exam = exam_venue.exam if exam_venue else None
                venue = exam_venue.venue if exam_venue else None
                exam_start = getattr(exam_venue, "start_time", None)
                exam_length = getattr(exam_venue, "exam_length", None)
                exam_end = exam_start + timedelta(minutes=exam_length) if exam_start and exam_length else None

                if assignment.cancel and assignment.confirmed:
                    status_label = "cancelled"
                elif assignment.cancel and not assignment.confirmed:
                    status_label = "cancellation requested"
                elif assignment.confirmed:
                    status_label = "confirmed"
                else:
                    status_label = "pending confirmation"

                venue_provisions = sorted(provisions_by_venue.get(assignment.exam_venue_id, set()))
                venue_notes = notes_by_venue.get(assignment.exam_venue_id, [])
                unique_notes = []
                for note in venue_notes:
                    if note not in unique_notes:
                        unique_notes.append(note)

                row = [
                    invigilator.id if invigilator else "",
                    invigilator.preferred_name or invigilator.full_name if invigilator else "",
                    getattr(invigilator.user, "username", "") if invigilator and invigilator.user else "",
                    assignment.id,
                    status_label,
                    assignment.exam_venue_id,
                    venue.venue_name if venue else "",
                    exam.exam_name if exam else "",
                    exam.course_code if exam else "",
                    exam.exam_school if exam else "",
                    _format_dt(exam_start),
                    _format_dt(exam_end),
                    exam_length if exam_length is not None else "",
                    _format_dt(assignment.assigned_start),
                    _format_dt(assignment.assigned_end),
                    assignment.role or "",
                    assignment.break_time_minutes or 0,
                    assignment.notes or "",
                ]
                if include_provisions:
                    row.extend([", ".join(venue_provisions), " | ".join(unique_notes)])
                writer.writerow(row)
            return buffer.getvalue()

        if len(invigilator_ids) == 1:
            invigilator = assignments.first().invigilator if assignments.exists() else None
            if not invigilator:
                invigilator = Invigilator.objects.filter(id=invigilator_ids[0]).select_related("user").first()
            name = (
                getattr(invigilator.user, "username", "") if invigilator and invigilator.user else ""
            ) or (invigilator.preferred_name if invigilator else "") or (invigilator.full_name if invigilator else "")
            filename = f"{slugify(name or 'invigilator')}_timetable.csv"
            response = HttpResponse(_csv_for(assignments), content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            Notification.objects.create(
                type=Notification.NotificationType.ADMIN_MESSAGE,
                admin_message=f"{admin_display_name(request.user)} exported invigilator timetable for {target_label}.",
                invigilator_message="",
                timestamp=timezone.now(),
                triggered_by=request.user,
            )
            return response

        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr("invigilators_timetables.csv", _csv_for(assignments))
            for invigilator_id in invigilator_ids:
                invigilator = invigilator_map.get(invigilator_id)
                name = (
                    getattr(invigilator.user, "username", "") if invigilator and invigilator.user else ""
                ) or (invigilator.preferred_name if invigilator else "") or (invigilator.full_name if invigilator else "")
                filename = f"{slugify(name or f'invigilator_{invigilator_id}')}_timetable.csv"
                per_assignments = [a for a in assignments if a.invigilator_id == invigilator_id]
                zip_file.writestr(filename, _csv_for(per_assignments))

        response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = 'attachment; filename="invigilators_timetables.zip"'
        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=f"{admin_display_name(request.user)} exported invigilator timetables for {target_label}.",
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=request.user,
        )
        return response


def log_notification(type_: str, message: str, when=None, user=None, invigilator=None):
    """
    Create a notification using the new admin/invigilator message fields.
    Existing callers pass a single `message`; we fan that out to both variants.
    """
    try:
        resolved_invigilator = invigilator or _resolve_invigilator_for_user(user)
        Notification.objects.create(
            type=type_,
            invigilator_message=message or "",
            admin_message=message or "",
            timestamp=when or timezone.now(),
            triggered_by=user,
            invigilator=resolved_invigilator,
        )
    except Exception:
        # Do not break main flows if notification logging fails
        pass


def _get_request_user(view, serializer=None):
    request = getattr(view, "request", None)
    if request is None and serializer is not None:
        try:
            request = serializer.context.get("request")
        except Exception:
            request = None
    return getattr(request, "user", None) if request is not None else None


def _resolve_invigilator_for_user(user):
    """
    Attempt to resolve an Invigilator profile for a user using the same
    fallbacks as the InvigilatorAssignmentViewSet queryset.
    """
    if user is None:
        return None
    invigilator = getattr(user, "invigilator_profile", None)
    if invigilator:
        return invigilator
    return (
        Invigilator.objects.filter(user=user).first()
        or Invigilator.objects.filter(preferred_name__iexact=getattr(user, "first_name", "") or user.username).first()
        or Invigilator.objects.filter(full_name__icontains=getattr(user, "username", "")).first()
    )


def _has_time_conflict(candidate, assignments):
    """
    Return True if the candidate assignment overlaps with any of the supplied assignments.
    Only compares rows with valid start/end timestamps.
    """
    c_start = getattr(candidate, "assigned_start", None)
    c_end = getattr(candidate, "assigned_end", None)
    if not c_start or not c_end:
        return False

    for assignment in assignments:
        a_start = getattr(assignment, "assigned_start", None)
        a_end = getattr(assignment, "assigned_end", None)
        if not a_start or not a_end:
            continue
        if c_start < a_end and a_start < c_end:
            return True
    return False


class IsInvigilatorOrAdmin(permissions.BasePermission):
    """
    Allow access to admins or users that can be resolved to an invigilator.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user and (user.is_staff or user.is_superuser):
            return True
        return _resolve_invigilator_for_user(user) is not None


class IsSeniorAdmin(permissions.BasePermission):
    """
    Allow access only to senior admins.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and (user.is_staff or user.is_superuser) and getattr(user, "is_senior_admin", False))


class ExamViewSet(viewsets.ModelViewSet):
    queryset = Exam.objects.all().prefetch_related("examvenue_set__venue")
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large bulk operations without throttling

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Delete multiple Exam records (admin-only).
        Expects JSON body: {"ids": [1,2,3]}
        """
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if not ids or not isinstance(ids, list):
            return Response(
                {"detail": "Provide a non-empty list of ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = [pk for pk in ids if isinstance(pk, int)]
        if not ids:
            return Response(
                {"detail": "No valid exam ids supplied."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Exam.objects.filter(pk__in=ids)
        deleted_count, _ = qs.delete()
        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)

    def perform_update(self, serializer):
        instance = serializer.save()
        log_notification("examChange", f"Exam '{instance.exam_name}' was updated.", user=_get_request_user(self, serializer))
        return instance


class VenueViewSet(viewsets.ModelViewSet):
    queryset = Venue.objects.all().prefetch_related("examvenue_set__exam")
    serializer_class = VenueSerializer
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large bulk operations without throttling

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Delete multiple Venue records (admin-only).
        Expects JSON body: {"ids": ["Hall A", "Lab B"]}
        """
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if not ids or not isinstance(ids, list):
            return Response(
                {"detail": "Provide a non-empty list of venue names in 'ids'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = [pk for pk in ids if isinstance(pk, str) and pk.strip()]
        if not ids:
            return Response(
                {"detail": "No valid venue names supplied."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Venue.objects.filter(venue_name__in=ids)
        deleted_count, _ = qs.delete()
        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return VenueWriteSerializer
        return VenueSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        log_notification("venueChange", f"Venue '{instance.venue_name}' was created.", user=_get_request_user(self, serializer))
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        log_notification("venueChange", f"Venue '{instance.venue_name}' was updated.", user=_get_request_user(self, serializer))
        return instance

    def perform_destroy(self, instance):
        venue_name = instance.venue_name
        response = super().perform_destroy(instance)
        log_notification("venueChange", f"Venue '{venue_name}' was deleted.", user=_get_request_user(self))
        return response


class ExamVenueViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for ExamVenue rows.
    - Core venues are read-only and cannot be updated or deleted here.
    - Creation requires an existing Exam and an optional existing Venue name.
    """

    queryset = ExamVenue.objects.select_related("exam", "venue").all()
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large bulk operations without throttling

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ExamVenueWriteSerializer
        return ExamVenueSerializer

    def perform_destroy(self, instance):
        if instance.core:
            raise ValidationError("Core exam venues cannot be deleted.")
        log_notification(
            "examChange",
            f"Exam venue removed for '{instance.exam.exam_name if instance.exam else 'Exam'}'.",
        )
        return super().perform_destroy(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        exam_name = instance.exam.exam_name if instance.exam else "Exam"
        venue_name = instance.venue.venue_name if instance.venue else "Unassigned"
        log_notification("examChange", f"Exam '{exam_name}' venue updated to {venue_name}.", user=_get_request_user(self, serializer))
        return instance

    def perform_create(self, serializer):
        instance = serializer.save()
        exam_name = instance.exam.exam_name if instance.exam else "Exam"
        venue_name = instance.venue.venue_name if instance.venue else "Unassigned"
        log_notification("examChange", f"Exam '{exam_name}' venue set to {venue_name}.", user=_get_request_user(self, serializer))
        return instance


class InvigilatorViewSet(viewsets.ModelViewSet):
    queryset = Invigilator.objects.select_related("user").prefetch_related(
        "assignments__exam_venue__exam",
        "assignments__exam_venue__venue",
        "availabilities",
        "qualifications",
    )
    serializer_class = InvigilatorSerializer
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large bulk operations without throttling

    def _admin_display_name(self, user) -> str:
        if not user:
            return "Administrator"
        first_name = (getattr(user, "first_name", "") or "").strip()
        return first_name or getattr(user, "username", "") or getattr(user, "email", "") or "Administrator"

    def _invigilator_display_name(self, invigilator) -> str:
        if not invigilator:
            return "Invigilator"
        return invigilator.preferred_name or invigilator.full_name or f"Invigilator #{invigilator.id}"

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Delete multiple invigilators (admin-only).
        Expects JSON body: {"ids": [1,2,3]}
        """
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        if not ids or not isinstance(ids, list):
            return Response(
                {"detail": "Provide a non-empty list of ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = [pk for pk in ids if isinstance(pk, int)]
        if not ids:
            return Response(
                {"detail": "No valid invigilator ids supplied."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Invigilator.objects.select_related("user").filter(pk__in=ids)
        user_ids = [inv.user_id for inv in qs if inv.user_id]
        deleted_count, _ = qs.delete()
        if user_ids:
            get_user_model().objects.filter(id__in=set(user_ids)).delete()
        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        user = getattr(instance, "user", None)
        instance.delete()
        if user:
            user.delete()
    @action(detail=True, methods=["post"], url_path="make-admin", permission_classes=[IsSeniorAdmin])
    def make_admin(self, request, pk=None):
        invigilator = self.get_object()
        user = getattr(invigilator, "user", None)
        if not user:
            return Response(
                {"detail": "Invigilator has no linked login to promote."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (user.is_staff and user.is_superuser):
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])

        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=(
                f"{self._admin_display_name(request.user)} promoted "
                f"{self._invigilator_display_name(invigilator)} to administrator."
            ),
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=request.user,
        )

        return Response(
            {
                "detail": "Invigilator promoted to administrator.",
                "user_id": user.id,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="remove-admin", permission_classes=[IsSeniorAdmin])
    def remove_admin(self, request, pk=None):
        invigilator = self.get_object()
        user = getattr(invigilator, "user", None)
        if not user:
            return Response(
                {"detail": "Invigilator has no linked login to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (user.is_staff or user.is_superuser):
            return Response(
                {"detail": "User is not an administrator."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_staff = False
        user.is_superuser = False
        if getattr(user, "is_senior_admin", False):
            user.is_senior_admin = False
            user.save(update_fields=["is_staff", "is_superuser", "is_senior_admin"])
        else:
            user.save(update_fields=["is_staff", "is_superuser"])

        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=(
                f"{self._admin_display_name(request.user)} removed administrator access for "
                f"{self._invigilator_display_name(invigilator)}."
            ),
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=request.user,
        )

        return Response(
            {
                "detail": "Administrator privileges removed.",
                "user_id": user.id,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "is_senior_admin": getattr(user, "is_senior_admin", False),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="make-senior-admin", permission_classes=[IsSeniorAdmin])
    def make_senior_admin(self, request, pk=None):
        invigilator = self.get_object()
        user = getattr(invigilator, "user", None)
        if not user:
            return Response(
                {"detail": "Invigilator has no linked login to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (user.is_staff or user.is_superuser):
            return Response(
                {"detail": "User must already be an administrator to be promoted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not getattr(user, "is_senior_admin", False):
            user.is_senior_admin = True
            user.save(update_fields=["is_senior_admin"])

        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=(
                f"{self._admin_display_name(request.user)} promoted "
                f"{self._invigilator_display_name(invigilator)} to senior administrator."
            ),
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=request.user,
        )

        return Response(
            {
                "detail": "Administrator promoted to senior administrator.",
                "user_id": user.id,
                "is_senior_admin": getattr(user, "is_senior_admin", False),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="remove-senior-admin", permission_classes=[IsSeniorAdmin])
    def remove_senior_admin(self, request, pk=None):
        invigilator = self.get_object()
        user = getattr(invigilator, "user", None)
        if not user:
            return Response(
                {"detail": "Invigilator has no linked login to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not getattr(user, "is_senior_admin", False):
            return Response(
                {"detail": "User is not a senior administrator."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_senior_admin = False
        user.save(update_fields=["is_senior_admin"])

        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=(
                f"{self._admin_display_name(request.user)} removed senior administrator access for "
                f"{self._invigilator_display_name(invigilator)}."
            ),
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=request.user,
        )

        return Response(
            {
                "detail": "Senior administrator privileges removed.",
                "user_id": user.id,
                "is_senior_admin": getattr(user, "is_senior_admin", False),
            },
            status=status.HTTP_200_OK,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        name = instance.preferred_name or instance.full_name or "Invigilator"
        Notification.objects.create(
            type=Notification.NotificationType.INVIGILATOR_UPDATE,
            admin_message=f"{name} has updated details.",
            invigilator_message="Your details have been updated",
            invigilator=instance,
            triggered_by=_get_request_user(self, serializer),
        )
        return instance


class InvigilatorAssignmentViewSet(viewsets.ModelViewSet):
    """
    Admins can manage all assignments; invigilators can read their own.
    """

    serializer_class = InvigilatorAssignmentSerializer
    throttle_classes: list = []

    def get_permissions(self):
        if getattr(self, "action", None) in {"available_covers", "pickup", "request_cancel", "undo_cancel"}:
            return [IsInvigilatorOrAdmin()]
        if self.request.method in permissions.SAFE_METHODS:
            return [IsInvigilatorOrAdmin()]
        return [permissions.IsAdminUser()]

    def get_queryset(self):
        qs = InvigilatorAssignment.objects.select_related(
            "invigilator",
            "exam_venue__exam",
            "exam_venue__venue",
        )
        user = getattr(self.request, "user", None)
        if user and (user.is_staff or user.is_superuser):
            return qs.all()
        invigilator = _resolve_invigilator_for_user(user)
        if invigilator is None:
            return qs.none()
        return qs.filter(invigilator=invigilator)

    def perform_update(self, serializer):
        instance = self.get_object()
        was_confirmed = bool(instance.confirmed)
        was_cancelled = bool(instance.cancel)
        updated = serializer.save()
        is_cancelled = bool(updated.cancel)
        if not was_confirmed and bool(updated.confirmed):
            name = updated.invigilator.preferred_name or updated.invigilator.full_name or "Invigilator"
            exam_name = updated.exam_venue.exam.exam_name if updated.exam_venue and updated.exam_venue.exam else "an exam"
            venue_name = updated.exam_venue.venue.venue_name if updated.exam_venue and updated.exam_venue.venue else "Venue TBC"
            start_str = (
                timezone.localtime(updated.assigned_start).strftime("%d %b %Y at %H:%M")
                if updated.assigned_start else "start time TBC"
            )
            details = f"{exam_name} at {venue_name} on {start_str}"
            if is_cancelled:
                Notification.objects.create(
                    type=Notification.NotificationType.CANCELLATION,
                    admin_message=f"Cancellation request approved for {name} ({details}).",
                    invigilator_message=f"Your cancellation request was approved for {details}.",
                    invigilator=updated.invigilator,
                    triggered_by=_get_request_user(self, serializer),
                )
            else:
                Notification.objects.create(
                    type=Notification.NotificationType.ASSIGNMENT,
                    admin_message=f"{name} has confirmed their assignment for {details}.",
                    invigilator_message=f"Your assignment has been confirmed for {details}.",
                    invigilator=updated.invigilator,
                    triggered_by=_get_request_user(self, serializer),
                )
        if was_cancelled and not is_cancelled:
            name = updated.invigilator.preferred_name or updated.invigilator.full_name or "Invigilator"
            exam_name = updated.exam_venue.exam.exam_name if updated.exam_venue and updated.exam_venue.exam else "an exam"
            venue_name = updated.exam_venue.venue.venue_name if updated.exam_venue and updated.exam_venue.venue else "Venue TBC"
            start_str = (
                timezone.localtime(updated.assigned_start).strftime("%d %b %Y at %H:%M")
                if updated.assigned_start else "start time TBC"
            )
            details = f"{exam_name} at {venue_name} on {start_str}"
            Notification.objects.create(
                type=Notification.NotificationType.CANCELLATION,
                admin_message=f"Cancellation request rejected for {name} ({details}).",
                invigilator_message=f"Your cancellation request was rejected for {details}.",
                invigilator=updated.invigilator,
                triggered_by=_get_request_user(self, serializer),
            )
        return updated

    @action(detail=False, methods=["get"], url_path="available-covers", permission_classes=[IsInvigilatorOrAdmin])
    def available_covers(self, request):
        """
        Return cancelled shifts that do not clash with the requesting invigilator
        and have not already been covered.
        """
        invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        base_qs = (
            InvigilatorAssignment.objects.select_related("exam_venue__exam", "exam_venue__venue", "invigilator")
            .filter(cancel=True, assigned_end__gte=now)
            .exclude(invigilator=invigilator)
            .annotate(has_cover=models.Exists(
                InvigilatorAssignment.objects.filter(cover_for=models.OuterRef("pk"), cancel=False)
            ))
            .filter(has_cover=False)
        )

        current_assignments = list(
            InvigilatorAssignment.objects.select_related("exam_venue__exam", "exam_venue__venue")
            .filter(invigilator=invigilator, cancel=False)
        )

        available = [
            a
            for a in base_qs
            if not _has_time_conflict(a, current_assignments)
            and not any(ca.exam_venue_id == a.exam_venue_id for ca in current_assignments)
        ]
        serializer = self.get_serializer(available, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="pickup", permission_classes=[IsInvigilatorOrAdmin])
    def pickup(self, request, pk=None):
        """
        Allow an invigilator to pick up a cancelled shift if no conflicts exist.
        Creates a new assignment marked as a cover.
        """
        invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            candidate = InvigilatorAssignment.objects.select_related(
                "exam_venue__exam", "exam_venue__venue", "invigilator"
            ).get(pk=pk, cancel=True)
        except InvigilatorAssignment.DoesNotExist:
            return Response({"detail": "Cancelled shift not found."}, status=status.HTTP_404_NOT_FOUND)

        if candidate.invigilator_id == invigilator.id:
            return Response({"detail": "You cannot pick up your own cancelled shift."}, status=status.HTTP_400_BAD_REQUEST)

        if candidate.cover_assignments.filter(cancel=False).exists():
            return Response({"detail": "Shift already covered."}, status=status.HTTP_400_BAD_REQUEST)

        if InvigilatorAssignment.objects.filter(invigilator=invigilator, exam_venue=candidate.exam_venue).exists():
            return Response({"detail": "You already have an assignment for this exam slot."}, status=status.HTTP_400_BAD_REQUEST)

        current_assignments = InvigilatorAssignment.objects.filter(invigilator=invigilator, cancel=False)
        if _has_time_conflict(candidate, current_assignments):
            return Response({"detail": "You already have a conflicting shift."}, status=status.HTTP_400_BAD_REQUEST)

        new_assignment = InvigilatorAssignment.objects.create(
            invigilator=invigilator,
            exam_venue=candidate.exam_venue,
            role=candidate.role,
            assigned_start=candidate.assigned_start,
            assigned_end=candidate.assigned_end,
            break_time_minutes=candidate.break_time_minutes,
            confirmed=False,
            cancel=False,
            cover=True,
            cover_for=candidate,
            notes=candidate.notes,
        )

        name = invigilator.preferred_name or invigilator.full_name or "Invigilator"
        exam_name = candidate.exam_venue.exam.exam_name if candidate.exam_venue and candidate.exam_venue.exam else "an exam"
        venue_name = candidate.exam_venue.venue.venue_name if candidate.exam_venue and candidate.exam_venue.venue else "Venue TBC"
        start_str = (
            timezone.localtime(candidate.assigned_start).strftime("%d %b %Y at %H:%M")
            if candidate.assigned_start else "start time TBC"
        )
        details = f"{exam_name} at {venue_name} on {start_str}"
        admin_details = details
        original_invigilator = getattr(candidate.invigilator, "preferred_name", None) or getattr(candidate.invigilator, "full_name", None) or None
        if original_invigilator:
            admin_details = f"{admin_details} (covering for {original_invigilator})"
        Notification.objects.create(
            type=Notification.NotificationType.SHIFT_PICKUP,
            admin_message=f"{name} picked up a shift for {admin_details}.",
            invigilator_message=f"You picked up a shift for {details}.",
            invigilator=invigilator,
            triggered_by=request.user,
        )

        serializer = self.get_serializer(new_assignment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="request-cancel", permission_classes=[IsInvigilatorOrAdmin])
    def request_cancel(self, request, pk=None):
        """
        Allow an invigilator to request cancellation of their own upcoming shift.
        Marks cancel=True with an optional reason; does not delete the assignment.
        """
        invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            assignment = InvigilatorAssignment.objects.select_related(
                "invigilator", "exam_venue__exam", "exam_venue__venue"
            ).get(pk=pk, invigilator=invigilator, cancel=False)
        except InvigilatorAssignment.DoesNotExist:
            return Response({"detail": "Shift not found or already cancelled."}, status=status.HTTP_404_NOT_FOUND)

        if assignment.assigned_start and assignment.assigned_start < timezone.now():
            return Response({"detail": "Past shifts cannot be cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        reason = None
        try:
            payload = request.data or {}
            reason = (payload.get("reason") or "").strip()
        except Exception:
            reason = None

        assignment.cancel = True
        if reason:
            assignment.cancel_cause = reason
        assignment.confirmed = False
        assignment.save(update_fields=["cancel", "cancel_cause", "confirmed"])

        name = assignment.invigilator.preferred_name or assignment.invigilator.full_name or "Invigilator"
        exam_name = assignment.exam_venue.exam.exam_name if assignment.exam_venue and assignment.exam_venue.exam else "an exam"
        venue_name = assignment.exam_venue.venue.venue_name if assignment.exam_venue and assignment.exam_venue.venue else "Venue TBC"
        start_str = (
            timezone.localtime(assignment.assigned_start).strftime("%d %b %Y at %H:%M")
            if assignment.assigned_start else "start time TBC"
        )
        details = f"{exam_name} at {venue_name} on {start_str}"
        if reason:
            details = f"{details} (reason: {reason})"
        Notification.objects.create(
            type=Notification.NotificationType.CANCELLATION,
            admin_message=f"{name} requested cancellation for {details}.",
            invigilator_message=f"Your cancellation request was submitted for {details}.",
            invigilator=assignment.invigilator,
            triggered_by=request.user,
        )

        return Response(self.get_serializer(assignment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="undo-cancel", permission_classes=[IsInvigilatorOrAdmin])
    def undo_cancel(self, request, pk=None):
        """
        Allow an invigilator to withdraw a cancellation request if it has not been covered.
        """
        invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            assignment = InvigilatorAssignment.objects.select_related(
                "invigilator", "exam_venue__exam", "exam_venue__venue"
            ).get(pk=pk, invigilator=invigilator, cancel=True)
        except InvigilatorAssignment.DoesNotExist:
            return Response({"detail": "Cancelled shift not found."}, status=status.HTTP_404_NOT_FOUND)

        if assignment.cover_assignments.filter(cancel=False).exists():
            return Response({"detail": "This shift has already been covered and cannot be reinstated."}, status=status.HTTP_400_BAD_REQUEST)

        reason = None
        try:
            payload = request.data or {}
            reason = (payload.get("reason") or "").strip()
        except Exception:
            reason = None

        assignment.cancel = False
        if reason:
            assignment.cancel_cause = reason
        assignment.save(update_fields=["cancel", "cancel_cause"])

        name = assignment.invigilator.preferred_name or assignment.invigilator.full_name or "Invigilator"
        exam_name = assignment.exam_venue.exam.exam_name if assignment.exam_venue and assignment.exam_venue.exam else "an exam"
        venue_name = assignment.exam_venue.venue.venue_name if assignment.exam_venue and assignment.exam_venue.venue else "Venue TBC"
        start_str = (
            timezone.localtime(assignment.assigned_start).strftime("%d %b %Y at %H:%M")
            if assignment.assigned_start else "start time TBC"
        )
        details = f"{exam_name} at {venue_name} on {start_str}"
        if reason:
            details = f"{details} (undo reason: {reason})"
        Notification.objects.create(
            type=Notification.NotificationType.CANCELLATION,
            admin_message=f"{name} withdrew cancellation for {details}.",
            invigilator_message=f"Your cancellation withdrawal was submitted for {details}.",
            invigilator=assignment.invigilator,
            triggered_by=request.user,
        )

        return Response(self.get_serializer(assignment).data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        instance = serializer.save()
        name = instance.invigilator.preferred_name or instance.invigilator.full_name or "Invigilator"
        exam_name = instance.exam_venue.exam.exam_name if instance.exam_venue and instance.exam_venue.exam else "an exam"
        venue_name = instance.exam_venue.venue.venue_name if instance.exam_venue and instance.exam_venue.venue else "Venue TBC"
        start_str = (
            timezone.localtime(instance.assigned_start).strftime("%d %b %Y at %H:%M")
            if instance.assigned_start else "start time TBC"
        )
        details = f"{exam_name} at {venue_name} on {start_str}"
        admin_details = details
        invigilator_details = details
        original_invigilator = None
        try:
            original_invigilator = (
                instance.cover_for.invigilator.preferred_name
                or instance.cover_for.invigilator.full_name
                if instance.cover_for and instance.cover_for.invigilator
                else None
            )
        except Exception:
            original_invigilator = None
        if original_invigilator:
            admin_details = f"{admin_details} (covering for {original_invigilator})"
        Notification.objects.create(
            type=Notification.NotificationType.ASSIGNMENT,
            admin_message=f"{name} has been assigned to a shift for {admin_details}.",
            invigilator_message=f"You have been assigned to a shift for {invigilator_details}.",
            invigilator=instance.invigilator,
            triggered_by=_get_request_user(self, serializer),
        )
        return instance

    def perform_destroy(self, instance):
        name = instance.invigilator.preferred_name or instance.invigilator.full_name or "Invigilator"
        exam_name = instance.exam_venue.exam.exam_name if instance.exam_venue and instance.exam_venue.exam else "an exam"
        venue_name = instance.exam_venue.venue.venue_name if instance.exam_venue and instance.exam_venue.venue else "Venue TBC"
        start_str = (
            timezone.localtime(instance.assigned_start).strftime("%d %b %Y at %H:%M")
            if instance.assigned_start else "start time TBC"
        )
        details = f"{exam_name} at {venue_name} on {start_str}"
        Notification.objects.create(
            type=Notification.NotificationType.CANCELLATION,
            admin_message=f"Cancellation request approved for {name} ({details}).",
            invigilator_message=f"Your cancellation request was approved for {details}.",
            invigilator=instance.invigilator,
            triggered_by=_get_request_user(self),
        )
        return super().perform_destroy(instance)


def _diet_code_for_range(start_date: date, end_date: date) -> str:
    start_abbr = calendar.month_abbr[start_date.month].upper()
    end_abbr = calendar.month_abbr[end_date.month].upper()
    end_year = str(end_date.year)[-2:]
    if start_date.month == end_date.month and start_date.year == end_date.year:
        return f"{start_abbr}_{end_year}"
    return f"{start_abbr}_{end_abbr}_{end_year}"


def _diet_name_for_range(start_date: date, end_date: date) -> str:
    start_name = calendar.month_name[start_date.month]
    end_name = calendar.month_name[end_date.month]
    end_year = str(end_date.year)
    if start_date.month == end_date.month and start_date.year == end_date.year:
        return f"{start_name} {end_year}"
    return f"{start_name}/{end_name} {end_year}"


def _suggest_diet_for_upload(min_date: date, max_date: date) -> dict:
    diets = list(Diet.objects.exclude(start_date__isnull=True, end_date__isnull=True))
    overlaps = [
        diet for diet in diets
        if diet.start_date <= max_date and diet.end_date >= min_date
    ]

    if len(overlaps) > 1:
        return {
            "status": "error",
            "message": "Multiple diets overlap the uploaded exam date range.",
        }

    if not overlaps:
        return {
            "status": "ok",
            "action": "create_new",
            "suggested": {
                "code": _diet_code_for_range(min_date, max_date),
                "name": _diet_name_for_range(min_date, max_date),
                "start_date": min_date.isoformat(),
                "end_date": max_date.isoformat(),
            },
        }

    diet = overlaps[0]
    options: list[str] = []
    if min_date < diet.start_date:
        options.append("extend_start")
    elif min_date > diet.start_date:
        options.append("contract_start")
    if max_date > diet.end_date:
        options.append("extend_end")
    elif max_date < diet.end_date:
        options.append("contract_end")

    return {
        "status": "ok",
        "action": "adjust_existing" if options else "none",
        "diet_id": diet.id,
        "diet_code": diet.code,
        "diet_name": diet.name,
        "current": {
            "start_date": diet.start_date.isoformat(),
            "end_date": diet.end_date.isoformat(),
        },
        "uploaded": {
            "start_date": min_date.isoformat(),
            "end_date": max_date.isoformat(),
        },
        "options": options,
    }


class TimetableUploadView(APIView):
    """Accepts an uploaded Excel file and routes it through the parser helpers."""
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large bulk uploads without throttling


    def post(self, request, *args, **kwargs):
        
        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"status": "error", "message": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(upload, "seek"):
            upload.seek(0)
                    
        try:
            result = parse_excel_file(upload)
        except Exception as exc:  # pragma: no cover - defensive fallback
            return Response(
                {
                    "status": "error",
                    "message": "Failed to parse uploaded file.",
                    "details": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
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

            if result.get("type") == "Exam":
                date_range = compute_exam_date_range(result.get("rows") or [])
                if date_range:
                    result["upload_exam_date_range"] = {
                        "min_date": date_range["min_date"].isoformat(),
                        "max_date": date_range["max_date"].isoformat(),
                        "row_count": date_range["row_count"],
                    }
                    result["diet_suggestion"] = _suggest_diet_for_upload(
                        date_range["min_date"],
                        date_range["max_date"],
                    )

        http_status = (
            status.HTTP_200_OK if result.get("status") == "ok" else status.HTTP_400_BAD_REQUEST
        )
        return Response(result, status=http_status)


class NotificationsView(APIView):
    """
    Return notifications stored in the Notification table.
    """
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only; allow large pulls without throttling

    def get(self, request, *args, **kwargs):
        cutoff = timezone.now() - timedelta(days=7)
        qs = Notification.objects.filter(timestamp__gte=cutoff).order_by("-timestamp")[:50]
        return Response(NotificationSerializer(qs, many=True).data)

    def post(self, request, *args, **kwargs):
        payload = request.data or {}
        invigilator_ids = payload.get("invigilator_ids") or []
        methods = payload.get("methods") or []
        subject = (payload.get("subject") or "").strip()
        message = (payload.get("message") or "").strip()
        log_only = bool(payload.get("log_only"))

        if not isinstance(invigilator_ids, (list, tuple)):
            return Response({"detail": "invigilator_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invigilator_ids = [int(i) for i in invigilator_ids]
        except (TypeError, ValueError):
            return Response({"detail": "invigilator_ids must contain numeric IDs."}, status=status.HTTP_400_BAD_REQUEST)

        if not invigilator_ids:
            return Response({"detail": "At least one invigilator ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not message and not log_only:
            return Response({"detail": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(methods, (list, tuple)):
            methods = []
        allowed_methods = {"email", "sms"}
        invalid_methods = [m for m in methods if m not in allowed_methods]
        if invalid_methods:
            return Response(
                {"detail": f"Invalid methods: {', '.join(invalid_methods)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not methods:
            return Response({"detail": "Choose at least one delivery method (email or sms)."}, status=status.HTTP_400_BAD_REQUEST)

        recipients = list(Invigilator.objects.filter(id__in=invigilator_ids))
        if not recipients:
            return Response({"detail": "No matching invigilators found."}, status=status.HTTP_404_NOT_FOUND)

        subject_to_use = subject or "Message from administrator"

        if log_only:
            count = len(recipients)
            method_label = " & ".join(methods) if methods else "mail"
            admin_message = (
                f"Sent '{subject_to_use}' mail merge to {count} invigilator{'s' if count != 1 else ''} via {method_label}"
            )
            Notification.objects.create(
                type=Notification.NotificationType.MAIL_MERGE,
                admin_message=admin_message,
                invigilator_message="",
                timestamp=timezone.now(),
                triggered_by=request.user,
            )
            for invigilator in recipients:
                Notification.objects.create(
                    type=Notification.NotificationType.MAIL_MERGE,
                    admin_message=admin_message,
                    invigilator_message=f"You were sent a mail merge: {subject_to_use}.",
                    timestamp=timezone.now(),
                    triggered_by=request.user,
                    invigilator=invigilator,
                )
            return Response(
                {
                    "status": "ok",
                    "logged": True,
                    "invigilator_ids": [i.id for i in recipients],
                    "count": count,
                    "subject": subject_to_use,
                }
            )

        if settings.EMAIL_BACKEND in {
            "django.core.mail.backends.console.EmailBackend",
            "django.core.mail.backends.dummy.EmailBackend",
        }:
            return Response(
                {
                    "detail": "Email backend is set to console/dummy. Configure SMTP via EMAIL_* env vars to send messages.",
                    "backend": settings.EMAIL_BACKEND,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        from django.core.mail import send_mail

        sender_email = settings.DEFAULT_FROM_EMAIL
        reply_to_email = getattr(request.user, "email", "") or None

        email_recipients = []
        sms_recipients = []
        skipped_sms = []

        for invigilator in recipients:
            name = invigilator.preferred_name or invigilator.full_name or f"Invigilator #{invigilator.id}"
            if "email" in methods:
                email_recipients.extend(
                    [
                        e
                        for e in [
                            getattr(invigilator, "university_email", None),
                            getattr(invigilator, "personal_email", None),
                        ]
                        if e
                    ]
                )
            if "sms" in methods:
                sms_candidate = getattr(invigilator, "mobile_text_only", None)
                if sms_candidate and "@" in sms_candidate:
                    sms_recipients.append(sms_candidate)
                else:
                    skipped_sms.append(name)

        send_results = {"email": 0, "sms": 0}
        errors = []

        if "email" in methods and email_recipients:
            try:
                email_msg = EmailMessage(
                    subject=subject_to_use,
                    body=message,
                    from_email=sender_email,
                    to=email_recipients,
                    reply_to=[reply_to_email] if reply_to_email else None,
                )
                email_msg.send(fail_silently=False)
                send_results["email"] = len(email_recipients)
            except Exception as exc:
                errors.append(f"Email send failed: {exc}")

        if "sms" in methods and sms_recipients:
            try:
                sms_msg = EmailMessage(
                    subject=subject_to_use,
                    body=message,
                    from_email=sender_email,
                    to=sms_recipients,
                    reply_to=[reply_to_email] if reply_to_email else None,
                )
                sms_msg.send(fail_silently=False)
                send_results["sms"] = len(sms_recipients)
            except Exception as exc:
                errors.append(f"SMS send failed: {exc}")

        if "email" in methods and not email_recipients:
            errors.append("No email addresses found for selected invigilators.")
        if "sms" in methods and not sms_recipients:
            errors.append(
                "No SMS-capable addresses (e.g. mobile_text_only with @) found for selected invigilators."
            )
        if skipped_sms and "sms" in methods:
            errors.append(f"Skipped SMS for: {', '.join(skipped_sms)} (missing SMS address).")

        if errors and send_results["email"] == 0 and send_results["sms"] == 0:
            return Response({"detail": errors[0]}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "status": "ok",
                "sent_email": send_results["email"],
                "sent_sms": send_results["sms"],
                "invigilator_ids": [i.id for i in recipients],
                "methods": list(methods),
                "subject": subject_to_use,
                "message": message,
                "warnings": errors,
            },
            status=status.HTTP_200_OK,
        )
        

class DietViewSet(viewsets.ModelViewSet):
    queryset = Diet.objects.all().order_by("-is_active", "-start_date", "code")
    serializer_class = DietSerializer
    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []

    @action(detail=False, methods=["post"], url_path="adjust")
    def adjust(self, request, *args, **kwargs):
        payload = request.data or {}
        action = (payload.get("action") or "").strip()
        diet_id = payload.get("diet_id")
        code = (payload.get("code") or "").strip()
        name = (payload.get("name") or "").strip()
        start_date_raw = payload.get("start_date")
        end_date_raw = payload.get("end_date")

        start_date = dateparse.parse_date(str(start_date_raw)) if start_date_raw else None
        end_date = dateparse.parse_date(str(end_date_raw)) if end_date_raw else None
        if not start_date or not end_date:
            return Response({"detail": "start_date and end_date are required."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "create_new":
            serializer = self.get_serializer(
                data={
                    "code": code or _diet_code_for_range(start_date, end_date),
                    "name": name or _diet_name_for_range(start_date, end_date),
                    "start_date": start_date,
                    "end_date": end_date,
                    "is_active": True,
                }
            )
            serializer.is_valid(raise_exception=True)
            diet = serializer.save()
            return Response(
                {
                    "status": "ok",
                    "action": "create_new",
                    "diet": DietSerializer(diet).data,
                },
                status=status.HTTP_200_OK,
            )

        if action in {"adjust_existing", "extend_start", "extend_end", "contract_start", "contract_end"}:
            if not diet_id:
                return Response({"detail": "diet_id is required for adjustments."}, status=status.HTTP_400_BAD_REQUEST)
            diet = Diet.objects.filter(pk=diet_id).first()
            if not diet:
                return Response({"detail": "Diet not found."}, status=status.HTTP_400_BAD_REQUEST)
            serializer = self.get_serializer(
                diet,
                data={
                    "code": code or diet.code,
                    "name": name or diet.name,
                    "start_date": start_date,
                    "end_date": end_date,
                    "is_active": diet.is_active,
                },
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            updated = serializer.save()
            return Response(
                {
                    "status": "ok",
                    "action": action,
                    "diet": DietSerializer(updated).data,
                },
                status=status.HTTP_200_OK,
            )

        return Response({"detail": "Unsupported action."}, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        diet = serializer.save()
        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=f"Diet '{diet.name or diet.code}' was created.",
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=_get_request_user(self, serializer),
        )
        return diet

    def _create_availability_rows(self, invigilator_ids: list[int], start_date: date, end_date: date):
        if not invigilator_ids or start_date > end_date:
            return
        to_create = []
        current_date = start_date
        while current_date <= end_date:
            for slot in SlotChoices.values:
                for invigilator_id in invigilator_ids:
                    to_create.append(
                        InvigilatorAvailability(
                            invigilator_id=invigilator_id,
                            date=current_date,
                            slot=slot,
                            available=True,
                        )
                    )
            current_date += timedelta(days=1)
        InvigilatorAvailability.objects.bulk_create(to_create, ignore_conflicts=True)

    def _remove_availability_rows(self, invigilator_ids: list[int], start_date: date, end_date: date):
        if not invigilator_ids or start_date > end_date:
            return
        InvigilatorAvailability.objects.filter(
            invigilator_id__in=invigilator_ids,
            date__gte=start_date,
            date__lte=end_date,
        ).delete()

    def perform_update(self, serializer):
        instance = self.get_object()
        old_start = instance.start_date
        old_end = instance.end_date
        old_code = instance.code
        updated = serializer.save()

        new_start = updated.start_date
        new_end = updated.end_date
        new_code = updated.code

        if old_code and new_code and old_code != new_code:
            InvigilatorRestriction.objects.filter(diet=old_code).update(diet=new_code)
            old_code = new_code

        if not old_code:
            return

        invigilator_ids = list(
            InvigilatorRestriction.objects.filter(diet=old_code).values_list("invigilator_id", flat=True)
        )
        if not invigilator_ids:
            return

        if old_start and old_end and not (new_start and new_end):
            self._remove_availability_rows(invigilator_ids, old_start, old_end)
            return

        if new_start and new_end and not (old_start and old_end):
            self._create_availability_rows(invigilator_ids, new_start, new_end)
            return

        if not (old_start and old_end and new_start and new_end):
            return

        if new_start > old_start:
            self._remove_availability_rows(invigilator_ids, old_start, new_start - timedelta(days=1))
        if new_end < old_end:
            self._remove_availability_rows(invigilator_ids, new_end + timedelta(days=1), old_end)
        if new_start < old_start:
            self._create_availability_rows(invigilator_ids, new_start, old_start - timedelta(days=1))
        if new_end > old_end:
            self._create_availability_rows(invigilator_ids, old_end + timedelta(days=1), new_end)

        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=f"Diet '{updated.name or updated.code}' was updated.",
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=_get_request_user(self, serializer),
        )

    def destroy(self, request, *args, **kwargs):
        diet = self.get_object()
        code = diet.code
        start_date = diet.start_date
        end_date = diet.end_date
        with transaction.atomic():
            if code:
                InvigilatorRestriction.objects.filter(diet=code).delete()
            if start_date and end_date:
                InvigilatorAvailability.objects.filter(date__gte=start_date, date__lte=end_date).delete()
            InvigilatorDietContract.objects.filter(diet=diet).delete()
            diet.delete()
        Notification.objects.create(
            type=Notification.NotificationType.ADMIN_MESSAGE,
            admin_message=f"Diet '{diet.name or diet.code}' was deleted.",
            invigilator_message="",
            timestamp=timezone.now(),
            triggered_by=_get_request_user(self),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

        
def _provision_row(provision: Provisions, student_exam: Optional[StudentExam]):
    student_exam = student_exam or StudentExam(student=provision.student, exam=provision.exam, exam_venue=None)
    exam_venue = getattr(student_exam, "exam_venue", None)
    venue = getattr(exam_venue, "venue", None)

    room_caps = {
        ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN,
        ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN,
    }
    ignored_caps = set(room_caps)
    ignored_caps.add(ExamVenueProvisionType.USE_COMPUTER)
    required_caps_raw = _required_capabilities(provision.provisions)
    required_caps = [cap for cap in required_caps_raw if cap not in ignored_caps]
    needs_accessible = _needs_accessible_venue(provision.provisions)
    needs_separate = ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN in required_caps_raw
    needs_computer = (
        _needs_computer(provision.provisions)
        or _exam_requires_computer(getattr(provision.exam, "exam_type", None))
    )
    allowed_types = _allowed_venue_types(needs_computer, needs_separate)

    matches_needs = False
    allocation_issue = None
    manual_override = bool(getattr(student_exam, "manual_allocation_override", False))

    if not exam_venue:
        allocation_issue = "No exam venue assigned"
    elif not venue:
        allocation_issue = "No physical venue allocated"
    else:
        if allowed_types is not None and venue.venuetype not in allowed_types:
            allocation_issue = "Venue type does not satisfy requirements"
        elif needs_accessible and not venue.is_accessible:
            allocation_issue = "Venue is not marked accessible"
        elif required_caps and not venue_supports_caps(venue, required_caps):
            allocation_issue = "Venue is missing required provisions"
        else:
            matches_needs = True

    if manual_override and allocation_issue == "Venue is missing required provisions":
        matches_needs = True
        allocation_issue = None

    exam_caps = getattr(exam_venue, "provision_capabilities", []) or []
    filtered_exam_caps = [cap for cap in exam_caps if cap not in room_caps]

    return {
        "student_id": provision.student.student_id,
        "student_name": provision.student.student_name,
        "exam_id": provision.exam.exam_id,
        "exam_name": provision.exam.exam_name,
        "course_code": provision.exam.course_code,
        "provisions": provision.provisions,
        "notes": provision.notes,
        "exam_venue_id": exam_venue.pk if exam_venue else None,
        "exam_venue_caps": filtered_exam_caps,
        "venue_name": venue.venue_name if venue else None,
        "venue_type": venue.venuetype if venue else None,
        "venue_accessible": venue.is_accessible if venue else None,
        "required_capabilities": required_caps,
        "allowed_venue_types": sorted(list(allowed_types)) if allowed_types else [],
        "matches_needs": matches_needs,
        "allocation_issue": allocation_issue,
        "manual_allocation_override": manual_override,
        "student_exam_id": student_exam.pk if student_exam else None,
    }


def map_assignment_hours_by_diet(assignments, diets=None):
    """
    Bucket assignment hours by diet using inclusive date ranges.
    Uses assigned_start date for the mapping.
    """
    if diets is None:
        diets = Diet.objects.exclude(start_date__isnull=True, end_date__isnull=True)
    diet_ranges = []
    for diet in diets:
        if not diet.start_date or not diet.end_date:
            continue
        diet_ranges.append((diet.code, diet.start_date, diet.end_date))

    results = {code: 0.0 for code, _, _ in diet_ranges}
    if not diet_ranges:
        return results

    for assignment in assignments:
        assigned_start = getattr(assignment, "assigned_start", None)
        if not assigned_start:
            continue
        assigned_date = assigned_start.date()
        matched_code = None
        for code, start, end in diet_ranges:
            if start <= assigned_date <= end:
                matched_code = code
                break
        if not matched_code:
            continue
        try:
            results[matched_code] += float(assignment.total_hours())
        except Exception:
            continue

    return {code: round(hours, 2) for code, hours in results.items()}
    
class AnnouncementViewSet(viewsets.ModelViewSet):
    """
    CRUD for announcements shown on dashboards.
    Admin-only for mutations; authenticated invigilators/admins can read.
    """

    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    throttle_classes: list = []

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [IsInvigilatorOrAdmin()]
        return [permissions.IsAdminUser()]

    def get_queryset(self):
        qs = super().get_queryset()

        audience = self.request.query_params.get("audience")
        if audience:
            qs = qs.filter(audience=audience)

        active_flag = self.request.query_params.get("active")
        if active_flag is not None:
            should_be_active = str(active_flag).lower() in {"1", "true", "yes"}
            if should_be_active:
                now = timezone.now()
                qs = qs.filter(is_active=True).filter(
                    models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
                )
            else:
                qs = qs.filter(is_active=False)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=_get_request_user(self, serializer))


def _provision_row(provision: Provisions, student_exam: Optional[StudentExam]):
    student_exam = student_exam or StudentExam(student=provision.student, exam=provision.exam, exam_venue=None)
    exam_venue = getattr(student_exam, "exam_venue", None)
    venue = getattr(exam_venue, "venue", None)

    room_caps = {"separate_room_on_own", "separate_room_not_on_own"}
    required_caps_raw = _required_capabilities(provision.provisions)
    required_caps = [cap for cap in required_caps_raw if cap not in room_caps]
    needs_accessible = _needs_accessible_venue(provision.provisions)
    needs_separate = _needs_separate_room(provision.provisions)
    needs_computer = _needs_computer(provision.provisions)
    allowed_types = _allowed_venue_types(needs_computer, needs_separate)
    _base_start, base_length = _core_exam_timing(provision.exam)
    extra_minutes_required = _extra_time_minutes(provision.provisions, base_length)

    matches_needs = False
    allocation_issue = None
    manual_override = bool(getattr(student_exam, "manual_allocation_override", False))

    if not exam_venue:
        allocation_issue = "No exam venue assigned"
    elif not venue:
        allocation_issue = "No physical venue allocated"
    else:
        if allowed_types is not None and venue.venuetype not in allowed_types:
            allocation_issue = "Venue type does not satisfy requirements"
        elif needs_accessible and not venue.is_accessible:
            allocation_issue = "Venue is not marked accessible"
        elif required_caps and not venue_supports_caps(venue, required_caps):
            allocation_issue = "Venue is missing required provisions"
        else:
            provided_length = getattr(exam_venue, "exam_length", None)
            if extra_minutes_required and base_length is not None:
                if provided_length is None:
                    allocation_issue = "Exam slot duration is missing for extra time check"
                else:
                    provided_extra = max(provided_length - base_length, 0)
                    if provided_extra < extra_minutes_required:
                        allocation_issue = (
                            f"Exam slot provides {provided_extra} extra minutes; student needs {extra_minutes_required}"
                        )
                    else:
                        matches_needs = True
            else:
                matches_needs = True

    if manual_override and allocation_issue == "Venue is missing required provisions":
        matches_needs = True
        allocation_issue = None

    exam_caps = getattr(exam_venue, "provision_capabilities", []) or []
    filtered_exam_caps = [cap for cap in exam_caps if cap not in room_caps]

    return {
        "student_id": provision.student.student_id,
        "student_name": provision.student.student_name,
        "exam_id": provision.exam.exam_id,
        "exam_name": provision.exam.exam_name,
        "course_code": provision.exam.course_code,
        "provisions": provision.provisions,
        "notes": provision.notes,
        "exam_venue_id": exam_venue.pk if exam_venue else None,
        "exam_venue_caps": filtered_exam_caps,
        "venue_name": venue.venue_name if venue else None,
        "venue_type": venue.venuetype if venue else None,
        "venue_accessible": venue.is_accessible if venue else None,
        "required_capabilities": required_caps,
        "allowed_venue_types": sorted(list(allowed_types)) if allowed_types else [],
        "matches_needs": matches_needs,
        "allocation_issue": allocation_issue,
        "manual_allocation_override": manual_override,
        "student_exam_id": student_exam.pk if student_exam else None,
    }


class StudentProvisionListView(APIView):
    """
    Return provision records for students, optionally filtered to those
    whose allocated venue does not yet meet their needs.
    """

    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []  # Admin-only

    def get(self, request, *args, **kwargs):
        unallocated_only = str(request.query_params.get("unallocated") or "").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        diet_code = (request.query_params.get("diet") or "").strip()
        diet = None
        if diet_code:
            diet = Diet.objects.filter(code=diet_code).first()
            if not diet:
                return Response({"detail": "Diet not found."}, status=status.HTTP_400_BAD_REQUEST)
            if not diet.start_date or not diet.end_date:
                return Response(
                    {"detail": "Diet must have start and end dates to filter provisions."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        provisions = Provisions.objects.select_related("student", "exam").all()
        student_exam_map = {
            (se.student_id, se.exam_id): se
            for se in StudentExam.objects.select_related("exam_venue__venue", "student", "exam")
        }

        rows = []
        for provision in provisions:
            student_exam = student_exam_map.get((provision.student_id, provision.exam_id))
            if diet and student_exam:
                exam_venue = getattr(student_exam, "exam_venue", None)
                start_time = getattr(exam_venue, "start_time", None)
                if not start_time:
                    continue
                start_day = start_time.date()
                if start_day < diet.start_date or start_day > diet.end_date:
                    continue
            row = _provision_row(provision, student_exam)

            if unallocated_only and row["matches_needs"]:
                continue

            rows.append(row)

        rows.sort(key=lambda r: (r.get("student_name") or "", r.get("course_code") or ""))
        return Response(rows)

    def patch(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        manual_override = data.get("manual_allocation_override", None)
        student_exam_id = data.get("student_exam_id")
        if student_exam_id in (None, ""):
            return Response({"detail": "student_exam_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            student_exam_id = int(student_exam_id)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid student_exam_id."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student_exam = StudentExam.objects.select_related("student", "exam", "exam_venue__venue").get(
                pk=student_exam_id
            )
        except StudentExam.DoesNotExist:
            return Response({"detail": "Student exam not found."}, status=status.HTTP_404_NOT_FOUND)

        update_fields = []
        has_exam_venue = "exam_venue_id" in data
        previous_exam_venue_id = student_exam.exam_venue_id
        previous_manual_override = bool(getattr(student_exam, "manual_allocation_override", False))
        exam_venue_id = data.get("exam_venue_id", None)
        new_exam_venue = None
        if has_exam_venue:
            if exam_venue_id not in (None, ""):
                try:
                    exam_venue_id = int(exam_venue_id)
                except (TypeError, ValueError):
                    return Response({"detail": "Invalid exam_venue_id."}, status=status.HTTP_400_BAD_REQUEST)

                try:
                    new_exam_venue = ExamVenue.objects.select_related("exam", "venue").get(pk=exam_venue_id)
                except ExamVenue.DoesNotExist:
                    return Response({"detail": "Exam venue not found."}, status=status.HTTP_404_NOT_FOUND)

                if new_exam_venue.exam_id != student_exam.exam_id:
                    return Response(
                        {"detail": "Exam venue does not belong to this exam."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            student_exam.exam_venue = new_exam_venue
            update_fields.append("exam_venue")
            if manual_override is None:
                manual_override = False

        manual_override_value = previous_manual_override
        if manual_override is not None:
            if isinstance(manual_override, bool):
                manual_override_value = manual_override
            elif isinstance(manual_override, str):
                manual_override_value = manual_override.strip().lower() in {"1", "true", "yes", "on"}
            else:
                manual_override_value = bool(manual_override)
            student_exam.manual_allocation_override = manual_override_value
            update_fields.append("manual_allocation_override")

        if not update_fields:
            return Response({"detail": "No fields to update."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student_exam.save(update_fields=update_fields)
        except DjangoValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        provision = Provisions.objects.filter(student=student_exam.student, exam=student_exam.exam).first()
        if provision is None:
            return Response(
                {"detail": "Provision record not found for the student and exam."},
                status=status.HTTP_404_NOT_FOUND,
            )

        row = _provision_row(provision, student_exam)
        exam_name = getattr(student_exam.exam, "exam_name", "Exam")
        student_name = getattr(student_exam.student, "student_name", "Student")
        if has_exam_venue and previous_exam_venue_id != student_exam.exam_venue_id:
            venue_name = (
                new_exam_venue.venue.venue_name
                if new_exam_venue and new_exam_venue.venue
                else "Unassigned"
            )
            log_notification(
                "venueChange",
                f"{student_name} moved to {venue_name} for {exam_name}.",
                user=getattr(request, "user", None),
            )

        if manual_override is not None and manual_override_value != previous_manual_override:
            action = "confirmed" if manual_override_value else "unconfirmed"
            Notification.objects.create(
                type=Notification.NotificationType.ALLOCATION,
                admin_message=f"Allocation {action} for {student_name} ({exam_name}).",
                invigilator_message="",
                timestamp=timezone.now(),
                triggered_by=getattr(request, "user", None),
            )

        return Response(row, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        student_exam_id = data.get("student_exam_id")
        student_id = data.get("student_id")
        exam_id = data.get("exam_id")

        if student_exam_id not in (None, ""):
            try:
                student_exam_id = int(student_exam_id)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid student_exam_id."}, status=status.HTTP_400_BAD_REQUEST)

            try:
                student_exam = StudentExam.objects.select_related("student", "exam").get(pk=student_exam_id)
            except StudentExam.DoesNotExist:
                return Response({"detail": "Student exam not found."}, status=status.HTTP_404_NOT_FOUND)

            student_id = student_exam.student_id
            exam_id = student_exam.exam_id
        else:
            if student_id in (None, "") or exam_id in (None, ""):
                return Response(
                    {"detail": "student_exam_id or student_id and exam_id are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                exam_id = int(exam_id)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid exam_id."}, status=status.HTTP_400_BAD_REQUEST)

        provision_qs = Provisions.objects.filter(student_id=student_id, exam_id=exam_id)
        if not provision_qs.exists():
            return Response(
                {"detail": "Provision record not found for the student and exam."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            deleted_count, _ = provision_qs.delete()
            StudentExam.objects.filter(student_id=student_id, exam_id=exam_id).delete()
            if student_id:
                has_remaining = (
                    Provisions.objects.filter(student_id=student_id).exists()
                    or StudentExam.objects.filter(student_id=student_id).exists()
                )
                if not has_remaining:
                    Student.objects.filter(student_id=student_id).delete()

        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)


class StudentProvisionRefreshView(APIView):
    """
    Rerun the student provision allocation logic against current venue data.
    """

    permission_classes = [permissions.IsAdminUser]
    throttle_classes: list = []

    def post(self, request, *args, **kwargs):
        summary = rerun_provision_allocation()
        try:
            updated = summary.get("updated", 0)
            skipped = summary.get("skipped", 0)
            unchanged = summary.get("unchanged", 0)
            Notification.objects.create(
                type=Notification.NotificationType.ALLOCATION,
                admin_message=f"Provision allocation refresh complete: {updated} updated, {skipped} skipped, {unchanged} unchanged.",
                invigilator_message="",
                timestamp=timezone.now(),
                triggered_by=getattr(request, "user", None),
            )
        except Exception:
            pass
        return Response(summary, status=status.HTTP_200_OK)


class InvigilatorNotificationsView(APIView):
    """
    Return recent notifications (last 20) for the authenticated invigilator.
    Includes global notifications and those targeted at the invigilator.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []  # Lightweight

    def get(self, request, *args, **kwargs):
        invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response([])

        hidden_types = [
            Notification.NotificationType.EXAM_CHANGE,
            Notification.NotificationType.VENUE_CHANGE,
            Notification.NotificationType.ALLOCATION,
            Notification.NotificationType.MAIL_MERGE,
            Notification.NotificationType.ADMIN_MESSAGE,
        ]
        qs = (
            Notification.objects.filter(
                models.Q(invigilator__isnull=True) | models.Q(invigilator=invigilator)
            )
            .exclude(type__in=hidden_types)
            .order_by("-timestamp")[:20]
        )
        return Response(NotificationSerializer(qs, many=True).data)


class InvigilatorAvailabilityView(APIView):
    """
    Allow invigilators to view and update availability (restrictions) for a given diet.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    def _get_invigilator(self, request):
        invigilator = getattr(request.user, "invigilator_profile", None)
        if invigilator is None:
            invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        return invigilator

    def _validate_diet(self, diet_code: str | None) -> Diet:
        if not diet_code:
            raise ValidationError({"diet": "Diet is required."})
        diet = Diet.objects.filter(code=diet_code).first()
        if not diet:
            raise ValidationError({"diet": f"Unknown diet '{diet_code}'."})
        return diet

    def _ensure_availability_rows(self, invigilator, diet_code: str, start_date: date | None, end_date: date | None):
        if start_date is None or end_date is None:
            return
        current_date = start_date
        to_create = []
        while current_date <= end_date:
            for slot in SlotChoices.values:
                to_create.append(
                    InvigilatorAvailability(
                        invigilator=invigilator,
                        date=current_date,
                        slot=slot,
                        available=True,
                    )
                )
            current_date += timedelta(days=1)
        InvigilatorAvailability.objects.bulk_create(to_create, ignore_conflicts=True)

    def _serialize_days(self, qs, start_date: date | None, end_date: date | None):
        entries = list(qs)
        by_date = {}
        for item in entries:
            key = item.date.isoformat()
            by_date.setdefault(key, {})[item.slot] = bool(item.available)

        # If we don't have a known range, infer one from the data
        inferred_start = inferred_end = None
        if entries:
            inferred_start = min(e.date for e in entries)
            inferred_end = max(e.date for e in entries)
        start = start_date or inferred_start
        end = end_date or inferred_end

        days = []
        if start and end:
            current_date = start
            while current_date <= end:
                key = current_date.isoformat()
                slots_map = by_date.get(key, {})
                slots = [
                    {"slot": slot, "available": slots_map.get(slot, True)}
                    for slot in SlotChoices.values
                ]
                days.append({"date": key, "slots": slots})
                current_date += timedelta(days=1)
        else:
            for key, slots_map in sorted(by_date.items()):
                slots = [
                    {"slot": slot, "available": slots_map.get(slot, True)}
                    for slot in SlotChoices.values
                ]
                days.append({"date": key, "slots": slots})
        return days

    def _serialize_entries(self, qs):
        return [
            {
                "date": item.date.isoformat(),
                "slot": item.slot,
                "available": bool(item.available),
            }
            for item in qs
        ]

    def get(self, request, *args, **kwargs):
        invigilator = self._get_invigilator(request)
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        restriction_diets = list(
            InvigilatorRestriction.objects.filter(invigilator=invigilator).values_list("diet", flat=True)
        )
        diet_qs = list(Diet.objects.all().order_by("-is_active", "-start_date", "code"))
        if not diet_qs:
            return Response({"detail": "No diets are configured."}, status=status.HTTP_400_BAD_REQUEST)

        available_diets = [
            {
                "code": d.code,
                "name": d.name,
                "start_date": str(d.start_date) if d.start_date else None,
                "end_date": str(d.end_date) if d.end_date else None,
                "restriction_cutoff": str(d.restriction_cutoff) if d.restriction_cutoff else None,
                "is_active": d.is_active,
            }
            for d in diet_qs
        ]

        requested_diet_code = request.query_params.get("diet")
        diet_obj = None
        if requested_diet_code:
            diet_obj = self._validate_diet(requested_diet_code)
        else:
            diet_obj = next((d for d in diet_qs if d.is_active), diet_qs[0] if diet_qs else None)

        if diet_obj is None:
            return Response({"detail": "No diets are configured."}, status=status.HTTP_400_BAD_REQUEST)

        diet = diet_obj.code
        start_date = diet_obj.start_date
        end_date = diet_obj.end_date

        self._ensure_availability_rows(invigilator, diet, start_date, end_date)

        qs = InvigilatorAvailability.objects.filter(invigilator=invigilator)
        if start_date and end_date:
            qs = qs.filter(date__range=(start_date, end_date))
        qs = qs.order_by("date", "slot")

        entries = list(qs)

        return Response(
            {
                "diet": diet,
                "diet_name": diet_obj.name,
                "restriction_cutoff": str(diet_obj.restriction_cutoff) if diet_obj.restriction_cutoff else None,
                "start_date": str(start_date) if start_date else None,
                "end_date": str(end_date) if end_date else None,
                "diets": available_diets,
                "days": self._serialize_days(entries, start_date, end_date),
                "availabilities": self._serialize_entries(entries),
            }
        )

    def put(self, request, *args, **kwargs):
        invigilator = self._get_invigilator(request)
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data or {}
        diet_obj = self._validate_diet(payload.get("diet"))
        diet = diet_obj.code
        unavailable = payload.get("unavailable") or []

        cutoff_date = diet_obj.restriction_cutoff
        today = timezone.localdate()
        if cutoff_date and today >= cutoff_date:
            return Response(
                {
                    "detail": f"Restrictions for {diet_obj.name or diet} closed on {cutoff_date}. Please contact administrators to request changes."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        start_date = diet_obj.start_date
        end_date = diet_obj.end_date

        self._ensure_availability_rows(invigilator, diet, start_date, end_date)

        # Normalize and validate unavailable slots
        unavailable_set = set()
        for entry in unavailable:
            try:
                date_str = (entry.get("date") or "").strip()
                slot = (entry.get("slot") or "").strip()
            except AttributeError:
                continue
            if slot not in SlotChoices.values:
                continue
            try:
                parsed_date = date.fromisoformat(date_str)
            except Exception:
                continue
            if start_date and end_date and (parsed_date < start_date or parsed_date > end_date):
                continue
            unavailable_set.add((parsed_date, slot))

        qs_base = InvigilatorAvailability.objects.filter(invigilator=invigilator)
        if start_date and end_date:
            qs_base = qs_base.filter(date__range=(start_date, end_date))
        qs = list(qs_base)

        # Reset all to available, then apply restrictions
        to_update = []
        for item in qs:
            item.available = True
        for item in qs:
            if (item.date, item.slot) in unavailable_set:
                item.available = False
            to_update.append(item)
        InvigilatorAvailability.objects.bulk_update(to_update, ["available"])

        # Prepare notification
        inv_name = invigilator.preferred_name or invigilator.full_name or "Invigilator"
        diet_label = diet_obj.name or diet
        count_unavailable = len(unavailable_set)

        def _format_slot(slot: str) -> str:
            return slot.replace("_", " ").title()

        slot_order = {slot: idx for idx, slot in enumerate(SlotChoices.values)}

        def _summarize_unavailable() -> str:
            by_date: dict[date, list[str]] = {}
            for unavailable_date, slot in unavailable_set:
                by_date.setdefault(unavailable_date, []).append(slot)

            parts: list[str] = []
            for unavailable_date in sorted(by_date.keys())[:3]:
                slots_for_day = sorted(by_date[unavailable_date], key=lambda s: slot_order.get(s, len(slot_order)))
                slot_labels = ", ".join(_format_slot(slot) for slot in slots_for_day)
                parts.append(f"{unavailable_date.strftime('%b %d')}: {slot_labels}")

            remaining_days = len(by_date) - len(parts)
            if remaining_days > 0:
                parts.append(f"+{remaining_days} more day{'s' if remaining_days != 1 else ''}")

            return "; ".join(parts)

        if count_unavailable:
            slot_word = "slot" if count_unavailable == 1 else "slots"
            summary = _summarize_unavailable()
            if summary:
                message = f"{inv_name} updated availability for {diet_label}: unavailable on {summary} ({count_unavailable} {slot_word})"
                invigilator_message = f"You updated availability for {diet_label}: unavailable on {summary} ({count_unavailable} {slot_word})"
            else:
                message = f"{inv_name} updated availability for {diet_label}: {count_unavailable} {slot_word} unavailable"
                invigilator_message = f"You updated availability for {diet_label}: {count_unavailable} {slot_word} unavailable"
        else:
            message = f"{inv_name} set availability for {diet_label}: all slots available"
            invigilator_message = f"You set availability for {diet_label}: all slots available"
        Notification.objects.create(
            type=Notification.NotificationType.AVAILABILITY,
            invigilator_message=invigilator_message,
            admin_message=message,
            timestamp=timezone.now(),
            triggered_by=request.user,
            invigilator=invigilator,
        )

        refreshed_qs = InvigilatorAvailability.objects.filter(invigilator=invigilator)
        if start_date and end_date:
            refreshed_qs = refreshed_qs.filter(date__range=(start_date, end_date))
        refreshed_qs = refreshed_qs.order_by("date", "slot")

        refreshed = list(refreshed_qs)

        return Response(
            {
                "status": "ok",
                "diet": diet,
                "unavailable_count": count_unavailable,
                "start_date": str(start_date) if start_date else None,
                "end_date": str(end_date) if end_date else None,
                "days": self._serialize_days(refreshed, start_date, end_date),
                "availabilities": self._serialize_entries(refreshed),
            },
            status=status.HTTP_200_OK,
        )


class InvigilatorStatsView(APIView):
    """
    Returns stats for the currently authenticated invigilator.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []  # Lightweight endpoint

    def get(self, request, *args, **kwargs):
        user = request.user
        invigilator = getattr(user, "invigilator_profile", None) or _resolve_invigilator_for_user(user)
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        assignments = InvigilatorAssignment.objects.select_related("exam_venue__exam", "exam_venue__venue").filter(
            invigilator=invigilator
        )
        now_ts = timezone.now()
        upcoming_qs = assignments.filter(cancel=False, assigned_start__gte=now_ts).order_by("assigned_start")
        cancelled_qs = assignments.filter(cancel=True)

        next_assignment = upcoming_qs.first()

        def _duration_hours(qs):
            total = 0.0
            for a in qs:
                try:
                    total += float(a.total_hours())
                except Exception:
                    continue
            return round(total, 2)

        data = {
            "total_shifts": assignments.count(),
            "upcoming_shifts": upcoming_qs.count(),
            "cancelled_shifts": cancelled_qs.count(),
            "hours_assigned": _duration_hours(assignments),
            "hours_upcoming": _duration_hours(upcoming_qs),
            "restrictions": InvigilatorRestriction.objects.filter(invigilator=invigilator).count(),
            "availability_entries": InvigilatorAvailability.objects.filter(invigilator=invigilator).count(),
            "next_assignment": None,
        }
        if next_assignment:
            data["next_assignment"] = {
                "exam_name": getattr(next_assignment.exam_venue.exam, "exam_name", None) if next_assignment.exam_venue else None,
                "venue_name": getattr(next_assignment.exam_venue.venue, "venue_name", None) if next_assignment.exam_venue else None,
                "start": next_assignment.assigned_start,
                "end": next_assignment.assigned_end,
                "role": next_assignment.role,
            }
        return Response(data, status=status.HTTP_200_OK)


class InvigilatorAssignmentsView(APIView):
    """
    Return assignments for the authenticated invigilator.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    def get(self, request, *args, **kwargs):
        invigilator = getattr(request.user, "invigilator_profile", None)
        if invigilator is None:
            invigilator = _resolve_invigilator_for_user(getattr(request, "user", None))
        if invigilator is None:
            return Response({"detail": "Invigilator profile not found."}, status=status.HTTP_404_NOT_FOUND)

        assignments = (
            InvigilatorAssignment.objects.select_related("exam_venue__exam", "exam_venue__venue")
            .filter(invigilator=invigilator)
            .order_by("assigned_start")
        )

        return Response(InvigilatorAssignmentSerializer(assignments, many=True).data)
