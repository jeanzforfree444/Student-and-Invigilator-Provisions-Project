from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


# ---------- ENUM TYPES ----------

class ProvisionType(models.TextChoices):
    DATA_AS_PRESENTED_TO_REGISTRY = 'data_as_presented_to_registry', 'Data as presented to Registry'
    ACCESSIBLE_EXAM_HALL_GROUND_OR_LIFT = 'accessible_exam_hall_ground_or_lift', 'Accessible exam hall: must be ground floor or have reliable lift access available'
    ACCESSIBLE_HALL = 'accessible_hall', 'Accessible hall'
    ALLOWED_EAT_DRINK = 'allowed_eat_drink', 'Allowed to eat and drink'
    ASSISTED_EVAC_REQUIRED = 'assisted_evacuation_required', 'Assisted evacuation required'
    EXAM_ADDITIONAL_COMMENT = 'exam_additional_comment', 'Exam Additional Comment'
    ALTERNATIVE_FORMAT_PAPER = 'alternative_format_paper', 'Exam paper required in alternative format'
    EXTRA_TIME = 'extra_time', 'Extra Time'
    EXTRA_TIME_100 = 'extra_time_100', 'Extra time 100%'
    EXTRA_TIME_15_PER_HOUR = 'extra_time_15_per_hour', 'Extra time 15 minutes every hour'
    EXTRA_TIME_20_PER_HOUR = 'extra_time_20_per_hour', 'Extra time 20 minutes every hour'
    EXTRA_TIME_30_PER_HOUR = 'extra_time_30_per_hour', 'Extra time 30 minutes every hour'
    INVIGILATOR_AWARENESS = 'invigilator_awareness', 'Invigilator awareness'
    SEATED_AT_BACK = 'seated_at_back', 'Seated at back'
    SEPARATE_ROOM_NOT_ON_OWN = 'separate_room_not_on_own', 'Separate room not on own'
    SEPARATE_ROOM_ON_OWN = 'separate_room_on_own', 'Separate room on own'
    TOILET_BREAKS_REQUIRED = 'toilet_breaks_required', 'Toilet breaks required'
    USE_COMPUTER = 'use_computer', 'Use of a computer'
    USE_READER = 'use_reader', 'Use of a reader'
    USE_SCRIBE = 'use_scribe', 'Use of a scribe'
    READER = 'reader', 'Reader'
    SCRIBE = 'scribe', 'Scribe'
    VERBAL_INSTR_WRITTEN = 'verbal_instr_written', 'Verbal instructions in written format'


class ExamVenueProvisionType(models.TextChoices):
    SEPARATE_ROOM_ON_OWN = 'separate_room_on_own', 'Separate room on own'
    SEPARATE_ROOM_NOT_ON_OWN = 'separate_room_not_on_own', 'Separate room not on own'
    USE_COMPUTER = 'use_computer', 'Use of a computer'
    ACCESSIBLE_HALL = 'accessible_hall', 'Accessible hall'


class VenueType(models.TextChoices):
    MAIN_HALL = 'main_hall', 'Main Hall'
    PURPLE_CLUSTER = 'purple_cluster', 'Purple Cluster'
    COMPUTER_CLUSTER = 'computer_cluster', 'Computer Cluster'
    SEPARATE_ROOM = 'separate_room', 'Separate Room'
    SCHOOL_TO_SORT = 'school_to_sort', 'School To Sort'
    CORE_EXAM_VENUE = 'core_exam_venue', 'Core Exam Venue'
    KELVIN_HALL = 'kelvin_hall', 'Kelvin Hall'
    DETACHED_DUTY = 'detached_duty', 'Detached Duty'
    VET_SCHOOL = 'vet_school', 'Vet School'
    SCOTTISH_EVENT_CAMPUS = 'scottish_event_campus', 'Scottish Event Campus'
    OSCE_EXAM = 'osce_exam', 'OSCE Exam'
    PRE_SESSIONAL_ENGLISH = 'pre_sessional_english', 'Pre-Sessional English'
    ADMIN = 'admin', 'Admin'


class ExamTypeChoices(models.TextChoices):
    ON_CAMPUS = 'on_campus', 'On Campus Exam'
    ON_CAMPUS_ONLINE = 'on_campus_online', 'On Campus Online Exam'


class DietChoices(models.TextChoices):
    DEC_2025 = 'DEC_2025', 'December 2025'
    APR_MAY_2026 = 'APR_MAY_2026', 'April/May 2026'
    AUG_2026 = 'AUG_2026', 'August 2026'
    # Add more as needed


class Diet(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    restriction_cutoff = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date", "code"]

    def __str__(self):
        return f"{self.name} ({self.code})" if self.name else self.code


class SlotChoices(models.TextChoices):
    MORNING = 'MORNING', 'Morning (AM)'
    EVENING = 'EVENING', 'Evening (PM)'


class InvigilatorQualificationChoices(models.TextChoices):
    SENIOR_INVIGILATOR = 'SENIOR_INVIGILATOR', 'Senior Invigilator (SI)'
    AKT_TRAINED = 'AKT_TRAINED', 'AKT Trained'
    CHECK_IN = 'CHECK_IN', 'Check-In'
    DETACHED_DUTY = 'DETACHED_DUTY', 'Detached Duty'
    # Add more qualifications as needed


class InvigilatorRestrictionType(models.TextChoices):
    ACCESSIBILITY_REQUIRED = "accessibility_required", "Accessibility required"
    SEPARATE_ROOM_ONLY = "separate_room_only", "Separate room only"
    PURPLE_CLUSTER = "purple_cluster", "Purple cluster"
    COMPUTER_CLUSTER = "computer_cluster", "Computer cluster"
    VET_SCHOOL = "vet_school", "Vet School"
    OSCE_GOLDEN_JUBILEE = "osce_golden_jubilee", "Golden Jubilee"
    OSCE_WOLFSON = "osce_wolfson", "Wolfson"
    OSCE_QUEEN_ELIZABETH = "osce_queen_elizabeth", "Queen Elizabeth"
    APPROVED_EXEMPTION = "approved_exemption", "Approved exemption"


class AccessibilityFeatures(models.TextChoices):
    WHEELCHAIR_ACCESSIBLE = 'WHEELCHAIR_ACCESSIBLE', 'Wheelchair accessible'
    HEARING_LOOP = 'HEARING_LOOP', 'Hearing loop'
    ELEVATOR_ACCESS = 'ELEVATOR_ACCESS', 'Elevator access'
    # Add more features as needed


# ---------- MAIN TABLES ----------


class Exam(models.Model):
    exam_id = models.AutoField(primary_key=True)
    exam_name = models.CharField(max_length=30)
    course_code = models.CharField(max_length=30)
    exam_type = models.CharField(max_length=30)
    no_students = models.IntegerField()
    exam_school = models.CharField(max_length=30)
    school_contact = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return f"{self.exam_name} ({self.course_code})"


class Venue(models.Model):
    venue_name = models.CharField(max_length=255, primary_key=True)
    capacity = models.IntegerField()
    venuetype = models.CharField(
        max_length=30,
        choices=VenueType.choices
    )
    is_accessible = models.BooleanField(default=True)
    qualifications = models.JSONField(default=list, blank=True)
    availability = models.JSONField(default=list, blank=True)
    provision_capabilities = ArrayField(
        models.CharField(max_length=40, choices=ExamVenueProvisionType.choices),
        default=list,
        blank=True,
    )
    accessibility_features = models.CharField(max_length=50, choices=AccessibilityFeatures.choices, blank=True)
    additional_info = models.TextField(blank=True)  # e.g., "Ground floor access"

    def __str__(self):
        return self.venue_name


class Student(models.Model):
    student_id = models.CharField(max_length=255, primary_key=True)
    student_name = models.CharField(max_length=255)

    def __str__(self):
        return self.student_name


class ExamVenue(models.Model):
    examvenue_id = models.AutoField(primary_key=True)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, null=True, blank=True)
    start_time = models.DateTimeField(blank=True, null=True)
    exam_length = models.IntegerField(blank=True, null=True)
    core = models.BooleanField(default=False)
    provision_capabilities = ArrayField(
        models.CharField(max_length=40, choices=ExamVenueProvisionType.choices),
        default=list,
        blank=True,
    )

    def __str__(self):
        return f"{self.exam} at {self.venue}"


class StudentExam(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    exam_venue = models.ForeignKey(
        ExamVenue,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    manual_allocation_override = models.BooleanField(default=False)

    class Meta:
        unique_together = ('student', 'exam')

    def __str__(self):
        return f"{self.student} - {self.exam}"

    def clean(self):
        super().clean()
        if not self.exam_venue:
            return
        caps = set(self.exam_venue.provision_capabilities or [])
        if "separate_room_on_own" in caps:
            clash_exists = (
                StudentExam.objects.filter(exam_venue=self.exam_venue)
                .exclude(pk=self.pk)
                .exists()
            )
            if clash_exists:
                raise ValidationError("This separate room (on own) is already allocated to another student.")

    def save(self, *args, **kwargs):
        # Ensure capacity rules are enforced for separate rooms.
        self.full_clean()
        return super().save(*args, **kwargs)


class Provisions(models.Model):
    provision_id = models.AutoField(primary_key=True)
    exam = models.ForeignKey(
        Exam,
        to_field="exam_id",
        on_delete=models.CASCADE
    )
    student = models.ForeignKey(
        Student,
        to_field="student_id",
        on_delete=models.CASCADE
    )
    provisions = ArrayField(
        models.CharField(max_length=50, choices=ProvisionType.choices),
        default=list,
        blank=True
    )
    extra_time_custom = models.CharField(max_length=100, blank=True)  # For non-standard extra time
    notes = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        verbose_name = "Provisions"
        verbose_name_plural = "Provisions"


# ---------- NOTIFICATIONS ----------


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        AVAILABILITY = "availability", "Availability"
        CANCELLATION = "cancellation", "Cancellation"
        ASSIGNMENT = "assignment", "Assignment"
        SHIFT_PICKUP = "shiftPickup", "Shift pickup"
        EXAM_CHANGE = "examChange", "Exam change"
        VENUE_CHANGE = "venueChange", "Venue change"
        INVIGILATOR_UPDATE = "invigilatorUpdate", "Invigilator update"
        ALLOCATION = "allocation", "Allocation"
        MAIL_MERGE = "mailMerge", "Mail merge"
        ADMIN_MESSAGE = "adminMessage", "Admin message"

    id = models.AutoField(primary_key=True)
    type = models.CharField(max_length=30, choices=NotificationType.choices)
    invigilator_message = models.TextField(blank=True, default="")
    admin_message = models.TextField(blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_notifications",
    )
    invigilator = models.ForeignKey(
        "Invigilator",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        preview = (self.invigilator_message or self.admin_message or "")[:40]
        return f"{self.get_type_display()}: {preview}"


class Announcement(models.Model):
    class Audience(models.TextChoices):
        INVIGILATOR = "invigilator", "Invigilator"
        ALL = "all", "All users"

    id = models.AutoField(primary_key=True)
    title = models.CharField(max_length=200)
    body = models.TextField()
    image = models.TextField(blank=True, null=True)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.INVIGILATOR)
    published_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text="Higher numbers are shown first.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_announcements",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-priority", "-published_at"]

    def __str__(self):
        return self.title


class UploadLog(models.Model):  # This gives a view of upload history
    file_name = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="exam_upload_logs",
        on_delete=models.SET_NULL,
        null=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    records_created = models.IntegerField(default=0)
    records_updated = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.file_name} by {self.uploaded_by} on {self.uploaded_at:%Y-%m-%d %H:%M}"


class Invigilator(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invigilator_profile",
    )
    preferred_name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=255)

    mobile = models.CharField(max_length=30, blank=True, null=True)
    mobile_text_only = models.CharField(max_length=30, blank=True, null=True)
    alt_phone = models.CharField(max_length=30, blank=True, null=True)

    university_email = models.EmailField(blank=True, null=True)
    personal_email = models.EmailField(blank=True, null=True)

    notes = models.TextField(blank=True, null=True)

    resigned = models.BooleanField(default=False)

    def __str__(self):
        return self.preferred_name or self.full_name


class InvigilatorDietContract(models.Model):
    invigilator = models.ForeignKey(
        Invigilator,
        on_delete=models.CASCADE,
        related_name="diet_contracts",
    )
    diet = models.ForeignKey(
        Diet,
        on_delete=models.CASCADE,
        related_name="invigilator_contracts",
    )
    contracted_hours = models.FloatField(default=0)

    class Meta:
        unique_together = ("invigilator", "diet")

    def __str__(self):
        return f"{self.invigilator} - {self.diet}: {self.contracted_hours}h"


class InvigilatorQualification(models.Model):
    invigilator = models.ForeignKey(
        Invigilator,
        on_delete=models.CASCADE,
        related_name="qualifications"
    )
    qualification = models.CharField(
        max_length=50,
        choices=InvigilatorQualificationChoices.choices
    )

    class Meta:
        unique_together = ("invigilator", "qualification")

    def __str__(self):
        return f"{self.invigilator} - {self.get_qualification_display()}"


class InvigilatorRestriction(models.Model):
    invigilator = models.ForeignKey(
        Invigilator,
        on_delete=models.CASCADE,
        related_name="restrictions"
    )
    diet = models.CharField(
        max_length=20
    )
    restrictions = ArrayField(
        models.CharField(
            max_length=50,
            choices=InvigilatorRestrictionType.choices
        ),
        default=list,
        blank=True
    )

    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ("invigilator", "diet")

    def __str__(self):
        return f"{self.invigilator} - {self.diet}"


class InvigilatorAvailability(models.Model):
    invigilator = models.ForeignKey(
        Invigilator,
        on_delete=models.CASCADE,
        related_name="availabilities"
    )
    date = models.DateField()
    slot = models.CharField(
        max_length=20,
        choices=SlotChoices.choices
    )
    available = models.BooleanField(default=True)  # True if available, False if cannot work

    class Meta:
        unique_together = ("invigilator", "date", "slot")
        indexes = [models.Index(fields=["date", "slot"])]

    def __str__(self):
        return f"{self.invigilator} availability on {self.date} ({self.slot}): {'Available' if self.available else 'Unavailable'}"


class InvigilatorAssignment(models.Model):
    invigilator = models.ForeignKey(
        Invigilator,
        on_delete=models.CASCADE,
        related_name="assignments"
    )

    exam_venue = models.ForeignKey(
        ExamVenue,
        on_delete=models.CASCADE,
        related_name="invigilator_assignments"
    )

    role = models.CharField(
        max_length=50,
        choices=[
            ("lead", "Lead Invigilator"),
            ("assistant", "Assistant Invigilator"),
            ("support", "Support Invigilator"),
        ],
        default="assistant"
    )

    assigned_start = models.DateTimeField()
    assigned_end = models.DateTimeField()
    break_time_minutes = models.IntegerField(default=0)
    confirmed = models.BooleanField(default=False)
    cancel = models.BooleanField(default=False)
    cancel_cause = models.TextField(blank=True)
    cover = models.BooleanField(default=False)
    cover_for = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cover_assignments",
        help_text="If set, this assignment covers the referenced cancelled shift.",
    )

    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ("invigilator", "exam_venue")

    def __str__(self):
        return f"{self.invigilator} → {self.exam_venue}"

    def total_hours(self):
        """
        Return total hours assigned, subtracting break_time_minutes.
        """
        if not self.assigned_start or not self.assigned_end:
            return 0
        delta = self.assigned_end - self.assigned_start
        hours = delta.total_seconds() / 3600
        return max(hours - (self.break_time_minutes or 0) / 60, 0)
