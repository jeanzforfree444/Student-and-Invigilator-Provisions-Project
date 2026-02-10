import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class ComplexityPasswordValidator:
    """
    Enforce basic complexity: at least one lowercase, one uppercase, one digit,
    and one symbol from the common punctuation set.
    """

    pattern = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$")

    def validate(self, password, user=None):
        if not password or self.pattern.match(password):
            return
        raise ValidationError(
            _(
                "This password must contain at least one lowercase letter, "
                "one uppercase letter, one digit, and one symbol."
            ),
            code="password_no_complexity",
        )

    def get_help_text(self):
        return _(
            "Your password must contain at least one lowercase letter, one uppercase letter, one digit, and one symbol."
        )
