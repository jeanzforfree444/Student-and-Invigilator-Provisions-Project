from datetime import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from timetabling_system.models import (
    Exam,
    ExamVenue,
    ExamVenueProvisionType,
    ProvisionType,
    Provisions,
    Student,
    StudentExam,
    UploadLog,
    Venue,
    VenueType,
)
from timetabling_system.services import ingest_upload_result
from timetabling_system.services.venue_stats import examvenue_student_counts, core_exam_size


class UploadProcessorTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="tester",
            email="tester@example.com",
            password="secret",
        )

    def test_exam_rows_create_and_update_records(self):
        result = {
            "status": "ok",
            "type": "Exam",
            "rows": [
                {
                    "exam_code": "ABC123",
                    "exam_name": "Algorithms 101",
                    "exam_date": "2025-07-01",
                    "exam_start": "09:00",
                    "exam_end": "11:00",
                    "exam_length": "2:00",
                    "exam_type": "Written",
                    "no_students": "150",
                    "school": "Engineering",
                    "school_contact": "Dr. Smith",
                    "main_venue": "Main Hall",
                }
            ],
        }

        summary = ingest_upload_result(result, file_name="exam.xlsx", uploaded_by=self.user)
        self.assertTrue(summary["handled"])
        self.assertEqual(summary["created"], 1)
        self.assertEqual(summary["updated"], 0)
        exam = Exam.objects.get(course_code="ABC123")
        self.assertEqual(exam.exam_name, "Algorithms 101"[:30])
        self.assertEqual(exam.no_students, 150)
        self.assertEqual(UploadLog.objects.count(), 1)
        # Venue + ExamVenue created
        venue = Venue.objects.get(venue_name="Main Hall")
        self.assertEqual(venue.venuetype, VenueType.CORE_EXAM_VENUE)
        self.assertTrue(ExamVenue.objects.filter(exam=exam, venue=venue).exists())
        exam_venue = ExamVenue.objects.get(exam=exam, venue=venue)
        self.assertEqual(exam_venue.exam_length, 120)
        self.assertIsNotNone(exam_venue.start_time)
        self.assertTrue(exam_venue.core)

        result["rows"][0]["exam_name"] = "Updated Algorithms"
        result["rows"][0]["main_venue"] = "Main Hall; Overflow Room"
        summary = ingest_upload_result(result, file_name="exam.xlsx", uploaded_by=self.user)
        self.assertEqual(summary["created"], 0)
        self.assertEqual(summary["updated"], 1)
        exam.refresh_from_db()
        self.assertEqual(exam.exam_name, "Updated Algorithms")
        self.assertEqual(UploadLog.objects.count(), 2)
        # New ExamVenue for new venue name
        self.assertTrue(Venue.objects.filter(venue_name="Overflow Room").exists())
        self.assertTrue(ExamVenue.objects.filter(exam=exam, venue__venue_name="Overflow Room").exists())

    def test_provision_rows_create_students_and_links(self):
        exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="ABC123",
            exam_type="Written",
            no_students=0,
            exam_school="Engineering",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Main Hall",
                capacity=100,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 1, 9, 0)),
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S12345",
                    "student_name": "Alice Example",
                    "exam_code": exam.course_code,
                    "provisions": "extra time; reader",
                    "additional_info": "Seat at the front",
                }
            ],
        }

        summary = ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        self.assertTrue(summary["handled"])
        self.assertEqual(summary["created"], 1)
        student = Student.objects.get(student_id="S12345")
        provision = Provisions.objects.get(student=student, exam=exam)
        self.assertEqual(provision.provisions, ["extra_time", "reader"])
        self.assertTrue(StudentExam.objects.filter(student=student, exam=exam).exists())
        self.assertEqual(UploadLog.objects.count(), 1)

    def test_provision_values_map_to_enum_slugs(self):
        exam = Exam.objects.create(
            exam_name="Discrete Maths",
            course_code="MATH101",
            exam_type="Written",
            no_students=0,
            exam_school="Mathematics",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Purple Cluster",
                capacity=50,
                venuetype=VenueType.PURPLE_CLUSTER,
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 2, 9, 0)),
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S54321",
                    "student_name": "Bob Example",
                    "exam_code": exam.course_code,
                    "provisions": (
                        "Extra time 15 minutes every hour; "
                        "Assisted evacuation required; "
                        "Use of a computer"
                    ),
                }
            ],
        }

        summary = ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        self.assertTrue(summary["handled"])
        self.assertEqual(summary["created"], 1)
        provision = Provisions.objects.get(student__student_id="S54321", exam=exam)
        self.assertEqual(
            provision.provisions,
            [
                "extra_time_15_per_hour",
                "assisted_evacuation_required",
                "use_computer",
            ],
        )
        self.assertTrue(StudentExam.objects.filter(student__student_id="S54321", exam=exam).exists())

    def test_small_extra_time_keeps_core_venue_but_new_examvenue(self):
        exam = Exam.objects.create(
            exam_name="Physics",
            course_code="PHY101",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        core_start = timezone.make_aware(datetime(2025, 7, 3, 10, 0))
        core_venue = Venue.objects.create(
            venue_name="Main Hall",
            capacity=150,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        core_ev = ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=core_start,
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S777",
                    "student_name": "Carol Extra",
                    "exam_code": exam.course_code,
                    "provisions": "Extra time 15 minutes every hour",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        self.assertEqual(ExamVenue.objects.filter(exam=exam).count(), 2)
        student_exam = StudentExam.objects.get(student__student_id="S777", exam=exam)
        self.assertNotEqual(student_exam.exam_venue_id, core_ev.pk)
        self.assertEqual(student_exam.exam_venue.venue, core_venue)
        self.assertEqual(
            student_exam.exam_venue.start_time,
            timezone.make_aware(datetime(2025, 7, 3, 9, 30)),
        )

    def test_use_computer_prefers_computer_or_separate_room(self):
        exam = Exam.objects.create(
            exam_name="Programming",
            course_code="CS200",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Main Hall",
                capacity=200,
                venuetype=VenueType.MAIN_HALL,
                is_accessible=True,
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 4, 9, 0)),
            exam_length=120,
            core=True,
        )
        computer_room = Venue.objects.create(
            venue_name="Computer Lab",
            capacity=30,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
            is_accessible=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S888",
                    "student_name": "Dana Device",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        student_exam = StudentExam.objects.get(student__student_id="S888", exam=exam)
        self.assertEqual(student_exam.exam_venue.venue, computer_room)
        self.assertIn(
            ExamVenueProvisionType.USE_COMPUTER,
            student_exam.exam_venue.provision_capabilities,
        )
        provision = Provisions.objects.get(student__student_id="S888", exam=exam)
        self.assertIn(ProvisionType.USE_COMPUTER, provision.provisions)

    def test_use_computer_requires_computer_cluster_or_separate_room(self):
        exam = Exam.objects.create(
            exam_name="Programming 2",
            course_code="CS201",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Main Hall With PCs",
                capacity=200,
                venuetype=VenueType.MAIN_HALL,
                is_accessible=True,
                provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 4, 9, 0)),
            exam_length=120,
            core=True,
        )
        Venue.objects.create(
            venue_name="Computer Cluster",
            capacity=40,
            venuetype=VenueType.COMPUTER_CLUSTER,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
            is_accessible=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S8888",
                    "student_name": "Casey Device",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        provision = Provisions.objects.get(student__student_id="S8888", exam=exam)
        self.assertIn(ProvisionType.USE_COMPUTER, provision.provisions)
        student_exam = StudentExam.objects.get(student__student_id="S8888", exam=exam)
        self.assertIn(
            student_exam.exam_venue.venue.venuetype,
            {VenueType.COMPUTER_CLUSTER, VenueType.PURPLE_CLUSTER},
        )

    def test_assisted_evac_requires_accessible_venue(self):
        exam = Exam.objects.create(
            exam_name="Law",
            course_code="LAW500",
            exam_type="Written",
            no_students=0,
            exam_school="Law",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Old Hall",
                capacity=100,
                venuetype=VenueType.MAIN_HALL,
                is_accessible=False,
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 5, 9, 0)),
            exam_length=120,
            core=True,
        )
        accessible_room = Venue.objects.create(
            venue_name="Accessible Hall",
            capacity=80,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.ACCESSIBLE_HALL],
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S999",
                    "student_name": "Eli Assist",
                    "exam_code": exam.course_code,
                    "provisions": "Assisted evacuation required",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        student_exam = StudentExam.objects.get(student__student_id="S999", exam=exam)
        self.assertEqual(student_exam.exam_venue.venue, accessible_room)
        self.assertTrue(student_exam.exam_venue.venue.is_accessible)

    def test_separate_room_on_own_allocates_different_venue(self):
        exam = Exam.objects.create(
            exam_name="Chemistry",
            course_code="CHEM1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        core_venue = Venue.objects.create(
            venue_name="Big Hall",
            capacity=300,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=timezone.make_aware(datetime(2025, 7, 6, 9, 0)),
            exam_length=120,
            core=True,
        )
        separate_room = Venue.objects.create(
            venue_name="Quiet Room 1",
            capacity=5,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            is_accessible=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S300",
                    "student_name": "Solo Space",
                    "exam_code": exam.course_code,
                    "provisions": "Separate room on own",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        student_exam = StudentExam.objects.get(student__student_id="S300", exam=exam)
        self.assertEqual(student_exam.exam_venue.venue, separate_room)
        self.assertNotEqual(student_exam.exam_venue.venue, core_venue)

    def test_small_extra_time_reuses_core_venue_despite_overlap(self):
        exam = Exam.objects.create(
            exam_name="History",
            course_code="HIST1",
            exam_type="Written",
            no_students=0,
            exam_school="Arts",
            school_contact="",
        )
        core_start = timezone.make_aware(datetime(2025, 7, 7, 10, 0))
        core_venue = Venue.objects.create(
            venue_name="Heritage Hall",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        core_ev = ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=core_start,
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S301",
                    "student_name": "Extra Early",
                    "exam_code": exam.course_code,
                    "provisions": "Extra time 15 minutes every hour",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)

        student_exam = StudentExam.objects.get(student__student_id="S301", exam=exam)
        self.assertEqual(student_exam.exam_venue.venue, core_venue)
        self.assertNotEqual(student_exam.exam_venue_id, core_ev.pk)
        self.assertEqual(
            student_exam.exam_venue.start_time,
            timezone.make_aware(datetime(2025, 7, 7, 9, 30)),
        )

    def test_examvenue_student_counts_and_core_exam_size(self):
        exam = Exam.objects.create(
            exam_name="Biology",
            course_code="BIO1",
            exam_type="Written",
            no_students=100,
            exam_school="Science",
            school_contact="",
        )
        core_venue = Venue.objects.create(
            venue_name="Main Bio Hall",
            capacity=200,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        core_ev = ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=timezone.make_aware(datetime(2025, 7, 8, 9, 0)),
            exam_length=120,
            core=True,
        )
        alt_venue = Venue.objects.create(
            venue_name="Overflow Bio",
            capacity=50,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
            is_accessible=True,
        )
        alt_ev = ExamVenue.objects.create(
            exam=exam,
            venue=alt_venue,
            start_time=timezone.make_aware(datetime(2025, 7, 8, 9, 0)),
            exam_length=120,
            core=False,
        )
        # Small extra-time alternative in same physical room as core
        small_extra_ev = ExamVenue.objects.create(
            exam=exam,
            venue=core_venue,
            start_time=timezone.make_aware(datetime(2025, 7, 8, 8, 45)),
            exam_length=135,
            core=False,
        )

        # Assign students
        for idx in range(10):
            student = Student.objects.create(student_id=f"SALT{idx}", student_name=f"Alt {idx}")
            StudentExam.objects.create(student=student, exam=exam, exam_venue=alt_ev)
        for idx in range(5):
            student = Student.objects.create(student_id=f"SET{idx}", student_name=f"Extra {idx}")
            StudentExam.objects.create(student=student, exam=exam, exam_venue=small_extra_ev)
        # Remaining 85 implicitly in core (no StudentExam assignment to core)

        counts = examvenue_student_counts(exam)
        self.assertEqual(counts.get(alt_ev.pk), 10)
        self.assertEqual(counts.get(small_extra_ev.pk), 5)
        self.assertIsNone(counts.get(core_ev.pk))

        # Core size should subtract the 10 students in the other venue, but not the 5 in the same venue.
        self.assertEqual(core_exam_size(exam), 90)

    def test_unsupported_file_type_returns_summary(self):
        result = {"status": "ok", "type": "Unknown", "days": []}
        summary = ingest_upload_result(result, file_name="venue.xlsx", uploaded_by=self.user)
        self.assertFalse(summary["handled"])
        self.assertIn("message", summary)
        self.assertEqual(UploadLog.objects.count(), 0)

    def test_venue_days_create_and_update_records(self):
        result = {
            "status": "ok",
            "type": "Venue",
            "days": [
                {
                    "day": "Monday",
                    "date": "2025-07-28",
                    "rooms": [
                        {
                            "name": "Main Hall",
                            "capacity": 200,
                            "venuetype": VenueType.MAIN_HALL,
                            "accessible": False,
                            "qualifications": ["exam"],
                        },
                        {
                            "name": "Purple Lab",
                            "capacity": "50",
                            "venuetype": VenueType.PURPLE_CLUSTER,
                        },
                    ],
                }
            ],
        }

        summary = ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        self.assertTrue(summary["handled"])
        self.assertEqual(summary["created"], 2)
        self.assertEqual(summary["updated"], 0)

        main_hall = Venue.objects.get(pk="Main Hall")
        self.assertEqual(main_hall.capacity, 200)
        self.assertEqual(main_hall.venuetype, VenueType.MAIN_HALL)
        self.assertFalse(main_hall.is_accessible)
        self.assertEqual(main_hall.qualifications, ["exam"])

        purple_lab = Venue.objects.get(pk="Purple Lab")
        self.assertEqual(purple_lab.capacity, 50)
        self.assertEqual(purple_lab.venuetype, VenueType.PURPLE_CLUSTER)
        self.assertTrue(purple_lab.is_accessible)
        self.assertIn("2025-07-28", main_hall.availability)
        self.assertEqual(UploadLog.objects.count(), 1)

        # Update capacities and accessibility to ensure updates are counted
        result["days"][0]["rooms"][0]["capacity"] = 180
        result["days"][0]["rooms"][0]["accessible"] = True
        result["days"][0]["rooms"][1]["capacity"] = 60

        summary = ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        self.assertEqual(summary["created"], 0)
        self.assertEqual(summary["updated"], 2)
        main_hall.refresh_from_db()
        purple_lab.refresh_from_db()
        self.assertEqual(main_hall.capacity, 180)
        self.assertFalse(main_hall.is_accessible)
        self.assertEqual(purple_lab.capacity, 60)
        self.assertEqual(UploadLog.objects.count(), 2)

    def test_venue_availability_merges_across_days(self):
        result = {
            "status": "ok",
            "type": "Venue",
            "days": [
                {
                    "day": "Monday",
                    "date": "2025-07-28",
                    "rooms": [{"name": "Room A"}],
                },
                {
                    "day": "Tuesday",
                    "date": "2025-07-29",
                    "rooms": [{"name": "Room A"}],
                },
            ],
        }

        ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        room = Venue.objects.get(pk="Room A")
        self.assertEqual(sorted(room.availability), ["2025-07-28", "2025-07-29"])

        # Reupload with different capacity should update and retain availability
        result["days"][0]["rooms"][0]["capacity"] = 20
        ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        room.refresh_from_db()
        self.assertEqual(sorted(room.availability), ["2025-07-28", "2025-07-29"])
        self.assertEqual(room.capacity, 20)

    def test_venue_accessibility_does_not_flip_to_true(self):
        result = {
            "status": "ok",
            "type": "Venue",
            "days": [
                {
                    "day": "Monday",
                    "date": "2025-07-28",
                    "rooms": [
                        {"name": "Main Hall", "accessible": False},
                    ],
                }
            ],
        }

        ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        venue = Venue.objects.get(pk="Main Hall")
        self.assertFalse(venue.is_accessible)

        # Previously this would flip the venue back to accessible.
        result["days"][0]["rooms"][0]["accessible"] = True
        ingest_upload_result(result, file_name="venues.xlsx", uploaded_by=self.user)
        venue.refresh_from_db()
        self.assertFalse(venue.is_accessible)

    def test_provisions_assign_existing_or_new_exam_venue(self):
        exam_date = datetime(2025, 7, 10).date()
        exam = Exam.objects.create(
            exam_name="Networks",
            course_code="NET101",
            exam_type="Written",
            no_students=0,
            exam_school="Engineering",
            school_contact="",
        )

        separate_room = Venue.objects.create(
            venue_name="Quiet Room 1",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            is_accessible=True,
            qualifications=[],
            availability=[exam_date.isoformat()],
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        existing_ev = ExamVenue.objects.create(
            exam=exam,
            venue=separate_room,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )

        computer_lab = Venue.objects.create(
            venue_name="Computer Lab 1",
            capacity=25,
            venuetype=VenueType.COMPUTER_CLUSTER,
            is_accessible=True,
            qualifications=[],
            availability=[exam_date.isoformat()],
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        # First upload should use existing separate room exam venue
        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S70001",
                    "student_name": "Separate Room Student",
                    "exam_code": exam.course_code,
                    "provisions": "Separate room on own",
                }
            ],
        }
        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        se_student_exam = StudentExam.objects.get(student__student_id="S70001", exam=exam)
        self.assertEqual(se_student_exam.exam_venue_id, existing_ev.pk)

        # Second upload needs computer lab; should create new ExamVenue with that venue
        result["rows"][0] = {
            "student_id": "S70002",
            "student_name": "Computer Student",
            "exam_code": exam.course_code,
            "provisions": "Use of a computer",
        }
        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        comp_student_exam = StudentExam.objects.get(student__student_id="S70002", exam=exam)
        self.assertIsNotNone(comp_student_exam.exam_venue)
        if comp_student_exam.exam_venue.venue:
            self.assertEqual(comp_student_exam.exam_venue.venue, computer_lab)
            self.assertEqual(
                comp_student_exam.exam_venue.venue.provision_capabilities,
                [ExamVenueProvisionType.USE_COMPUTER],
            )

    def test_provisions_skip_exam_venue_if_venue_lacks_capability(self):
        exam_date = datetime(2025, 8, 1).date()
        exam = Exam.objects.create(
            exam_name="Data Science",
            course_code="DS101",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )

        venue_without_caps = Venue.objects.create(
            venue_name="Big Hall",
            capacity=200,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
            availability=[exam_date.isoformat()],
            provision_capabilities=[],
        )
        ExamVenue.objects.create(exam=exam, venue=venue_without_caps, provision_capabilities=[])

        computer_room = Venue.objects.create(
            venue_name="Comp Lab 2",
            capacity=30,
            venuetype=VenueType.COMPUTER_CLUSTER,
            is_accessible=True,
            availability=[exam_date.isoformat()],
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S80001",
                    "student_name": "Comp Student",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        student_exam = StudentExam.objects.get(student__student_id="S80001", exam=exam)
        self.assertIsNotNone(student_exam.exam_venue)
        if student_exam.exam_venue.venue:
            self.assertEqual(student_exam.exam_venue.venue, computer_room)

    def test_provisions_create_placeholder_exam_venue_when_no_matching_venue(self):
        exam = Exam.objects.create(
            exam_name="AI Ethics",
            course_code="AI200",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S90001",
                    "student_name": "Unplaced Student",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                },
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        student_exam = StudentExam.objects.get(student__student_id="S90001", exam=exam)
        self.assertIsNotNone(student_exam.exam_venue)
        self.assertIsNone(student_exam.exam_venue.venue)
        self.assertEqual(
            student_exam.exam_venue.provision_capabilities,
            [ExamVenueProvisionType.USE_COMPUTER],
        )

        # Additional students with the same need should reuse the placeholder
        result["rows"].append(
            {
                "student_id": "S90002",
                "student_name": "Second Student",
                "exam_code": exam.course_code,
                "provisions": "Use of a computer",
            }
        )
        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        self.assertEqual(ExamVenue.objects.filter(exam=exam).count(), 1)

    def test_placeholder_upgraded_to_real_venue_when_capability_added(self):
        exam = Exam.objects.create(
            exam_name="ML",
            course_code="ML300",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )

        # First upload creates placeholder because no venues are compatible
        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S91001",
                    "student_name": "Needs Computer",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }
        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        placeholder = ExamVenue.objects.get(exam=exam)
        self.assertIsNone(placeholder.venue)

        # Add a compatible venue and re-run upload; placeholder should be updated to use it
        computer_lab = Venue.objects.create(
            venue_name="Comp Lab 3",
            capacity=20,
            venuetype=VenueType.COMPUTER_CLUSTER,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        placeholder.refresh_from_db()
        self.assertEqual(placeholder.venue, computer_lab)
        self.assertIn(ExamVenueProvisionType.USE_COMPUTER, placeholder.provision_capabilities)

    def test_placeholder_auto_upgrades_when_venue_capabilities_added(self):
        exam = Exam.objects.create(
            exam_name="Security",
            course_code="SEC101",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )

        # Initial upload creates placeholder with no matching venue
        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S92001",
                    "student_name": "Late Match Student",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }
        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        placeholder = ExamVenue.objects.get(exam=exam)
        student_exam = StudentExam.objects.get(student__student_id="S92001", exam=exam)
        self.assertIsNone(placeholder.venue)
        self.assertEqual(student_exam.exam_venue, placeholder)

        # Create a new compatible venue; signal should attach placeholder automatically
        computer_lab = Venue.objects.create(
            venue_name="Comp Lab Auto",
            capacity=15,
            venuetype=VenueType.SCHOOL_TO_SORT,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        placeholder.refresh_from_db()
        student_exam.refresh_from_db()
        self.assertEqual(placeholder.venue, computer_lab)
        self.assertEqual(student_exam.exam_venue, placeholder)

    def test_venue_capability_overrides_venuetype_requirement(self):
        exam = Exam.objects.create(
            exam_name="Databases",
            course_code="DB101",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )

        # Venue is not a computer cluster by type, but explicitly has the capability.
        capable_room = Venue.objects.create(
            venue_name="Any Room",
            capacity=50,
            venuetype=VenueType.SCHOOL_TO_SORT,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S93001",
                    "student_name": "Comp Need",
                    "exam_code": exam.course_code,
                    "provisions": "Use of a computer",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        student_exam = StudentExam.objects.get(student__student_id="S93001", exam=exam)
        self.assertIsNotNone(student_exam.exam_venue)
        self.assertEqual(student_exam.exam_venue.venue, capable_room)

    def test_use_computer_capability_sets_venue_type(self):
        venue = Venue.objects.create(
            venue_name="Flexible Room",
            capacity=40,
            venuetype=VenueType.SCHOOL_TO_SORT,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )
        self.assertEqual(venue.venuetype, VenueType.COMPUTER_CLUSTER)

    def test_extra_time_variants_for_one_hour_exam(self):
        core_venue = Venue.objects.create(
            venue_name="Core Hall Extra Hour",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        alt_venue = Venue.objects.create(
            venue_name="Alt Hall Extra Hour",
            capacity=40,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        cases = [
            ("Extra time 100%", 120),
            ("Extra time 30 minutes every hour", 90),
            ("Extra time 20 minutes every hour", 80),
            ("Extra time 15 minutes every hour", 75),
            ("Extra time", 75),
        ]
        for idx, (provision, expected_length) in enumerate(cases, start=1):
            with self.subTest(provision=provision):
                exam = Exam.objects.create(
                    exam_name=f"Extra Hour {idx}",
                    course_code=f"EXTRA{idx:03d}",
                    exam_type="Written",
                    no_students=0,
                    exam_school="Computing",
                    school_contact="",
                )
                base_start = timezone.make_aware(datetime(2025, 7, 20 + idx, 10, 0))
                ExamVenue.objects.create(
                    exam=exam,
                    venue=core_venue,
                    start_time=base_start,
                    exam_length=60,
                    core=True,
                )

                result = {
                    "status": "ok",
                    "type": "Provisions",
                    "rows": [
                        {
                            "student_id": f"S98{idx:03d}",
                            "student_name": f"Extra Student {idx}",
                            "exam_code": exam.course_code,
                            "provisions": provision,
                        }
                    ],
                }

                ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
                student_exam = StudentExam.objects.get(student__student_id=f"S98{idx:03d}", exam=exam)
                self.assertEqual(student_exam.exam_venue.exam_length, expected_length)

    def test_extra_time_variants_for_ninety_minute_exam(self):
        core_venue = Venue.objects.create(
            venue_name="Core Hall Extra Ninety",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        cases = [
            ("Extra time 100%", 180),
            ("Extra time 30 minutes every hour", 135),
            ("Extra time 20 minutes every hour", 120),
            ("Extra time 15 minutes every hour", 113),
            ("Extra time", 113),
        ]
        for idx, (provision, expected_length) in enumerate(cases, start=1):
            with self.subTest(provision=provision):
                exam = Exam.objects.create(
                    exam_name=f"Extra Ninety {idx}",
                    course_code=f"EXTRA9{idx:02d}",
                    exam_type="Written",
                    no_students=0,
                    exam_school="Computing",
                    school_contact="",
                )
                base_start = timezone.make_aware(datetime(2025, 8, 1 + idx, 10, 0))
                ExamVenue.objects.create(
                    exam=exam,
                    venue=core_venue,
                    start_time=base_start,
                    exam_length=90,
                    core=True,
                )

                result = {
                    "status": "ok",
                    "type": "Provisions",
                    "rows": [
                        {
                            "student_id": f"S99{idx:03d}",
                            "student_name": f"Extra Ninety Student {idx}",
                            "exam_code": exam.course_code,
                            "provisions": provision,
                        }
                    ],
                }

                ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
                student_exam = StudentExam.objects.get(student__student_id=f"S99{idx:03d}", exam=exam)
                self.assertEqual(student_exam.exam_venue.exam_length, expected_length)

    def test_extra_time_variants_for_two_hour_exam(self):
        core_venue = Venue.objects.create(
            venue_name="Core Hall Extra Two Hour",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        cases = [
            ("Extra time 100%", 240),
            ("Extra time 30 minutes every hour", 180),
            ("Extra time 20 minutes every hour", 160),
            ("Extra time 15 minutes every hour", 150),
            ("Extra time", 150),
        ]
        for idx, (provision, expected_length) in enumerate(cases, start=1):
            with self.subTest(provision=provision):
                exam = Exam.objects.create(
                    exam_name=f"Extra Two Hour {idx}",
                    course_code=f"EXTRA2{idx:02d}",
                    exam_type="Written",
                    no_students=0,
                    exam_school="Computing",
                    school_contact="",
                )
                base_start = timezone.make_aware(datetime(2025, 8, 10 + idx, 10, 0))
                ExamVenue.objects.create(
                    exam=exam,
                    venue=core_venue,
                    start_time=base_start,
                    exam_length=120,
                    core=True,
                )

                result = {
                    "status": "ok",
                    "type": "Provisions",
                    "rows": [
                        {
                            "student_id": f"S97{idx:03d}",
                            "student_name": f"Extra Two Hour Student {idx}",
                            "exam_code": exam.course_code,
                            "provisions": provision,
                        }
                    ],
                }

                ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
                student_exam = StudentExam.objects.get(student__student_id=f"S97{idx:03d}", exam=exam)
                self.assertEqual(student_exam.exam_venue.exam_length, expected_length)

    def test_extra_time_variants_for_two_and_half_hour_exam(self):
        core_venue = Venue.objects.create(
            venue_name="Core Hall Extra Two Half",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        cases = [
            ("Extra time 100%", 300),
            ("Extra time 30 minutes every hour", 225),
            ("Extra time 20 minutes every hour", 200),
            ("Extra time 15 minutes every hour", 188),
            ("Extra time", 188),
        ]
        for idx, (provision, expected_length) in enumerate(cases, start=1):
            with self.subTest(provision=provision):
                exam = Exam.objects.create(
                    exam_name=f"Extra Two Half {idx}",
                    course_code=f"EXTRA25{idx:02d}",
                    exam_type="Written",
                    no_students=0,
                    exam_school="Computing",
                    school_contact="",
                )
                base_start = timezone.make_aware(datetime(2025, 8, 20 + idx, 10, 0))
                ExamVenue.objects.create(
                    exam=exam,
                    venue=core_venue,
                    start_time=base_start,
                    exam_length=150,
                    core=True,
                )

                result = {
                    "status": "ok",
                    "type": "Provisions",
                    "rows": [
                        {
                            "student_id": f"S96{idx:03d}",
                            "student_name": f"Extra Two Half Student {idx}",
                            "exam_code": exam.course_code,
                            "provisions": provision,
                        }
                    ],
                }

                ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
                student_exam = StudentExam.objects.get(student__student_id=f"S96{idx:03d}", exam=exam)
                self.assertEqual(student_exam.exam_venue.exam_length, expected_length)

    def test_extra_time_variants_for_three_hour_exam(self):
        core_venue = Venue.objects.create(
            venue_name="Core Hall Extra Three Hour",
            capacity=120,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        cases = [
            ("Extra time 100%", 360),
            ("Extra time 30 minutes every hour", 270),
            ("Extra time 20 minutes every hour", 240),
            ("Extra time 15 minutes every hour", 225),
            ("Extra time", 225),
        ]
        for idx, (provision, expected_length) in enumerate(cases, start=1):
            with self.subTest(provision=provision):
                exam = Exam.objects.create(
                    exam_name=f"Extra Three Hour {idx}",
                    course_code=f"EXTRA3{idx:02d}",
                    exam_type="Written",
                    no_students=0,
                    exam_school="Computing",
                    school_contact="",
                )
                base_start = timezone.make_aware(datetime(2025, 9, idx, 10, 0))
                ExamVenue.objects.create(
                    exam=exam,
                    venue=core_venue,
                    start_time=base_start,
                    exam_length=180,
                    core=True,
                )

                result = {
                    "status": "ok",
                    "type": "Provisions",
                    "rows": [
                        {
                            "student_id": f"S95{idx:03d}",
                            "student_name": f"Extra Three Hour Student {idx}",
                            "exam_code": exam.course_code,
                            "provisions": provision,
                        }
                    ],
                }

                ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
                student_exam = StudentExam.objects.get(student__student_id=f"S95{idx:03d}", exam=exam)
                self.assertEqual(student_exam.exam_venue.exam_length, expected_length)

    def test_provision_exam_venue_inherits_core_timing_without_extra_time(self):
        core_start = timezone.make_aware(datetime(2025, 7, 15, 10, 0))
        exam = Exam.objects.create(
            exam_name="OS",
            course_code="OS100",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        core_ev = ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Main Hall Base",
                capacity=200,
                venuetype=VenueType.MAIN_HALL,
                is_accessible=True,
                provision_capabilities=[ExamVenueProvisionType.ACCESSIBLE_HALL],
            ),
            start_time=core_start,
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S94001",
                    "student_name": "No Extra",
                    "exam_code": exam.course_code,
                    "provisions": "Accessible hall",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        student_exam = StudentExam.objects.get(student__student_id="S94001", exam=exam)
        # Timing should match the core exam; venue may remain placeholder if conflicts prevent reuse.
        self.assertEqual(student_exam.exam_venue.start_time, core_start)
        self.assertEqual(student_exam.exam_venue.exam_length, 120)
        if student_exam.exam_venue.venue:
            self.assertEqual(student_exam.exam_venue.venue, core_ev.venue)

    def test_extra_time_starts_earlier_until_nine_am(self):
        base_start = timezone.make_aware(datetime(2025, 7, 16, 10, 0))
        exam = Exam.objects.create(
            exam_name="AI",
            course_code="AI300",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Core Hall",
                capacity=100,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        separate_room = Venue.objects.create(
            venue_name="Quiet Room Extra",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S95001",
                    "student_name": "Needs Extra",
                    "exam_code": exam.course_code,
                    "provisions": "Separate room on own; Extra time 30 minutes every hour",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        student_exam = StudentExam.objects.get(student__student_id="S95001", exam=exam)
        ev = student_exam.exam_venue
        self.assertEqual(ev.venue, separate_room)
        self.assertEqual(ev.start_time, timezone.make_aware(datetime(2025, 7, 16, 9, 0)))
        # Extra time now extends duration rather than reducing it when starting earlier.
        self.assertEqual(ev.exam_length, 180)  # base 120 + 60 extra (30 mins per hour)

    def test_extra_time_split_before_and_after_nine_am(self):
        base_start = timezone.make_aware(datetime(2025, 7, 17, 9, 15))
        exam = Exam.objects.create(
            exam_name="HCI",
            course_code="HCI200",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Core Hall HCI",
                capacity=100,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        separate_room = Venue.objects.create(
            venue_name="Quiet Room HCI",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            is_accessible=True,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S96001",
                    "student_name": "Needs Extra Split",
                    "exam_code": exam.course_code,
                    "provisions": "Separate room on own; Extra time 30 minutes every hour",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        ev = StudentExam.objects.get(student__student_id="S96001", exam=exam).exam_venue
        self.assertEqual(ev.venue, separate_room)
        self.assertEqual(ev.start_time, timezone.make_aware(datetime(2025, 7, 17, 9, 0)))
        # Extra time keeps the full allowance added to duration even when start shifts earlier.
        self.assertEqual(ev.exam_length, 180)  # base 120 + 60 extra (30 mins per hour)

    def test_conflict_avoids_double_booking(self):
        # Exam 1 uses a separate room at 10:00 for 2 hours
        base_start = timezone.make_aware(datetime(2025, 7, 18, 10, 0))
        exam1 = Exam.objects.create(
            exam_name="Graphics",
            course_code="GFX100",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        sep_room = Venue.objects.create(
            venue_name="Quiet Room Conflict",
            capacity=8,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        ExamVenue.objects.create(
            exam=exam1,
            venue=sep_room,
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        # Exam 2 same slot, same requirement should not reuse the venue
        exam2 = Exam.objects.create(
            exam_name="AI Safety",
            course_code="AIS200",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam2,
            venue=Venue.objects.create(
                venue_name="Core Hall AIS",
                capacity=50,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S97001",
                    "student_name": "Needs Separate",
                    "exam_code": exam2.course_code,
                    "provisions": "Separate room on own",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        ev2 = StudentExam.objects.get(student__student_id="S97001", exam=exam2).exam_venue
        self.assertIsNone(ev2.venue)  # placeholder, no double booking
        self.assertEqual(ev2.provision_capabilities, [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN])

    def test_conflict_detects_partial_overlap(self):
        base_start = timezone.make_aware(datetime(2025, 7, 19, 13, 0))
        exam1 = Exam.objects.create(
            exam_name="Parallel",
            course_code="PAR100",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        overlap_room = Venue.objects.create(
            venue_name="Overlap Room",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        ExamVenue.objects.create(
            exam=exam1,
            venue=overlap_room,
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        exam2 = Exam.objects.create(
            exam_name="Overlap Later",
            course_code="PAR200",
            exam_type="Written",
            no_students=0,
            exam_school="Computing",
            school_contact="",
        )
        ExamVenue.objects.create(
            exam=exam2,
            venue=Venue.objects.create(
                venue_name="Core Hall PAR2",
                capacity=50,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=timezone.make_aware(datetime(2025, 7, 19, 13, 30)),
            exam_length=60,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S98001",
                    "student_name": "Needs Separate Later",
                    "exam_code": exam2.course_code,
                    "provisions": "Separate room on own",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        ev = StudentExam.objects.get(student__student_id="S98001", exam=exam2).exam_venue
        self.assertIsNone(ev.venue)  # no reuse because 13:00-15:00 conflicts with 13:30 start

    def test_same_exam_cannot_double_book_same_venue(self):
        base_start = timezone.make_aware(datetime(2025, 7, 20, 13, 30))
        exam = Exam.objects.create(
            exam_name="Astro",
            course_code="ASTRO1",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        main_hall = Venue.objects.create(
            venue_name="Wolfson 346",
            capacity=100,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )
        # Existing conflicting booking for the same exam/venue at 13:00
        ExamVenue.objects.create(
            exam=exam,
            venue=main_hall,
            start_time=timezone.make_aware(datetime(2025, 7, 20, 13, 0)),
            exam_length=120,
            core=False,
        )
        # Core exam elsewhere at 13:30
        ExamVenue.objects.create(
            exam=exam,
            venue=Venue.objects.create(
                venue_name="Core Hall Astro",
                capacity=200,
                venuetype=VenueType.MAIN_HALL,
            ),
            start_time=base_start,
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Provisions",
            "rows": [
                {
                    "student_id": "S99001",
                    "student_name": "Separate Astro",
                    "exam_code": exam.course_code,
                    "provisions": "Separate room on own",
                }
            ],
        }

        ingest_upload_result(result, file_name="prov.xlsx", uploaded_by=self.user)
        ev = StudentExam.objects.get(student__student_id="S99001", exam=exam).exam_venue
        self.assertIsNone(ev.venue)  # conflicting slot leads to placeholder

    def test_exam_upload_conflict_creates_placeholder(self):
        venue = Venue.objects.create(
            venue_name="Wolfson 346",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
        )
        # Existing booking occupying 09:00-11:00
        ExamVenue.objects.create(
            exam=Exam.objects.create(
                exam_name="Existing",
                course_code="EXIST1",
                exam_type="Written",
                no_students=0,
                exam_school="Science",
                school_contact="",
            ),
            venue=venue,
            start_time=timezone.make_aware(datetime(2025, 8, 15, 9, 0)),
            exam_length=120,
            core=True,
        )

        result = {
            "status": "ok",
            "type": "Exam",
            "rows": [
                {
                    "exam_code": "NEW1",
                    "exam_name": "New Exam",
                    "exam_date": "2025-08-15",
                    "exam_start": "09:15",
                    "exam_length": 60,
                    "exam_type": "Written",
                    "no_students": "50",
                    "school": "Science",
                    "school_contact": "Dr. X",
                    "main_venue": "Wolfson 346",
                }
            ],
        }

        ingest_upload_result(result, file_name="exam.xlsx", uploaded_by=self.user)
        ev = ExamVenue.objects.get(exam__course_code="NEW1")
        # Conflicts now keep the named venue instead of creating a placeholder.
        self.assertEqual(ev.venue, venue)
        self.assertEqual(ev.start_time, timezone.make_aware(datetime(2025, 8, 15, 9, 15)))
        self.assertEqual(ev.exam_length, 60)

    def test_placeholder_is_assigned_when_venue_capabilities_updated(self):
        exam = Exam.objects.create(
            exam_name="Late Capability",
            course_code="LC100",
            exam_type="Written",
            no_students=0,
            exam_school="Science",
            school_contact="",
        )
        placeholder = ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=timezone.make_aware(datetime(2025, 8, 20, 9, 0)),
            exam_length=90,
            provision_capabilities=[ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN],
        )

        venue = Venue.objects.create(
            venue_name="Late Room",
            capacity=10,
            venuetype=VenueType.SEPARATE_ROOM,
            provision_capabilities=[],
        )

        # Initially not assigned
        placeholder.refresh_from_db()
        self.assertIsNone(placeholder.venue)

        # Update venue to add capability; post_save signal should attach placeholder
        venue.provision_capabilities = [ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN]
        venue.save()

        placeholder.refresh_from_db()
        self.assertEqual(placeholder.venue, venue)
