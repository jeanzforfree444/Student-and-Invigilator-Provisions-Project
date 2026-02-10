from datetime import datetime

from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import Exam, ExamVenue, Venue, VenueType, UploadLog
from timetabling_system.services.upload_processor import (
    _apply_extra_time,
    _base_summary,
    _coerce_datetime,
    _combine_start_datetime,
    _create_exam_venue_links,
    ingest_upload_result,
)


class UploadProcessorEdgeTests(TestCase):
    def test_base_summary(self):
        summary = _base_summary(3)
        self.assertEqual(summary["total_rows"], 3)
        self.assertEqual(summary["created"], 0)

    def test_combine_start_datetime_handles_direct_datetime(self):
        exam_date = datetime(2025, 7, 1, 10, 0)
        combined = _combine_start_datetime(exam_date, exam_date.date())
        self.assertEqual(combined, exam_date)

    def test_coerce_datetime_invalid_returns_none(self):
        self.assertIsNone(_coerce_datetime("not-a-datetime"))

    def test_apply_extra_time_with_none_base(self):
        start, length = _apply_extra_time(None, None, 30)
        self.assertIsNone(start)
        self.assertEqual(length, 30)

    def test_ingest_upload_result_skips_non_ok(self):
        self.assertIsNone(ingest_upload_result({"status": "error"}, file_name="bad.xlsx"))

    def test_ingest_upload_result_returns_none_when_no_rows(self):
        result = {"status": "ok", "type": "Exam", "rows": []}
        summary = ingest_upload_result(result, file_name="empty.xlsx")
        self.assertEqual(summary["created"], 0)
        self.assertEqual(UploadLog.objects.count(), 1)

    def test_create_exam_venue_links_updates_existing(self):
        exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=0,
            exam_school="Engineering",
            school_contact="",
        )
        venue = Venue.objects.create(
            venue_name="Main Hall",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ev = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=timezone.make_aware(datetime(2025, 7, 1, 9, 0)),
            exam_length=60,
            core=True,
        )

        new_start = timezone.make_aware(datetime(2025, 7, 1, 10, 0))
        _create_exam_venue_links(
            exam,
            {"main_venue": "Main Hall", "exam_start": "10:00", "exam_length": 90},
            start_time=new_start,
            exam_length=90,
        )

        ev.refresh_from_db()
        self.assertEqual(ev.start_time, new_start)
        self.assertEqual(ev.exam_length, 90)
