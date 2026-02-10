from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .forms import CustomUserCreationForm, CustomUserChangeForm
from .models import CustomUser, UserSession


class CustomUserAdmin(UserAdmin):
    add_form = CustomUserCreationForm
    form = CustomUserChangeForm
    model = CustomUser
    list_display = [
        "email",
        "username",
        "phone",
        "has_avatar",
        "is_staff",
        "is_senior_admin",
        "is_active",
    ]
    list_filter = ["is_staff", "is_superuser", "is_senior_admin", "is_active"]
    search_fields = ["email", "username", "phone"]
    fieldsets = UserAdmin.fieldsets + (
        ("Profile", {"fields": ("phone", "avatar", "is_senior_admin")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Profile", {"fields": ("phone", "avatar", "is_senior_admin")}),
    )

    @admin.display(description="Avatar", boolean=True)
    def has_avatar(self, obj: CustomUser) -> bool:
        return bool(obj.avatar)


admin.site.register(CustomUser, CustomUserAdmin)


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = [
        "key",
        "user",
        "ip_address",
        "created_at",
        "last_seen",
        "revoked_at",
        "is_active",
    ]
    list_filter = ["revoked_at", "created_at"]
    search_fields = ["key", "user__email", "user__username", "ip_address", "user_agent"]
    readonly_fields = ["key", "created_at", "last_seen"]

    @admin.display(boolean=True, description="Active")
    def is_active(self, obj: UserSession) -> bool:
        return obj.revoked_at is None
