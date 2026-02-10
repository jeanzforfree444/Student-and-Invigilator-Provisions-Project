import math
import re
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Iterable, List, Optional

from django.conf import settings
from django.db import transaction
from django.utils import dateparse, timezone

from timetabling_system.models import (
    Exam,
    ProvisionType,
    Provisions,
    Student,
    StudentExam,
    ExamVenue,
    ExamVenueProvisionType,
    Venue,
    VenueType,
    UploadLog,
)
from timetabling_system.services.venue_matching import (
    venue_has_timing_conflict,
    venue_is_available,
    venue_supports_caps,
)


def ingest_upload_result(
    result: Dict[str, Any],
    *,
    file_name: str,
    uploaded_by: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    """
    Persist parsed upload results into the relational models.

    Returns a summary dictionary that is merged back into the API response.
    Unsupported file types return a handled=False summary so callers can show
    a helpful message without treating the upload as an error.
    """
    
    if not result or result.get("status") != "ok":
        return None

    file_type = result.get("type")
    rows: Iterable[Dict[str, Any]] = result.get("rows", [])

    if file_type == "Exam":
        summary = _import_exam_rows(rows)
    elif file_type == "Provisions":
        summary = _import_provision_rows(rows)
    elif file_type == "Venue":
        summary = _import_venue_days(result.get("days", []))
    else:
        return {
            "handled": False,
            "type": file_type,
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [],
            "message": f"No persistence configured for {file_type or 'unknown'} uploads.",
        }

    summary["handled"] = True
    summary["type"] = file_type

    user = uploaded_by if getattr(uploaded_by, "is_authenticated", False) else None
    UploadLog.objects.create(
        file_name=file_name or result.get("file", "uploaded_file"),
        uploaded_by=user,
        records_created=summary["created"],
        records_updated=summary["updated"],
    )

    return summary


def _base_summary(total_rows: int) -> Dict[str, Any]:
    return {
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "skipped": 0,
        "total_rows": total_rows,
        "errors": [],
    }


def _maybe_to_datetime(value: Any) -> Any:
    if hasattr(value, "to_pydatetime"):
        try:
            return value.to_pydatetime()
        except (TypeError, ValueError):
            return None
    return value


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    try:
        return value != value  # catches NaN / NaT
    except Exception:
        return False


def _clean_string(value: Any, *, max_length: Optional[int] = None) -> str:
    if _is_missing(value):
        return ""
    text = str(value).strip()
    if max_length is not None:
        return text[:max_length]
    return text


def _coerce_date(value: Any) -> Optional[date]:
    if _is_missing(value):
        return None
    value = _maybe_to_datetime(value)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        parsed = dateparse.parse_date(stripped)
        if parsed:
            return parsed
        parsed_dt = dateparse.parse_datetime(stripped)
        if parsed_dt:
            return parsed_dt.date()
    return None


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if _is_missing(value):
        return None
    value = _maybe_to_datetime(value)
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        return dateparse.parse_datetime(stripped)
    return None


def compute_exam_date_range(rows: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    rows_list = list(rows or [])
    if not rows_list:
        return None

    dates: list[date] = []
    for row in rows_list:
        exam_date = _coerce_date(row.get("exam_date"))
        if exam_date:
            dates.append(exam_date)

    if not dates:
        return None

    return {
        "min_date": min(dates),
        "max_date": max(dates),
        "row_count": len(dates),
    }


def _time_from_digits(text: str) -> Optional[time]:
    digits = re.sub(r"[^0-9]", "", text)
    if len(digits) in (3, 4):
        hours = int(digits[:-2])
        minutes = int(digits[-2:])
        if 0 <= hours < 24 and 0 <= minutes < 60:
            return time(hour=hours, minute=minutes)
    return None


def _coerce_time(value: Any) -> Optional[time]:
    if _is_missing(value):
        return None
    value = _maybe_to_datetime(value)
    if isinstance(value, datetime):
        return value.time()
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        parsed = dateparse.parse_time(stripped)
        if parsed:
            return parsed
        parsed_dt = dateparse.parse_datetime(stripped)
        if parsed_dt:
            return parsed_dt.time()
        fallback = _time_from_digits(stripped)
        if fallback:
            return fallback
    if isinstance(value, (int, float)):
        try:
            fractional = float(value)
        except (TypeError, ValueError):
            return None
        seconds = int(round(fractional * 24 * 3600))
        seconds %= 24 * 3600
        hours, remainder = divmod(seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return time(hour=hours, minute=minutes, second=seconds)
    return None


def _coerce_int(value: Any) -> Optional[int]:
    if _is_missing(value):
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return None
        if 0 < abs(value) < 1:
            # Excel duration encoded as fraction of a day
            return int(round(value * 24 * 60))
        return int(round(value))
    text = str(value).strip().lower()
    if not text:
        return None
    if ":" in text:
        parts = [p for p in text.split(":") if p]
        if len(parts) >= 2:
            try:
                hours = int(parts[0])
                minutes = int(parts[1])
                return hours * 60 + minutes
            except ValueError:
                pass
    try:
        num = float(text)
        if 0 < abs(num) < 1:
            return int(round(num * 24 * 60))
        return int(round(num))
    except (ValueError, TypeError):
        pass
    hour_match = re.search(r"(\d+)\s*h", text)
    minute_match = re.search(r"(\d+)\s*m", text)
    if hour_match or minute_match:
        hours = int(hour_match.group(1)) if hour_match else 0
        minutes = int(minute_match.group(1)) if minute_match else 0
        return hours * 60 + minutes
    digits = re.findall(r"\d+", text)
    if digits:
        return int(digits[0])
    return None


def _ensure_aware(dt: datetime) -> datetime:
    if not dt:
        return dt
    current_tz = timezone.get_default_timezone()
    if settings.USE_TZ and timezone.is_naive(dt):
        return timezone.make_aware(dt, current_tz)
    if not settings.USE_TZ and timezone.is_aware(dt):
        return timezone.make_naive(dt, current_tz)
    return dt


def _combine_start_datetime(start_value: Any, exam_date: date) -> Optional[datetime]:
    direct = _coerce_datetime(start_value)
    if direct:
        return direct
    date_value = _coerce_date(exam_date)
    time_value = _coerce_time(start_value)
    if date_value and time_value:
        return datetime.combine(date_value, time_value)
    if isinstance(exam_date, datetime):
        return exam_date
    return None


def _duration_in_minutes(length_value: Any, end_value: Any, start_dt: Optional[datetime]) -> int:
    duration = _coerce_int(length_value)
    if duration is not None:
        return max(duration, 0)
    end_time = _coerce_time(end_value)
    if start_dt and end_time:
        end_dt = datetime.combine(start_dt.date(), end_time)
        if end_dt < start_dt:
            end_dt += timedelta(days=1)
        return max(int((end_dt - start_dt).total_seconds() // 60), 0)
    return 0


def _core_exam_timing(exam: Exam) -> tuple[Optional[datetime], Optional[int]]:
    """
    Return the core exam start_time and length from the primary ExamVenue rows.
    """
    if not exam:
        return None, None
    core_ev = exam.examvenue_set.filter(core=True).order_by("pk").first()
    if core_ev:
        return core_ev.start_time, core_ev.exam_length
    fallback = exam.examvenue_set.order_by("pk").first()
    if fallback:
        return fallback.start_time, fallback.exam_length
    return None, None


def _extra_time_minutes(provisions: List[str], base_length: Optional[int]) -> int:
    """
    Derive extra time in minutes from provision codes.
    We take the maximum applicable extra-time rule.
    """
    base = base_length or 0
    extras: List[int] = []
    for prov in provisions or []:
        if prov == ProvisionType.EXTRA_TIME_100:
            extras.append(base)
        elif prov == ProvisionType.EXTRA_TIME_30_PER_HOUR:
            extras.append(math.ceil(base / 60 * 30))
        elif prov == ProvisionType.EXTRA_TIME_20_PER_HOUR:
            extras.append(math.ceil(base / 60 * 20))
        elif prov == ProvisionType.EXTRA_TIME_15_PER_HOUR:
            extras.append(math.ceil(base / 60 * 15))
        elif prov == ProvisionType.EXTRA_TIME:
            extras.append(math.ceil(base * 0.25))
    return max(extras) if extras else 0


def _apply_extra_time(
    base_start: Optional[datetime],
    base_length: Optional[int],
    extra_minutes: int,
) -> tuple[Optional[datetime], Optional[int]]:
    """
    Shift the start earlier where possible (not before 09:00),
    with any remaining extra added to the end (exam_length).
    """
    if extra_minutes <= 0:
        return base_start, base_length

    new_start = base_start
    remaining = extra_minutes

    # Optionally start earlier (not before 09:00), but still keep the full extra time
    # added to the duration so total = base_length + extra_minutes.
    if base_start:
        earliest = base_start.replace(hour=9, minute=0, second=0, microsecond=0)
        minutes_available = max(
            0, int((base_start - earliest).total_seconds() // 60)
        )
        shift = min(remaining, minutes_available)
        if shift:
            new_start = base_start - timedelta(minutes=shift)

    if base_length is None:
        new_length = None if extra_minutes == 0 else extra_minutes
    else:
        new_length = base_length + extra_minutes

    return new_start, new_length


@transaction.atomic
def _import_exam_rows(rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    rows_list = list(rows or [])
    summary = _base_summary(len(rows_list))

    for idx, raw in enumerate(rows_list, start=1):
        try:
            payload = _build_exam_payload(raw)
        except ValueError as exc:
            summary["skipped"] += 1
            summary["errors"].append(f"Row {idx}: {exc}")
            continue

        course_code = payload["course_code"]
        defaults = payload["defaults"]
        existing = list(Exam.objects.filter(course_code=course_code).order_by("exam_id")[:2])
        if not existing:
            exam_obj = Exam.objects.create(course_code=course_code, **defaults)
            created = True
        else:
            exam_obj = existing[0]
            if len(existing) > 1:
                summary["errors"].append(
                    f"Row {idx}: Multiple exams found for course_code '{course_code}'. "
                    f"Updating exam_id={exam_obj.exam_id}."
                )
            updates = []
            for field, value in defaults.items():
                if getattr(exam_obj, field) != value:
                    setattr(exam_obj, field, value)
                    updates.append(field)
            if updates:
                exam_obj.save(update_fields=updates)
            created = False
        if created:
            summary["created"] += 1
        else:
            summary["updated"] += 1

        _create_exam_venue_links(
            exam_obj,
            raw,
            start_time=payload["start_time"],
            exam_length=payload["exam_length"],
        )

    return summary


def _build_exam_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    course_code = _clean_string(row.get("course_code") or row.get("exam_code"), max_length=30)
    if not course_code:
        raise ValueError("Missing exam_code / course_code.")

    exam_date = _coerce_date(row.get("exam_date"))
    start_dt = _combine_start_datetime(row.get("exam_start"), exam_date)
    start_dt = _ensure_aware(start_dt) if start_dt else None
    duration = _duration_in_minutes(row.get("exam_length"), row.get("exam_end"), start_dt)
    duration = duration if duration > 0 else None

    defaults = {
        "exam_name": _clean_string(row.get("exam_name"), max_length=30) or course_code,
        "exam_type": _clean_string(row.get("exam_type"), max_length=30) or "Exam",
        "no_students": _coerce_int(row.get("no_students")) or 0,
        "exam_school": _clean_string(row.get("school"), max_length=30) or "Unassigned",
        "school_contact": _clean_string(row.get("school_contact"), max_length=100),
    }

    return {
        "course_code": course_code,
        "defaults": defaults,
        "start_time": start_dt,
        "exam_length": duration,
    }


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "", str(value).strip().lower().replace(" ", "_"))


PROVISION_SLUG_MAP = {
    _slugify(choice.value): choice.value
    for choice in ProvisionType
}
PROVISION_SLUG_MAP.update({
    _slugify(choice.label): choice.value
    for choice in ProvisionType
})
# Common shorthand/synonyms from legacy data
PROVISION_SLUG_MAP.update({
    "reader": ProvisionType.READER,
    "use_reader": ProvisionType.READER,
    "useofareader": ProvisionType.READER,
    "scribe": ProvisionType.SCRIBE,
    "use_scribe": ProvisionType.SCRIBE,
    "useofascribe": ProvisionType.SCRIBE,
    "computer": ProvisionType.USE_COMPUTER,
    "use_computer": ProvisionType.USE_COMPUTER,
    "extra_time": ProvisionType.EXTRA_TIME,
})

def _match_extra_time_token(token: str) -> Optional[str]:
    if not token:
        return None
    lowered = str(token).strip().lower()
    if "extra" not in lowered or "time" not in lowered:
        return None

    percent_match = re.search(r"(\d+)\s*%", lowered)
    if percent_match:
        percent = int(percent_match.group(1))
        if percent >= 100:
            return ProvisionType.EXTRA_TIME_100
        return ProvisionType.EXTRA_TIME

    per_hour_match = re.search(
        r"(\d+)\s*(?:mins?|minutes?)\s*(?:per|every)\s*hour",
        lowered,
    )
    if per_hour_match:
        minutes = int(per_hour_match.group(1))
        if minutes == 30:
            return ProvisionType.EXTRA_TIME_30_PER_HOUR
        if minutes == 20:
            return ProvisionType.EXTRA_TIME_20_PER_HOUR
        if minutes == 15:
            return ProvisionType.EXTRA_TIME_15_PER_HOUR
        return ProvisionType.EXTRA_TIME

    if "extra time" in lowered:
        return ProvisionType.EXTRA_TIME

    return None


def _normalize_provisions(
    value: Any,
    *,
    unknown_tokens: Optional[List[str]] = None,
) -> List[str]:
    if _is_missing(value):
        return []
    if isinstance(value, (list, tuple, set)):
        tokens = value
    else:
        tokens = re.split(r"[;,/]", str(value))

    def _match_extra_time_token(token: str, slug: str) -> Optional[str]:
        if "extra" not in slug or "time" not in slug:
            return None
        numbers = [int(n) for n in re.findall(r"\d+", slug)]
        if 100 in numbers:
            return ProvisionType.EXTRA_TIME_100
        if "hour" in slug:
            if 30 in numbers:
                return ProvisionType.EXTRA_TIME_30_PER_HOUR
            if 20 in numbers:
                return ProvisionType.EXTRA_TIME_20_PER_HOUR
            if 15 in numbers:
                return ProvisionType.EXTRA_TIME_15_PER_HOUR
        if "extra_time" in slug or ("extra" in slug and "time" in slug):
            return ProvisionType.EXTRA_TIME
        return None

    normalized: List[str] = []
    seen = set()
    unknown_seen = set()
    for token in tokens:
        slug = _slugify(token)
        mapped = PROVISION_SLUG_MAP.get(slug)
        if not mapped:
            mapped = _match_extra_time_token(token, slug)
        if mapped and mapped not in seen:
            normalized.append(mapped)
            seen.add(mapped)
        elif not mapped and unknown_tokens is not None:
            cleaned = _clean_string(token, max_length=60)
            if cleaned and slug and slug not in unknown_seen:
                unknown_seen.add(slug)
                unknown_tokens.append(cleaned)
    return normalized


@transaction.atomic
def _import_provision_rows(rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    rows_list = list(rows or [])
    summary = _base_summary(len(rows_list))

    for idx, raw in enumerate(rows_list, start=1):
        student_id = _clean_string(
            raw.get("student_id") or raw.get("mock_ids") or raw.get("id"),
            max_length=255,
        )
        if not student_id:
            summary["skipped"] += 1
            summary["errors"].append(f"Row {idx}: Missing student_id.")
            continue

        exam_code = _clean_string(raw.get("exam_code") or raw.get("course_code"), max_length=30)
        if not exam_code:
            summary["skipped"] += 1
            summary["errors"].append(f"Row {idx}: Missing exam_code.")
            continue

        try:
            exam = Exam.objects.get(course_code=exam_code)
        except Exam.DoesNotExist:
            summary["skipped"] += 1
            summary["errors"].append(f"Row {idx}: Exam with code '{exam_code}' not found.")
            continue

        student, _ = Student.objects.update_or_create(
            student_id=student_id,
            defaults={
                "student_name": _clean_string(raw.get("student_name"), max_length=255) or student_id,
            },
        )

        unknown_provisions: List[str] = []
        provisions = _normalize_provisions(
            raw.get("provisions"),
            unknown_tokens=unknown_provisions,
        )
        notes = _clean_string(raw.get("additional_info") or raw.get("notes"), max_length=200)
        if unknown_provisions:
            unknown_text = ", ".join(unknown_provisions)
            suffix = f"Unrecognized provisions: {unknown_text}"
            if notes:
                notes = f"{notes}; {suffix}"
            else:
                notes = suffix
            notes = _clean_string(notes, max_length=200)

        provision_obj, created = Provisions.objects.update_or_create(
            student=student,
            exam=exam,
            defaults={
                "provisions": provisions,
                "notes": notes or None,
            },
        )

        student_exam, _ = StudentExam.objects.get_or_create(student=student, exam=exam)
        required_caps = _required_capabilities(provisions)
        match_caps = [
            cap for cap in required_caps
            if cap
            not in (
                ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN,
                ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN,
                ExamVenueProvisionType.USE_COMPUTER,
            )
        ]
        requires_individual_room = (
            ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN in required_caps
        )
        needs_accessible = _needs_accessible_venue(provisions)
        requires_separate_room = (
            requires_individual_room
            or ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN in required_caps
        )
        needs_computer = (
            _needs_computer(provisions)
            or _exam_requires_computer(getattr(exam, "exam_type", None))
        )
        allowed_venue_types = _allowed_venue_types(needs_computer, requires_separate_room)
        core_evs = list(
            exam.examvenue_set.select_related("venue")
            .filter(core=True, venue__isnull=False)
            .order_by("pk")
        )
        core_venue = core_evs[0].venue if core_evs else None
        core_venue_names = {ev.venue_id for ev in core_evs}
        core_venue = core_evs[0].venue if core_evs else None
        core_venue_names = {ev.venue_id for ev in core_evs}
        base_start, base_length = _core_exam_timing(exam)
        extra_minutes = _extra_time_minutes(provisions, base_length)
        target_start, target_length = _apply_extra_time(base_start, base_length, extra_minutes)
        small_extra_time = _has_small_extra_time(extra_minutes, base_length)
        avoid_core_venues = bool((extra_minutes and not small_extra_time) or requires_separate_room)
        preferred_venue = None
        if small_extra_time and not requires_separate_room and not needs_computer:
            preferred_venue = core_venue
            if needs_accessible and preferred_venue and not preferred_venue.is_accessible:
                preferred_venue = None
        allow_same_exam_overlap = bool(extra_minutes > 0 and not requires_individual_room)

        exam_venue = None
        if requires_individual_room and student_exam.exam_venue_id:
            exam_venue = student_exam.exam_venue
        if not exam_venue:
            exam_venue = _find_matching_exam_venue(
                exam,
                required_caps,
                target_start,
                target_length,
                require_accessible=needs_accessible,
                preferred_venue=preferred_venue,
                allowed_venue_types=allowed_venue_types,
                avoid_shared_room=requires_individual_room,
                student_exam_id=student_exam.pk,
                avoid_venue_names=core_venue_names if avoid_core_venues else None,
                avoid_placeholders=True,
                match_caps=match_caps,
            )
        if (
            allowed_venue_types is not None
            and exam_venue
            and exam_venue.venue
            and exam_venue.venue.venuetype not in allowed_venue_types
        ):
            exam_venue = None
        if not exam_venue:
            exam_venue = _allocate_exam_venue(
                exam,
                required_caps,
                target_start,
                target_length,
                require_accessible=needs_accessible,
                preferred_venue=preferred_venue,
                allow_same_exam_overlap=allow_same_exam_overlap,
                allowed_venue_types=allowed_venue_types,
                avoid_shared_room=requires_individual_room,
                student_exam_id=student_exam.pk,
                avoid_venue_names=core_venue_names if avoid_core_venues else None,
                match_caps=match_caps,
            )

        if exam_venue:
            updates = []
            if target_start and exam_venue.start_time != target_start:
                exam_venue.start_time = target_start
                updates.append("start_time")
            if target_length is not None and exam_venue.exam_length != target_length:
                exam_venue.exam_length = target_length
                updates.append("exam_length")
            existing_caps = exam_venue.provision_capabilities or []
            if required_caps and not all(cap in existing_caps for cap in required_caps):
                exam_venue.provision_capabilities = sorted(set(existing_caps + required_caps))
                updates.append("provision_capabilities")
            if updates:
                exam_venue.save(update_fields=updates)

        if exam_venue and student_exam.exam_venue_id != exam_venue.pk:
            student_exam.exam_venue = exam_venue
            student_exam.save(update_fields=["exam_venue"])

        if created:
            summary["created"] += 1
        else:
            summary["updated"] += 1

    return summary

def _create_provision_exam_venues():
    provision_list = Provisions.objects.all()
    for provision in provision_list:
        evs = ExamVenue.objects.all(exam=provision.exam)


@transaction.atomic
def rerun_provision_allocation() -> Dict[str, Any]:
    provisions = Provisions.objects.select_related("student", "exam").all()
    summary = _base_summary(provisions.count())

    for provision in provisions:
        exam = provision.exam
        student = provision.student
        student_exam, _ = StudentExam.objects.get_or_create(student=student, exam=exam)
        if getattr(student_exam, "manual_allocation_override", False):
            summary["skipped"] += 1
            continue

        required_caps = _required_capabilities(provision.provisions)
        match_caps = [
            cap for cap in required_caps
            if cap
            not in (
                ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN,
                ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN,
                ExamVenueProvisionType.USE_COMPUTER,
            )
        ]
        requires_individual_room = (
            ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN in required_caps
        )
        needs_accessible = _needs_accessible_venue(provision.provisions)
        requires_separate_room = (
            requires_individual_room
            or ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN in required_caps
        )
        needs_computer = (
            _needs_computer(provision.provisions)
            or _exam_requires_computer(getattr(exam, "exam_type", None))
        )
        allowed_venue_types = _allowed_venue_types(needs_computer, requires_separate_room)
        core_evs = list(
            exam.examvenue_set.select_related("venue")
            .filter(core=True, venue__isnull=False)
            .order_by("pk")
        )
        core_venue = core_evs[0].venue if core_evs else None
        core_venue_names = {ev.venue_id for ev in core_evs}
        base_start, base_length = _core_exam_timing(exam)
        extra_minutes = _extra_time_minutes(provision.provisions, base_length)
        target_start, target_length = _apply_extra_time(base_start, base_length, extra_minutes)
        small_extra_time = _has_small_extra_time(extra_minutes, base_length)
        avoid_core_venues = bool((extra_minutes and not small_extra_time) or requires_separate_room)
        preferred_venue = None
        if small_extra_time and not requires_separate_room and not needs_computer:
            preferred_venue = core_venue
            if needs_accessible and preferred_venue and not preferred_venue.is_accessible:
                preferred_venue = None
        allow_same_exam_overlap = bool(extra_minutes > 0 and not requires_individual_room)

        exam_venue = None
        if requires_individual_room and student_exam.exam_venue_id:
            exam_venue = student_exam.exam_venue
        if not exam_venue:
            exam_venue = _find_matching_exam_venue(
                exam,
                required_caps,
                target_start,
                target_length,
                require_accessible=needs_accessible,
                preferred_venue=preferred_venue,
                allowed_venue_types=allowed_venue_types,
                avoid_shared_room=requires_individual_room,
                student_exam_id=student_exam.pk,
                avoid_venue_names=core_venue_names if avoid_core_venues else None,
                avoid_placeholders=True,
                match_caps=match_caps,
            )
        if (
            allowed_venue_types is not None
            and exam_venue
            and exam_venue.venue
            and exam_venue.venue.venuetype not in allowed_venue_types
        ):
            exam_venue = None
        if not exam_venue:
            exam_venue = _allocate_exam_venue(
                exam,
                required_caps,
                target_start,
                target_length,
                require_accessible=needs_accessible,
                preferred_venue=preferred_venue,
                allow_same_exam_overlap=allow_same_exam_overlap,
                allowed_venue_types=allowed_venue_types,
                avoid_shared_room=requires_individual_room,
                student_exam_id=student_exam.pk,
                avoid_venue_names=core_venue_names if avoid_core_venues else None,
                match_caps=match_caps,
            )

        if exam_venue:
            updates = []
            if target_start and exam_venue.start_time != target_start:
                exam_venue.start_time = target_start
                updates.append("start_time")
            if target_length is not None and exam_venue.exam_length != target_length:
                exam_venue.exam_length = target_length
                updates.append("exam_length")
            existing_caps = exam_venue.provision_capabilities or []
            if required_caps and not all(cap in existing_caps for cap in required_caps):
                exam_venue.provision_capabilities = sorted(set(existing_caps + required_caps))
                updates.append("provision_capabilities")
            if updates:
                exam_venue.save(update_fields=updates)

        if exam_venue and student_exam.exam_venue_id != exam_venue.pk:
            student_exam.exam_venue = exam_venue
            student_exam.save(update_fields=["exam_venue"])
            summary["updated"] += 1
        else:
            summary["unchanged"] += 1

    return summary

def _extract_venue_names(row: Dict[str, Any]) -> List[str]:
    raw_value = row.get("main_venue") or row.get("venue")
    online_aliases = {
        "online",
        "online exam",
        "digital",
        "digital on campus",
        "digital on campus exam",
        "online/digital",
    }

    def _is_online_marker(val: str) -> bool:
        lowered = val.strip().lower()
        return lowered in online_aliases or "online" in lowered or "digital" in lowered

    if _is_missing(raw_value):
        # Fall back to exam_type for online/digital entries.
        exam_type_val = row.get("exam_type") or row.get("assessment_type")
        if isinstance(exam_type_val, str) and _is_online_marker(exam_type_val):
            return ["Online / Digital"]
        return []
    if isinstance(raw_value, (list, tuple, set)):
        tokens = raw_value
    else:
        tokens = re.split(r"[;,/|]", str(raw_value))
    normalized: List[str] = []
    for token in tokens:
        name = _clean_string(token, max_length=255)
        if not name:
            continue
        if _is_online_marker(name):
            name = "Online / Digital"
        normalized.append(name)
    if not normalized:
        exam_type_val = row.get("exam_type") or row.get("assessment_type")
        if isinstance(exam_type_val, str) and _is_online_marker(exam_type_val):
            normalized.append("Online / Digital")
    return normalized


def _required_capabilities(provisions: List[str]) -> List[str]:
    mapping = {
        ProvisionType.SEPARATE_ROOM_ON_OWN: ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN,
        ProvisionType.SEPARATE_ROOM_NOT_ON_OWN: ExamVenueProvisionType.SEPARATE_ROOM_NOT_ON_OWN,
        ProvisionType.USE_COMPUTER: ExamVenueProvisionType.USE_COMPUTER,
        ProvisionType.ACCESSIBLE_HALL: ExamVenueProvisionType.ACCESSIBLE_HALL,
        ProvisionType.ASSISTED_EVAC_REQUIRED: ExamVenueProvisionType.ACCESSIBLE_HALL,
    }
    caps: List[str] = []
    for prov in provisions or []:
        cap = mapping.get(prov)
        if cap and cap not in caps:
            caps.append(cap)
    return caps


def _needs_accessible_venue(provisions: List[str]) -> bool:
    return (
        ProvisionType.ACCESSIBLE_HALL in provisions
        or ProvisionType.ASSISTED_EVAC_REQUIRED in provisions
    )


def _needs_separate_room(provisions: List[str]) -> bool:
    return any(
        prov in (ProvisionType.SEPARATE_ROOM_ON_OWN, ProvisionType.SEPARATE_ROOM_NOT_ON_OWN)
        for prov in provisions or []
    )


def _needs_computer(provisions: List[str]) -> bool:
    return ProvisionType.USE_COMPUTER in (provisions or [])


def _exam_requires_computer(exam_type: Optional[str]) -> bool:
    if not exam_type or not isinstance(exam_type, str):
        return False
    lowered = exam_type.strip().lower()
    if lowered in {"cmol", "on_campus_online", "on campus online", "on campus online exam"}:
        return True
    if "campus" in lowered and ("online" in lowered or "digital" in lowered):
        return True
    if "digital on campus" in lowered or "online on campus" in lowered:
        return True
    return False


def _has_small_extra_time(extra_minutes: int, base_length: Optional[int]) -> bool:
    """
    Returns True when the extra time allowance is <= 15 minutes per hour.
    """
    if extra_minutes <= 0 or not base_length:
        return False
    hours = base_length / 60
    if hours <= 0:
        return False
    per_hour = extra_minutes / hours
    return per_hour <= 15


def _allowed_venue_types(needs_computer: bool, requires_separate_room: bool) -> Optional[set]:
    if needs_computer:
        return {
            VenueType.COMPUTER_CLUSTER.value,
            VenueType.PURPLE_CLUSTER.value,
        }
    return None


def _exam_venue_is_reserved(
    exam_venue: ExamVenue,
    student_exam_id: Optional[int] = None,
) -> bool:
    caps = exam_venue.provision_capabilities or []
    if ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN not in caps:
        return False
    assigned = StudentExam.objects.filter(exam_venue=exam_venue)
    if student_exam_id:
        assigned = assigned.exclude(pk=student_exam_id)
    return assigned.exists()


def _find_matching_exam_venue(
    exam: Exam,
    required_caps: List[str],
    target_start: Optional[datetime],
    target_length: Optional[int],
    *,
    require_accessible: bool = False,
    preferred_venue: Optional[Venue] = None,
    allowed_venue_types: Optional[set] = None,
    avoid_shared_room: bool = False,
    student_exam_id: Optional[int] = None,
    avoid_venue_names: Optional[set] = None,
    avoid_placeholders: bool = False,
    match_caps: Optional[List[str]] = None,
) -> Optional[ExamVenue]:
    if not exam:
        return None

    evs = list(ExamVenue.objects.filter(exam=exam).select_related("venue"))
    caps_for_matching = match_caps if match_caps is not None else required_caps

    def _matches(ev: ExamVenue) -> bool:
        if _exam_venue_is_reserved(ev, student_exam_id):
            return False
        if avoid_shared_room:
            assigned = StudentExam.objects.filter(exam_venue=ev)
            if student_exam_id:
                assigned = assigned.exclude(pk=student_exam_id)
            if assigned.exists():
                return False
        if avoid_placeholders and not ev.venue:
            return False
        if ev.venue:
            if avoid_venue_names and ev.venue_id in avoid_venue_names:
                return False
            if caps_for_matching and not venue_supports_caps(ev.venue, caps_for_matching):
                return False
            if require_accessible and not ev.venue.is_accessible:
                return False
            if allowed_venue_types is not None and ev.venue.venuetype not in allowed_venue_types:
                return False
        else:
            placeholder_caps = ev.provision_capabilities or []
            if caps_for_matching and not all(cap in placeholder_caps for cap in caps_for_matching):
                return False

        if target_start and ev.start_time != target_start:
            return False
        if target_length is not None and ev.exam_length != target_length:
            return False
        return True

    if preferred_venue:
        for ev in evs:
            if ev.venue_id == preferred_venue.pk and _matches(ev):
                return ev

    for ev in evs:
        if _matches(ev):
            return ev
    return None


def _allocate_exam_venue(
    exam: Exam,
    required_caps: List[str],
    target_start: Optional[datetime],
    target_length: Optional[int],
    *,
    require_accessible: bool = False,
    preferred_venue: Optional[Venue] = None,
    allow_same_exam_overlap: bool = False,
    allowed_venue_types: Optional[set] = None,
    avoid_shared_room: bool = False,
    student_exam_id: Optional[int] = None,
    avoid_venue_names: Optional[set] = None,
    match_caps: Optional[List[str]] = None,
) -> Optional[ExamVenue]:
    if not exam:
        return None

    exam_date = getattr(exam, "date_exam", None)
    iso_date = exam_date.isoformat() if exam_date else None
    requires_individual_room = ExamVenueProvisionType.SEPARATE_ROOM_ON_OWN in required_caps
    if requires_individual_room:
        allow_same_exam_overlap = False
    caps_for_matching = match_caps if match_caps is not None else required_caps

    def _merge_caps(ev: ExamVenue) -> List[str]:
        existing = ev.provision_capabilities or []
        merged = sorted(set(existing + (required_caps or [])))
        return merged

    def _placeholder_has_other_students(ev: ExamVenue) -> bool:
        assigned = StudentExam.objects.filter(exam_venue=ev)
        if student_exam_id:
            assigned = assigned.exclude(pk=student_exam_id)
        return assigned.exists()

    def _placeholder_matches_timing(ev: ExamVenue) -> bool:
        if target_start is not None and ev.start_time != target_start:
            return False
        if target_length is not None and ev.exam_length != target_length:
            return False
        return True

    candidates: List[Venue] = []
    candidate_order: List[Venue] = []

    if preferred_venue:
        candidate_order.append(preferred_venue)

    # Prefer the venue(s) already linked to the core exam venue rows.
    core_venues = [
        ev.venue for ev in exam.examvenue_set.select_related("venue").filter(core=True, venue__isnull=False)
    ]
    if avoid_venue_names:
        core_venues = [venue for venue in core_venues if venue and venue.venue_name not in avoid_venue_names]
    candidate_order.extend(core_venues)
    candidate_order.extend(list(Venue.objects.all()))

    seen_names = set()
    for venue in candidate_order:
        if not venue or venue.venue_name in seen_names:
            continue
        seen_names.add(venue.venue_name)
        if avoid_venue_names and venue.venue_name in avoid_venue_names:
            continue
        if allowed_venue_types is not None and venue.venuetype not in allowed_venue_types:
            continue
        if caps_for_matching and not venue_supports_caps(venue, caps_for_matching):
            continue
        if require_accessible and not venue.is_accessible:
            continue
        if not venue_is_available(venue, target_start):
            continue
        if venue_has_timing_conflict(
            venue,
            target_start,
            target_length,
            ignore_exam_id=None if requires_individual_room else exam.exam_id,
            allow_same_exam_overlap=allow_same_exam_overlap,
        ):
            continue
        availability = venue.availability or []
        if iso_date and availability and iso_date not in availability:
            continue
        candidates.append(venue)

    placeholder_qs = ExamVenue.objects.filter(exam=exam, venue__isnull=True)
    if avoid_shared_room:
        used_placeholders = StudentExam.objects.filter(
            exam_venue__venue__isnull=True
        ).values_list("exam_venue_id", flat=True)
        placeholder_qs = placeholder_qs.exclude(pk__in=used_placeholders)
    placeholder = placeholder_qs.first()
    if placeholder and _exam_venue_is_reserved(placeholder, student_exam_id):
        placeholder = None
    placeholder_assigned = False
    if placeholder:
        placeholder_assigned = _placeholder_has_other_students(placeholder)
        if placeholder_assigned and not _placeholder_matches_timing(placeholder):
            placeholder = None

    if not candidates:
        if placeholder:
            updates = []
            merged = _merge_caps(placeholder)
            if merged != (placeholder.provision_capabilities or []):
                placeholder.provision_capabilities = merged
                updates.append("provision_capabilities")
            if not placeholder_assigned:
                if target_start and placeholder.start_time != target_start:
                    placeholder.start_time = target_start
                    updates.append("start_time")
                if target_length is not None and placeholder.exam_length != target_length:
                    placeholder.exam_length = target_length
                    updates.append("exam_length")
            if updates:
                placeholder.save(update_fields=updates)
            return placeholder

        return ExamVenue.objects.create(
            exam=exam,
            venue=None,
            start_time=target_start,
            exam_length=target_length,
            provision_capabilities=required_caps,
        )

    selected = candidates[0]
    if placeholder:
        updates = ["venue"]
        placeholder.venue = selected
        merged = _merge_caps(placeholder)
        if merged != (placeholder.provision_capabilities or []):
            placeholder.provision_capabilities = merged
            updates.append("provision_capabilities")
        if not placeholder_assigned:
            if target_start and placeholder.start_time != target_start:
                placeholder.start_time = target_start
                updates.append("start_time")
            if target_length is not None and placeholder.exam_length != target_length:
                placeholder.exam_length = target_length
                updates.append("exam_length")
        placeholder.save(update_fields=updates)
        return placeholder

    existing = ExamVenue.objects.filter(
        exam=exam,
        venue=selected,
        start_time=target_start,
        exam_length=target_length,
    ).first()

    if existing and _exam_venue_is_reserved(existing, student_exam_id):
        existing = None
    elif existing and avoid_shared_room:
        assigned = StudentExam.objects.filter(exam_venue=existing)
        if student_exam_id:
            assigned = assigned.exclude(pk=student_exam_id)
        if assigned.exists():
            existing = None

    if existing:
        merged = _merge_caps(existing)
        if merged != (existing.provision_capabilities or []):
            existing.provision_capabilities = merged
            existing.save(update_fields=["provision_capabilities"])
        return existing

    return ExamVenue.objects.create(
        exam=exam,
        venue=selected,
        start_time=target_start,
        exam_length=target_length,
        provision_capabilities=required_caps,
    )


def _create_exam_venue_links(
    exam: Exam,
    raw_row: Dict[str, Any],
    *,
    start_time: Optional[datetime] = None,
    exam_length: Optional[int] = None,
) -> None:
    """
    Ensure Venue rows exist for each venue name in the exam upload,
    and create ExamVenue links to the associated exam.
    """
    if not exam:
        return

    venue_names = _extract_venue_names(raw_row)
    if not venue_names:
        return

    seen = set()
    for name in venue_names:
        if name in seen:
            continue
        seen.add(name)

        defaults = {
            "capacity": 0,
            "venuetype": VenueType.CORE_EXAM_VENUE,
            "is_accessible": True,
            "qualifications": [],
        }
        venue, _ = Venue.objects.get_or_create(
            venue_name=name,
            defaults=defaults,
        )

        exam_venue = (
            ExamVenue.objects.filter(exam=exam, venue=venue)
            .order_by("pk")
            .first()
        )
        created = False
        if not exam_venue:
            exam_venue = ExamVenue.objects.create(
                exam=exam,
                venue=venue,
                start_time=start_time,
                exam_length=exam_length,
                core=True,
            )
            created = True

        updates = []
        if start_time and exam_venue.start_time != start_time:
            exam_venue.start_time = start_time
            updates.append("start_time")
        if exam_length is not None and exam_venue.exam_length != exam_length:
            exam_venue.exam_length = exam_length
            updates.append("exam_length")
        if created and exam_venue.core is not True:
            exam_venue.core = True
            updates.append("core")
        if updates and not created:
            exam_venue.save(update_fields=updates)


@transaction.atomic
def _import_venue_days(days: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Venue uploads carry a list of day blocks, each with a list of rooms.
    We treat each room as a Venue row and upsert by venue_name.
    """
    
    rooms: List[Dict[str, Any]] = []
    for day in days or []:
        day_date = _coerce_date(day.get("date"))
        for room in day.get("rooms", []):
            room_copy = dict(room)
            room_copy["_day_date"] = day_date
            room_copy["_day_name"] = day.get("day")
            rooms.append(room_copy)

    summary = _base_summary(len(rooms))

    for idx, room in enumerate(rooms, start=1):
        name = _clean_string(room.get("name"), max_length=255)
        if not name:
            summary["skipped"] += 1
            summary["errors"].append(f"Room {idx}: Missing name.")
            continue

        cap_val = _coerce_int(room.get("capacity"))
        incoming_accessible = room.get("accessible", None)
        defaults = {
            "capacity": cap_val if cap_val is not None else 0,
            "venuetype": room.get("venuetype") or VenueType.SCHOOL_TO_SORT,
            "is_accessible": True if incoming_accessible is None else bool(incoming_accessible),
            "qualifications": room.get("qualifications") or [],
            "availability": [],
        }

        day_date = room.get("_day_date")
        if day_date:
            defaults["availability"] = [day_date.isoformat()]

        venue_obj, created = Venue.objects.get_or_create(
            venue_name=name,
            defaults=defaults,
        )

        updated_fields = []
        for field in ("venuetype", "qualifications"):
            if getattr(venue_obj, field) != defaults[field]:
                setattr(venue_obj, field, defaults[field])
                updated_fields.append(field)
        if incoming_accessible is not None:
            merged_accessible = venue_obj.is_accessible and bool(incoming_accessible)
            if venue_obj.is_accessible != merged_accessible:
                venue_obj.is_accessible = merged_accessible
                updated_fields.append("is_accessible")
        if cap_val is not None and venue_obj.capacity != cap_val:
            venue_obj.capacity = cap_val
            updated_fields.append("capacity")

        if defaults["availability"]:
            merged = sorted(set((venue_obj.availability or []) + defaults["availability"]))
            if merged != (venue_obj.availability or []):
                venue_obj.availability = merged
                updated_fields.append("availability")

        if updated_fields:
            venue_obj.save(update_fields=updated_fields)

        if created:
            summary["created"] += 1
        else:
            summary["updated"] += 1

    return summary
