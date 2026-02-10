# timetabling_system/utils/file_classifier.py

import math
from datetime import date, datetime

from .column_mapper import normalize, map_equivalent_columns


EXAM_INDICATORS = {
    "exam_code",
    "exam_name",
    "exam_date",
    "exam_start",
    "main_venue",
    "exam_type",
    "exam_end",
    "exam_length",
}

PROVISION_INDICATORS = {
    "student_id",
    "student_name",
    "provisions",
    "additional_info",
    "registry",
    "mock_ids",
}


def _normalized_columns(df):
    return {normalize(col) for col in df.columns}


def _canonical_columns(df):
    """
    Map messy column names to canonical equivalents before detection.
    If pandas produced mostly "Unnamed" headers, fall back to using a later
    row (e.g., the real header) as a header guess.
    """
    def map_and_score(headers):
        mapped = set(map_equivalent_columns(headers).values())
        exam_hits = len(mapped & EXAM_INDICATORS)
        provision_hits = len(mapped & PROVISION_INDICATORS)
        return mapped, exam_hits, provision_hits

    normalized_cols = [normalize(col) for col in df.columns]
    canonical_cols, exam_hits, provision_hits = map_and_score(df.columns)

    best = (canonical_cols, exam_hits, provision_hits)

    unnamed_count = sum(col.startswith("unnamed") or col in ("", "nan") for col in normalized_cols)
    for i in range(min(5, len(df.index))):
        # Only hunt for an alternate header when the current signal is weak
        # or columns are largely unnamed/blank.
        if best[1] >= 2 or best[2] >= 2:
            break
        if unnamed_count < max(1, len(normalized_cols) // 2) and i > 0:
            break
        try:
            candidate = df.iloc[i]
        except Exception:
            continue
        mapped, exam_hits, provision_hits = map_and_score(candidate)
        if exam_hits > best[1] or provision_hits > best[2]:
            best = (mapped, exam_hits, provision_hits)

    return best[0]


def detect_provision_file(df):
    """Provision files contain student + registry info."""
    canonical_cols = _canonical_columns(df)

    provision_indicators = PROVISION_INDICATORS
    provision_present = "provisions" in canonical_cols

    # Must have at least one provision-like column to count as a provision file.
    if not provision_present:
        return False

    strong_hits = len(canonical_cols & provision_indicators)

    studentish = sum("student" in col for col in canonical_cols)
    provisionish = sum(any(term in col for term in ("provision", "registry", "adjustment")) for col in canonical_cols)

    return strong_hits >= 2 or (studentish >= 1 and provisionish >= 1)


def detect_exam_file(df):
    """Exam files contain exam session fields but no student data."""
    canonical_cols = _canonical_columns(df)
    exam_indicators = {
        "exam_code",
        "exam_name",
        "exam_date",
        "exam_start",
        "main_venue",
        "exam_type",
        "exam_end",
        "exam_length",
    }

    exam_hits = len(canonical_cols & exam_indicators)
    return exam_hits >= 2 and not detect_provision_file(df)


def _looks_like_date_cell(val):
    if val is None:
        return False

    if isinstance(val, (datetime, date)):
        return True

    # pandas can give floats/ints for Excel serial dates
    if isinstance(val, (int, float)):
        if isinstance(val, float) and math.isnan(val):
            return False
        return val >= 40000  # Excel serial dates start around 1900 -> 40000+

    text = str(val).strip()
    if not text:
        return False

    lowered = text.lower()
    if any(sep in lowered for sep in ("/", "-")):
        return True

    if lowered.isdigit() and len(lowered) >= 5:
        return True

    try:
        num = float(lowered)
        return num >= 40000
    except (ValueError, TypeError):
        return False


def detect_venue_file(df):
    """
    Venue files are column-based:
    Row 1 = day names
    Row 2 = dates
    Rows 3.. = room names
    """
    weekdays = ("monday", "tuesday", "wednesday", "thursday", "friday", "sat", "sun", "saturday", "sunday")

    def weekday_hits(seq):
        return sum(any(day in str(cell).lower().split("-")[0] for day in weekdays) for cell in seq)

    def date_hits(seq):
        return sum(_looks_like_date_cell(cell) for cell in seq)

    try:
        # If it already looks like an exam or provision file, do not treat it as venue.
        if detect_exam_file(df) or detect_provision_file(df):
            return False

        # Case 1: worksheets treated as data rows (no header)
        if len(df.index) >= 2:
            first_row = df.iloc[0]
            second_row = df.iloc[1]
            if weekday_hits(first_row) >= 1 and date_hits(second_row) >= 1:
                return True

        # Case 2: pandas used first row as header, so weekdays sit in columns
        if len(df.columns) >= 1 and len(df.index) >= 1:
            if weekday_hits(df.columns) >= 1 and date_hits(df.iloc[0]) >= 1:
                return True
        return False

    except Exception:
        return False
