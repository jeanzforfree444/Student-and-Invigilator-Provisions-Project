from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.authtoken import models as authtoken_models
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import UserSession
from timetabling_system.models import InvigilatorQualificationChoices

Token = authtoken_models.Token


def _safe_attr(obj, name, default=None):
    try:
        return getattr(obj, name)
    except Exception:
        return default


def _derive_role(user):
    if _safe_attr(user, "is_staff", False) or _safe_attr(user, "is_superuser", False):
        return "admin"
    if _safe_attr(user, "invigilator_profile"):
        return "invigilator"
    return "invigilator"


def _get_invigilator_id(user):
    invigilator = _safe_attr(user, "invigilator_profile")
    return getattr(invigilator, "id", None)


def _get_senior_admin_flag(user):
    return bool(_safe_attr(user, "is_senior_admin", False))


def _get_senior_invigilator_flag(user):
    invigilator = _safe_attr(user, "invigilator_profile")
    if not invigilator:
        return False
    try:
        return invigilator.qualifications.filter(
            qualification=InvigilatorQualificationChoices.SENIOR_INVIGILATOR
        ).exists()
    except Exception:
        try:
            return any(
                q.qualification == InvigilatorQualificationChoices.SENIOR_INVIGILATOR
                for q in invigilator.qualifications.all()
            )
        except Exception:
            return False


def _get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _get_user_agent(request):
    return request.META.get("HTTP_USER_AGENT", "")


class AuthTokenSerializer(serializers.Serializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    default_error_messages = {
        "invalid_credentials": "Unable to log in with provided credentials.",
        "inactive": "User account is disabled.",
    }

    def validate(self, attrs):
        username_or_email = attrs.get("username")
        password = attrs.get("password")
        if not username_or_email or not password:
            raise serializers.ValidationError(self.error_messages["invalid_credentials"], code="authorization")

        user_model = get_user_model()
        user = (
            user_model.objects.filter(Q(username=username_or_email) | Q(email__iexact=username_or_email))
            .order_by("id")
            .first()
        )
        if not user or not user.check_password(password):
            raise serializers.ValidationError(self.error_messages["invalid_credentials"], code="authorization")
        if not user.is_active:
            raise serializers.ValidationError(self.error_messages["inactive"], code="authorization")

        attrs["user"] = user
        return attrs


class ObtainAuthTokenView(ObtainAuthToken):
    """
    Issue an auth token for any active user (admin or invigilator).
    Accepts either username or email in the "username" field.
    """

    permission_classes = [AllowAny]
    serializer_class = AuthTokenSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        if not getattr(token, "key", None):
            token.delete()
            token = Token.objects.create(user=user)
        # Manually bump last_login since we are not using django.contrib.auth.login here.
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        user.refresh_from_db(fields=["last_login"])
        session = UserSession.objects.create(
            user=user,
            user_agent=_get_user_agent(request),
            ip_address=_get_client_ip(request),
        )
        return Response(
            {
                # Return DRF token (tested/expected), but still create a session for tracking.
                "token": token.key,
                "session": session.key,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "role": _derive_role(user),
                "invigilator_id": _get_invigilator_id(user),
                "is_senior_admin": _get_senior_admin_flag(user),
                "is_senior_invigilator": _get_senior_invigilator_flag(user),
                "avatar": getattr(user, "avatar", None),
                "last_login": user.last_login.isoformat() if user.last_login else None,
            },
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *_args, **_kwargs):
        user = request.user
        phone = _safe_attr(user, "phone")
        avatar = _safe_attr(user, "avatar")
        invigilator_profile = _safe_attr(user, "invigilator_profile")
        if not phone and invigilator_profile:
            try:
                phone = invigilator_profile.alt_phone
            except Exception:
                phone = phone
        last_login_iso = None
        last_login_val = _safe_attr(user, "last_login")
        if last_login_val:
            try:
                last_login_iso = last_login_val.isoformat()
            except Exception:
                last_login_iso = None
        return Response(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "is_staff": _safe_attr(user, "is_staff", False),
                "is_superuser": _safe_attr(user, "is_superuser", False),
                "role": _derive_role(user),
                "invigilator_id": _get_invigilator_id(user),
                "is_senior_admin": _get_senior_admin_flag(user),
                "is_senior_invigilator": _get_senior_invigilator_flag(user),
                "phone": phone,
                "avatar": avatar,
                "last_login": last_login_iso,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, *_args, **_kwargs):
        user = request.user
        user_model = get_user_model()

        username = request.data.get("username")
        email = request.data.get("email")
        phone = request.data.get("phone")
        avatar = request.data.get("avatar")
        current_password = request.data.get("current_password")
        new_password = request.data.get("new_password")
        confirm_password = request.data.get("confirm_password")

        # Basic validation
        if username is not None:
            username = username.strip()
            if not username:
                return Response({"detail": "Username cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            if user_model.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
                return Response({"detail": "Username is already taken."}, status=status.HTTP_400_BAD_REQUEST)

        if email is not None:
            email = email.strip()
            if email and user_model.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
                return Response({"detail": "Email is already in use."}, status=status.HTTP_400_BAD_REQUEST)

        updated = False
        update_fields = []
        if username is not None and username != user.username:
            user.username = username
            updated = True
            update_fields.append("username")
        if email is not None and email != user.email:
            user.email = email
            updated = True
            update_fields.append("email")

        phone_updated = False
        if phone is not None:
            phone = phone.strip()
            if getattr(user, "phone", None) != phone:
                user.phone = phone
                updated = True
                update_fields.append("phone")
                phone_updated = True
            try:
                if hasattr(user, "invigilator_profile") and user.invigilator_profile:
                    if user.invigilator_profile.alt_phone != phone:
                        user.invigilator_profile.alt_phone = phone
                        user.invigilator_profile.save(update_fields=["alt_phone"])
            except Exception:
                pass

        if avatar is not None and avatar != getattr(user, "avatar", None):
            user.avatar = avatar
            updated = True
            update_fields.append("avatar")

        password_updated = False
        if current_password or new_password or confirm_password:
            # Ensure all fields are present
            if not current_password or not new_password:
                return Response({"detail": "Current password and new password are required."}, status=status.HTTP_400_BAD_REQUEST)
            if new_password != confirm_password:
                return Response({"detail": "New passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
            if not user.check_password(current_password):
                return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                validate_password(new_password, user)
            except ValidationError as exc:
                return Response({"detail": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(new_password)
            updated = True
            password_updated = True
            # set_password handles hashing; ensure password updated even if no other fields change
            update_fields.append("password")

        if updated:
            # Remove duplicates if any
            update_fields = list(dict.fromkeys(update_fields))
            user.save(update_fields=update_fields)

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "role": _derive_role(user),
                "phone": phone if phone is not None else getattr(getattr(user, "invigilator_profile", None), "alt_phone", None),
                "phone_updated": phone_updated,
                "avatar": getattr(user, "avatar", None),
                "password_updated": password_updated,
                "last_login": user.last_login.isoformat() if user.last_login else None,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request, *_args, **_kwargs):
        user = request.user
        if not (user.is_staff or user.is_superuser):
            return Response({"detail": "Only admin users can delete their own account."}, status=status.HTTP_403_FORBIDDEN)

        # Revoke all sessions for this user before deletion
        UserSession.objects.filter(user=user).delete()

        user_id = user.id
        username = user.username
        user.delete()
        return Response(
            {"detail": f"Account deleted: {username or user_id}"},
            status=status.HTTP_204_NO_CONTENT,
        )


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *_args, **_kwargs):
        current_key = getattr(getattr(request, "auth", None), "key", None)
        sessions = UserSession.objects.filter(user=request.user).order_by("-created_at")
        payload = []
        for session in sessions:
            payload.append(
                {
                    "key": session.key,
                    "created_at": session.created_at.isoformat(),
                    "last_seen": session.last_seen.isoformat() if session.last_seen else None,
                    "revoked_at": session.revoked_at.isoformat() if session.revoked_at else None,
                    "user_agent": session.user_agent,
                    "ip_address": session.ip_address,
                    "is_current": session.key == current_key,
                    "is_active": session.revoked_at is None,
                }
            )
        return Response(payload, status=status.HTTP_200_OK)


class SessionRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *_args, **_kwargs):
        key = request.data.get("key")
        if not key:
            return Response({"detail": "Session key is required."}, status=status.HTTP_400_BAD_REQUEST)
        session = UserSession.objects.filter(user=request.user, key=key).first()
        if not session:
            return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)
        if not session.revoked_at:
            session.revoke()
        return Response({"detail": "Session revoked.", "key": key}, status=status.HTTP_200_OK)


class SessionRevokeOthersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *_args, **_kwargs):
        current_key = getattr(getattr(request, "auth", None), "key", None)
        qs = UserSession.objects.filter(user=request.user, revoked_at__isnull=True)
        if current_key:
            qs = qs.exclude(key=current_key)
        revoked_count = qs.update(revoked_at=timezone.now())
        return Response({"detail": "Other sessions revoked.", "revoked": revoked_count}, status=status.HTTP_200_OK)


class SessionLogoutView(APIView):
    """
    Revoke the current session (used on logout).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *_args, **_kwargs):
        current_session = getattr(request, "auth", None)
        if isinstance(current_session, UserSession):
            current_session.revoke()
            return Response({"detail": "Session revoked."}, status=status.HTTP_200_OK)
        return Response({"detail": "No active session to revoke."}, status=status.HTTP_400_BAD_REQUEST)
