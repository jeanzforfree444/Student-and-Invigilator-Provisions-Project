# timetabling_system/utils/excel_parser.py

import pandas as pd

from .column_mapper import map_equivalent_columns, normalize
from .file_classifier import (
    detect_provision_file,
    detect_venue_file,
    detect_exam_file,
    EXAM_INDICATORS,
    PROVISION_INDICATORS,
)
from .file_definitions import REQUIRED_COLUMNS
from .venue_parser import parse_venue_file


# --------------------------------------------------------------------------
# Load and normalize using pandas
# --------------------------------------------------------------------------

def _score_headers(headers):
    mapping = map_equivalent_columns(headers)
    canonical = []
    for h in headers:
        try:
            mapped = mapping.get(h)
        except TypeError:
            mapped = mapping.get(str(h))
        canonical.append(mapped if mapped is not None else normalize(h))
    canonical_set = set(canonical)
    exam_hits = len(canonical_set & EXAM_INDICATORS)
    provision_hits = len(canonical_set & PROVISION_INDICATORS)
    return canonical, exam_hits, provision_hits


def _apply_best_header(df):
    """
    Use the existing columns if they already look good; otherwise, try the first
    few data rows as header candidates (handles files where pandas produced
    Unnamed columns and the real header sits lower down).
    """
    best_cols, best_exam, best_prov = _score_headers(df.columns)
    best_school = None

    normalized_cols = [normalize(c) for c in df.columns]
    unnamed_count = sum(c == "" or c.startswith("unnamed") for c in normalized_cols)
    header_search_needed = (best_exam < 2 and best_prov < 2) or unnamed_count >= max(1, len(normalized_cols) // 2)

    if header_search_needed:
        for i in range(min(5, len(df.index))):
            candidate = df.iloc[i]
            candidate_cols, exam_hits, provision_hits = _score_headers(candidate)
            if exam_hits > best_exam or provision_hits > best_prov:
                best_cols, best_exam, best_prov = candidate_cols, exam_hits, provision_hits
                if i > 0:
                    prev = df.iloc[i - 1]
                    for cell in prev:
                        if pd.notna(cell) and str(cell).strip():
                            best_school = str(cell).strip()
                            break
                df = df.iloc[i + 1:].reset_index(drop=True)
                break

    df.columns = best_cols
    return df, best_school


def _sanitize_dataframe(df):
    """Drop empty columns and replace NaN/NaT with None for JSON safety."""
    df = df.loc[:, [col for col in df.columns if str(col).strip() != ""]]
    return df.where(pd.notna(df), None)

def _is_missing(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    try:
        missing = pd.isna(value)
        # pandas can return array-like; collapse to a single boolean.
        if hasattr(missing, "all"):
            try:
                return bool(missing.all())
            except Exception:
                pass
        return bool(missing)
    except Exception:
        return False


def _row_is_header(values):
    canonical, exam_hits, provision_hits = _score_headers(values)
    return exam_hits >= 2 or provision_hits >= 2


def _assign_school_blocks(df, school_header):
    if "school" not in df.columns:
        df["school"] = None

    df = df.reset_index(drop=True)
    columns_without_school = [col for col in df.columns if col != "school"]
    current_school = school_header
    drop_indices = []

    for idx in range(len(df.index)):
        row_values = [df.at[idx, col] for col in columns_without_school]
        non_empty = [val for val in row_values if not _is_missing(val)]

        if _row_is_header(non_empty):
            drop_indices.append(idx)
            continue

        if len(non_empty) == 1:
            candidate = str(non_empty[0]).strip()
            if "school" in candidate.lower():
                next_idx = idx + 1
                if next_idx < len(df.index):
                    next_values = [df.at[next_idx, col] for col in columns_without_school]
                    next_non_empty = [val for val in next_values if not _is_missing(val)]
                    if _row_is_header(next_non_empty):
                        current_school = candidate
                        drop_indices.append(idx)
                        continue

        if current_school and _is_missing(df.at[idx, "school"]):
            df.at[idx, "school"] = current_school

    if drop_indices:
        df = df.drop(index=drop_indices).reset_index(drop=True)

    return df


def prepare_exam_provision_df(df):
    """
    Normalize/massage the DataFrame for exam/provision detection and parsing.
    Venue detection should operate on the raw sheet structure, so we keep this separate.
    """
    df, school_header = _apply_best_header(df)

    # Normalize and map again to ensure consistent canonical naming
    df.columns = [normalize(c) for c in df.columns]
    mapping = map_equivalent_columns(df.columns)
    df.rename(columns=mapping, inplace=True)

    df = _assign_school_blocks(df, school_header)

    df = _sanitize_dataframe(df)
    return df


# --------------------------------------------------------------------------
# Validate fields for exam + provision files
# --------------------------------------------------------------------------

def validate_required_columns(df, file_type):
    required = REQUIRED_COLUMNS[file_type]
    if not required:   # Venue has no required column list
        return []

    df_cols = set(df.columns)
    required_set = set(required)

    missing = list(required_set - df_cols)
    return missing


# --------------------------------------------------------------------------
# Main unified parser
# --------------------------------------------------------------------------

def parse_excel_file(file):
    """
    Detects the file type:
    - Exam timetable file (Exam)
    - Exam provision report (Provisions)
    - Venue availability file (Venue)
    
    Then returns structured data for each.
    """

    filename = getattr(file, "name", "uploaded_file")

    try:
        raw_df = pd.read_excel(file)
    except Exception:
        if hasattr(file, "seek"):
            file.seek(0)
        return parse_venue_file(file)

    # Prepare normalized copy for exam/provision detection
    df = prepare_exam_provision_df(raw_df.copy())

    # ------------------------------------------
    # 1. Detect PROVISION file
    # ------------------------------------------
    if detect_provision_file(df):
        file_type = "Provisions"

        missing = validate_required_columns(df, file_type)
        if missing:
            return {
                "status": "error",
                "file": filename,
                "type": file_type,
                "message": f"Missing required columns: {', '.join(missing)}"
            }

        return {
            "status": "ok",
            "type": "Provisions",
            "file": filename,
            "columns": list(df.columns),
            "rows": df.to_dict(orient="records"),
        }

    # ------------------------------------------
    # 2. Detect EXAM file
    # (Check exam before venue to avoid misclassifying exam tables that include day/date columns.)
    if detect_exam_file(df):
        file_type = "Exam"

        missing = validate_required_columns(df, file_type)
        if missing:
            return {
                "status": "error",
                "file": filename,
                "type": file_type,
                "message": f"Missing required columns: {', '.join(missing)}"
            }

        return {
            "status": "ok",
            "type": "Exam",
            "file": filename,
            "columns": list(df.columns),
            "rows": df.to_dict(orient="records"),
        }

    # ------------------------------------------
    # 3. Detect VENUE file
    # ------------------------------------------
    if detect_venue_file(raw_df):
        if hasattr(file, "seek"):
            file.seek(0)
        return parse_venue_file(file)

    # ------------------------------------------
    # 4. Unknown file type
    # ------------------------------------------
    return {
        "status": "error",
        "file": filename,
        "message": "Unrecognized file structure. Cannot classify."
    }
