from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    Invigilator,
    InvigilatorAssignment,
    InvigilatorQualification,
    InvigilatorQualificationChoices,
    InvigilatorRestriction,
    InvigilatorRestrictionType,
    DietChoices,
    Student,
    StudentExam,
    UploadLog,
    Venue,
    VenueType,
)


class ModelStringTests(TestCase):
    def test_str_helpers_and_total_hours(self):
        exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=10,
            exam_school="Engineering",
            school_contact="Contact",
        )
        venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        student = Student.objects.create(student_id="S1", student_name="Alice")
        exam_venue = ExamVenue.objects.create(exam=exam, venue=venue, core=True)
        student_exam = StudentExam.objects.create(student=student, exam=exam, exam_venue=exam_venue)

        upload_log = UploadLog.objects.create(
            file_name="upload.xlsx",
            uploaded_by=None,
            records_created=1,
            records_updated=2,
        )

        invigilator = Invigilator.objects.create(preferred_name="Pat", full_name="Pat Invigilator")
        qualification = InvigilatorQualification.objects.create(
            invigilator=invigilator,
            qualification=InvigilatorQualificationChoices.SENIOR_INVIGILATOR,
        )
        detached = InvigilatorQualification.objects.create(
            invigilator=invigilator,
            qualification=InvigilatorQualificationChoices.DETACHED_DUTY,
        )
        restriction = InvigilatorRestriction.objects.create(
            invigilator=invigilator,
            diet=DietChoices.DEC_2025,
            restrictions=[InvigilatorRestrictionType.ACCESSIBILITY_REQUIRED],
        )

        self.assertEqual(str(student), "Alice")
        self.assertIn("upload.xlsx", str(upload_log))
        self.assertIn("Hall A", str(venue))
        self.assertIn("Algorithms", str(exam))
        self.assertIn("Alice -", str(student_exam))
        self.assertIn("Senior Invigilator", str(qualification))
        self.assertIn("Detached Duty", str(detached))
        self.assertIn("DEC_2025", str(restriction))

        # Unsaved assignment should gracefully handle missing start/end times
        assignment = InvigilatorAssignment(
            invigilator=invigilator,
            exam_venue=exam_venue,
            assigned_start=None,
            assigned_end=None,
        )
        self.assertEqual(assignment.total_hours(), 0)

        # When times exist, total_hours returns a positive value minus break time
        assignment.assigned_start = timezone.now()
        assignment.assigned_end = assignment.assigned_start + timedelta(hours=2)
        assignment.break_time_minutes = 30
        self.assertAlmostEqual(assignment.total_hours(), 1.5)
