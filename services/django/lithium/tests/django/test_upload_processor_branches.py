from datetime import date, datetime, time, timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    ProvisionType,
    Student,
    StudentExam,
    Venue,
    VenueType,
)
from timetabling_system.services import upload_processor as up


class UploadProcessorBranchTests(TestCase):
    def test_maybe_to_datetime_handles_failure(self):
        class Bad:
            def to_pydatetime(self):
                raise TypeError("bad")

        self.assertIsNone(up._maybe_to_datetime(Bad()))

    def test_coerce_time_and_int_edge_cases(self):
        self.assertEqual(up._coerce_time(0.5), datetime.utcfromtimestamp(0).replace(hour=12, minute=0, second=0).time())
        self.assertEqual(up._coerce_int(True), 1)
        self.assertIsNone(up._coerce_int(float("nan")))
        self.assertEqual(up._coerce_int("1h 30m"), 90)

    def test_ensure_aware_converts_naive(self):
        naive = datetime(2025, 1, 1, 9, 0)
        aware = up._ensure_aware(naive)
        self.assertFalse(timezone.is_naive(aware))

    def test_core_exam_timing_fallback_non_core(self):
        exam = Exam.objects.create(
            exam_name="Fallback",
            course_code="FB1",
            exam_type="Written",
            no_students=0,
            exam_school="Eng",
            school_contact="",
        )
        start = timezone.now()
        ExamVenue.objects.create(exam=exam, venue=None, start_time=start, exam_length=90, core=False)
        core_start, core_length = up._core_exam_timing(exam)
        self.assertEqual(core_start, start)
        self.assertEqual(core_length, 90)

    def test_slugify_and_normalize_provisions(self):
        self.assertEqual(up._slugify("Test Value!"), "test_value")
        provisions = up._normalize_provisions("Reader;scribe;extra time;reader")
        self.assertIn(up.ProvisionType.READER, provisions)
        self.assertIn(up.ProvisionType.SCRIBE, provisions)
        self.assertIn(up.ProvisionType.EXTRA_TIME, provisions)
        self.assertEqual(len(provisions), 3)

    def test_import_exam_rows_skips_invalid(self):
        summary = up._import_exam_rows([{"exam_name": "No Code"}])
        self.assertEqual(summary["skipped"], 1)
        self.assertEqual(summary["errors"][0].startswith("Row 1"), True)

    def test_import_exam_rows_handles_duplicate_course_codes(self):
        exam1 = Exam.objects.create(
            exam_name="Old A",
            course_code="DUP1",
            exam_type="Written",
            no_students=10,
            exam_school="Science",
            school_contact="Old A",
        )
        exam2 = Exam.objects.create(
            exam_name="Old B",
            course_code="DUP1",
            exam_type="Written",
            no_students=20,
            exam_school="Arts",
            school_contact="Old B",
        )
        row = {
            "exam_code": "DUP1",
            "exam_name": "New Name",
            "exam_type": "Written",
            "no_students": 42,
            "school": "Engineering",
            "school_contact": "New Contact",
            "main_venue": "",
        }

        summary = up._import_exam_rows([row])

        self.assertEqual(summary["created"], 0)
        self.assertEqual(summary["updated"], 1)
        self.assertEqual(len(summary["errors"]), 1)
        self.assertIn("Multiple exams found for course_code 'DUP1'", summary["errors"][0])

        exam1.refresh_from_db()
        exam2.refresh_from_db()
        self.assertEqual(exam1.exam_name, "New Name")
        self.assertEqual(exam1.no_students, 42)
        self.assertEqual(exam1.exam_school, "Engineering")
        self.assertEqual(exam2.exam_name, "Old B")
        self.assertEqual(exam2.no_students, 20)

    def test_import_venue_days_handles_empty(self):
        summary = up._import_venue_days([])
        self.assertEqual(summary["total_rows"], 0)
        self.assertEqual(summary["created"], 0)

    def test_find_matching_exam_venue_filters_allowed_types(self):
        exam = Exam.objects.create(
            exam_name="Types",
            course_code="TYPE1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        venue = Venue.objects.create(
            venue_name="Main",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ExamVenue.objects.create(exam=exam, venue=venue, start_time=None, exam_length=None)
        found = up._find_matching_exam_venue(
            exam,
            [],
            target_start=None,
            target_length=None,
            allowed_venue_types={VenueType.SEPARATE_ROOM},
        )
        self.assertIsNone(found)

    def test_allocate_exam_venue_creates_placeholder_when_none_available(self):
        exam = Exam.objects.create(
            exam_name="NoVenues",
            course_code="NOV1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        allocated = up._allocate_exam_venue(
            exam,
            [ExamVenueProvisionType.USE_COMPUTER],
            target_start=None,
            target_length=None,
            require_accessible=True,
        )
        self.assertIsNone(allocated.venue)
        self.assertIn(ExamVenueProvisionType.USE_COMPUTER, allocated.provision_capabilities)

    def test_allocate_exam_venue_creates_new_examvenue_when_candidate(self):
        exam = Exam.objects.create(
            exam_name="Candidate",
            course_code="CAND1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        venue = Venue.objects.create(
            venue_name="Separate",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            is_accessible=True,
        )
        allocated = up._allocate_exam_venue(
            exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=timezone.make_aware(datetime(2025, 7, 1, 9, 0)),
            target_length=60,
            require_accessible=True,
        )
        self.assertEqual(allocated.venue, venue)
        self.assertEqual(allocated.exam_length, 60)

    def test_helper_coercions_cover_edges(self):
        class BadEq:
            def __eq__(self, other):
                raise RuntimeError("boom")

        self.assertFalse(up._is_missing(BadEq()))
        self.assertEqual(up._clean_string(" keep "), "keep")

        dt_val = datetime(2025, 1, 2, 3, 4)
        self.assertEqual(up._coerce_date(dt_val), dt_val.date())
        self.assertIsNone(up._coerce_date("   "))
        self.assertEqual(up._coerce_date("2025-01-02T03:04:00"), dt_val.date())
        self.assertIsNone(up._coerce_datetime(None))
        self.assertIsNone(up._coerce_datetime("   "))
        self.assertEqual(up._coerce_datetime("2025-01-02T03:04:00"), dt_val)

        self.assertIsNone(up._coerce_time(""))
        self.assertEqual(up._coerce_time("915"), time(9, 15))
        self.assertEqual(up._coerce_time(dt_val), dt_val.time())

        class NoFloat:
            def __float__(self):
                raise TypeError("bad")
        self.assertIsNone(up._coerce_time(NoFloat()))

        self.assertEqual(up._coerce_int(0.5), 720)
        self.assertIsNone(up._coerce_int(""))
        self.assertEqual(up._coerce_int("1:02"), 62)
        self.assertEqual(up._coerce_int("dur 15m"), 15)
        self.assertEqual(up._coerce_int("99abc"), 99)

    def test_ensure_aware_and_combine_helpers(self):
        self.assertIsNone(up._ensure_aware(None))
        aware = timezone.make_aware(datetime(2025, 1, 1, 9, 0))
        with override_settings(USE_TZ=False):
            naive = up._ensure_aware(aware)
            self.assertTrue(timezone.is_naive(naive))

        exam_date = datetime(2025, 5, 1, 9, 0)
        self.assertEqual(up._combine_start_datetime(None, exam_date), exam_date)
        self.assertEqual(up._duration_in_minutes(None, None, None), 0)
        self.assertEqual(up._core_exam_timing(None), (None, None))

    def test_extra_time_and_normalize_helpers(self):
        self.assertEqual(up._extra_time_minutes([ProvisionType.EXTRA_TIME_30_PER_HOUR], 120), 60)
        self.assertEqual(up._extra_time_minutes([ProvisionType.EXTRA_TIME_20_PER_HOUR], 90), 30)
        self.assertFalse(up._has_small_extra_time(10, 0))
        self.assertEqual(up._normalize_provisions(None), [])
        self.assertEqual(
            up._normalize_provisions([ProvisionType.SCRIBE, ProvisionType.SCRIBE]),
            [ProvisionType.SCRIBE],
        )
        self.assertEqual(up._extra_time_minutes([ProvisionType.EXTRA_TIME_100], 50), 50)
        self.assertFalse(up._has_small_extra_time(5, -30))

    def test_additional_coercion_branches(self):
        class FloatLike(float):
            def __float__(self):
                raise TypeError("bad float")

        self.assertIsNone(up._coerce_date(" "))
        parsed_dt = up._coerce_datetime("2025-02-02T01:00:00")
        self.assertEqual(parsed_dt, datetime(2025, 2, 2, 1, 0))
        self.assertIsNone(up._coerce_time("ab"))
        self.assertIsNone(up._coerce_time(FloatLike(1.0)))
        self.assertEqual(up._coerce_time(time(1, 2)), time(1, 2))
        self.assertEqual(up._coerce_time("2025-01-01T05:00:00"), time(5, 0))
        self.assertEqual(up._coerce_int(2.2), 2)
        self.assertIsNone(up._coerce_int("   "))
        self.assertEqual(up._coerce_int("1:bad"), 1)
        self.assertEqual(up._coerce_int("0.25"), 360)
        self.assertEqual(up._coerce_int("abc123"), 123)
        self.assertIsNone(up._coerce_int("nodigits"))
        self.assertIsNone(up._coerce_int(float("nan")))
        aware_now = timezone.now()
        self.assertEqual(up._ensure_aware(aware_now), aware_now)
        self.assertEqual(up._combine_start_datetime(None, datetime(2025, 3, 3, 10, 0)), datetime(2025, 3, 3, 10, 0))

    def test_coerce_functions_when_not_marked_missing(self):
        with mock.patch("timetabling_system.services.upload_processor._is_missing", return_value=False):
            self.assertIsNone(up._coerce_date("   "))
            self.assertIsNone(up._coerce_datetime("   "))
            self.assertIsNone(up._coerce_datetime(object()))
            self.assertIsNone(up._coerce_time("   "))
            self.assertIsNone(up._coerce_int("   "))
            self.assertIsNone(up._coerce_int(float("nan")))
        self.assertIsNone(up._combine_start_datetime("bad", None))

    def test_import_provision_rows_error_handling(self):
        rows = [
            {"exam_code": "MISSING", "student_id": ""},  # missing student_id
            {"student_id": "S1"},  # missing exam_code
            {"student_id": "S2", "exam_code": "NOEXAM"},  # exam not found
        ]
        summary = up._import_provision_rows(rows)
        self.assertEqual(summary["skipped"], 3)
        self.assertEqual(len(summary["errors"]), 3)

    def test_import_provision_rows_appends_unknown_provisions_to_notes(self):
        exam = Exam.objects.create(
            exam_name="Unknown Notes",
            course_code="UNK1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        row = {
            "student_id": "S900",
            "student_name": "Unknown Provision",
            "exam_code": exam.course_code,
            "provisions": "Reader;Mystery Flag",
            "additional_info": "Extra notes",
        }

        with mock.patch(
            "timetabling_system.services.upload_processor._find_matching_exam_venue",
            return_value=None,
        ), mock.patch(
            "timetabling_system.services.upload_processor._allocate_exam_venue",
            return_value=None,
        ):
            summary = up._import_provision_rows([row])

        self.assertEqual(summary["created"], 1)
        provision = up.Provisions.objects.get(student__student_id="S900", exam=exam)
        self.assertIn(ProvisionType.READER, provision.provisions)
        self.assertEqual(
            provision.notes,
            "Extra notes; Unrecognized provisions: Mystery Flag",
        )

    def test_import_provision_rows_updates_existing_exam_venue(self):
        core_start = timezone.make_aware(datetime(2025, 7, 16, 12, 0))
        exam = Exam.objects.create(
            exam_name="Bio",
            course_code="BIO101",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        core_venue = Venue.objects.create(
            venue_name="Legacy",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=False,
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=core_start,
            exam_length=60,
            core=True,
        )
        placeholder = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=core_start,
            exam_length=60,
            provision_capabilities=[],
        )

        row = {
            "student_id": "S300",
            "student_name": "Needs Access",
            "exam_code": exam.course_code,
            "provisions": f"{ProvisionType.ACCESSIBLE_HALL}, {ProvisionType.EXTRA_TIME_15_PER_HOUR}",
        }

        with mock.patch("timetabling_system.services.upload_processor._find_matching_exam_venue", return_value=None):
            summary = up._import_provision_rows([row])

        placeholder.refresh_from_db()
        student_exam = StudentExam.objects.get(student__student_id="S300", exam=exam)
        self.assertEqual(summary["created"], 1)
        self.assertIsNotNone(student_exam.exam_venue)
        self.assertNotEqual(student_exam.exam_venue.start_time, core_start)
        self.assertGreater(student_exam.exam_venue.exam_length, 60)

    def test_allowed_venue_types_reset_and_updates(self):
        exam = Exam.objects.create(
            exam_name="CompSci",
            course_code="CS500",
            exam_type="Written",
            no_students=0,
            exam_school="Engineering",
            school_contact="",
        )
        wrong_type_venue = Venue.objects.create(
            venue_name="Hall Wrong",
            capacity=20,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ev = ExamVenue.objects.create(
            exam=exam,
            venue=wrong_type_venue,
            start_time=timezone.make_aware(datetime(2025, 8, 1, 9, 0)),
            exam_length=45,
            core=False,
        )
        good_venue = Venue.objects.create(
            venue_name="Cluster",
            capacity=15,
            venuetype=VenueType.COMPUTER_CLUSTER,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
            is_accessible=True,
        )

        row = {
            "student_id": "S400",
            "student_name": "Computer User",
            "exam_code": exam.course_code,
            "provisions": ProvisionType.USE_COMPUTER,
        }

        with mock.patch(
            "timetabling_system.services.upload_processor._find_matching_exam_venue",
            return_value=ev,
        ):
            summary = up._import_provision_rows([row])

        self.assertEqual(summary["created"], 1)
        # A new allocation should have been made on the allowed venue type
        student_exam = StudentExam.objects.get(student__student_id="S400", exam=exam)
        self.assertEqual(student_exam.exam_venue.venue, good_venue)

    def test_import_provision_rows_updates_existing_times(self):
        core_start = timezone.make_aware(datetime(2025, 11, 1, 10, 0))
        exam = Exam.objects.create(
            exam_name="Times",
            course_code="TIME1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        venue = Venue.objects.create(
            venue_name="Access",
            capacity=50,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=core_start,
            exam_length=60,
            core=True,
        )
        ev = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=core_start,
            exam_length=60,
            core=False,
            provision_capabilities=[],
        )
        row = {
            "student_id": "S500",
            "student_name": "Adjust",
            "exam_code": exam.course_code,
            "provisions": f"{ProvisionType.EXTRA_TIME_30_PER_HOUR}; {ProvisionType.ACCESSIBLE_HALL}",
        }
        with mock.patch("timetabling_system.services.upload_processor._find_matching_exam_venue", return_value=ev), \
             mock.patch("timetabling_system.services.upload_processor._allocate_exam_venue", return_value=None):
            summary = up._import_provision_rows([row])
        ev.refresh_from_db()
        self.assertEqual(summary["created"], 1)
        self.assertNotEqual(ev.start_time, core_start)
        self.assertGreater(ev.exam_length, 60)
        self.assertTrue(ev.provision_capabilities)

    def test_extract_venue_names_online_fallback(self):
        self.assertEqual(up._extract_venue_names({"exam_type": "Digital"}), ["Online / Digital"])
        self.assertEqual(
            up._extract_venue_names({"main_venue": ["", "Hall A"], "exam_type": "Exam"}),
            ["Hall A"],
        )
        self.assertEqual(
            up._extract_venue_names({"main_venue": [" ", ""], "exam_type": "digital on campus"}),
            ["Online / Digital"],
        )
        self.assertEqual(
            up._extract_venue_names({"main_venue": "Online Exam"}),
            ["Online / Digital"],
        )

    def test_find_matching_exam_venue_branches(self):
        self.assertIsNone(up._find_matching_exam_venue(None, [], None, None))
        exam = Exam.objects.create(
            exam_name="Pref",
            course_code="PREF1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        venue = Venue.objects.create(
            venue_name="Pref Hall",
            capacity=20,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=False,
        )
        placeholder = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[],
        )
        preferred = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=None,
            exam_length=None,
            provision_capabilities=[],
        )
        result = up._find_matching_exam_venue(
            exam,
            ["cap"],
            target_start=None,
            target_length=None,
            require_accessible=True,
            preferred_venue=venue,
        )
        self.assertIsNone(result)

        preferred.venue.is_accessible = True
        preferred.venue.save(update_fields=["is_accessible"])
        result = up._find_matching_exam_venue(
            exam,
            [],
            target_start=None,
            target_length=None,
            preferred_venue=venue,
        )
        self.assertEqual(result, preferred)

        other_exam = Exam.objects.create(
            exam_name="Block",
            course_code="BLOCK1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        inaccessible = Venue.objects.create(
            venue_name="Blocked",
            capacity=10,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=False,
        )
        ExamVenue.objects.create(exam=other_exam, venue=inaccessible, start_time=None, exam_length=None)
        self.assertIsNone(
            up._find_matching_exam_venue(
                other_exam,
                [],
                target_start=None,
                target_length=None,
                require_accessible=True,
            )
        )

    def test_allocate_exam_venue_placeholder_and_existing(self):
        self.assertIsNone(up._allocate_exam_venue(None, [], None, None))
        exam = Exam.objects.create(
            exam_name="Alloc",
            course_code="ALLOC1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        placeholder = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[],
        )
        target_start = timezone.make_aware(datetime(2025, 9, 1, 10, 0))
        updated_placeholder = up._allocate_exam_venue(
            exam,
            ["cap"],
            target_start=target_start,
            target_length=50,
            require_accessible=False,
        )
        self.assertEqual(updated_placeholder.start_time, target_start)
        self.assertEqual(updated_placeholder.exam_length, 50)
        self.assertIn("cap", updated_placeholder.provision_capabilities)

        # Remove the first placeholder to exercise the candidate + placeholder path cleanly
        placeholder.delete()
        venue = Venue.objects.create(
            venue_name="Alloc Venue",
            capacity=30,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=[target_start.date().isoformat()],
            is_accessible=True,
        )
        placeholder2 = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=target_start,
            exam_length=50,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        assigned = up._allocate_exam_venue(
            exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=target_start,
            target_length=50,
        )
        self.assertEqual(assigned.venue, venue)
        placeholder2.refresh_from_db()
        self.assertEqual(placeholder2.venue, venue)

        # Reuse an existing ExamVenue in place
        ExamVenue.objects.filter(exam=exam).delete()
        venue.provision_capabilities = [ExamVenueProvisionType.USE_COMPUTER]
        venue.save(update_fields=["provision_capabilities"])
        existing = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=target_start,
            exam_length=50,
            provision_capabilities=[],
        )
        reused = up._allocate_exam_venue(
            exam,
            [ExamVenueProvisionType.USE_COMPUTER],
            target_start=target_start,
            target_length=50,
        )
        self.assertEqual(reused.pk, existing.pk)
        self.assertIn(ExamVenueProvisionType.USE_COMPUTER, reused.provision_capabilities)

    def test_allocate_exam_venue_candidate_filters(self):
        exam = Exam.objects.create(
            exam_name="Filter",
            course_code="FIL1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        exam.date_exam = date(2025, 10, 1)
        placeholder = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=None,
            exam_length=None,
            provision_capabilities=[],
        )
        venue_bad = Venue.objects.create(
            venue_name="Bad",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=[exam.date_exam.isoformat()],
            is_accessible=False,
        )
        venue_skip = Venue.objects.create(
            venue_name="Skip",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=["2025-10-02"],
            is_accessible=True,
        )
        venue_good = Venue.objects.create(
            venue_name="Good",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=[exam.date_exam.isoformat()],
            is_accessible=True,
        )
        allocated = up._allocate_exam_venue(
            exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=None,
            target_length=40,
            require_accessible=True,
        )
        placeholder.refresh_from_db()
        self.assertEqual(allocated.venue, venue_good)
        self.assertIn(ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN, allocated.provision_capabilities)

        late_exam = Exam.objects.create(
            exam_name="Late",
            course_code="LATE1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        Venue.objects.create(
            venue_name="Unavailable",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            availability=["2025-12-01"],
            is_accessible=True,
        )
        up._allocate_exam_venue(
            late_exam,
            [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            target_start=timezone.make_aware(datetime(2025, 12, 2, 9, 0)),
            target_length=30,
        )

    def test_create_exam_venue_links_branches(self):
        up._create_exam_venue_links(None, {})
        exam = Exam.objects.create(
            exam_name="Create Links",
            course_code="CL1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        up._create_exam_venue_links(exam, {"main_venue": ""})
        up._create_exam_venue_links(exam, {"main_venue": "HallX;HallX"})

        # Force branch where created core flag needs correction
        def fake_get_or_create(*args, **kwargs):
            venue, _ = Venue.objects.get_or_create(
                venue_name="TempCore",
                defaults={
                    "capacity": 10,
                    "venuetype": VenueType.MAIN_HALL,
                    "is_accessible": True,
                },
            )
            ev = ExamVenue(exam=exam, venue=venue, core=False)
            return ev, True

        with mock.patch.object(ExamVenue.objects, "get_or_create", side_effect=fake_get_or_create):
            up._create_exam_venue_links(exam, {"main_venue": "TempCore"})

    def test_create_provision_exam_venues_safe(self):
        exam = Exam.objects.create(
            exam_name="ProvExam",
            course_code="PROV1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        student = Student.objects.create(student_id="SP1", student_name="Student Prov")
        Provisions = up.Provisions  # type: ignore
        Provisions.objects.create(exam=exam, student=student)

        with mock.patch.object(up.ExamVenue.objects, "all", return_value=[]):
            up._create_provision_exam_venues()

    def test_import_venue_days_missing_name(self):
        summary = up._import_venue_days([{"rooms": [{}]}])
        self.assertEqual(summary["skipped"], 1)
