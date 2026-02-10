from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.validators import ComplexityPasswordValidator


class ComplexityPasswordValidatorTests(TestCase):
    def setUp(self):
        self.validator = ComplexityPasswordValidator()

    def test_valid_password_passes(self):
        self.validator.validate("Aa1!aaaa")

    def test_invalid_password_raises(self):
        with self.assertRaises(ValidationError):
            self.validator.validate("password")

    def test_help_text_present(self):
        self.assertIn("must contain at least one lowercase letter", self.validator.get_help_text())
