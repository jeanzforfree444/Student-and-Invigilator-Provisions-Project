import csv
import zipfile
from io import BytesIO
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch

from timetabling_system.models import (
    Exam,
    Venue,
    ExamVenue,
    Student,
    StudentExam,
    Provisions,
    Invigilator,
    InvigilatorAssignment,
    Diet,
    VenueType,
    ProvisionType,
    Notification,
)
from timetabling_system.api.views import map_assignment_hours_by_diet, _suggest_diet_for_upload


class TimetableUploadViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="uploader",
            email="uploader@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-exam-upload")

    def test_missing_file_returns_400(self):
        response = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["message"], "No file uploaded.")

    @patch("timetabling_system.api.views.ingest_upload_result")
    @patch("timetabling_system.api.views.parse_excel_file")
    def test_parser_exception_returns_400(self, mock_parse, mock_ingest):
        mock_parse.side_effect = Exception("boom")
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(self.url, {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["message"], "Failed to parse uploaded file.")
        mock_parse.assert_called_once()
        mock_ingest.assert_not_called()

    @patch("timetabling_system.api.views.ingest_upload_result")
    @patch("timetabling_system.api.views.parse_excel_file")
    def test_parser_error_result_returns_400(self, mock_parse, mock_ingest):
        mock_parse.return_value = {"status": "error", "message": "Missing required columns"}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(self.url, {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], "error")
        self.assertEqual(response.data["message"], "Missing required columns")
        mock_parse.assert_called_once()
        mock_ingest.assert_not_called()

    @patch("timetabling_system.api.views.ingest_upload_result")
    @patch("timetabling_system.api.views.parse_excel_file")
    def test_successful_upload_calls_ingest_and_returns_result(self, mock_parse, mock_ingest):
        mock_parse.return_value = {"status": "ok", "type": "Exam", "rows": []}
        mock_ingest.return_value = {"handled": True, "created": 1, "updated": 0}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(self.url, {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_parse.assert_called_once()
        # Call args may reflect mutation after ingest due to shared dict; check fields explicitly.
        ingest_args, ingest_kwargs = mock_ingest.call_args
        self.assertEqual(ingest_kwargs["file_name"], "exam.xlsx")
        self.assertEqual(ingest_kwargs["uploaded_by"], self.user)
        self.assertEqual(ingest_args[0]["status"], "ok")
        self.assertEqual(ingest_args[0]["type"], "Exam")
        self.assertIn("rows", ingest_args[0])
        self.assertEqual(response.data["status"], "ok")
        self.assertIn("ingest", response.data)

    @patch("timetabling_system.api.views.ingest_upload_result")
    @patch("timetabling_system.api.views.parse_excel_file")
    def test_exam_upload_includes_diet_suggestion(self, mock_parse, mock_ingest):
        Diet.objects.create(
            code="BASE_2026",
            name="Base 2026",
            start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 20),
            is_active=True,
        )
        mock_parse.return_value = {
            "status": "ok",
            "type": "Exam",
            "rows": [
                {"exam_date": "2026-04-05"},
                {"exam_date": "2026-04-12"},
            ],
        }
        mock_ingest.return_value = {"handled": True, "created": 0, "updated": 0}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(self.url, {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("upload_exam_date_range", response.data)
        self.assertIn("diet_suggestion", response.data)
        suggestion = response.data["diet_suggestion"]
        self.assertEqual(suggestion["status"], "ok")
        self.assertEqual(suggestion["action"], "adjust_existing")

    @patch("timetabling_system.api.views.ingest_upload_result")
    @patch("timetabling_system.api.views.parse_excel_file")
    def test_exam_upload_without_dates_has_no_suggestion(self, mock_parse, mock_ingest):
        mock_parse.return_value = {
            "status": "ok",
            "type": "Exam",
            "rows": [
                {"exam_date": None},
                {"exam_date": ""},
            ],
        }
        mock_ingest.return_value = {"handled": True, "created": 0, "updated": 0}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(self.url, {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("upload_exam_date_range", response.data)
        self.assertNotIn("diet_suggestion", response.data)


class DietSuggestionLogicTests(TestCase):
    def setUp(self):
        Diet.objects.all().delete()

    def test_no_overlap_returns_create_new(self):
        suggestion = _suggest_diet_for_upload(date(2026, 7, 1), date(2026, 7, 15))
        self.assertEqual(suggestion["status"], "ok")
        self.assertEqual(suggestion["action"], "create_new")
        self.assertIn("suggested", suggestion)

    def test_overlap_returns_extend_options(self):
        diet = Diet.objects.create(
            code="APR_2026",
            name="April 2026",
            start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 20),
            is_active=True,
        )
        suggestion = _suggest_diet_for_upload(date(2026, 4, 5), date(2026, 4, 25))
        self.assertEqual(suggestion["status"], "ok")
        self.assertEqual(suggestion["diet_id"], diet.id)
        self.assertIn("extend_start", suggestion["options"])
        self.assertIn("extend_end", suggestion["options"])

    def test_inside_range_returns_contract_options(self):
        Diet.objects.create(
            code="MAY_2026",
            name="May 2026",
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 31),
            is_active=True,
        )
        suggestion = _suggest_diet_for_upload(date(2026, 5, 10), date(2026, 5, 20))
        self.assertEqual(suggestion["status"], "ok")
        self.assertIn("contract_start", suggestion["options"])
        self.assertIn("contract_end", suggestion["options"])

    def test_mixed_extend_contract_options(self):
        Diet.objects.create(
            code="JUN_2026",
            name="June 2026",
            start_date=date(2026, 6, 5),
            end_date=date(2026, 6, 25),
            is_active=True,
        )
        suggestion = _suggest_diet_for_upload(date(2026, 6, 1), date(2026, 6, 20))
        self.assertEqual(suggestion["status"], "ok")
        self.assertIn("extend_start", suggestion["options"])
        self.assertIn("contract_end", suggestion["options"])

    def test_multiple_overlaps_returns_error(self):
        Diet.objects.create(
            code="D1",
            name="Diet 1",
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 10),
            is_active=True,
        )
        Diet.objects.create(
            code="D2",
            name="Diet 2",
            start_date=date(2026, 4, 5),
            end_date=date(2026, 4, 15),
            is_active=True,
        )
        suggestion = _suggest_diet_for_upload(date(2026, 4, 7), date(2026, 4, 12))
        self.assertEqual(suggestion["status"], "error")


class ProvisionExportViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-provisions-export")

        self.exam = Exam.objects.create(
            exam_name="Physics",
            course_code="PHY101",
            exam_school="Science",
            exam_type="on_campus",
            no_students=120,
        )
        self.venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=200,
            venuetype=VenueType.MAIN_HALL,
        )
        self.start_time = timezone.now()
        self.exam_venue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=self.start_time,
            exam_length=120,
            core=True,
        )
        self.student = Student.objects.create(student_id="S1", student_name="Ada Lovelace")
        StudentExam.objects.create(student=self.student, exam=self.exam, exam_venue=self.exam_venue)
        Provisions.objects.create(
            exam=self.exam,
            student=self.student,
            provisions=[ProvisionType.EXTRA_TIME_15_PER_HOUR],
            notes="Extra time 15 per hour",
        )

        self.other_exam = Exam.objects.create(
            exam_name="Chemistry",
            course_code="CHEM1",
            exam_school="Engineering",
            exam_type="on_campus",
            no_students=90,
        )
        self.other_venue = Venue.objects.create(
            venue_name="Hall B",
            capacity=180,
            venuetype=VenueType.MAIN_HALL,
        )
        self.other_exam_venue = ExamVenue.objects.create(
            exam=self.other_exam,
            venue=self.other_venue,
            start_time=self.start_time + timedelta(days=1),
            exam_length=90,
            core=True,
        )
        other_student = Student.objects.create(student_id="S2", student_name="Grace Hopper")
        StudentExam.objects.create(student=other_student, exam=self.other_exam, exam_venue=self.other_exam_venue)
        Provisions.objects.create(
            exam=self.other_exam,
            student=other_student,
            provisions=[ProvisionType.SEPARATE_ROOM_NOT_ON_OWN],
            notes="Separate room not on own",
        )

    def _parse_csv(self, content: bytes):
        rows = list(csv.reader(content.decode().splitlines()))
        return rows[0], rows[1:]

    def test_export_returns_csv_with_expected_fields(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        header, rows = self._parse_csv(response.content)
        self.assertIn("Exam Name", header)
        self.assertIn("Provisions", header)
        self.assertIn("Additional Info", header)
        self.assertEqual(len(rows), 2)
        self.assertIn("Physics", rows[0])
        self.assertIn("Extra time 15 per hour", rows[0])

    def test_export_filters_by_school(self):
        response = self.client.get(f"{self.url}?school=Science")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        _, rows = self._parse_csv(response.content)
        self.assertEqual(len(rows), 1)
        self.assertIn("Physics", rows[0])

    def test_export_separate_returns_zip(self):
        response = self.client.get(f"{self.url}?separate=1")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with zipfile.ZipFile(BytesIO(response.content), "r") as zip_file:
            names = set(zip_file.namelist())
            self.assertIn("provisions_export_science.csv", names)
            self.assertIn("provisions_export_engineering.csv", names)
            with zip_file.open("provisions_export_science.csv") as handle:
                header, rows = self._parse_csv(handle.read())
                self.assertIn("Exam Name", header)
                self.assertTrue(any("Physics" in row for row in rows))


class InvigilatorTimetableExportViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-invigilator-timetable-export")

        self.invigilator_user = get_user_model().objects.create_user(
            username="alice",
            email="alice@example.com",
            password="secret",
        )
        self.invigilator = Invigilator.objects.create(
            user=self.invigilator_user,
            preferred_name="Alice",
            full_name="Alice Example",
        )
        self.invigilator_user_2 = get_user_model().objects.create_user(
            username="bob",
            email="bob@example.com",
            password="secret",
        )
        self.invigilator_2 = Invigilator.objects.create(
            user=self.invigilator_user_2,
            preferred_name="Bob",
            full_name="Bob Example",
        )

        self.exam = Exam.objects.create(
            exam_name="Maths",
            course_code="MTH101",
            exam_school="Science",
            exam_type="on_campus",
            no_students=60,
        )
        self.venue = Venue.objects.create(
            venue_name="Room 1",
            capacity=80,
            venuetype=VenueType.MAIN_HALL,
        )
        base_time = timezone.now()
        self.exam_venue_confirmed = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=base_time,
            exam_length=90,
            core=True,
        )
        self.exam_venue_pending = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=base_time + timedelta(hours=3),
            exam_length=90,
            core=True,
        )
        self.exam_venue_requested = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=base_time + timedelta(hours=6),
            exam_length=90,
            core=True,
        )
        self.exam_venue_cancelled = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=base_time + timedelta(hours=9),
            exam_length=90,
            core=True,
        )
        self.exam_venue_other = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=base_time + timedelta(hours=12),
            exam_length=90,
            core=True,
        )

        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_confirmed,
            assigned_start=base_time - timedelta(minutes=15),
            assigned_end=base_time + timedelta(hours=2),
            confirmed=True,
            cancel=False,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_pending,
            assigned_start=base_time + timedelta(hours=3),
            assigned_end=base_time + timedelta(hours=5),
            confirmed=False,
            cancel=False,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_requested,
            assigned_start=base_time + timedelta(hours=6),
            assigned_end=base_time + timedelta(hours=8),
            confirmed=False,
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_cancelled,
            assigned_start=base_time + timedelta(hours=9),
            assigned_end=base_time + timedelta(hours=11),
            confirmed=True,
            cancel=True,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator_2,
            exam_venue=self.exam_venue_other,
            assigned_start=base_time + timedelta(hours=12),
            assigned_end=base_time + timedelta(hours=14),
            confirmed=True,
            cancel=False,
        )

        student = Student.objects.create(student_id="S10", student_name="Jamie")
        StudentExam.objects.create(
            student=student,
            exam=self.exam,
            exam_venue=self.exam_venue_confirmed,
        )
        Provisions.objects.create(
            exam=self.exam,
            student=student,
            provisions=[ProvisionType.EXTRA_TIME_15_PER_HOUR],
            notes="Needs extra time",
        )

    def _parse_csv(self, content: bytes):
        rows = list(csv.reader(content.decode().splitlines()))
        return rows[0], rows[1:]

    def test_missing_ids_returns_400(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_confirmed_filters_rows(self):
        response = self.client.post(
            self.url,
            {"invigilator_ids": [self.invigilator.id], "only_confirmed": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        _, rows = self._parse_csv(response.content)
        self.assertEqual(len(rows), 1)
        self.assertIn("confirmed", rows[0])

    def test_include_cancelled_adds_cancelled_rows(self):
        response = self.client.post(
            self.url,
            {"invigilator_ids": [self.invigilator.id], "only_confirmed": True, "include_cancelled": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        _, rows = self._parse_csv(response.content)
        statuses = {row[4] for row in rows}
        self.assertEqual(len(rows), 2)
        self.assertIn("confirmed", statuses)
        self.assertIn("cancelled", statuses)

    def test_include_provisions_toggle(self):
        response = self.client.post(
            self.url,
            {"invigilator_ids": [self.invigilator.id], "include_provisions": False},
            format="json",
        )
        header, _ = self._parse_csv(response.content)
        self.assertNotIn("student_provisions", header)
        self.assertNotIn("provision_notes", header)

        response = self.client.post(
            self.url,
            {"invigilator_ids": [self.invigilator.id], "include_provisions": True},
            format="json",
        )
        header, rows = self._parse_csv(response.content)
        self.assertIn("student_provisions", header)
        self.assertIn("provision_notes", header)
        self.assertTrue(any("extra_time_15_per_hour" in row for row in rows))
        self.assertTrue(any("Needs extra time" in row for row in rows))

    def test_multi_invigilator_export_returns_zip(self):
        response = self.client.post(
            self.url,
            {"invigilator_ids": [self.invigilator.id, self.invigilator_2.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/zip")
        zip_file = zipfile.ZipFile(BytesIO(response.content))
        combined_name = "invigilators_timetables.csv"
        alice_name = f"{slugify('alice')}_timetable.csv"
        bob_name = f"{slugify('bob')}_timetable.csv"
        self.assertIn(combined_name, zip_file.namelist())
        self.assertIn(alice_name, zip_file.namelist())
        self.assertIn(bob_name, zip_file.namelist())

        combined_rows = zip_file.read(combined_name).decode().splitlines()
        self.assertTrue(any(str(self.invigilator.id) in row for row in combined_rows))
        self.assertTrue(any(str(self.invigilator_2.id) in row for row in combined_rows))


class StudentProvisionAllocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="allocator",
            email="allocator@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-student-provisions")

        self.exam = Exam.objects.create(
            exam_name="Biology",
            course_code="BIO101",
            exam_school="Science",
            exam_type="on_campus",
            no_students=50,
        )
        self.venue = Venue.objects.create(
            venue_name="Lab A",
            capacity=50,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
            provision_capabilities=[],
        )
        self.exam_venue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            core=True,
        )
        self.student = Student.objects.create(
            student_id="S001",
            student_name="Student One",
        )
        Provisions.objects.create(
            student=self.student,
            exam=self.exam,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        self.student_exam = StudentExam.objects.create(
            student=self.student,
            exam=self.exam,
            exam_venue=self.exam_venue,
        )

    def test_manual_allocation_override_sets_matches_needs_and_logs_notification(self):
        response = self.client.patch(
            self.url,
            {"student_exam_id": self.student_exam.id, "manual_allocation_override": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["matches_needs"])
        self.assertIsNone(response.data["allocation_issue"])
        self.student_exam.refresh_from_db()
        self.assertTrue(self.student_exam.manual_allocation_override)

        notification = Notification.objects.filter(type=Notification.NotificationType.ALLOCATION).first()
        self.assertIsNotNone(notification)
        self.assertIn("Allocation confirmed", notification.admin_message)
        self.assertEqual(notification.invigilator_message, "")

    def test_manual_allocation_override_unconfirm_logs_notification(self):
        self.student_exam.manual_allocation_override = True
        self.student_exam.save(update_fields=["manual_allocation_override"])

        response = self.client.patch(
            self.url,
            {"student_exam_id": self.student_exam.id, "manual_allocation_override": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student_exam.refresh_from_db()
        self.assertFalse(self.student_exam.manual_allocation_override)

        notification = Notification.objects.filter(type=Notification.NotificationType.ALLOCATION).first()
        self.assertIsNotNone(notification)
        self.assertIn("Allocation unconfirmed", notification.admin_message)
        self.assertEqual(notification.invigilator_message, "")


class StudentProvisionDietFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="diet_admin",
            email="diet_admin@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-student-provisions")

        self.diet_one = Diet.objects.create(
            code="JAN_2026",
            name="January 2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        self.diet_two = Diet.objects.create(
            code="FEB_2026",
            name="February 2026",
            start_date=date(2026, 2, 1),
            end_date=date(2026, 2, 28),
            is_active=True,
        )

        self.exam_one = Exam.objects.create(
            exam_name="Diet Exam One",
            course_code="DIE101",
            exam_school="Test School",
            exam_type="on_campus",
            no_students=10,
        )
        self.exam_two = Exam.objects.create(
            exam_name="Diet Exam Two",
            course_code="DIE201",
            exam_school="Test School",
            exam_type="on_campus",
            no_students=10,
        )
        self.venue_one = Venue.objects.create(
            venue_name="Diet Room 1",
            capacity=10,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=False,
            provision_capabilities=[],
        )
        self.venue_two = Venue.objects.create(
            venue_name="Diet Room 2",
            capacity=10,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=False,
            provision_capabilities=[],
        )
        self.exam_venue_one = ExamVenue.objects.create(
            exam=self.exam_one,
            venue=self.venue_one,
            start_time=timezone.make_aware(datetime(2026, 1, 10, 9, 0)),
            exam_length=60,
            core=True,
        )
        self.exam_venue_two = ExamVenue.objects.create(
            exam=self.exam_two,
            venue=self.venue_two,
            start_time=timezone.make_aware(datetime(2026, 2, 5, 9, 0)),
            exam_length=60,
            core=True,
        )

        self.student_one = Student.objects.create(student_id="S300", student_name="Student One")
        self.student_two = Student.objects.create(student_id="S301", student_name="Student Two")
        Provisions.objects.create(
            student=self.student_one,
            exam=self.exam_one,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        Provisions.objects.create(
            student=self.student_two,
            exam=self.exam_two,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        StudentExam.objects.create(student=self.student_one, exam=self.exam_one, exam_venue=self.exam_venue_one)
        StudentExam.objects.create(student=self.student_two, exam=self.exam_two, exam_venue=self.exam_venue_two)

        self.exam_three = Exam.objects.create(
            exam_name="Diet Exam No Start",
            course_code="DIE301",
            exam_school="Test School",
            exam_type="on_campus",
            no_students=10,
        )
        self.exam_venue_three = ExamVenue.objects.create(
            exam=self.exam_three,
            venue=self.venue_one,
            start_time=None,
            exam_length=60,
            core=True,
        )
        student_three = Student.objects.create(student_id="S302", student_name="Student Three")
        Provisions.objects.create(
            student=student_three,
            exam=self.exam_three,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        StudentExam.objects.create(student=student_three, exam=self.exam_three, exam_venue=self.exam_venue_three)

    def test_diet_filter_returns_only_matching_unallocated_rows(self):
        response = self.client.get(self.url, {"unallocated": "1", "diet": "JAN_2026"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["exam_id"], self.exam_one.exam_id)

    def test_diet_filter_rejects_unknown_diet(self):
        response = self.client.get(self.url, {"unallocated": "1", "diet": "UNKNOWN"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_diet_filter_requires_dates(self):
        Diet.objects.create(code="NO_DATES", name="No Dates", start_date=None, end_date=None)
        response = self.client.get(self.url, {"unallocated": "1", "diet": "NO_DATES"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

class StudentProvisionRefreshTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="refresh_admin",
            email="refresh_admin@example.com",
            password="secret",
        )
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(self.user)
        self.url = reverse("api-student-provisions-refresh")

        self.exam = Exam.objects.create(
            exam_name="Maths",
            course_code="MTH101",
            exam_school="Science",
            exam_type="on_campus",
            no_students=60,
        )
        self.venue = Venue.objects.create(
            venue_name="Room 1",
            capacity=60,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
            provision_capabilities=[ProvisionType.ACCESSIBLE_HALL],
        )
        self.exam_venue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            core=True,
        )

        self.student_a = Student.objects.create(
            student_id="S100",
            student_name="Student A",
        )
        Provisions.objects.create(
            student=self.student_a,
            exam=self.exam,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        self.student_exam_a = StudentExam.objects.create(
            student=self.student_a,
            exam=self.exam,
        )

        self.student_b = Student.objects.create(
            student_id="S101",
            student_name="Student B",
        )
        Provisions.objects.create(
            student=self.student_b,
            exam=self.exam,
            provisions=[ProvisionType.ACCESSIBLE_HALL],
        )
        self.student_exam_b = StudentExam.objects.create(
            student=self.student_b,
            exam=self.exam,
            manual_allocation_override=True,
        )

    def test_refresh_allocations_updates_and_logs_notification(self):
        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["updated"], 1)
        self.assertIn("skipped", response.data)
        self.assertIn("unchanged", response.data)
        self.assertIn("total_rows", response.data)
        self.student_exam_a.refresh_from_db()
        self.assertEqual(self.student_exam_a.exam_venue_id, self.exam_venue.pk)

        notification = Notification.objects.filter(type=Notification.NotificationType.ALLOCATION).first()
        self.assertIsNotNone(notification)
        self.assertIn("Provision allocation refresh complete", notification.admin_message)
        self.assertEqual(notification.invigilator_message, "")

    def test_refresh_respects_manual_override(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.student_exam_a.refresh_from_db()
        self.student_exam_b.refresh_from_db()
        self.assertEqual(self.student_exam_a.exam_venue_id, self.exam_venue.pk)
        self.assertIsNone(self.student_exam_b.exam_venue_id)
        self.assertTrue(self.student_exam_b.manual_allocation_override)

    def test_refresh_leaves_unmatched_provisions_unchanged(self):
        exam = Exam.objects.create(
            exam_name="Physics",
            course_code="PHY201",
            exam_school="Science",
            exam_type="on_campus",
            no_students=20,
        )
        student = Student.objects.create(
            student_id="S200",
            student_name="Student C",
        )
        Provisions.objects.create(
            student=student,
            exam=exam,
            provisions=[ProvisionType.USE_COMPUTER],
        )
        student_exam = StudentExam.objects.create(student=student, exam=exam)

        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("unchanged", response.data)
        student_exam.refresh_from_db()
        self.assertIsNotNone(student_exam.exam_venue_id)
        self.assertIsNone(student_exam.exam_venue.venue_id)


class AssignmentDietMappingTests(TestCase):
    def setUp(self):
        self.invigilator = Invigilator.objects.create(preferred_name="Alex", full_name="Alex Example")
        self.exam = Exam.objects.create(
            exam_name="Diet Exam",
            course_code="DIE101",
            exam_school="Test School",
            exam_type="on_campus",
            no_students=10,
        )
        self.venue = Venue.objects.create(
            venue_name="Diet Hall",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        self.exam_venue = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now(),
            exam_length=60,
            core=False,
        )
        self.exam_venue_two = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() + timedelta(days=1),
            exam_length=60,
            core=False,
        )
        self.exam_venue_three = ExamVenue.objects.create(
            exam=self.exam,
            venue=self.venue,
            start_time=timezone.now() + timedelta(days=2),
            exam_length=60,
            core=False,
        )
        self.diet_one = Diet.objects.create(
            code="JAN_2026",
            name="January 2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        self.diet_two = Diet.objects.create(
            code="FEB_2026",
            name="February 2026",
            start_date=date(2026, 2, 1),
            end_date=date(2026, 2, 28),
            is_active=True,
        )

    def test_map_assignment_hours_by_diet(self):
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue,
            role="assistant",
            assigned_start=timezone.make_aware(datetime(2026, 1, 10, 9, 0)),
            assigned_end=timezone.make_aware(datetime(2026, 1, 10, 12, 0)),
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_two,
            role="assistant",
            assigned_start=timezone.make_aware(datetime(2026, 2, 5, 9, 0)),
            assigned_end=timezone.make_aware(datetime(2026, 2, 5, 11, 0)),
            break_time_minutes=30,
        )
        InvigilatorAssignment.objects.create(
            invigilator=self.invigilator,
            exam_venue=self.exam_venue_three,
            role="assistant",
            assigned_start=timezone.make_aware(datetime(2026, 3, 1, 9, 0)),
            assigned_end=timezone.make_aware(datetime(2026, 3, 1, 10, 0)),
        )

        assignments = InvigilatorAssignment.objects.filter(invigilator=self.invigilator)
        summary = map_assignment_hours_by_diet(assignments)

        self.assertIn("JAN_2026", summary)
        self.assertIn("FEB_2026", summary)
        self.assertAlmostEqual(summary["JAN_2026"], 3.0)
        self.assertAlmostEqual(summary["FEB_2026"], 1.5)
