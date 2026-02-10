from typing import Dict, Optional

from django.db.models import Count

from timetabling_system.models import Exam, ExamVenue, StudentExam


def examvenue_student_counts(exam: Exam) -> Dict[int, int]:
    """
    Return a mapping of ExamVenue PK -> number of StudentExam rows assigned to it.
    """
    if not exam:
        return {}
    counts = (
        StudentExam.objects.filter(exam=exam)
        .values("exam_venue_id")
        .annotate(total=Count("exam_venue_id"))
    )
    return {row["exam_venue_id"]: row["total"] for row in counts if row["exam_venue_id"]}


def core_exam_size(exam: Exam) -> int:
    """
    Estimate how many students sit the core exam venue(s).

    Start from exam.no_students, subtract students allocated to alternative exam
    venues, but DO NOT subtract small-extra-time allocations that reuse the core
    venue (identified as non-core ExamVenues sharing the same venue as the core).
    """
    if not exam:
        return 0

    total = getattr(exam, "no_students", 0) or 0
    counts = examvenue_student_counts(exam)
    core_ev: Optional[ExamVenue] = (
        exam.examvenue_set.select_related("venue").filter(core=True).order_by("pk").first()
    )

    for ev in exam.examvenue_set.select_related("venue").all():
        if core_ev and ev.pk == core_ev.pk:
            continue
        if core_ev and ev.venue_id == core_ev.venue_id:
            # Small extra-time slot in the same physical room: do not reduce core count.
            continue
        total -= counts.get(ev.pk, 0)

    return max(total, 0)
