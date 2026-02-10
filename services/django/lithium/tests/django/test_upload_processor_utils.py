import math
from datetime import datetime, date, time

import pandas as pd
from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    Venue,
    VenueType,
)
from timetabling_system.services import upload_processor as up


class UploadProcessorHelperTests(TestCase):
    def test_ingest_upload_result_unknown_or_error(self):
        # Non-ok status returns None
        self.assertIsNone(up.ingest_upload_result({"status": "error"}, file_name="file"))
        # Unknown type yields handled=False summary and no UploadLog created
        result = up.ingest_upload_result({"status": "ok", "type": "Unknown", "rows": []}, file_name="file")
        self.assertFalse(result["handled"])
        self.assertEqual(result["created"], 0)

    def test_coerce_helpers_and_duration(self):
        self.assertEqual(up._coerce_date("2025-07-01"), date(2025, 7, 1))
        self.assertIsNone(up._coerce_date("notadate"))
        self.assertEqual(up._coerce_time("09:30"), time(9, 30))
        # Excel fractional day to minutes
        self.assertEqual(up._coerce_int(0.5), 720)
        self.assertEqual(up._coerce_int("1:30"), 90)

        start = datetime(2025, 7, 1, 23, 30)
        duration = up._duration_in_minutes(None, "00:30", start)
        self.assertEqual(duration, 60)  # crosses midnight

    def test_extra_time_and_apply(self):
        base = 120
        self.assertEqual(up._extra_time_minutes([up.ProvisionType.EXTRA_TIME_15_PER_HOUR], base), 30)
        shifted_start, new_len = up._apply_extra_time(
            timezone.make_aware(datetime(2025, 7, 1, 10, 0)), base, 60
        )
        self.assertEqual(new_len, 180)
        self.assertEqual(shifted_start, timezone.make_aware(datetime(2025, 7, 1, 9, 0)))

    def test_allowed_venue_types(self):
        self.assertIn(VenueType.COMPUTER_CLUSTER.value, up._allowed_venue_types(True, False))
        self.assertIsNone(up._allowed_venue_types(False, True))
        self.assertIsNone(up._allowed_venue_types(False, False))

    def test_extract_venue_names_online_and_split(self):
        self.assertEqual(
            up._extract_venue_names({"main_venue": "Hall A;Hall B"}),
            ["Hall A", "Hall B"],
        )
        self.assertEqual(
            up._extract_venue_names({"exam_type": "online exam"}),
            ["Online / Digital"],
        )

    def test_required_capabilities_and_flags(self):
        provisions = [up.ProvisionType.USE_COMPUTER, up.ProvisionType.ASSISTED_EVAC_REQUIRED]
        caps = up._required_capabilities(provisions)
        self.assertIn(ExamVenueProvisionType.USE_COMPUTER, caps)
        self.assertTrue(up._needs_accessible_venue(provisions))
        self.assertTrue(up._needs_computer(provisions))
        self.assertFalse(up._needs_separate_room([]))
        self.assertFalse(up._has_small_extra_time(0, None))
        self.assertTrue(up._has_small_extra_time(15, 60))


class AllocateExamVenueTests(TestCase):
    def setUp(self):
        self.exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=50,
            exam_school="Engineering",
            school_contact="Dr. X",
        )
        self.core_venue = Venue.objects.create(
            venue_name="Core Hall",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ExamVenue.objects.create(exam=self.exam, venue=self.core_venue, core=True)

    def test_find_matching_uses_placeholders_and_caps(self):
        placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )
        found = up._find_matching_exam_venue(
            self.exam,
            [ExamVenueProvisionType.USE_COMPUTER],
            target_start=None,
            target_length=None,
        )
        self.assertEqual(found.pk, placeholder.pk)

    def test_allocate_returns_placeholder_when_no_candidates(self):
        placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[],
        )
        allocated = up._allocate_exam_venue(
            self.exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=None,
            target_length=None,
        )
        self.assertEqual(allocated.pk, placeholder.pk)
        self.assertIn(ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN, allocated.provision_capabilities)

    def test_allocate_selects_candidate_and_updates_placeholder(self):
        separate = Venue.objects.create(
            venue_name="Separate Room",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            is_accessible=True,
        )
        placeholder = ExamVenue.objects.create(
            exam=self.exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        allocated = up._allocate_exam_venue(
            self.exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=timezone.make_aware(datetime(2025, 7, 1, 9, 0)),
            target_length=90,
            preferred_venue=separate,
        )
        self.assertEqual(allocated.venue, separate)
        # Placeholder should be updated in-place
        placeholder.refresh_from_db()
        self.assertEqual(placeholder.pk, allocated.pk)
        self.assertEqual(placeholder.exam_length, 90)

    def test_create_exam_venue_links_creates_core(self):
        up._create_exam_venue_links(
            self.exam,
            {"main_venue": "New Hall", "exam_start": "09:00", "exam_length": 60},
            start_time=timezone.make_aware(datetime(2025, 7, 2, 9, 0)),
            exam_length=60,
        )
        ev = ExamVenue.objects.get(venue__venue_name="New Hall")
        self.assertTrue(ev.core)
        self.assertEqual(ev.exam, self.exam)
