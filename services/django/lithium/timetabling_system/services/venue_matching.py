from typing import Iterable, List, Optional
from datetime import datetime, timedelta

from django.db import transaction

from timetabling_system.models import (
    ExamVenue,
    ExamVenueProvisionType,
    StudentExam,
    Venue,
)


def venue_supports_caps(venue: Venue, required_caps: Iterable[str]) -> bool:
    """Return True if the venue satisfies all required provision capabilities."""
    caps_needed: List[str] = list(required_caps or [])
    venue_caps = venue.provision_capabilities or []

    for cap in caps_needed:
        if cap not in venue_caps:
            return False
    return True


def venue_has_timing_conflict(
    venue: Venue,
    start_time: Optional[datetime],
    length_minutes: Optional[int],
    ignore_exam_id: Optional[int] = None,
    allow_same_exam_overlap: bool = False,
) -> bool:
    """
    Return True if the venue already has another ExamVenue that overlaps the supplied slot.
    Exam with ID == ignore_exam_id is skipped (so a given exam can reuse its own slot);
    optionally allow overlaps for the same exam when allow_same_exam_overlap is True.
    """
    if not venue or not start_time or length_minutes is None:
        # Without timing info we cannot test overlap; allow allocation.
        return False
    target_end = start_time + timedelta(minutes=length_minutes)
    for ev in venue.examvenue_set.all():
        if ignore_exam_id and ev.exam_id == ignore_exam_id:
            if allow_same_exam_overlap:
                # Explicitly allow overlap for the same exam (used for small extra-time cases).
                continue
            if (
                ev.start_time == start_time
                and ev.exam_length == length_minutes
            ):
                # Same exam, exact same slot is OK (reuse).
                continue
        if not ev.start_time or ev.exam_length is None:
            # If existing timing is unknown, skip conflict check for this row.
            continue
        ev_end = ev.start_time + timedelta(minutes=ev.exam_length)
        if start_time < ev_end and ev.start_time < target_end:
            return True
    return False


def venue_is_available(venue: Venue, start_time: Optional[datetime]) -> bool:
    """
    Return True if the venue is available on the date of start_time based on its availability list.
    If availability is empty, treat as available (no restriction).
    """
    if not venue:
        return False
    days = venue.availability or []
    if not days:
        return True
    if not start_time:
        # Without a date, we cannot restrict by availability; allow it.
        return True
    return start_time.date().isoformat() in days


@transaction.atomic
def attach_placeholders_to_venue(venue: Venue) -> None:
    """
    When a Venue gains provision capabilities, upgrade any placeholder ExamVenue
    records (venue is NULL) that the room can now satisfy.
    """
    if not venue:
        return

    placeholders = ExamVenue.objects.select_related("exam").filter(venue__isnull=True)
    for ev in placeholders:
        required_caps = ev.provision_capabilities or []
        # Skip placeholders that have no specific provision requirements to avoid
        # mass-assigning every unallocated exam to the most recently edited venue.
        if not required_caps:
            continue
        if not venue_supports_caps(venue, required_caps):
            continue
        if ExamVenueProvisionType.ACCESSIBLE_HALL in required_caps and not venue.is_accessible:
            continue
        if not venue_is_available(venue, ev.start_time):
            continue
        if venue_has_timing_conflict(
            venue, ev.start_time, ev.exam_length, ignore_exam_id=ev.exam_id
        ):
            continue

        # If an ExamVenue already exists for this exam+venue, reuse it and re-point students.
        existing = (
            ExamVenue.objects.filter(exam=ev.exam, venue=venue)
            .exclude(pk=ev.pk)
            .first()
        )
        if existing:
            StudentExam.objects.filter(exam_venue=ev).update(exam_venue=existing)
            ev.delete()
            continue

        ev.venue = venue
        ev.save(update_fields=["venue"])
