from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework import status


class UploadTimetableViewTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="StrongPass123!",
            is_staff=True,
            is_superuser=True,
        )
        self.client.login(username="admin", password="StrongPass123!")

    def test_missing_file_returns_400(self):
        response = self.client.post(reverse("upload-exams"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["message"], "No file uploaded.")

    @patch("timetabling_system.views.ingest_upload_result")
    @patch("timetabling_system.views.parse_excel_file")
    def test_parser_exception_returns_400(self, mock_parse, mock_ingest):
        mock_parse.side_effect = Exception("boom")
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(reverse("upload-exams"), {"file": upload})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["message"], "Failed to parse uploaded file.")
        mock_ingest.assert_not_called()

    @patch("timetabling_system.views.ingest_upload_result")
    @patch("timetabling_system.views.parse_excel_file")
    def test_parser_error_result_returns_400(self, mock_parse, mock_ingest):
        mock_parse.return_value = {"status": "error", "message": "Missing required columns"}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(reverse("upload-exams"), {"file": upload})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["status"], "error")
        self.assertEqual(response.json()["message"], "Missing required columns")
        mock_ingest.assert_not_called()

    @patch("timetabling_system.views.ingest_upload_result")
    @patch("timetabling_system.views.parse_excel_file")
    def test_successful_upload_calls_ingest_and_returns_result(self, mock_parse, mock_ingest):
        mock_parse.return_value = {"status": "ok", "type": "Exam", "rows": []}
        mock_ingest.return_value = {"handled": True, "created": 1, "updated": 0}
        upload = SimpleUploadedFile("exam.xlsx", b"content", content_type="application/vnd.ms-excel")

        response = self.client.post(reverse("upload-exams"), {"file": upload})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_parse.assert_called_once()
        ingest_args, ingest_kwargs = mock_ingest.call_args
        self.assertEqual(ingest_kwargs["file_name"], "exam.xlsx")
        self.assertEqual(ingest_args[0]["status"], "ok")
        self.assertEqual(ingest_args[0]["type"], "Exam")
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("ingest", data)
        self.assertEqual(data["records_created"], 1)
        self.assertEqual(data["records_updated"], 0)
