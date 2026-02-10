from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient

from timetabling_system.models import Exam, Venue, ExamVenue, Invigilator, InvigilatorAssignment, VenueType


class InvigilatorStatsNextAssignmentTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="invig", password="secret", email="invig@example.com")
        self.invigilator = Invigilator.objects.create(preferred_name="Invig", full_name="Invig User", user=self.user)

        self.exam = Exam.objects.create(
            exam_name="Test Exam",
            course_code="TST101",
            exam_type="Written",
            no_students=10,
            exam_school="Test School",
            school_contact="Dr. Test",
        )
        self.venue = Venue.objects.create(
            venue_name="Main Hall",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        self.exam_venue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() + timedelta(days=1),
            exam_length=90,
            core=False,
        )
        self.exam_venue_past = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() - timedelta(days=2),
            exam_length=90,
            core=False,
        )
        self.exam_venue_later = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() + timedelta(days=3),
            exam_length=90,
            core=False,
        )
        self.exam_venue_other = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() + timedelta(days=4),
            exam_length=60,
            core=False,
        )

        now = timezone.now()
        # Past assignment
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_past,
            role="lead",
            assigned_start=now - timedelta(days=2),
            assigned_end=now - timedelta(days=2, hours=-1),
        )
        # Future assignment (earliest)
        self.next_assignment = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue,
            role="assistant",
            assigned_start=now + timedelta(days=1),
            assigned_end=now + timedelta(days=1, hours=2),
        )
        # Later future assignment (different exam venue)
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_later,
            role="support",
            assigned_start=now + timedelta(days=3),
            assigned_end=now + timedelta(days=3, hours=2),
        )
        # Cancelled assignment that should be skipped
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_other,
            role="assistant",
            assigned_start=now + timedelta(days=1, hours=1),
            assigned_end=now + timedelta(days=1, hours=3),
            cancel=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_next_assignment_is_earliest_future_non_cancelled(self):
        res = self.client.get(reverse("api-invigilator-stats"))
        self.assertEqual(res.status_code, 200)
        next_assignment = res.data.get("next_assignment")
        self.assertIsNotNone(next_assignment)
        self.assertEqual(next_assignment.get("exam_name"), self.exam.exam_name)
        self.assertEqual(next_assignment.get("role"), "assistant")
        self.assertEqual(str(next_assignment.get("start")), str(self.next_assignment.assigned_start))

    def test_stats_counts_and_hours(self):
        res = self.client.get(reverse("api-invigilator-stats"))
        self.assertEqual(res.status_code, 200)
        data = res.data
        # We created 4 assignments total (including one cancelled)
        self.assertEqual(data.get("total_shifts"), 4)
        # Two upcoming non-cancelled (next_assignment and later)
        self.assertEqual(data.get("upcoming_shifts"), 2)
        # One cancelled
        self.assertEqual(data.get("cancelled_shifts"), 1)
        # Hours: past 1h + next 2h + later 2h + cancelled 2h = 7h
        self.assertEqual(data.get("hours_assigned"), 7)
        # Upcoming hours (non-cancelled future): 2h + 2h = 4h
        self.assertEqual(data.get("hours_upcoming"), 4)
        # No restrictions or availability in this fixture
        self.assertEqual(data.get("restrictions"), 0)
        self.assertEqual(data.get("availability_entries"), 0)


class InvigilatorAssignmentsFallbackTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="alex", password="secret", email="alex@example.com")
        self.invigilator = Invigilator.objects.create(preferred_name="Alex", full_name="Alex Example")

        exam = Exam.objects.create(
            exam_name="Assignment Exam",
            course_code="ASN100",
            exam_type="Written",
            no_students=5,
            exam_school="Test School",
            school_contact="Dr. Test",
        )
        venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=50,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        exam_venue = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=timezone.now() + timedelta(days=1),
            exam_length=60,
            core=False,
        )
        self.assignment = InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=exam_venue,
            role="assistant",
            assigned_start=timezone.now() + timedelta(days=1),
            assigned_end=timezone.now() + timedelta(days=1, hours=1),
        )

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_assignments_resolve_invigilator_without_profile(self):
        res = self.client.get(reverse("api-invigilator-assignments"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["invigilator"], self.invigilator.pk)
        self.assertEqual(res.data[0]["exam_name"], "Assignment Exam")
