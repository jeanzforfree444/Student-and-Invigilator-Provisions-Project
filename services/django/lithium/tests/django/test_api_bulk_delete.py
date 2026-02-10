from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from timetabling_system.models import Exam, Invigilator, Venue, VenueType


class BulkDeleteApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="strongpass123",
            is_staff=True,
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _make_exam(self, idx: int) -> Exam:
        return Exam.objects.create(
            exam_name=f"Exam {idx}",
            course_code=f"COURSE{idx}",
            exam_type="Written",
            no_students=10,
            exam_school="School",
            school_contact="Contact",
        )

    def _make_venue(self, name: str) -> Venue:
        return Venue.objects.create(
            venue_name=name,
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )

    def _make_invigilator(self, idx: int) -> Invigilator:
        return Invigilator.objects.create(
            preferred_name=f"Invig {idx}",
            full_name=f"Invigilator {idx}",
        )

    def test_bulk_delete_exams(self):
        ids = [self._make_exam(i).pk for i in range(3)]

        response = self.client.post(reverse("exam-bulk-delete"), {"ids": ids}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json().get("deleted"), 3)
        self.assertEqual(Exam.objects.count(), 0)

    def test_bulk_delete_exams_invalid_payload_returns_400(self):
        response = self.client.post(reverse("exam-bulk-delete"), {"ids": []}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.json())

    def test_bulk_delete_exams_rejects_non_int_ids(self):
        response = self.client.post(reverse("exam-bulk-delete"), {"ids": ["bad"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json().get("detail"), "No valid exam ids supplied.")

    def test_bulk_delete_venues(self):
        names = [self._make_venue(name).venue_name for name in ("Hall A", "Hall B")]

        response = self.client.post(reverse("venue-bulk-delete"), {"ids": names}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json().get("deleted"), 2)
        self.assertEqual(Venue.objects.count(), 0)

    def test_bulk_delete_venues_rejects_blank_names(self):
        response = self.client.post(reverse("venue-bulk-delete"), {"ids": ["", None]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json().get("detail"), "No valid venue names supplied.")

    def test_bulk_delete_venues_requires_list(self):
        response = self.client.post(reverse("venue-bulk-delete"), {"ids": "Hall A"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Provide a non-empty list", response.json().get("detail", ""))

    def test_bulk_delete_invigilators(self):
        ids = [self._make_invigilator(i).pk for i in range(4)]

        response = self.client.post(reverse("invigilator-bulk-delete"), {"ids": ids}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json().get("deleted"), 4)
        self.assertEqual(Invigilator.objects.count(), 0)

    def test_bulk_delete_invigilators_rejects_non_int_ids(self):
        response = self.client.post(reverse("invigilator-bulk-delete"), {"ids": ["x"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json().get("detail"), "No valid invigilator ids supplied.")

    def test_bulk_delete_invigilators_requires_list(self):
        response = self.client.post(reverse("invigilator-bulk-delete"), {"ids": "1"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Provide a non-empty list", response.json().get("detail", ""))
