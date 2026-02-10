from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.test import TestCase

from timetabling_system.models import Invigilator


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        self.invigilator_user = User.objects.create_user(
            username="invig",
            email="invig@example.com",
            password="secret",
            is_staff=False,
            is_superuser=False,
        )
        Invigilator.objects.create(
            user=self.invigilator_user,
            preferred_name="Invig",
            full_name="Invigilator User",
        )
        self.other_user = User.objects.create_user(
            username="taken",
            email="taken@example.com",
            password="secret",
        )

    def test_token_login_returns_admin_role(self):
        response = self.client.post(
            reverse("api-login"),
            {"username": "admin", "password": "secret"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["role"], "admin")
        self.assertFalse(response.data["user"]["is_senior_admin"])

    def test_token_login_accepts_email_and_returns_invigilator_role(self):
        response = self.client.post(
            reverse("api-login"),
            {"username": "invig@example.com", "password": "secret"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], "invig")
        self.assertEqual(response.data["user"]["role"], "invigilator")
        self.assertIsNotNone(response.data["user"]["invigilator_id"])

    def test_token_login_rejects_bad_credentials(self):
        response = self.client.post(
            reverse("api-login"),
            {"username": "admin", "password": "wrong"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Unable to log in", str(response.data))

    def test_current_user_requires_auth(self):
        response = self.client.get(reverse("api-auth-me"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_current_user_returns_role_and_profile_fields(self):
        self.client.force_authenticate(self.invigilator_user)

        response = self.client.get(reverse("api-auth-me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "invig")
        self.assertEqual(response.data["role"], "invigilator")
        self.assertIsNotNone(response.data["invigilator_id"])
        self.assertFalse(response.data["is_senior_admin"])

    def test_patch_rejects_duplicate_username(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("api-auth-me"),
            {"username": "taken"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Username is already taken", response.data["detail"])

    def test_patch_updates_phone_and_invigilator_profile(self):
        self.client.force_authenticate(self.invigilator_user)

        response = self.client.patch(
            reverse("api-auth-me"),
            {"phone": "01234"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.invigilator_user.refresh_from_db()
        self.assertEqual(getattr(self.invigilator_user, "phone", None), "01234")
        invig = Invigilator.objects.get(user=self.invigilator_user)
        self.assertEqual(invig.alt_phone, "01234")

    def test_patch_password_mismatch_rejected(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("api-auth-me"),
            {
                "current_password": "secret",
                "new_password": "newsecret",
                "confirm_password": "different",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("New passwords do not match", response.data["detail"])
