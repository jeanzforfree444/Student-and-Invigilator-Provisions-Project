from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from .models import CustomUser


class CustomUserCreationForm(AdminUserCreationForm):

    class Meta:
        model = CustomUser
        fields = (
            "email",
            "username",
            "phone",
            "avatar",
            "is_senior_admin",
        )


class CustomUserChangeForm(UserChangeForm):

    class Meta:
        model = CustomUser
        fields = (
            "email",
            "username",
            "phone",
            "avatar",
            "is_senior_admin",
        )
