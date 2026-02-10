from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication

from accounts.models import UserSession


class UserSessionAuthentication(TokenAuthentication):
    """
    DRF authentication that uses the per-login UserSession token instead of the single global Token.
    Updates last_seen on each authenticated request.
    """

    keyword = "Token"
    model = UserSession

    def authenticate_credentials(self, key):
        try:
            session = self.model.objects.select_related("user").get(key=key)
        except self.model.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid token.")

        user = session.user
        if not user.is_active:
            raise exceptions.AuthenticationFailed("User inactive or deleted.")
        if session.revoked_at is not None:
            raise exceptions.AuthenticationFailed("Session revoked.")

        # Touch last_seen for activity tracking
        session.last_seen = timezone.now()
        session.save(update_fields=["last_seen"])
        return (user, session)
