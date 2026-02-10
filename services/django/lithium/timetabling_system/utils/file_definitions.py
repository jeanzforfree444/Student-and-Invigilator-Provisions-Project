# timetabling_system/utils/file_definitions.py

"""
Defines the required canonical columns for each file type,
based on the real uploaded examples:
- Exam Timetable for Invigilation
- ExamProvisionReportbyDate
- Venue availability files
"""

# -------------------------------
#  CANONICAL FIELD DEFINITIONS
# -------------------------------

# Exam files have exam session information only
REQUIRED_EXAM_COLUMNS = [
    "exam_code",
    "exam_name",
    "exam_date",
    "exam_start",
    "exam_length",
    "exam_type",
    "main_venue",        # mapped from Main Venue, Venue, etc.
    "school",
]

# Provision files contain student rows + provision data
REQUIRED_PROVISION_COLUMNS = [
    "student_id",        # Mock IDs
    "student_name",      # Names
    "exam_code",         # Also present
    "school",            # School column exists in your file
    "provisions",        # Registry
    "additional_info",   # Additional Information
]

# Venue files are column-based, not row-column structured.
# They do NOT require matching pandas columns.
REQUIRED_VENUE_COLUMNS = []   # Determined structurally, not by header names


# ---------------------------------
#  FILE TYPE → REQUIRED COLUMNS MAP
# ---------------------------------

REQUIRED_COLUMNS = {
    "Exam": REQUIRED_EXAM_COLUMNS,
    "Provisions": REQUIRED_PROVISION_COLUMNS,
    "Venue": REQUIRED_VENUE_COLUMNS,
}
