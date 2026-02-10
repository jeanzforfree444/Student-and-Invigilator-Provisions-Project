from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from timetabling_system.models import (
    Exam,
    ExamVenue,
    Invigilator,
    InvigilatorAssignment,
    Notification,
    Venue,
    VenueType,
    Diet,
    InvigilatorDietContract,
)


class AdminApiCrudTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        self.senior_admin = User.objects.create_user(
            username="senior",
            email="senior@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
            is_senior_admin=True,
        )
        self.non_admin = User.objects.create_user(
            username="user",
            email="user@example.com",
            password="secret",
            is_staff=False,
            is_superuser=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_non_admin_requests_are_forbidden(self):
        client = APIClient()
        client.force_authenticate(self.non_admin)

        response = client.get(reverse("exam-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_exam_update_logs_notification(self):
        exam = Exam.objects.create(
            exam_name="Algorithms",
            course_code="CS101",
            exam_type="Written",
            no_students=100,
            exam_school="Engineering",
            school_contact="Dr. Smith",
        )

        response = self.client.patch(
            reverse("exam-detail", args=[exam.pk]),
            {"exam_name": "Updated Algorithms"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        exam.refresh_from_db()
        self.assertEqual(exam.exam_name, "Updated Algorithms")
        note = Notification.objects.get()
        self.assertEqual(note.type, "examChange")
        self.assertIn("Updated Algorithms", note.admin_message)

    def test_venue_create_and_update_log_notifications(self):
        create_response = self.client.post(
            reverse("venue-list"),
            {
                "venue_name": "Main Hall",
                "capacity": 200,
                "venuetype": VenueType.MAIN_HALL,
                "is_accessible": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Notification.objects.filter(type="venueChange").count(),
            1,
        )
        self.assertIn(
            "Main Hall",
            Notification.objects.filter(type="venueChange").latest("id").admin_message,
        )

        update_response = self.client.patch(
            reverse("venue-detail", args=["Main Hall"]),
            {"capacity": 250},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Notification.objects.filter(type="venueChange").count(),
            2,
        )

    def test_exam_venue_core_rows_are_protected(self):
        exam = Exam.objects.create(
            exam_name="Databases",
            course_code="DB101",
            exam_type="Written",
            no_students=50,
            exam_school="Computing",
            school_contact="Dr. X",
        )
        venue = Venue.objects.create(
            venue_name="Hall A",
            capacity=100,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        core_ev = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=timezone.now(),
            exam_length=120,
            core=True,
        )

        response = self.client.delete(
            reverse("exam-venue-detail", args=[core_ev.pk]),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ExamVenue.objects.filter(pk=core_ev.pk).exists())

    def test_exam_venue_create_requires_existing_venue(self):
        exam = Exam.objects.create(
            exam_name="Networks",
            course_code="NET101",
            exam_type="Written",
            no_students=80,
            exam_school="Engineering",
            school_contact="Dr. Net",
        )

        response = self.client.post(
            reverse("exam-venue-list"),
            {
                "exam": exam.pk,
                "venue_name": "Nonexistent Room",
                "start_time": timezone.now(),
                "exam_length": 90,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("does not exist", str(response.data))

    def test_invigilator_update_logs_notification(self):
        invigilator = Invigilator.objects.create(
            preferred_name="Pat",
            full_name="Pat Example",
        )

        response = self.client.patch(
            reverse("invigilator-detail", args=[invigilator.pk]),
            {"mobile": "0123456789"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        note = Notification.objects.get()
        self.assertEqual(note.type, "invigilatorUpdate")
        self.assertIn("Pat", note.admin_message)

    def test_make_invigilator_admin_promotes_linked_user(self):
        User = get_user_model()
        invigilator_user = User.objects.create_user(
            username="invigilator_user",
            email="invigilator@example.com",
            password="secret",
            is_staff=False,
            is_superuser=False,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Morgan",
            full_name="Morgan Example",
            user=invigilator_user,
        )

        client = APIClient()
        client.force_authenticate(self.senior_admin)

        response = client.post(
            reverse("invigilator-make-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invigilator_user.refresh_from_db()
        self.assertTrue(invigilator_user.is_staff)
        self.assertTrue(invigilator_user.is_superuser)

    def test_make_invigilator_admin_requires_linked_user(self):
        invigilator = Invigilator.objects.create(
            preferred_name="NoLogin",
            full_name="No Login Example",
        )

        client = APIClient()
        client.force_authenticate(self.senior_admin)

        response = client.post(
            reverse("invigilator-make-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_make_invigilator_admin_requires_senior_admin(self):
        User = get_user_model()
        invigilator_user = User.objects.create_user(
            username="invigilator_user2",
            email="invigilator2@example.com",
            password="secret",
            is_staff=False,
            is_superuser=False,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Casey",
            full_name="Casey Example",
            user=invigilator_user,
        )

        client = APIClient()
        client.force_authenticate(self.admin)

        response = client.post(
            reverse("invigilator-make-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_remove_admin_requires_senior_admin(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="adminish",
            email="adminish@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Alex",
            full_name="Alex Example",
            user=admin_user,
        )

        client = APIClient()
        client.force_authenticate(self.admin)

        response = client.post(
            reverse("invigilator-remove-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_remove_admin_demotes_user(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="demote",
            email="demote@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
            is_senior_admin=True,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Jo",
            full_name="Jo Example",
            user=admin_user,
        )

        client = APIClient()
        client.force_authenticate(self.senior_admin)

        response = client.post(
            reverse("invigilator-remove-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        admin_user.refresh_from_db()
        self.assertFalse(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)
        self.assertFalse(admin_user.is_senior_admin)

    def test_make_senior_admin_requires_senior_admin(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="adminish",
            email="adminish@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Alex",
            full_name="Alex Example",
            user=admin_user,
        )

        client = APIClient()
        client.force_authenticate(self.admin)

        response = client.post(
            reverse("invigilator-make-senior-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_make_senior_admin_promotes_admin(self):
        User = get_user_model()
        admin_user = User.objects.create_user(
            username="seniorize",
            email="seniorize@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Jo",
            full_name="Jo Example",
            user=admin_user,
        )

        client = APIClient()
        client.force_authenticate(self.senior_admin)

        response = client.post(
            reverse("invigilator-make-senior-admin", args=[invigilator.pk]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        admin_user.refresh_from_db()
        self.assertTrue(admin_user.is_senior_admin)

    def test_invigilator_assignment_create_and_delete_log_notifications(self):
        exam = Exam.objects.create(
            exam_name="Physics",
            course_code="PHY101",
            exam_type="Written",
            no_students=120,
            exam_school="Science",
            school_contact="Dr. Photon",
        )
        venue = Venue.objects.create(
            venue_name="Physics Hall",
            capacity=150,
            venuetype=VenueType.MAIN_HALL,
            is_accessible=True,
        )
        exam_venue = ExamVenue.objects.create(
            exam=exam,
            venue=venue,
            start_time=timezone.now(),
            exam_length=120,
            core=True,
        )
        invigilator = Invigilator.objects.create(
            preferred_name="Sam",
            full_name="Sam Invigilator",
        )

        start = timezone.now()
        end = start + timedelta(hours=2)
        create_response = self.client.post(
            reverse("invigilator-assignment-list"),
            {
                "invigilator": invigilator.pk,
                "exam_venue": exam_venue.pk,
                "assigned_start": start,
                "assigned_end": end,
                "role": "lead",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Notification.objects.filter(type="assignment").count(),
            1,
        )
        assignment_id = create_response.data["id"]

        delete_response = self.client.delete(
            reverse("invigilator-assignment-detail", args=[assignment_id]),
        )

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            Notification.objects.filter(type="assignment").count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(type="cancellation").count(),
            1,
        )
        self.assertFalse(
            InvigilatorAssignment.objects.filter(pk=assignment_id).exists()
        )


class InvigilatorDietContractApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin_diet",
            email="admin_diet@example.com",
            password="secret",
            is_staff=True,
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.invigilator = Invigilator.objects.create(
            preferred_name="Diet",
            full_name="Diet Invigilator",
        )
        now = timezone.now().date()
        self.diet_one = Diet.objects.create(
            code="DEC_2025_CONTRACT",
            name="December 2025",
            start_date=now,
            end_date=now + timedelta(days=10),
            is_active=True,
        )
        self.diet_two = Diet.objects.create(
            code="APR_2026_CONTRACT",
            name="April 2026",
            start_date=now + timedelta(days=30),
            end_date=now + timedelta(days=40),
            is_active=True,
        )

    def test_invigilator_detail_includes_diet_contracts(self):
        InvigilatorDietContract.objects.create(
            invigilator=self.invigilator,
            diet=self.diet_one,
            contracted_hours=80,
        )
        InvigilatorDietContract.objects.create(
            invigilator=self.invigilator,
            diet=self.diet_two,
            contracted_hours=100,
        )

        response = self.client.get(reverse("invigilator-detail", args=[self.invigilator.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contracts = response.data.get("diet_contracts") or []
        codes = {c.get("diet") for c in contracts}
        self.assertIn("DEC_2025_CONTRACT", codes)
        self.assertIn("APR_2026_CONTRACT", codes)
        contract_map = {c.get("diet"): c.get("contracted_hours") for c in contracts}
        self.assertEqual(contract_map.get("DEC_2025_CONTRACT"), 80)
        self.assertEqual(contract_map.get("APR_2026_CONTRACT"), 100)

    def test_invigilator_update_replaces_diet_contracts(self):
        InvigilatorDietContract.objects.create(
            invigilator=self.invigilator,
            diet=self.diet_one,
            contracted_hours=60,
        )

        response = self.client.patch(
            reverse("invigilator-detail", args=[self.invigilator.pk]),
            {
                "diet_contracts": [
                    {"diet": "APR_2026_CONTRACT", "contracted_hours": 120},
                    {"diet": "DEC_2025_CONTRACT", "contracted_hours": 90},
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contracts = InvigilatorDietContract.objects.filter(invigilator=self.invigilator)
        self.assertEqual(contracts.count(), 2)
        contract_map = {c.diet.code: c.contracted_hours for c in contracts}
        self.assertEqual(contract_map["APR_2026_CONTRACT"], 120)
        self.assertEqual(contract_map["DEC_2025_CONTRACT"], 90)
