from unittest import mock

from django.db import DatabaseError
from django.test import TestCase
from django.urls import reverse


class HomePageTests(TestCase):
    def test_home_page_renders(self):
        response = self.client.get(reverse("home"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "timetabling_system/home.html")


class AboutPageTests(TestCase):
    def test_about_page_renders(self):
        response = self.client.get(reverse("about"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "timetabling_system/about.html")


class HealthTests(TestCase):
    def test_healthz_ok(self):
        response = self.client.get(reverse("healthz"))

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(
            response.content,
            {"status": "ok", "services": {"database": {"status": "ok"}}},
        )

    def test_healthz_db_error_returns_503(self):
        cursor_mock = mock.MagicMock()
        cursor_mock.__enter__.side_effect = DatabaseError("boom")

        with mock.patch("timetabling_system.views.connection") as mocked_connection:
            mocked_connection.cursor.return_value = cursor_mock

            response = self.client.get(reverse("healthz"))

        self.assertEqual(response.status_code, 503)
        self.assertJSONEqual(
            response.content,
            {
                "status": "error",
                "services": {
                    "database": {"status": "error", "error": "boom"},
                },
            },
        )
