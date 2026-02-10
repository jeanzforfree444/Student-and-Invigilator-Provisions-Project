from rest_framework.throttling import UserRateThrottle


class AdminBypassUserRateThrottle(UserRateThrottle):
    """
    Skip user-level throttling for staff/superusers so bulk admin actions
    (e.g., deleting many exams) are not rate limited, while keeping limits
    for regular users/invigilators.
    """

    def allow_request(self, request, view):
        user = getattr(request, "user", None)
        if user and user.is_authenticated and (user.is_staff or user.is_superuser):
            return True
        return super().allow_request(request, view)
