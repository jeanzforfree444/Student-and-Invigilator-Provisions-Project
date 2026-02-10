from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class CustomUserTests(TestCase):
    def test_create_user(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="smokeuser",
            email="smoke@example.com",
            password="Testpass123",
        )

        self.assertEqual(user.email, "smoke@example.com")
        self.assertTrue(user.check_password("Testpass123"))
        self.assertEqual(str(user), "smoke@example.com")

    def test_login_page_renders(self):
        response = self.client.get(reverse("account_login"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "account/login.html")

    def test_admin_redirects_to_login_when_anonymous(self):
        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("admin:login"), response.url)
