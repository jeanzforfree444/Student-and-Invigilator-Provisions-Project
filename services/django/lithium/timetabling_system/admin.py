from django import forms
from django.contrib import admin

from .models import (
    Exam,
    Venue,
    Student,
    ExamVenue,
    StudentExam,
    Provisions,
    ProvisionType,
    ExamVenueProvisionType,
    UploadLog,
    Notification,
    Announcement,
    Invigilator,
    InvigilatorQualification,
    InvigilatorRestriction,
    InvigilatorAvailability,
    InvigilatorAssignment,
    InvigilatorDietContract,
    InvigilatorRestrictionType,
    InvigilatorQualificationChoices,
    Diet,
)

class VenueAdminForm(forms.ModelForm):
    provision_capabilities = forms.MultipleChoiceField(
        required=False,
        choices=ExamVenueProvisionType.choices,
        widget=forms.CheckboxSelectMultiple,
    )

    class Meta:
        model = Venue
        fields = "__all__"


class ExamVenueAdminForm(forms.ModelForm):
    provision_capabilities = forms.MultipleChoiceField(
        required=False,
        choices=ExamVenueProvisionType.choices,
        widget=forms.CheckboxSelectMultiple,
    )

    class Meta:
        model = ExamVenue
        fields = "__all__"


class ProvisionsAdminForm(forms.ModelForm):
    provisions = forms.MultipleChoiceField(
        required=False,
        choices=ProvisionType.choices,
        widget=forms.CheckboxSelectMultiple,
    )

    class Meta:
        model = Provisions
        fields = "__all__"


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ("exam_name", "course_code", "exam_school", "exam_type")
    search_fields = ("exam_name", "course_code", "exam_school")
    list_filter = ("exam_school", "exam_type")
    ordering = ("course_code",)


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    form = VenueAdminForm
    list_display = ("venue_name", "capacity", "venuetype", "is_accessible")
    search_fields = ("venue_name",)
    list_filter = ("venuetype", "is_accessible")


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("student_id", "student_name")
    search_fields = ("student_name", "student_id")


@admin.register(ExamVenue)
class ExamVenueAdmin(admin.ModelAdmin):
    form = ExamVenueAdminForm
    list_display = ("exam", "venue", "start_time", "exam_length")
    list_filter = ("venue", "core")
    search_fields = ("exam__exam_name", "venue__venue_name")


@admin.register(StudentExam)
class StudentExamAdmin(admin.ModelAdmin):
    list_display = ("student", "exam")
    search_fields = ("student__student_name", "exam__exam_name")


@admin.register(Provisions)
class ProvisionsAdmin(admin.ModelAdmin):
    form = ProvisionsAdminForm
    list_display = ("student", "exam", "provisions", "notes")
    search_fields = ("student__student_name", "exam__exam_name", "notes")
    list_filter = ("exam",)


@admin.register(Invigilator)
class InvigilatorAdmin(admin.ModelAdmin):
    list_display = (
        "preferred_name",
        "full_name",
        "university_email",
        "resigned",
    )
    list_filter = ("resigned",)
    search_fields = (
        "preferred_name",
        "full_name",
        "university_email",
        "personal_email",
    )


@admin.register(InvigilatorQualification)
class InvigilatorQualificationAdmin(admin.ModelAdmin):
    list_display = ("invigilator", "qualification")
    list_filter = ("qualification",)
    search_fields = ("invigilator__preferred_name", "invigilator__full_name")


@admin.register(InvigilatorRestriction)
class InvigilatorRestrictionAdmin(admin.ModelAdmin):
    list_display = ("invigilator", "diet")
    list_filter = ("diet",)
    search_fields = (
        "invigilator__preferred_name",
        "invigilator__full_name",
        "notes",
    )


@admin.register(InvigilatorAvailability)
class InvigilatorAvailabilityAdmin(admin.ModelAdmin):
    list_display = ("invigilator", "date", "slot", "available")
    list_filter = ("date", "slot", "available")
    search_fields = ("invigilator__preferred_name", "invigilator__full_name")


@admin.register(InvigilatorAssignment)
class InvigilatorAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "invigilator",
        "exam_venue",
        "role",
        "assigned_start",
        "assigned_end",
        "cancel",
        "cover",
        "cover_for",
    )
    list_filter = ("role", "cancel", "cover")
    search_fields = (
        "invigilator__preferred_name",
        "invigilator__full_name",
        "exam_venue__exam__exam_name",
    )
    raw_id_fields = ("invigilator", "exam_venue", "cover_for")


@admin.register(InvigilatorDietContract)
class InvigilatorDietContractAdmin(admin.ModelAdmin):
    list_display = ("invigilator", "diet", "contracted_hours")
    list_filter = ("diet",)
    search_fields = ("invigilator__preferred_name", "invigilator__full_name", "diet__code", "diet__name")


@admin.register(UploadLog)
class UploadLogAdmin(admin.ModelAdmin):
    list_display = ("file_name", "uploaded_by", "uploaded_at", "records_created", "records_updated")
    ordering = ("-uploaded_at",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("type", "invigilator", "invigilator_message", "admin_message", "timestamp")
    list_filter = ("type", "invigilator")
    search_fields = ("invigilator_message", "admin_message")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "audience", "is_active", "priority", "published_at", "expires_at")
    list_filter = ("audience", "is_active")
    search_fields = ("title", "body")
    ordering = ("-priority", "-published_at")


@admin.register(Diet)
class DietAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "start_date", "end_date", "restriction_cutoff", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    ordering = ("-start_date", "code")
