from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    Invigilator,
    InvigilatorAssignment,
    InvigilatorAvailability,
    Notification,
    ProvisionType,
    SlotChoices,
    Venue,
    VenueType,
)


class ModelBehaviorTests(TestCase):
    def test_invigilator_str_prefers_preferred_name(self):
        invig = Invigilator.objects.create(
            preferred_name="Pat",
            full_name="Patricia Example",
        )
        self.assertEqual(str(invig), "Pat")
        invig.preferred_name = ""
        invig.save(update_fields=["preferred_name"])
        self.assertEqual(str(invig), "Patricia Example")

    def test_invigilator_assignment_str_and_total_hours(self):
        invig = Invigilator.objects.create(
            preferred_name="Sam",
            full_name="Sam Invigilator",
        )
        exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=50,
            exam_school="Engineering",
            school_contact="Dr. Smith",
        )
        venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        exam_venue = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=timezone.now(),
            exam_length=120,
            core=True,
        )
        start = timezone.now()
        end = start + timedelta(hours=3)
        assignment = InvigilatorAssignment.objects.create(
            invigilator=invig,
            exam_venue=exam_venue,
            assigned_start=start,
            assigned_end=end,
            break_time_minutes=30,
        )

        self.assertIn("→", str(assignment))
        self.assertAlmostEqual(assignment.total_hours(), 2.5)

    def test_notification_str_includes_display_and_message(self):
        note = Notification.objects.create(
            type="availability",
            invigilator_message="Availability update for week",
            admin_message="Availability update for week",
        )
        display = note.get_type_display()
        self.assertIn(display, str(note))
        self.assertIn("Availability update", str(note))

    def test_invigilator_availability_str_reflects_status(self):
        invig = Invigilator.objects.create(
            preferred_name="Taylor",
            full_name="Taylor Example",
        )
        availability = InvigilatorAvailability.objects.create(
            invigilator=invig,
            date=timezone.now().date(),
            slot=SlotChoices.MORNING,
            available=True,
        )
        self.assertIn("Available", str(availability))

    def test_enum_values_include_extended_types(self):
        self.assertIn(VenueType.KELVIN_HALL, VenueType.values)
        self.assertIn(VenueType.DETACHED_DUTY, VenueType.values)
        self.assertIn(ProvisionType.EXTRA_TIME_100, ProvisionType.values)
        self.assertIn(ProvisionType.SEPARATE_ROOM_ON_OWN, ProvisionType.values)
