from rest_framework import serializers
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db import transaction
from timetabling_system.models import (
    Exam,
    Venue,
    ExamVenue,
    VenueType,
    Invigilator,
    InvigilatorQualification,
    InvigilatorRestriction,
    InvigilatorAvailability,
    InvigilatorAssignment,
    InvigilatorDietContract,
    StudentExam,
    Provisions,
    Notification,
    Announcement,
    SlotChoices,
    Diet,
)
from timetabling_system.services.venue_stats import examvenue_student_counts

# Backwards-compat attribute so older tests that patch DIET_DATE_RANGES don't crash.
DIET_DATE_RANGES: dict = {}


class ExamVenueSerializer(serializers.ModelSerializer):
    venue_name = serializers.SerializerMethodField()
    exam_name = serializers.CharField(source="exam.exam_name", read_only=True)
    venue_type = serializers.SerializerMethodField()
    venue_accessible = serializers.SerializerMethodField()
    students_count = serializers.SerializerMethodField()

    class Meta:
        model = ExamVenue
        fields = (
            "examvenue_id",
            "exam_name",
            "exam",
            "venue_name",
            "start_time",
            "exam_length",
            "core",
            "provision_capabilities",
            "venue_type",
            "venue_accessible",
            "students_count",
        )

    def get_venue_name(self, obj):
        # Some ExamVenue rows act as placeholders before a venue is allocated.
        return obj.venue.venue_name if obj.venue else None

    def get_venue_type(self, obj):
        venue = getattr(obj, "venue", None)
        return venue.venuetype if venue else None

    def get_venue_accessible(self, obj):
        venue = getattr(obj, "venue", None)
        return venue.is_accessible if venue is not None else None

    def get_students_count(self, obj):
        exam = getattr(obj, "exam", None)
        if not exam:
            return 0
        cache = self.context.setdefault("_examvenue_student_counts", {})
        if exam.pk not in cache:
            cache[exam.pk] = examvenue_student_counts(exam)
        return cache[exam.pk].get(obj.pk, 0)


class ExamVenueWriteSerializer(serializers.ModelSerializer):
    venue_name = serializers.CharField(
        allow_blank=True,
        allow_null=True,
        required=False,
        help_text="Name of an existing venue; leave blank for an unassigned placeholder.",
    )

    class Meta:
        model = ExamVenue
        fields = (
            "examvenue_id",
            "exam",
            "venue_name",
            "start_time",
            "exam_length",
            "core",
            "provision_capabilities",
        )
        read_only_fields = ("examvenue_id",)

    def _resolve_venue(self, venue_name: str | None) -> Venue | None:
        """Translate a venue name string into a Venue instance or None."""
        if not venue_name:
            return None
        try:
            return Venue.objects.get(venue_name=venue_name)
        except Venue.DoesNotExist:
            raise serializers.ValidationError({"venue_name": f"Venue '{venue_name}' does not exist."})

    def validate(self, attrs):
        if self.instance and self.instance.core:
            raise serializers.ValidationError("Core exam venues cannot be modified via this endpoint.")

        # If marked as a separate room venue, ensure no overlap with another exam at the same time.
        prov_caps = attrs.get("provision_capabilities")
        if prov_caps is None and self.instance:
            prov_caps = getattr(self.instance, "provision_capabilities", []) or []
        venue_obj = None
        if "venue_name" in attrs:
            venue_name = attrs.get("venue_name", None)
            if venue_name:
                try:
                    venue_obj = self._resolve_venue(venue_name)
                except serializers.ValidationError:
                    # Defer missing venue validation to create/update so tests expecting
                    # save-time errors still pass.
                    venue_obj = None
        elif self.instance:
            venue_obj = getattr(self.instance, "venue", None)

        has_separate_room = (
            (prov_caps and any(
                cap in ("separate_room_on_own", "separate_room_not_on_own") for cap in prov_caps
            ))
            or (venue_obj and getattr(venue_obj, "venuetype", None) == VenueType.SEPARATE_ROOM)
        )
        if has_separate_room and venue_obj:
            venue = venue_obj
            start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
            exam_length = attrs.get("exam_length", getattr(self.instance, "exam_length", None))
            exam_value = attrs.get("exam", None)
            if exam_value is None:
                exam_id = getattr(self.instance, "exam_id", None)
            else:
                exam_id = getattr(exam_value, "pk", exam_value)

            if start_time and exam_length is not None:
                new_end = start_time + timedelta(minutes=exam_length)
                conflicts = []
                for ev in ExamVenue.objects.filter(venue=venue).exclude(pk=getattr(self.instance, "pk", None)):
                    if ev.start_time is None or ev.exam_length is None:
                        continue
                    # Skip same exam; requirement is to avoid clashes with another exam.
                    if exam_id and ev.exam_id == exam_id:
                        continue
                    existing_end = ev.start_time + timedelta(minutes=ev.exam_length)
                    overlap = start_time < existing_end and ev.start_time < new_end
                    if overlap:
                        conflicts.append(ev.exam.exam_name if ev.exam else "another exam")
                if conflicts:
                    raise serializers.ValidationError(
                        {
                            "venue_name": f"This separate room is already allocated at that time to {', '.join(conflicts)}."
                        }
                    )
            else:
                raise serializers.ValidationError(
                    {"non_field_errors": "Start time and duration are required for separate room venues."}
                )

        return super().validate(attrs)

    def create(self, validated_data):
        venue = self._resolve_venue(validated_data.pop("venue_name", None))
        validated_data["venue"] = venue
        return super().create(validated_data)

    def update(self, instance, validated_data):
        venue = self._resolve_venue(validated_data.pop("venue_name", None))
        validated_data["venue"] = venue
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        """Reuse the read serializer shape for responses."""
        return ExamVenueSerializer(instance).data


class ExamSerializer(serializers.ModelSerializer):
    venues = serializers.SerializerMethodField()
    exam_venues = ExamVenueSerializer(source="examvenue_set", many=True, read_only=True)

    class Meta:
        model = Exam
        fields = (
            "exam_id",
            "exam_name",
            "course_code",
            "exam_type",
            "no_students",
            "exam_school",
            "school_contact",
            "venues",
            "exam_venues",
        )
        extra_kwargs = {
            "school_contact": {"required": False, "allow_null": True, "allow_blank": True}
        }

    def get_venues(self, obj):
        """Return venue names associated with an exam via ExamVenue."""
        exam_venues = getattr(obj, "_prefetched_objects_cache", {}).get("examvenue_set")
        if exam_venues is None: exam_venues = obj.examvenue_set.select_related("venue").all()
        return [ev.venue.venue_name for ev in exam_venues if ev.venue]


DISALLOWED_VENUE_CAPS = {"separate_room_on_own", "separate_room_not_on_own"}


class VenueSerializer(serializers.ModelSerializer):
    exams = serializers.SerializerMethodField()
    exam_venues = ExamVenueSerializer(source="examvenue_set", many=True, read_only=True)

    class Meta:
        model = Venue
        fields = (
            "venue_name",
            "capacity",
            "venuetype",
            "is_accessible",
            "qualifications",
            "availability",
            "provision_capabilities",
            "exams",
            "exam_venues",
        )

    def get_exams(self, obj):
        """Return exam names associated with a venue via ExamVenue."""
        exam_venues = getattr(obj, "_prefetched_objects_cache", {}).get("examvenue_set")
        if exam_venues is None: exam_venues = obj.examvenue_set.select_related("exam").all()
        return [ev.exam.exam_name for ev in exam_venues]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        caps = data.get("provision_capabilities") or []
        data["provision_capabilities"] = [c for c in caps if c not in DISALLOWED_VENUE_CAPS]
        return data


class VenueWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = (
            "venue_name",
            "capacity",
            "venuetype",
            "is_accessible",
            "provision_capabilities",
            "qualifications",
            "availability",
        )

    def _clean_caps(self, caps):
        return [c for c in (caps or []) if c not in DISALLOWED_VENUE_CAPS]

    def validate(self, attrs):
        if "provision_capabilities" in attrs:
            attrs["provision_capabilities"] = self._clean_caps(attrs.get("provision_capabilities"))
        return super().validate(attrs)

    def create(self, validated_data):
        validated_data["provision_capabilities"] = self._clean_caps(validated_data.get("provision_capabilities"))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "provision_capabilities" in validated_data:
            validated_data["provision_capabilities"] = self._clean_caps(validated_data.get("provision_capabilities"))
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        return VenueSerializer(instance).data


class NotificationSerializer(serializers.ModelSerializer):
    triggered_by = serializers.SerializerMethodField()
    invigilator = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "id",
            "type",
            "invigilator_message",
            "admin_message",
            "timestamp",
            "triggered_by",
            "invigilator",
        )

    def get_triggered_by(self, obj):
        user = getattr(obj, "triggered_by", None)
        if not user:
            return None
        return {
            "id": user.id,
            "email": getattr(user, "email", None),
            "username": getattr(user, "username", None),
        }

    def get_invigilator(self, obj):
        inv = getattr(obj, "invigilator", None)
        if not inv:
            return None
        return {
            "id": inv.id,
            "name": getattr(inv, "preferred_name", None) or getattr(inv, "full_name", None),
        }


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "image",
            "audience",
            "published_at",
            "expires_at",
            "is_active",
            "priority",
        )
        read_only_fields = ("id",)


class InvigilatorAssignmentSerializer(serializers.ModelSerializer):
    invigilator_name = serializers.SerializerMethodField()
    exam_name = serializers.CharField(source="exam_venue.exam.exam_name", read_only=True)
    venue_name = serializers.SerializerMethodField()
    exam_start = serializers.DateTimeField(source="exam_venue.start_time", read_only=True)
    exam_length = serializers.IntegerField(source="exam_venue.exam_length", read_only=True)
    cover_filled = serializers.SerializerMethodField()
    provision_capabilities = serializers.SerializerMethodField()
    student_provisions = serializers.SerializerMethodField()
    student_provision_notes = serializers.SerializerMethodField()

    class Meta:
        model = InvigilatorAssignment
        fields = (
            "id",
            "invigilator",
            "invigilator_name",
            "exam_venue",
            "exam_name",
            "venue_name",
            "exam_start",
            "exam_length",
            "provision_capabilities",
            "student_provisions",
            "student_provision_notes",
            "role",
            "assigned_start",
            "assigned_end",
            "break_time_minutes",
            "cancel",
            "cancel_cause",
            "cover",
            "cover_for",
            "cover_filled",
            "confirmed",
            "notes",
        )

    def get_invigilator_name(self, obj):
        invigilator = obj.invigilator
        return invigilator.preferred_name or invigilator.full_name

    def get_venue_name(self, obj):
        venue = getattr(obj.exam_venue, "venue", None)
        return venue.venue_name if venue else None

    def get_cover_filled(self, obj):
        return obj.cover_assignments.filter(cancel=False).exists()

    def get_provision_capabilities(self, obj):
        caps = getattr(getattr(obj, "exam_venue", None), "provision_capabilities", None)
        return list(caps or [])

    def _student_provision_rows(self, obj):
        exam_venue = getattr(obj, "exam_venue", None)
        if not exam_venue or not getattr(exam_venue, "exam", None):
            return []
        student_ids = StudentExam.objects.filter(exam_venue=exam_venue).values_list("student_id", flat=True)
        if not student_ids:
            return []
        return Provisions.objects.filter(exam=exam_venue.exam, student_id__in=student_ids)

    def get_student_provisions(self, obj):
        provisions: list[str] = []
        for row in self._student_provision_rows(obj):
            provisions.extend(row.provisions or [])
        return sorted(set(provisions))

    def get_student_provision_notes(self, obj):
        notes: list[str] = []
        for row in self._student_provision_rows(obj):
            if row.extra_time_custom:
                notes.append(str(row.extra_time_custom).strip())
            if row.notes:
                notes.append(str(row.notes).strip())
        return [note for note in dict.fromkeys(notes) if note]


class InvigilatorQualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvigilatorQualification
        fields = ("qualification",)


class InvigilatorRestrictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvigilatorRestriction
        fields = ("diet", "restrictions", "notes")


class InvigilatorDietContractSerializer(serializers.ModelSerializer):
    diet = serializers.SlugRelatedField(slug_field="code", queryset=Diet.objects.all())
    diet_name = serializers.CharField(source="diet.name", read_only=True)

    class Meta:
        model = InvigilatorDietContract
        fields = ("diet", "diet_name", "contracted_hours")


class InvigilatorAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = InvigilatorAvailability
        fields = ("date", "slot", "available")


class DietSerializer(serializers.ModelSerializer):
    class Meta:
        model = Diet
        fields = (
            "id",
            "code",
            "name",
            "start_date",
            "end_date",
            "restriction_cutoff",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_code(self, value: str):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Code is required.")
        return value

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "End date must be on or after start date."})
        if start_date and end_date:
            qs = Diet.objects.filter(start_date__isnull=False, end_date__isnull=False)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            overlap = qs.filter(start_date__lte=end_date, end_date__gte=start_date).exists()
            if overlap:
                raise serializers.ValidationError("Diet dates overlap with an existing diet.")
        return attrs

class InvigilatorSerializer(serializers.ModelSerializer):
    assignments = InvigilatorAssignmentSerializer(many=True, read_only=True)
    qualifications = InvigilatorQualificationSerializer(many=True, required=False)
    restrictions = InvigilatorRestrictionSerializer(many=True, required=False)
    diet_contracts = InvigilatorDietContractSerializer(many=True, required=False)
    availabilities = InvigilatorAvailabilitySerializer(many=True, read_only=True)
    user = serializers.DictField(write_only=True, required=False, allow_null=True)
    user_id = serializers.IntegerField(read_only=True)
    user_is_staff = serializers.SerializerMethodField()
    user_is_superuser = serializers.SerializerMethodField()
    user_is_senior_admin = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = Invigilator
        fields = (
            "id",
            "user",
            "user_id",
            "user_is_staff",
            "user_is_superuser",
            "user_is_senior_admin",
            "avatar",
            "preferred_name",
            "full_name",
            "mobile",
            "mobile_text_only",
            "alt_phone",
            "university_email",
            "personal_email",
            "notes",
            "resigned",
            "diet_contracts",
            "qualifications",
            "restrictions",
            "assignments",
            "availabilities",
        )

    def get_user_is_staff(self, obj):
        user = getattr(obj, "user", None)
        return bool(getattr(user, "is_staff", False)) if user else False

    def get_user_is_superuser(self, obj):
        user = getattr(obj, "user", None)
        return bool(getattr(user, "is_superuser", False)) if user else False

    def get_user_is_senior_admin(self, obj):
        user = getattr(obj, "user", None)
        return bool(getattr(user, "is_senior_admin", False)) if user else False

    def get_avatar(self, obj):
        user = getattr(obj, "user", None)
        return getattr(user, "avatar", None) if user else None

    def validate_user(self, value):
        if value in (None, {}):
            return None
        username = (value.get("username") or "").strip()
        email = (value.get("email") or "").strip() or None
        password = value.get("password") or None

        if not username:
            raise serializers.ValidationError("username is required when providing user details.")

        User = get_user_model()
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        if email and User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with that email already exists.")

        return {"username": username, "email": email, "password": password}

    def _create_user_for_invigilator(self, user_data):
        if not user_data:
            return None
        User = get_user_model()
        password = user_data.get("password") or User.objects.make_random_password()
        return User.objects.create_user(
            username=user_data["username"],
            email=user_data.get("email"),
            password=password,
        )

    def create(self, validated_data):
        user_data = validated_data.pop("user", None)
        qualifications_data = validated_data.pop("qualifications", [])
        restrictions_data = validated_data.pop("restrictions", [])
        diet_contracts_data = validated_data.pop("diet_contracts", [])

        with transaction.atomic():
            user = self._create_user_for_invigilator(user_data)
            invigilator = Invigilator.objects.create(user=user, **validated_data)

        for q in qualifications_data:
            InvigilatorQualification.objects.create(
                invigilator=invigilator,
                **q
            )

        diets = []
        for r in restrictions_data:
            InvigilatorRestriction.objects.create(
                invigilator=invigilator,
                **r
            )
            diets.append(r["diet"])

        diet_map = self._get_diet_map(diets)
        self._generate_availability(invigilator, diet_map)

        if diet_contracts_data:
            InvigilatorDietContract.objects.bulk_create(
                [
                    InvigilatorDietContract(invigilator=invigilator, **entry)
                    for entry in diet_contracts_data
                ],
                ignore_conflicts=True,
            )

        return invigilator

    def _get_diet_map(self, diet_codes: list[str]) -> dict[str, Diet]:
        unique_codes = list({code for code in diet_codes if code})
        if not unique_codes:
            return {}
        diet_map: dict[str, Diet] = {}
        db_diets = {d.code: d for d in Diet.objects.filter(code__in=unique_codes)}
        # Silently skip missing diet codes; availability won't be generated for them.
        diet_map.update(db_diets)
        return diet_map

    def _generate_availability(self, invigilator, diet_map: dict[str, Diet]):
        availability_objects = []

        for diet in diet_map.values():
            start_date = diet.start_date
            end_date = diet.end_date
            if not start_date or not end_date:
                continue
            current_date = start_date

            while current_date <= end_date:
                for slot in SlotChoices.values:
                    availability_objects.append(
                        InvigilatorAvailability(
                            invigilator=invigilator,
                            date=current_date,
                            slot=slot,
                            available=True,
                        )
                    )
                current_date += timedelta(days=1)

        InvigilatorAvailability.objects.bulk_create(
            availability_objects,
            ignore_conflicts=True,
        )

    def _remove_availability_for_diets(self, invigilator, diet_codes: list[str]):
        if not diet_codes:
            return
        for diet in Diet.objects.filter(code__in=diet_codes):
            if not diet.start_date or not diet.end_date:
                continue
            InvigilatorAvailability.objects.filter(
                invigilator=invigilator,
                date__gte=diet.start_date,
                date__lte=diet.end_date,
            ).delete()

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        qualifications_data = validated_data.pop("qualifications", None)
        restrictions_data = validated_data.pop("restrictions", None)
        diet_contracts_data = validated_data.pop("diet_contracts", None)

        with transaction.atomic():
            if user_data and instance.user is None:
                instance.user = self._create_user_for_invigilator(user_data)
            instance = super().update(instance, validated_data)

        if qualifications_data is not None:
            InvigilatorQualification.objects.filter(invigilator=instance).delete()
            for q in qualifications_data:
                InvigilatorQualification.objects.create(invigilator=instance, **q)

        if restrictions_data is not None:
            existing_restrictions = InvigilatorRestriction.objects.filter(invigilator=instance)
            existing_diets = set(existing_restrictions.values_list("diet", flat=True))

            InvigilatorRestriction.objects.filter(invigilator=instance).delete()
            new_diets = []
            for r in restrictions_data:
                InvigilatorRestriction.objects.create(invigilator=instance, **r)
                new_diets.append(r["diet"])

            new_diet_set = set(new_diets)
            removed_diets = list(existing_diets - new_diet_set)
            added_diets = list(new_diet_set - existing_diets)

            if removed_diets:
                self._remove_availability_for_diets(instance, removed_diets)
            if added_diets:
                diet_map = self._get_diet_map(added_diets)
                self._generate_availability(instance, diet_map)

        if diet_contracts_data is not None:
            InvigilatorDietContract.objects.filter(invigilator=instance).delete()
            if diet_contracts_data:
                InvigilatorDietContract.objects.bulk_create(
                    [
                        InvigilatorDietContract(invigilator=instance, **entry)
                        for entry in diet_contracts_data
                    ],
                    ignore_conflicts=True,
                )

        return instance

