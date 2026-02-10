from django.db import transaction

from timetabling_system.models import Venue, VenueType


def upsert_venues(venues):
    """
    Create/update Venue records from parsed venue files.

    The spreadsheet does not contain capacity or venue type, so we default to
    capacity=0 and venuetype=SCHOOL_TO_SORT to flag that it should be
    classified later.
    """
    created = 0
    updated = 0

    with transaction.atomic():
        for venue in venues:
            name = venue.get("name")
            if not name:
                continue

            is_accessible = venue.get("is_accessible", True)
            obj, was_created = Venue.objects.update_or_create(
                venue_name=name,
                defaults={
                    "capacity": venue.get("capacity", 0),
                    "venuetype": venue.get("venuetype", VenueType.SCHOOL_TO_SORT),
                    "is_accessible": is_accessible,
                    "qualifications": venue.get("qualifications", []),
                },
            )

            created += int(was_created)
            updated += int(not was_created)

    return {"created": created, "updated": updated}
