from django.test import TestCase

from timetabling_system.models import Venue, VenueType
from timetabling_system.utils.venue_ingest import upsert_venues


class VenueIngestTests(TestCase):
    def test_creates_venues_with_defaults(self):
        result = upsert_venues(
            [
                {"name": "Room A"},
                {"name": "Room B", "capacity": 50, "venuetype": VenueType.MAIN_HALL, "is_accessible": False},
                {"name": ""},  # skipped
            ]
        )

        self.assertEqual(result["created"], 2)
        self.assertEqual(result["updated"], 0)

        room_a = Venue.objects.get(pk="Room A")
        self.assertEqual(room_a.capacity, 0)
        self.assertEqual(room_a.venuetype, VenueType.SCHOOL_TO_SORT)
        self.assertTrue(room_a.is_accessible)

        room_b = Venue.objects.get(pk="Room B")
        self.assertEqual(room_b.capacity, 50)
        self.assertEqual(room_b.venuetype, VenueType.MAIN_HALL)
        self.assertFalse(room_b.is_accessible)

    def test_updates_existing_venues(self):
        Venue.objects.create(
            venue_name="Room C",
            capacity=10,
            venuetype=VenueType.SCHOOL_TO_SORT,
            is_accessible=True,
        )

        result = upsert_venues(
            [
                {"name": "Room C", "capacity": 20, "venuetype": VenueType.SEPARATE_ROOM, "is_accessible": False},
            ]
        )

        self.assertEqual(result["created"], 0)
        self.assertEqual(result["updated"], 1)

        room_c = Venue.objects.get(pk="Room C")
        self.assertEqual(room_c.capacity, 20)
        self.assertEqual(room_c.venuetype, VenueType.SEPARATE_ROOM)
        self.assertFalse(room_c.is_accessible)
