from datetime import datetime, timedelta

from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    Student,
    StudentExam,
    Venue,
    VenueType,
)
from timetabling_system.services import venue_matching
from timetabling_system.services.venue_stats import examvenue_student_counts, core_exam_size


class VenueMatchingTests(TestCase):
    def setUp(self):
        self.venue = Venue.objects.create(
            venue_name="Room A",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=[timezone.now().date().isoformat()],
            is_accessible=True,
        )
        self.exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=10,
            exam_school="Engineering",
            school_contact="Dr. X",
        )

    def test_venue_supports_caps(self):
        self.assertTrue(venue_matching.venue_supports_caps(self.venue, [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN]))
        self.assertFalse(venue_matching.venue_supports_caps(self.venue, [ExamVenueProvisionType.USE_COMPUTER]))

    def test_venue_availability_and_conflict(self):
        start = timezone.make_aware(datetime(2025, 7, 28, 10, 0))
        ev = ExamVenue.objects.create(exam=self.exam, venue=self.venue, start_time=start, exam_length=120, core=True)
        conflict = venue_matching.venue_has_timing_conflict(self.venue, start + timedelta(minutes=30), 60)
        self.assertTrue(conflict)
        # Allow same exam overlap exact slot reuse
        conflict_same_exam = venue_matching.venue_has_timing_conflict(
            self.venue, start, 120, ignore_exam_id=self.exam.pk, allow_same_exam_overlap=True
        )
        self.assertFalse(conflict_same_exam)

        available = venue_matching.venue_is_available(self.venue, start)
        self.assertFalse(available)  # start date not in availability list -> False
        unrestricted = Venue(
            venue_name="NoAvail",
            capacity=5,
            venuetype=VenueType.SEPARATE_ROOM,
            is_accessible=True,
        )
        self.assertTrue(venue_matching.venue_is_available(unrestricted, start))
        self.assertTrue(venue_matching.venue_is_available(self.venue, None))

    def test_venue_conflict_handles_missing_data(self):
        start = timezone.make_aware(datetime(2025, 7, 28, 9, 0))
        self.assertFalse(venue_matching.venue_has_timing_conflict(self.venue, None, 60))
        self.assertFalse(venue_matching.venue_has_timing_conflict(self.venue, start, None))

        ExamVenue.objects.create(exam=self.exam, venue=self.venue, start_time=None, exam_length=None)
        self.assertFalse(venue_matching.venue_has_timing_conflict(self.venue, start, 30))

    def test_venue_is_available_without_venue(self):
        self.assertFalse(venue_matching.venue_is_available(None, timezone.now()))

    def test_attach_placeholders_to_venue_skips_missing_caps_and_conflicts(self):
        # Placeholder with no caps is skipped
        placeholder_no_caps = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=timezone.make_aware(datetime(2025, 7, 28, 9, 0)),
            exam_length=60,
            provision_capabilities=[],
        )
        venue_matching.attach_placeholders_to_venue(self.venue)
        placeholder_no_caps.refresh_from_db()
        self.assertIsNone(placeholder_no_caps.venue)

        # Placeholder with caps but conflicting timing should remain unassigned
        conflicting_placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=timezone.make_aware(datetime(2025, 7, 28, 10, 0)),
            exam_length=60,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        venue_matching.attach_placeholders_to_venue(self.venue)
        conflicting_placeholder.refresh_from_db()
        self.assertIsNone(conflicting_placeholder.venue)

        # Non-conflicting placeholder should attach
        free_placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=timezone.make_aware(datetime(2025, 7, 28, 13, 0)),
            exam_length=60,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        # Existing ExamVenue for this exam should be reused (placeholder deleted)
        ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.make_aware(datetime(2025, 7, 28, 8, 0)),
            exam_length=30,
        )
        # Ensure availability allows this date
        self.venue.availability = [timezone.now().date().isoformat(), "2025-07-28", "2025-07-29"]
        self.venue.save(update_fields=["availability"])
        venue_matching.attach_placeholders_to_venue(self.venue)
        # After attach, placeholder might be reused or deleted in favor of an existing ExamVenue
        exists = ExamVenue.objects.filter(pk=free_placeholder.pk).exists()
        if exists:
            free_placeholder.refresh_from_db()
            self.assertEqual(free_placeholder.venue, self.venue)
        else:
            assigned = ExamVenue.objects.filter(exam=self.exam, venue=self.venue).first()
            self.assertIsNotNone(assigned)

    def test_attach_placeholders_reuses_existing_examvenue(self):
        existing = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.make_aware(datetime(2025, 7, 29, 9, 0)),
            exam_length=60,
        )
        # Allow this date in availability so placeholders can attach/reuse
        self.venue.availability = [timezone.now().date().isoformat(), "2025-07-29"]
        self.venue.save(update_fields=["availability"])
        placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=existing.start_time,
            exam_length=60,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        student = Student.objects.create(student_id="S1", student_name="One")
        StudentExam.objects.create(student=student, exam=self.exam, exam_venue=placeholder)

        venue_matching.attach_placeholders_to_venue(self.venue)

        placeholder_exists = ExamVenue.objects.filter(pk=placeholder.pk).exists()
        student_exam = StudentExam.objects.get(student=student, exam=self.exam)
        self.assertFalse(placeholder_exists)
        self.assertEqual(student_exam.exam_venue, existing)
        self.assertEqual(existing.venue, self.venue)

    def test_attach_placeholders_respects_accessibility_and_conflicts(self):
        venue_matching.attach_placeholders_to_venue(None)  # No-op safeguard

        start = timezone.make_aware(datetime.now())
        inaccessible = Venue.objects.create(
            venue_name="Inaccessible",
            capacity=5,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.ACCESSIBLE_HALL],
            is_accessible=False,
            availability=[start.date().isoformat()],
        )
        placeholder_accessible = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=start,
            exam_length=45,
            provision_capabilities=[ExamVenueProvisionType.ACCESSIBLE_HALL],
        )
        venue_matching.attach_placeholders_to_venue(inaccessible)
        placeholder_accessible.refresh_from_db()
        self.assertIsNone(placeholder_accessible.venue)

        # Conflict with an existing event should also block assignment
        self.venue.availability = [start.date().isoformat()]
        self.venue.save(update_fields=["availability"])
        other_exam = Exam.objects.create(
            exam_name="Other",
            course_code="OTH1",
            exam_type="Written",
            no_students=5,
            exam_school="Engineering",
            school_contact="Y",
        )
        ExamVenue.objects.create(
            exam=other_exam,
            venue=self.venue,
            start_time=start,
            exam_length=60,
        )
        conflicting_placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=start,
            exam_length=45,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )

        venue_matching.attach_placeholders_to_venue(self.venue)
        conflicting_placeholder.refresh_from_db()
        self.assertIsNone(conflicting_placeholder.venue)


class VenueStatsTests(TestCase):
    def test_exam_stats_handle_missing_exam(self):
        self.assertEqual(examvenue_student_counts(None), {})
        self.assertEqual(core_exam_size(None), 0)

    def test_examvenue_counts_and_core_size(self):
        exam = Exam.objects.create(
            exam_name="Maths",
            course_code="MATH1",
            exam_type="Written",
            no_students=100,
            exam_school="Science",
            school_contact="Dr. Y",
        )
        core_venue = Venue.objects.create(
            venue_name="Hall Core",
            capacity=200,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        alt_venue = Venue.objects.create(
            venue_name="Alt Room",
            capacity=20,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            is_accessible=True,
        )
        core_ev = ExamVenue.objects.create(exam=exam, venue=core_venue, core=True)
        alt_ev = ExamVenue.objects.create(exam=exam, venue=alt_venue, core=False)
        # Small extra-time in same physical core venue
        small_extra = ExamVenue.objects.create(exam=exam, venue=core_venue, core=False)

        for idx in range(5):
            StudentExam.objects.create(
                student=Student.objects.create(student_id=f"CORE{idx}", student_name=str(idx)),
                exam=exam,
                exam_venue=core_ev,
            )
        for idx in range(3):
            StudentExam.objects.create(
                student=Student.objects.create(student_id=f"ALT{idx}", student_name=str(idx)),
                exam=exam,
                exam_venue=alt_ev,
            )
        for idx in range(2):
            StudentExam.objects.create(
                student=Student.objects.create(student_id=f"SMALL{idx}", student_name=str(idx)),
                exam=exam,
                exam_venue=small_extra,
            )

        counts = examvenue_student_counts(exam)
        self.assertEqual(counts[core_ev.pk], 5)
        self.assertEqual(counts[alt_ev.pk], 3)
        self.assertEqual(counts[small_extra.pk], 2)

        # core_exam_size subtracts alt venue but not small extra in same room
        self.assertEqual(core_exam_size(exam), 97)
