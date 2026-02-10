import os

from django.test import SimpleTestCase

from django_project import settings as project_settings


class SettingsHelperTests(SimpleTestCase):
    def test_env_list_splits_and_trims(self):
        os.environ["DJANGO_TEST_LIST"] = " alpha ,beta,, gamma "
        self.addCleanup(os.environ.pop, "DJANGO_TEST_LIST", None)

        result = project_settings.env_list("DJANGO_TEST_LIST")
        self.assertEqual(result, ["alpha", "beta", "gamma"])
