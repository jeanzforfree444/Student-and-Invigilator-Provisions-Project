from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


class ApiPermissionsTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        self.non_admin = User.objects.create_user(
            username="user",
            email="user@example.com",
            password="secret",
        )

    def test_admin_only_endpoints_reject_non_admin(self):
        client = APIClient()
        client.force_authenticate(self.non_admin)
        endpoints = [
            reverse("exam-list"),
            reverse("venue-list"),
            reverse("exam-venue-list"),
            reverse("invigilator-list"),
            reverse("invigilator-assignment-list"),
            reverse("api-notifications"),
        ]
        for url in endpoints:
            response = client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_upload_requires_admin(self):
        client = APIClient()
        response = client.post(reverse("api-exam-upload"), {}, format="multipart")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
