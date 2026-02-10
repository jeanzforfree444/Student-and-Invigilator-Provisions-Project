from django.test import TestCase

from timetabling_system.models import (
    ExamVenueProvisionType,
    Venue,
    VenueType,
)


class VenueSignalsTests(TestCase):
    def test_use_computer_sets_computer_cluster_type(self):
        venue = Venue.objects.create(
            venue_name="Room A",
            capacity=10,
            venuetype=VenueType.SCHOOL_TO_SORT,
            provision_capabilities=[ExamVenueProvisionType.USE_COMPUTER],
        )

        venue.refresh_from_db()
        self.assertEqual(venue.venuetype, VenueType.COMPUTER_CLUSTER)

    def test_non_computer_capability_keeps_type(self):
        venue = Venue.objects.create(
            venue_name="Room B",
            capacity=20,
            venuetype=VenueType.MAIN_HALL,
            provision_capabilities=[ExamVenueProvisionType.ACCESSIBLE_HALL],
        )

        venue.refresh_from_db()
        self.assertEqual(venue.venuetype, VenueType.MAIN_HALL)
