import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from timetabling_system.models import Announcement


class AnnouncementApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        self.inv_user = User.objects.create_user(
            username="invigilator",
            email="invigilator@example.com",
            password="secret",
        )
        self.client = APIClient()

    def test_str_returns_title(self):
        a = Announcement.objects.create(title="Hello", body="Body")
        self.assertEqual(str(a), "Hello")

    def test_admin_can_create_and_sets_created_by(self):
        self.client.force_authenticate(self.admin)
        url = reverse("announcement-list")
        payload = {
            "title": "New announcement",
            "body": "Important update",
            "audience": "all",
            "priority": 3,
            "is_active": True,
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Announcement.objects.get(id=response.data["id"])
        self.assertEqual(created.created_by, self.admin)
        self.assertEqual(created.priority, 3)

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(self.inv_user)
        url = reverse("announcement-list")
        response = self.client.post(
            url,
            {"title": "Nope", "body": "Should fail", "audience": "all"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_audience_rejected(self):
        self.client.force_authenticate(self.admin)
        url = reverse("announcement-list")
        response = self.client.post(
            url,
            {"title": "Bad", "body": "No", "audience": "admins"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_active_filter_excludes_expired(self):
        self.client.force_authenticate(self.admin)
        now = timezone.now()
        valid = Announcement.objects.create(
            title="Valid", body="ok", audience="all", expires_at=now + datetime.timedelta(days=1)
        )
        Announcement.objects.create(
            title="Expired",
            body="old",
            audience="all",
            expires_at=now - datetime.timedelta(days=1),
        )

        url = reverse("announcement-list") + "?audience=all&active=true"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.json()]
        self.assertIn(valid.id, ids)
        self.assertNotIn("Expired", [item["title"] for item in response.json()])

    def test_audience_filter_invigilator(self):
        self.client.force_authenticate(self.admin)
        Announcement.objects.create(title="For invigilator", body="yes", audience="invigilator")
        Announcement.objects.create(title="For all", body="yes", audience="all")

        url = reverse("announcement-list") + "?audience=invigilator&active=true"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.json()]
        self.assertIn("For invigilator", titles)
        self.assertNotIn("For all", titles)

    def test_ordering_priority_then_published_at(self):
        self.client.force_authenticate(self.admin)
        earlier = timezone.now() - datetime.timedelta(days=1)
        Announcement.objects.create(title="Low", body="b", priority=0, published_at=earlier)
        high = Announcement.objects.create(title="High", body="b", priority=5, published_at=earlier)
        Announcement.objects.create(title="Later low", body="b", priority=0, published_at=timezone.now())

        url = reverse("announcement-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.json()]
        self.assertEqual(titles[0], "High")  # highest priority first
        self.assertLess(titles.index("Later low"), titles.index("Low"))  # newer low comes before older low

    def test_active_false_returns_inactive(self):
        self.client.force_authenticate(self.admin)
        inactive = Announcement.objects.create(title="Inactive", body="b", is_active=False)
        Announcement.objects.create(title="Active", body="b", is_active=True)

        url = reverse("announcement-list") + "?active=false"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.json()]
        self.assertIn(inactive.title, titles)
        self.assertNotIn("Active", titles)

    def test_inactive_and_expired_not_returned_when_active_true(self):
        self.client.force_authenticate(self.admin)
        Announcement.objects.create(
          title="Inactive expired",
          body="b",
          is_active=False,
          expires_at=timezone.now() - datetime.timedelta(days=1),
        )
        url = reverse("announcement-list") + "?active=true"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item["title"] for item in response.json()]
        self.assertNotIn("Inactive expired", titles)

    def test_serializer_requires_title_and_body(self):
        self.client.force_authenticate(self.admin)
        url = reverse("announcement-list")
        response = self.client.post(url, {"title": "", "body": "", "audience": "all"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_serializer_rejects_bad_audience(self):
        self.client.force_authenticate(self.admin)
        url = reverse("announcement-list")
        response = self.client.post(url, {"title": "t", "body": "b", "audience": "bad"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_serializer_allows_null_image(self):
        self.client.force_authenticate(self.admin)
        url = reverse("announcement-list")
        response = self.client.post(
            url, {"title": "t", "body": "b", "audience": "all", "image": None}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_patch_allows_admin_blocks_non_admin(self):
        announcement = Announcement.objects.create(title="t", body="b", audience="all")
        url = reverse("announcement-detail", args=[announcement.id])

        # Non-admin blocked
        self.client.force_authenticate(self.inv_user)
        resp_forbidden = self.client.patch(url, {"title": "new"}, format="json")
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can patch
        self.client.force_authenticate(self.admin)
        resp_ok = self.client.patch(url, {"title": "new"}, format="json")
        self.assertEqual(resp_ok.status_code, status.HTTP_200_OK)
        announcement.refresh_from_db()
        self.assertEqual(announcement.title, "new")

    def test_delete_allows_admin_blocks_non_admin(self):
        announcement = Announcement.objects.create(title="t", body="b", audience="all")
        url = reverse("announcement-detail", args=[announcement.id])

        # Non-admin blocked
        self.client.force_authenticate(self.inv_user)
        resp_forbidden = self.client.delete(url)
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can delete
        self.client.force_authenticate(self.admin)
        resp_ok = self.client.delete(url)
        self.assertEqual(resp_ok.status_code, status.HTTP_204_NO_CONTENT)
