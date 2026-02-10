import importlib
from unittest import mock

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework import serializers as drf_serializers
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.adapters import AccountAdapter
from accounts.api import AuthTokenSerializer, _derive_role, CurrentUserView
from accounts.admin import CustomUserAdmin
from accounts.models import UserSession
from timetabling_system.models import Invigilator

migration_module = importlib.import_module("accounts.migrations.0002_create_default_admin")
create_default_admin = migration_module.create_default_admin
DEFAULT_USERNAME = migration_module.DEFAULT_USERNAME
DEFAULT_EMAIL = migration_module.DEFAULT_EMAIL
DEFAULT_PASSWORD = migration_module.DEFAULT_PASSWORD


class AccountAdapterTests(TestCase):
    def setUp(self):
        self.adapter = AccountAdapter()
        self.user = get_user_model().objects.create_user(
            username="invig",
            email="invig@example.com",
            password="secret",
        )
        self.invigilator = Invigilator.objects.create(
            user=self.user,
            preferred_name="Invig",
            full_name="Invigilator Example",
            resigned=True,
        )
        patcher = mock.patch(
            "allauth.account.adapter.DefaultAccountAdapter.is_login_allowed",
            return_value=True,
            create=True,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    @override_settings(BLOCK_RESIGNED_INVIGILATORS=True)
    def test_block_resigned_invigilator_when_setting_enabled(self):
        allowed = self.adapter.is_login_allowed(self.user)
        self.assertFalse(allowed)

    @override_settings(BLOCK_RESIGNED_INVIGILATORS=False)
    def test_resigned_invigilator_allowed_when_setting_disabled(self):
        allowed = self.adapter.is_login_allowed(self.user)
        self.assertTrue(allowed)

    def test_user_without_profile_allowed(self):
        user = get_user_model().objects.create_user(
            username="plain",
            email="plain@example.com",
            password="secret",
        )
        allowed = self.adapter.is_login_allowed(user)
        self.assertTrue(allowed)

    @override_settings(BLOCK_RESIGNED_INVIGILATORS=True)
    def test_non_resigned_invigilator_allowed(self):
        self.invigilator.resigned = False
        self.invigilator.save(update_fields=["resigned"])
        allowed = self.adapter.is_login_allowed(self.user)
        self.assertTrue(allowed)

    def test_super_can_disallow_login(self):
        with mock.patch(
            "accounts.adapters.DefaultAccountAdapter.is_login_allowed",
            return_value=False,
            create=True,
        ):
            allowed = self.adapter.is_login_allowed(self.user)
            self.assertFalse(allowed)

    def test_invigilator_profile_error_allows_login(self):
        class BrokenUser:
            is_staff = False
            is_superuser = False

            def __getattr__(self, _name):
                raise RuntimeError("boom")

        with override_settings(BLOCK_RESIGNED_INVIGILATORS=True):
            with mock.patch(
                "accounts.adapters.DefaultAccountAdapter.is_login_allowed",
                return_value=True,
                create=True,
            ):
                allowed = self.adapter.is_login_allowed(BrokenUser())
                self.assertTrue(allowed)

    def test_derive_role_handles_exception(self):
        class BrokenUser:
            is_staff = False
            is_superuser = False

            def __getattr__(self, _name):
                raise RuntimeError("boom")

        self.assertEqual(_derive_role(BrokenUser()), "invigilator")


class AuthApiEdgeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
            is_active=True,
        )
        self.invigilator_user = get_user_model().objects.create_user(
            username="invig",
            email="invig@example.com",
            password="secret",
            is_active=True,
        )
        Invigilator.objects.create(
            user=self.invigilator_user,
            preferred_name="Invig",
            full_name="Invigilator User",
            alt_phone="07700",
        )
        self.other_user = get_user_model().objects.create_user(
            username="other",
            email="other@example.com",
            password="secret",
            is_active=True,
        )

    def test_token_login_missing_credentials_rejected(self):
        serializer = AuthTokenSerializer()
        with self.assertRaises(drf_serializers.ValidationError) as exc:
            serializer.validate({"username": "", "password": ""})
        self.assertIn("Unable to log in", str(exc.exception))

    def test_token_login_missing_password_rejected(self):
        with self.assertRaises(drf_serializers.ValidationError):
            AuthTokenSerializer().validate({"username": "admin", "password": ""})

    def test_token_login_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        serializer = AuthTokenSerializer(data={"username": "admin", "password": "secret"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("disabled", serializer.errors["non_field_errors"][0])

    def test_current_user_no_changes_returns_200(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(reverse("api-auth-me"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["password_updated"])

    def test_delete_account_rejected_for_non_admin(self):
        self.client.force_authenticate(self.user)
        response = self.client.delete(reverse("api-auth-me"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_account_admin_removes_sessions_and_user(self):
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        UserSession.objects.create(user=self.user, user_agent="ua", ip_address="127.0.0.1")
        UserSession.objects.create(user=self.user)
        user_id = self.user.id

        self.client.force_authenticate(self.user)
        response = self.client.delete(reverse("api-auth-me"))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(get_user_model().objects.filter(pk=user_id).exists())
        self.assertFalse(UserSession.objects.filter(user_id=user_id).exists())

    @mock.patch("accounts.api.Token.objects.create")
    @mock.patch("accounts.api.Token.objects.get_or_create")
    def test_blank_token_key_regenerates(self, mock_get_or_create, mock_create):
        blank_token = mock.Mock(key=None)
        mock_get_or_create.return_value = (blank_token, False)
        new_token = mock.Mock(key="new-token")
        mock_create.return_value = new_token

        response = self.client.post(
            reverse("api-login"),
            {"username": "admin", "password": "secret"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        blank_token.delete.assert_called_once()
        mock_create.assert_called_once_with(user=self.user)
        self.assertEqual(response.data["token"], "new-token")

    def test_patch_empty_username_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {"username": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Username cannot be empty", response.data["detail"])

    def test_patch_duplicate_email_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {"email": self.other_user.email},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Email is already in use", response.data["detail"])

    def test_patch_missing_current_password_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {"new_password": "Newsecret123!", "confirm_password": "Newsecret123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Current password and new password are required", response.data["detail"])

    def test_patch_incorrect_current_password_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {
                "current_password": "wrong",
                "new_password": "Newsecret123!",
                "confirm_password": "Newsecret123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Current password is incorrect", response.data["detail"])

    @mock.patch("accounts.api.validate_password")
    def test_patch_password_validation_errors(self, mock_validate):
        mock_validate.side_effect = ValidationError(["too simple"])
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {
                "current_password": "secret",
                "new_password": "simple",
                "confirm_password": "simple",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("too simple", response.data["detail"])

    def test_patch_password_success_updates_and_sets_flag(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {
                "current_password": "secret",
                "new_password": "Newsecret123!",
                "confirm_password": "Newsecret123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Newsecret123!"))
        self.assertTrue(response.data["password_updated"])

    def test_patch_updates_avatar_only(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {"avatar": "path/to/avatar.png"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(getattr(self.user, "avatar", None), "path/to/avatar.png")

    def test_current_user_falls_back_to_invigilator_phone(self):
        self.invigilator_user.phone = None
        self.invigilator_user.save(update_fields=["phone"])
        self.client.force_authenticate(self.invigilator_user)
        response = self.client.get(reverse("api-auth-me"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["phone"], self.invigilator_user.invigilator_profile.alt_phone)

    def test_patch_updates_username_and_email(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("api-auth-me"),
            {"username": "newadmin", "email": "newadmin@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "newadmin")
        self.assertEqual(self.user.email, "newadmin@example.com")

    def test_patch_phone_handles_invigilator_profile_exception(self):
        # Patch the invigilator_profile to raise when updating phone
        user = self.user
        self.client.force_authenticate(user)
        with mock.patch.object(
            type(user),
            "invigilator_profile",
            new_callable=mock.PropertyMock,
            side_effect=RuntimeError("boom"),
            create=True,
        ):
            response = self.client.patch(
                reverse("api-auth-me"),
                {"phone": "09999"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.phone, "09999")

    def test_current_user_handles_invigilator_profile_exception(self):
        class Dummy:
            is_staff = False
            is_superuser = False
            id = 1
            email = "d@example.com"
            username = "dummy"
            phone = None
            avatar = None

            def __getattr__(self, _name):
                raise RuntimeError("boom")

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        request.user = Dummy()
        view = CurrentUserView()
        response = view.get(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["phone"])


class MigrationTests(TestCase):
    def test_create_default_admin_when_missing(self):
        User = get_user_model()
        User.objects.filter(username=DEFAULT_USERNAME).delete()
        Token.objects.filter(user__username=DEFAULT_USERNAME).delete()

        class FakeApps:
            def get_model(self, app_label, model_name):
                if app_label == "accounts" and model_name == "CustomUser":
                    return User
                if app_label == "authtoken" and model_name == "Token":
                    return Token
                raise LookupError

        create_default_admin(FakeApps(), None)
        user = User.objects.get(username=DEFAULT_USERNAME)
        self.assertTrue(user.is_staff)
        self.assertTrue(Token.objects.filter(user=user).exists())

    def test_create_default_admin_updates_existing_and_token(self):
        User = get_user_model()
        User.objects.filter(username=DEFAULT_USERNAME).delete()
        Token.objects.filter(user__username=DEFAULT_USERNAME).delete()
        existing = User.objects.create_user(
            username=DEFAULT_USERNAME,
            email="old@example.com",
            password="oldpass",
            is_staff=False,
            is_superuser=False,
            is_active=False,
        )
        old_token = Token.objects.create(user=existing)

        class FakeApps:
            def get_model(self, app_label, model_name):
                if app_label == "accounts" and model_name == "CustomUser":
                    return User
                if app_label == "authtoken" and model_name == "Token":
                    return Token
                raise LookupError

        create_default_admin(FakeApps(), None)

        existing.refresh_from_db()
        self.assertTrue(existing.is_staff)
        self.assertTrue(existing.is_superuser)
        self.assertTrue(existing.is_active)
        self.assertTrue(existing.check_password(DEFAULT_PASSWORD))
        tokens = Token.objects.filter(user=existing)
        self.assertEqual(tokens.count(), 1)
        self.assertNotEqual(tokens.first().key, old_token.key)

    def test_remove_default_admin_deletes(self):
        User = get_user_model()
        User.objects.filter(username=DEFAULT_USERNAME, email=DEFAULT_EMAIL).delete()
        user = User.objects.create_user(
            username=DEFAULT_USERNAME,
            email=DEFAULT_EMAIL,
            password="secret",
        )
        Token.objects.create(user=user)

        class FakeApps:
            def get_model(self, app_label, model_name):
                if app_label == "accounts" and model_name == "CustomUser":
                    return User
                return Token

        remove_default_admin = migration_module.remove_default_admin
        remove_default_admin(FakeApps(), None)
        self.assertFalse(User.objects.filter(username=DEFAULT_USERNAME, email=DEFAULT_EMAIL).exists())


class AdminHasAvatarTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="avatarless",
            email="avatarless@example.com",
            password="secret",
        )
        self.admin_site = AdminSite()
        self.admin = CustomUserAdmin(get_user_model(), self.admin_site)

    def test_has_avatar_boolean_display(self):
        self.assertFalse(self.admin.has_avatar(self.user))
        self.user.avatar = "path/to/avatar.png"
        self.assertTrue(self.admin.has_avatar(self.user))
