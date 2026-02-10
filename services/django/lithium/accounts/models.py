import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUser(AbstractUser):
    phone = models.CharField(max_length=50, blank=True, null=True)
    avatar = models.TextField(blank=True, null=True)
    is_senior_admin = models.BooleanField(default=False)

    def __str__(self):
        return self.email


def _generate_session_key() -> str:
    return secrets.token_hex(20)


class UserSession(models.Model):
    """
    Per-login API session token, similar to DRF's Token model but allows multiple tokens per user.
    """

    key = models.CharField(max_length=40, primary_key=True, default=_generate_session_key, editable=False)
    user = models.ForeignKey(CustomUser, related_name="sessions", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    ip_address = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def revoke(self):
        if not self.revoked_at:
            self.revoked_at = timezone.now()
            self.save(update_fields=["revoked_at"])

    def __str__(self):
        return f"Session for {self.user_id} ({'active' if self.is_active else 'revoked'})"
