from datetime import date, datetime, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from timetabling_system.api import views as api_views
from timetabling_system.api.serializers import (
    ExamVenueSerializer,
    ExamVenueWriteSerializer,
    InvigilatorSerializer,
)
from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    Invigilator,
    Diet,
    InvigilatorAvailability,
    InvigilatorAssignment,
    InvigilatorQualificationChoices,
    Venue,
    VenueType,
)


class ExamVenueSerializerTests(TestCase):
    def setUp(self):
        self.exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=100,
            exam_school="Engineering",
            school_contact="Dr. Smith",
        )

    def test_invalid_venue_name_rejected(self):
        serializer = ExamVenueWriteSerializer(
            data={
                "exam": self.exam.pk,
                "venue_name": "Missing Room",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.assertRaises(DRFValidationError):
            serializer.save()

    def test_missing_exam_raises_validation_error(self):
        serializer = ExamVenueWriteSerializer(data={"venue_name": ""})
        self.assertFalse(serializer.is_valid())

    def test_core_examvenue_cannot_be_updated(self):
        venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ev = ExamVenue.objects.create(
            exam=self.exam,
            venue=venue,
            start_time=None,
            exam_length=None,
            core=True,
        )
        serializer = ExamVenueWriteSerializer(
            instance=ev,
            data={"exam": self.exam.pk},
            partial=True,
        )
        with self.assertRaises(DRFValidationError):
            serializer.is_valid(raise_exception=True)

    def test_to_representation_reuses_read_serializer(self):
        venue = Venue.objects.create(
            venue_name="Hall B",
            capacity=50,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ev = ExamVenue.objects.create(
            exam=self.exam,
            venue=venue,
            start_time=None,
            exam_length=90,
            core=False,
        )
        serializer = ExamVenueWriteSerializer()
        data = serializer.to_representation(ev)
        self.assertEqual(data["venue_name"], "Hall B")
        self.assertEqual(data["exam_length"], 90)

    def test_create_allows_placeholder_when_venue_blank(self):
        serializer = ExamVenueWriteSerializer(
            data={
                "exam": self.exam.pk,
                "venue_name": "",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        ev = serializer.save()
        self.assertIsNone(ev.venue)

    def test_update_changes_venue_via_name(self):
        first = Venue.objects.create(
            venue_name="Hall C",
            capacity=40,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        second = Venue.objects.create(
            venue_name="Hall D",
            capacity=30,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ev = ExamVenue.objects.create(
            exam=self.exam,
            venue=first,
            start_time=None,
            exam_length=75,
            core=False,
        )
        serializer = ExamVenueWriteSerializer(
            instance=ev,
            data={"exam": self.exam.pk, "venue_name": second.venue_name},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.venue, second)

    def test_separate_room_update_ignores_same_exam_conflict(self):
        venue = Venue.objects.create(
            venue_name="Room 1",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            is_accessible=True,
        )
        start_time = timezone.make_aware(datetime(2025, 1, 10, 9, 0))
        ExamVenue.objects.create(
            exam=self.exam,
            venue=venue,
            start_time=start_time,
            exam_length=60,
            core=False,
        )
        ev = ExamVenue.objects.create(
            exam=self.exam,
            venue=venue,
            start_time=start_time,
            exam_length=60,
            core=False,
        )

        serializer = ExamVenueWriteSerializer(
            instance=ev,
            data={
                "exam": self.exam.pk,
                "venue_name": venue.venue_name,
                "start_time": start_time,
                "exam_length": 60,
                "provision_capabilities": [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class InvigilatorSerializerTests(TestCase):
    def setUp(self):
        self.diet, _ = Diet.objects.update_or_create(
            code="DEC_2025",
            defaults={
                "name": "December 2025",
                "start_date": date(2025, 1, 1),
                "end_date": date(2025, 1, 1),
                "is_active": True,
            },
        )

    def test_create_invigilator_generates_availability(self):
        serializer = InvigilatorSerializer(
            data={
                "preferred_name": "Pat",
                "full_name": "Pat Invigilator",
                "qualifications": [{"qualification": InvigilatorQualificationChoices.CHECK_IN}],
                "restrictions": [
                    {"diet": "DEC_2025", "restrictions": [], "notes": "note"},
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invig = serializer.save()
        self.assertEqual(invig.qualifications.count(), 1)
        # Single day diet range -> 2 slots (morning + evening)
        self.assertEqual(InvigilatorAvailability.objects.filter(invigilator=invig).count(), 2)

    def test_update_replaces_qualifications_and_restrictions(self):
        invig = Invigilator.objects.create(preferred_name="Sam", full_name="Sam Invig")
        serializer = InvigilatorSerializer(
            instance=invig,
            data={
                "preferred_name": "Sam",
                "full_name": "Sam Invig",
                "qualifications": [{"qualification": InvigilatorQualificationChoices.AKT_TRAINED}],
                "restrictions": [{"diet": "DEC_2025", "restrictions": ["accessibility_required"], "notes": ""}],
            },
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        invig.refresh_from_db()
        self.assertEqual(invig.qualifications.count(), 1)
        self.assertEqual(invig.restrictions.count(), 1)
        self.assertEqual(InvigilatorAvailability.objects.filter(invigilator=invig).count(), 2)

    def test_generate_availability_skips_unknown_diet_ranges(self):
        self.diet.delete()
        serializer = InvigilatorSerializer(
            data={
                "preferred_name": "Lee",
                "full_name": "Lee Invigilator",
                "restrictions": [
                    {"diet": "DEC_2025", "restrictions": [], "notes": ""},
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invig = serializer.save()
        self.assertEqual(InvigilatorAvailability.objects.filter(invigilator=invig).count(), 0)

    def test_generate_availability_handles_multiple_diets(self):
        # Use an existing DietChoices code for compatibility
        diet2, _ = Diet.objects.update_or_create(
            code="APR_MAY_2026",
            defaults={
                "name": "April/May 2026",
                "start_date": date(2026, 4, 1),
                "end_date": date(2026, 4, 2),
                "is_active": True,
            },
        )
        serializer = InvigilatorSerializer(
            data={
                "preferred_name": "Alex",
                "full_name": "Alex Invig",
                "restrictions": [
                    {"diet": self.diet.code, "restrictions": [], "notes": ""},
                    {"diet": diet2.code, "restrictions": [], "notes": ""},
                ],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invig = serializer.save()
        # self.diet is 1 day (2 slots), diet2 is 2 days (4 slots) -> total 6
        self.assertEqual(InvigilatorAvailability.objects.filter(invigilator=invig).count(), 6)

    def test_invigilator_serializer_exposes_admin_flags(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="adminish",
            email="adminish@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        invig = Invigilator.objects.create(
            preferred_name="Adminish",
            full_name="Adminish Example",
            user=admin_user,
        )

        data = InvigilatorSerializer(instance=invig).data

        self.assertTrue(data["user_is_staff"])
        self.assertTrue(data["user_is_superuser"])
        self.assertFalse(data["user_is_senior_admin"])

    def test_invigilator_serializer_exposes_senior_admin_flag(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="senior",
            email="senior@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
            is_senior_admin=True,
        )
        invig = Invigilator.objects.create(
            preferred_name="Senior",
            full_name="Senior Example",
            user=admin_user,
        )

        data = InvigilatorSerializer(instance=invig).data

        self.assertTrue(data["user_is_senior_admin"])

    def test_generate_availability_skips_diet_without_dates(self):
        diet_no_dates, _ = Diet.objects.update_or_create(
            code=self.diet.code, defaults={"name": self.diet.name, "start_date": None, "end_date": None}
        )
        serializer = InvigilatorSerializer(
            data={
                "preferred_name": "Jo",
                "full_name": "Jo Invig",
                "restrictions": [{"diet": diet_no_dates.code, "restrictions": [], "notes": ""}],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        invig = serializer.save()
        self.assertEqual(InvigilatorAvailability.objects.filter(invigilator=invig).count(), 0)


class ApiViewHelpersTests(TestCase):
    def test_log_notification_swallows_exceptions(self):
        with mock.patch("timetabling_system.api.views.Notification.objects.create", side_effect=Exception("boom")):
            # Should not raise
            api_views.log_notification("test", "msg")

    def test_viewset_serializer_selection(self):
        venue_view = api_views.VenueViewSet()
        venue_view.action = "create"
        self.assertIs(api_views.VenueWriteSerializer, venue_view.get_serializer_class())

        examvenue_view = api_views.ExamVenueViewSet()
        examvenue_view.action = "partial_update"
        self.assertIs(api_views.ExamVenueWriteSerializer, examvenue_view.get_serializer_class())

    def test_log_notification_handles_exception(self):
        with mock.patch("timetabling_system.api.views.Notification.objects.create", side_effect=Exception("boom")):
            api_views.log_notification("test", "msg")


class ApiViewActionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = get_user_model().objects.create_user(username="casey", password="pass")
        self.other_user = get_user_model().objects.create_user(username="alex", password="pass")
        self.exam = Exam.objects.create(
            exam_name="Physics",
            course_code="PHYS100",
            exam_type="Written",
            no_students=50,
            exam_school="Science",
            school_contact="Dr. Z",
        )
        self.venue = Venue.objects.create(
            venue_name="Main Hall",
            capacity=150,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        self.alt_venue = Venue.objects.create(
            venue_name="Side Hall",
            capacity=40,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        self.examvenue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now(),
            exam_length=90,
            core=False,
        )
        self.invigilator = Invigilator.objects.create(
            preferred_name="Casey",
            full_name="Casey Invigilator",
            user=self.user,
        )
        self.other_invigilator = Invigilator.objects.create(
            preferred_name="Alex",
            full_name="Alex Invigilator",
            user=self.other_user,
        )
        self.assignment = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.examvenue,
            role="lead",
            assigned_start=timezone.now(),
            assigned_end=timezone.now() + timedelta(hours=2),
        )

    def test_exam_and_venue_viewsets_log_notifications(self):
        exam_view = api_views.ExamViewSet()
        venue_view = api_views.VenueViewSet()
        venue_view.action = None
        self.assertIs(api_views.VenueSerializer, venue_view.get_serializer_class())

        exam_serializer = mock.Mock()
        exam_serializer.save.return_value = self.exam
        venue_serializer = mock.Mock()
        venue_serializer.save.return_value = self.venue

        with mock.patch("timetabling_system.api.views.log_notification") as log:
            exam_view.perform_update(exam_serializer)
            venue_view.perform_create(venue_serializer)
            venue_view.perform_update(venue_serializer)
            temp_venue = Venue.objects.create(
                venue_name="Temp Hall",
                capacity=10,
                venuetype=VenueType.MAIN_HALL,
                is_accessible=True,
            )
            venue_view.perform_destroy(temp_venue)
        self.assertGreaterEqual(log.call_count, 4)

    def test_examvenue_viewset_branches(self):
        view = api_views.ExamVenueViewSet()
        view.action = "list"
        self.assertIs(api_views.ExamVenueSerializer, view.get_serializer_class())

        serializer = mock.Mock()
        serializer.save.return_value = self.examvenue

        with mock.patch("timetabling_system.api.views.log_notification") as log:
            view.perform_update(serializer)
            view.perform_create(serializer)
        self.assertGreaterEqual(log.call_count, 2)

        to_delete = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.alt_venue,
            start_time=timezone.now(),
            exam_length=60,
            core=False,
        )
        with mock.patch("timetabling_system.api.views.log_notification") as log_destroy:
            view.perform_destroy(to_delete)
        self.assertEqual(log_destroy.call_count, 1)

    def test_invigilator_and_assignment_views_log(self):
        inv_view = api_views.InvigilatorViewSet()
        inv_serializer = mock.Mock()
        inv_serializer.save.return_value = self.invigilator
        with mock.patch("timetabling_system.api.views._get_request_user", return_value=None), \
            mock.patch("timetabling_system.api.views.Notification.objects.create") as log:
            inv_view.perform_update(inv_serializer)
        self.assertEqual(log.call_count, 1)

        assign_view = api_views.InvigilatorAssignmentViewSet()
        assign_serializer = mock.Mock()
        assign_serializer.save.return_value = self.assignment
        with mock.patch("timetabling_system.api.views._get_request_user", return_value=None), \
            mock.patch("timetabling_system.api.views.Notification.objects.create") as log_assign:
            assign_view.perform_create(assign_serializer)
            assign_view.perform_destroy(self.assignment)
        self.assertEqual(log_assign.call_count, 2)

    def test_available_covers_filters_conflicts(self):
        now = timezone.now()
        exam_conflict = Exam.objects.create(
            exam_name="Maths",
            course_code="MATH100",
            exam_type="Written",
            no_students=60,
            exam_school="Science",
            school_contact="Dr. M",
        )
        exam_conflict_venue = ExamVenue.objects.create(
            exam=exam_conflict,
            venue=self.venue,
            start_time=now + timedelta(hours=2),
            exam_length=120,
            core=False,
        )
        conflicting_cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=exam_conflict_venue,
            role="lead",
            assigned_start=now + timedelta(hours=2),
            assigned_end=now + timedelta(hours=4),
            cancel=True,
        )
        exam_safe = Exam.objects.create(
            exam_name="Chemistry",
            course_code="CHEM100",
            exam_type="Written",
            no_students=30,
            exam_school="Science",
            school_contact="Dr. A",
        )
        exam_safe_venue = ExamVenue.objects.create(
            exam=exam_safe,
            venue=self.venue,
            start_time=now + timedelta(hours=6),
            exam_length=90,
            core=False,
        )
        available_cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=exam_safe_venue,
            role="assistant",
            assigned_start=now + timedelta(hours=6),
            assigned_end=now + timedelta(hours=8),
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=exam_conflict_venue,
            role="assistant",
            assigned_start=now + timedelta(hours=3),
            assigned_end=now + timedelta(hours=3, minutes=30),
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"get": "available_covers"})
        request = self.factory.get("/invigilator/assignments/available-covers/")
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        returned_ids = {item["id"] for item in response.data}
        self.assertIn(available_cancelled.id, returned_ids)
        self.assertNotIn(conflicting_cancelled.id, returned_ids)

    def test_pickup_creates_cover_assignment(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Biology",
            course_code="BIO100",
            exam_type="Written",
            no_students=40,
            exam_school="Science",
            school_contact="Dr. B",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=5),
            exam_length=120,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=5),
            assigned_end=now + timedelta(hours=7),
            cancel=True,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "pickup"})
        request = self.factory.post(f"/invigilator/assignments/{cancelled.pk}/pickup/")
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 201)

        replacement = InvigilatorAssignment.objects.exclude(pk=cancelled.pk).get(cover_for=cancelled)
        self.assertTrue(replacement.cover)
        self.assertEqual(replacement.invigilator, self.invigilator)
        self.assertEqual(replacement.role, cancelled.role)

    def test_own_cancelled_shift_not_pickable(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="History",
            course_code="HIST100",
            exam_type="Written",
            no_students=25,
            exam_school="Humanities",
            school_contact="Dr. H",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=2),
            exam_length=90,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=2),
            assigned_end=now + timedelta(hours=4),
            cancel=True,
        )

        list_view = api_views.InvigilatorAssignmentViewSet.as_view({"get": "available_covers"})
        list_request = self.factory.get("/invigilator-assignments/available-covers/")
        force_authenticate(list_request, user=self.user)
        list_response = list_view(list_request)
        self.assertEqual(list_response.status_code, 200)
        ids_returned = {item["id"] for item in list_response.data}
        self.assertNotIn(cancelled.id, ids_returned)

        pickup_view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "pickup"})
        pickup_request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/pickup/")
        force_authenticate(pickup_request, user=self.user)
        pickup_response = pickup_view(pickup_request, pk=cancelled.pk)
        self.assertEqual(pickup_response.status_code, 400)
        self.assertIn("cannot pick up your own", pickup_response.data.get("detail", "").lower())

    def test_request_cancel_marks_assignment(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Geo",
            course_code="GEO100",
            exam_type="Written",
            no_students=25,
            exam_school="Science",
            school_contact="Dr. G",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=4),
            exam_length=90,
            core=False,
        )
        upcoming = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=4),
            assigned_end=now + timedelta(hours=6),
            cancel=False,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "request_cancel"})
        request = self.factory.post(f"/invigilator-assignments/{upcoming.pk}/request-cancel/", {"reason": "Unavailable"})
        force_authenticate(request, user=self.user)
        response = view(request, pk=upcoming.pk)
        self.assertEqual(response.status_code, 200)
        upcoming.refresh_from_db()
        self.assertTrue(upcoming.cancel)
        self.assertEqual(upcoming.cancel_cause, "Unavailable")

    def test_undo_cancel_happy_path(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Stats",
            course_code="STAT100",
            exam_type="Written",
            no_students=25,
            exam_school="Science",
            school_contact="Dr. S",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=6),
            exam_length=120,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=6),
            assigned_end=now + timedelta(hours=8),
            cancel=True,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "undo_cancel"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/undo-cancel/", {"reason": "Still available"})
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 200)
        cancelled.refresh_from_db()
        self.assertFalse(cancelled.cancel)
        self.assertEqual(cancelled.cancel_cause, "Still available")

    def test_undo_cancel_blocked_when_covered(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Law",
            course_code="LAW100",
            exam_type="Written",
            no_students=30,
            exam_school="Law",
            school_contact="Dr. L",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=3),
            exam_length=90,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=3),
            assigned_end=now + timedelta(hours=5),
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=cancelled.assigned_start,
            assigned_end=cancelled.assigned_end,
            cancel=False,
            cover=True,
            cover_for=cancelled,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "undo_cancel"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/undo-cancel/", {"reason": "Changed mind"})
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 400)
        cancelled.refresh_from_db()
        self.assertTrue(cancelled.cancel)

    def test_undo_cancel_rejects_not_owner(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Philosophy",
            course_code="PHIL100",
            exam_type="Written",
            no_students=20,
            exam_school="Arts",
            school_contact="Dr. P",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=2),
            exam_length=90,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=2),
            assigned_end=now + timedelta(hours=4),
            cancel=True,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "undo_cancel"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/undo-cancel/", {"reason": "Not yours"})
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 404)
        cancelled.refresh_from_db()
        self.assertTrue(cancelled.cancel)

    def test_available_covers_excludes_own_and_includes_details(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Politics",
            course_code="POL100",
            exam_type="Written",
            no_students=35,
            exam_school="Social Science",
            school_contact="Dr. P",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=2),
            exam_length=90,
            core=False,
        )
        own_cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=2),
            assigned_end=now + timedelta(hours=4),
            cancel=True,
        )
        other_cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=2),
            assigned_end=now + timedelta(hours=4),
            cancel=True,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"get": "available_covers"})
        request = self.factory.get("/invigilator/assignments/available-covers/")
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertNotIn(own_cancelled.id, ids)
        self.assertIn(other_cancelled.id, ids)

    def test_available_covers_filters_time_conflicts(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Chem",
            course_code="CHEM100",
            exam_type="Written",
            no_students=35,
            exam_school="Science",
            school_contact="Dr. C",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=4),
            exam_length=120,
            core=False,
        )
        conflicting = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=4),
            assigned_end=now + timedelta(hours=6),
            cancel=True,
        )
        blocking_examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.alt_venue,
            start_time=now + timedelta(hours=4, minutes=15),
            exam_length=120,
            core=False,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=blocking_examvenue,
            role="assistant",
            assigned_start=blocking_examvenue.start_time,
            assigned_end=blocking_examvenue.start_time + timedelta(hours=2),
            cancel=False,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"get": "available_covers"})
        request = self.factory.get("/invigilator/assignments/available-covers/")
        force_authenticate(request, user=self.user)
        response = view(request)
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertNotIn(conflicting.id, ids)

    def test_pickup_returns_cover_filled(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Drama",
            course_code="DRM100",
            exam_type="Written",
            no_students=20,
            exam_school="Arts",
            school_contact="Dr. D",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=3),
            exam_length=120,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=3),
            assigned_end=now + timedelta(hours=5),
            cancel=True,
        )

        pickup_view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "pickup"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/pickup/")
        force_authenticate(request, user=self.user)
        response = pickup_view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 201)
        data = response.data
        self.assertIn("cover", data)
        self.assertFalse(data.get("cover_filled"))

    def test_pickup_rejects_when_already_have_assignment_for_examvenue(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Economics",
            course_code="ECON100",
            exam_type="Written",
            no_students=20,
            exam_school="Business",
            school_contact="Dr. E",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=4),
            exam_length=120,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=4),
            assigned_end=now + timedelta(hours=6),
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=4),
            assigned_end=now + timedelta(hours=6),
            cancel=False,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "pickup"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/pickup/")
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 400)

    def test_pickup_rejects_when_already_covered(self):
        now = timezone.now()
        exam = Exam.objects.create(
            exam_name="Anthropology",
            course_code="ANTH100",
            exam_type="Written",
            no_students=20,
            exam_school="Social",
            school_contact="Dr. A",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=now + timedelta(hours=5),
            exam_length=120,
            core=False,
        )
        cancelled = InvigilatorAssignment.objects.create(
            invigilator=self.other_invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=now + timedelta(hours=5),
            assigned_end=now + timedelta(hours=7),
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=cancelled.assigned_start,
            assigned_end=cancelled.assigned_end,
            cancel=False,
            cover=True,
            cover_for=cancelled,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "pickup"})
        request = self.factory.post(f"/invigilator-assignments/{cancelled.pk}/pickup/")
        force_authenticate(request, user=self.user)
        response = view(request, pk=cancelled.pk)
        self.assertEqual(response.status_code, 400)

    def test_request_cancel_rejects_past_shift(self):
        past = timezone.now() - timedelta(days=1)
        exam = Exam.objects.create(
            exam_name="Ancient History",
            course_code="HIS200",
            exam_type="Written",
            no_students=10,
            exam_school="Arts",
            school_contact="Dr. AH",
        )
        examvenue = ExamVenue.objects.create(
            exam=exam,
            venue=self.venue,
            start_time=past,
            exam_length=120,
            core=False,
        )
        past_assignment = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=examvenue,
            role="assistant",
            assigned_start=past,
            assigned_end=past + timedelta(hours=2),
            cancel=False,
        )

        view = api_views.InvigilatorAssignmentViewSet.as_view({"post": "request_cancel"})
        request = self.factory.post(f"/invigilator-assignments/{past_assignment.pk}/request-cancel/", {"reason": "Too late"})
        force_authenticate(request, user=self.user)
        response = view(request, pk=past_assignment.pk)
        self.assertEqual(response.status_code, 400)
