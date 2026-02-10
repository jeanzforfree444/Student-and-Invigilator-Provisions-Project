import logging

from allauth.account.adapter import DefaultAccountAdapter
from django.conf import settings

logger = logging.getLogger(__name__)


class AccountAdapter(DefaultAccountAdapter):
    def is_login_allowed(self, user):
        if not super().is_login_allowed(user):
            return False

        if not getattr(settings, "BLOCK_RESIGNED_INVIGILATORS", False):
            return True

        try:
            invigilator = user.invigilator_profile
        except Exception:
            return True

        if invigilator.resigned:
            logger.info("Blocked resigned invigilator login: user_id=%s", user.pk)
            return False

        return True
