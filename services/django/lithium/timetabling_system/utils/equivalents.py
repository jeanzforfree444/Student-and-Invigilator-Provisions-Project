
"""
Maps messy column names from Excel files to canonical internal names.
Canonical names are used throughout parsing and validation.
"""

EQUIVALENT_COLUMNS = {
#exam file fields
    "exam_code": [
        "exam code", "course code", "code"
    ],

    "exam_name": [
        "exam name", "assessment name", "module", "name", "exam"
    ],

    "exam_date": [
        "exam date", "date"
    ],

    "exam_start": [
        "exam start", "exam start time", "ol start", "oc start", "start", "start time",
        "exam start (bst)", "exam start bst"
    ],

    "exam_end": [
        "exam end", "exam finish", "ol finish", "oc finish", "end", "finish time"
    ],

    "exam_length": [
        "exam length", "exam duration", "duration", "length", "time allowed",
        "exam duration (hours:minutes)", "exam duration (hoursminutes)"
    ],

    "exam_type": [
        "exam type", "assessment type", "type", "online/ on campus exam",
        "online/ on campus/digital on campus exam", "online on campus digital on campus exam",
        "digital on campus exam"
    ],

    "main_venue": [
        "main venue", "venue", "location", "room", "exam venue",
        "assessment type (online exams/ venue (on campus exams)",
        "assessment type online exams venue on campus exams"
    ],

    "school": [
        "school", "department", "college"
    ],

    "no_students": [
        "exam_size", "no_students", "number_of_students", "student_count", "exam size"
    ],

    "school_contact": [
        "school_contact", "contact", "contact_name", "school contact"
    ],

   #provision fields
    "student_id": [
        "mock ids", "mock id", "student id", "id", "student id mock ids"
    ],

    "student_name": [
        "names", "student name", "name", "student name mock names"
    ],

    "provisions": [
        "registry", "exam provision", "provision", "adjustments", "exam provision data as presented to registry"
    ],

    "additional_info": [
        "additional information", "notes", "comments", "info",
        "additional information student identifers have been removed",
        "additional information student identifiers have been removed"
    ],

    # -------------------------
    # Optional Fields Shared
    # -------------------------
    "exam_building": [
        "building", "site"
    ],

    # Empty mapping for venue-style structural detection
    # Actual parsing uses openpyxl, not column matching.
}
