from django.test import TestCase

import pandas as pd
 
from timetabling_system.utils.file_classifier import (

    detect_exam_file,

    detect_provision_file,

    detect_venue_file

)
from timetabling_system.utils.excel_parser import (
    _apply_best_header,
    _sanitize_dataframe,
    validate_required_columns,
    parse_excel_file,
    prepare_exam_provision_df,
)
from timetabling_system.utils.column_mapper import normalize, map_equivalent_columns
 
 
class TestFileClassifier(TestCase):
 
    def test_detect_exam_file(self):

        df = pd.DataFrame({

            "exam_code": [1],

            "exam_name": ["Test"],

            "exam_date": ["2025-06-01"]

        })

        assert detect_exam_file(df) is True

        assert detect_provision_file(df) is False

        assert detect_venue_file(df) is False
 
    def test_detect_provision_file(self):

        df = pd.DataFrame({

            "student_id": ["12345"],

            "student_name": ["Alice"],

            "provisions": ["extra_time"]

        })

        assert detect_provision_file(df) is True

        assert detect_exam_file(df) is False

        assert detect_venue_file(df) is False
 
    def test_detect_venue_file(self):
        df = pd.DataFrame(
            [
                ["Monday", "Tuesday"],
                ["2025/07/28", "2025/07/29"],
                ["Room A", "Room B"],
            ]
        )

        assert detect_venue_file(df) is True

        assert detect_exam_file(df) is False

        assert detect_provision_file(df) is False

    def test_detect_provision_multiline_headers(self):
        df = pd.DataFrame(
            [
                [
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "Campus Exam",
                    "CHEM5022_1",
                    "Physical Chemistry",
                    "SCHOOL OF CHEMISTRY",
                    "82",
                    "Torres;Christian",
                    "Extra time 30 minutes every hour ; Separate room on own",
                    "Additional notes",
                ]
            ],
            columns=[
                "Main Venue",
                "Day",
                "Date",
                "Start Time",
                "Finish Time",
                "Duration",
                "Exam Type",
                "Exam Code",
                "Exam",
                "School",
                "Student ID\nMock IDs",
                "Student Name\nMock Names",
                "Exam Provision\nData as presented to Registry",
                "Additional Information \nStudent identifers have been removed",
            ],
        )

        assert detect_provision_file(df) is True
        assert detect_exam_file(df) is False
        assert detect_venue_file(df) is False

    def test_provision_requires_provision_column(self):
        df = pd.DataFrame(
            {
                "Student ID": ["12345"],
                "Student Name": ["Alice"],
            }
        )

        assert detect_provision_file(df) is False
        assert detect_exam_file(df) is False
        assert detect_venue_file(df) is False

    def test_detect_exam_file_with_equivalent_columns(self):
        df = pd.DataFrame(
            {
                "Course Code": [1],
                "Assessment Name": ["Test"],
                "Date": ["2025-06-01"],
            }
        )

        assert detect_exam_file(df) is True
        assert detect_provision_file(df) is False

    def test_prepare_exam_provision_df_adds_school_and_maps_venue(self):
        df = pd.DataFrame(
            [
                ["August Resit Exam Final Timetable", "", "", ""],
                ["ADAM SMITH BUSINESS SCHOOL", "", "", ""],
                [
                    "Exam Code",
                    "Exam Name",
                    "Exam date",
                    "Assessment Type (Online Exams/ Venue (On Campus Exams)",
                ],
                ["CHEM101", "Chemistry 1", "2025-06-01", "Main Hall"],
            ]
        )

        prepared = prepare_exam_provision_df(df)

        assert "school" in prepared.columns
        assert prepared.iloc[0]["school"] == "ADAM SMITH BUSINESS SCHOOL"
        assert "main_venue" in prepared.columns

    def test_sanitize_dataframe_replaces_nan_and_drops_empty_column(self):
        df = pd.DataFrame(
            {
                "Exam Code": [1],
                "": [pd.NA],
            }
        )
        df.columns = [normalize(c) for c in df.columns]
        mapping = map_equivalent_columns(df.columns)
        df.rename(columns=mapping, inplace=True)

        cleaned = _sanitize_dataframe(df)

        assert "" not in cleaned.columns
        assert cleaned.iloc[0]["exam_code"] == 1
        assert not pd.isna(cleaned.iloc[0]["exam_code"])

    def test_apply_best_header_adds_school(self):
        df = pd.DataFrame(
            [
                ["August Resit Exam Final Timetable", "", ""],
                ["ADAM SMITH BUSINESS SCHOOL", "", ""],
                ["Exam Code", "Exam Name", "Exam date"],
                ["CHEM101", "Chemistry 1", "2025-06-01"],
            ]
        )

        parsed, school = _apply_best_header(df)
        parsed.columns = [normalize(c) for c in parsed.columns]
        mapping = map_equivalent_columns(parsed.columns)
        parsed.rename(columns=mapping, inplace=True)
        if school and "school" not in parsed.columns:
            parsed["school"] = school

        assert school == "ADAM SMITH BUSINESS SCHOOL"
        assert "school" in parsed.columns
        assert parsed.iloc[0]["school"] == "ADAM SMITH BUSINESS SCHOOL"

    def test_detect_provision_file_with_equivalent_columns(self):
        df = pd.DataFrame(
            {
                "Mock ID": ["12345"],
                "Names": ["Alice"],
                "Exam provision data as presented to registry": ["extra_time"],
            }
        )

        assert detect_provision_file(df) is True
        assert detect_exam_file(df) is False

    def test_exam_not_classified_as_venue_when_days_present(self):
        df = pd.DataFrame(
            {
                "Day": ["Monday", "Tuesday"],
                "Date": ["2025-06-01", "2025-06-02"],
                "Exam Code": ["CHEM101", "MATH202"],
                "Assessment Name": ["Chemistry 1", "Maths 2"],
                "Exam Start": ["09:00", "13:00"],
                "Exam End": ["11:00", "15:00"],
                "Main Venue": ["Hall A", "Hall B"],
            }
        )

        assert detect_exam_file(df) is True
        assert detect_venue_file(df) is False
        assert detect_provision_file(df) is False

    def test_exam_file_with_unnamed_columns_uses_first_row_as_header(self):
        df = pd.DataFrame(
            [
                ["Exam Code", "Assessment Name", "Date"],
                ["CHEM101", "Chemistry 1", "2025-06-01"],
            ],
            columns=["Unnamed: 0", "Unnamed: 1", "Unnamed: 2"],
        )

        assert detect_exam_file(df) is True
        assert detect_provision_file(df) is False

    def test_parse_excel_file_exam(self):
        from tempfile import NamedTemporaryFile
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["August Resit Exam Final Timetable", "", "", ""])
        ws.append(["ADAM SMITH BUSINESS SCHOOL", "", "", ""])
        ws.append(
            [
                "Exam Code",
                "Exam Name",
                "Exam date",
                "Exam Start (BST)",
                "Exam Duration (Hours:Minutes)",
                "Exam finish",
                "Online/ On Campus Exam",
                "Assessment Type (Online Exams/ Venue (On Campus Exams)",
                "Exam Size",
                "School Contact ",
                "School",
            ]
        )
        ws.append(
            [
                "CHEM101",
                "Chemistry 1",
                "2025-06-01",
                "09:00",
                "02:00",
                "11:00",
                "On Campus",
                "Main Hall",
                10,
                "",
                "ADAM SMITH BUSINESS SCHOOL",
            ]
        )

        with NamedTemporaryFile(suffix=".xlsx") as tmp:
            wb.save(tmp.name)
            tmp.seek(0)
            result = parse_excel_file(tmp)

        assert result["status"] == "ok"
        assert result["type"] == "Exam"
        assert "school" in result["columns"]

    def test_validate_required_columns_for_venue(self):
        df = pd.DataFrame({"Something": [1]})
        assert validate_required_columns(df, "Venue") == []

    def test_parse_excel_file_provisions_success(self):
        from tempfile import NamedTemporaryFile

        df = pd.DataFrame(
            {
                "Student ID": ["S1"],
                "Student Name": ["Alice"],
                "Exam Code": ["CHEM101"],
                "School": ["Chemistry"],
                "Exam provision data as presented to registry": ["Extra time"],
                "Additional Information": ["Note"],
            }
        )

        with NamedTemporaryFile(suffix=".xlsx") as tmp:
            df.to_excel(tmp.name, index=False)
            tmp.seek(0)
            result = parse_excel_file(tmp)

        assert result["status"] == "ok"
        assert result["type"] == "Provisions"
        assert result["rows"][0]["student_id"] == "S1"

    def test_detect_venue_with_weekday_columns(self):
        df = pd.DataFrame(
            [
                [45866, 45867, 45868, 45869, 45870],
                ["Hetherington 118", "Hetherington 118", "Hetherington 130", "Hetherington 118", "Hetherington 118"],
            ],
            columns=[
                "Monday- 837630",
                "Tuesday- 837631",
                "Wednesday- 837635",
                "Thursday- 837639",
                "Friday- 837641",
            ],
        )

        assert detect_venue_file(df) is True
        assert detect_exam_file(df) is False
        assert detect_provision_file(df) is False

    def test_parse_excel_file_venue(self):
        from tempfile import NamedTemporaryFile
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Monday", "Tuesday"])
        ws.append(["2025-07-28", "2025-07-29"])
        ws.append(["Room A", "Room B"])
        ws.append(["Room C", ""])

        with NamedTemporaryFile(suffix=".xlsx") as tmp:
            wb.save(tmp.name)
            tmp.seek(0)
            result = parse_excel_file(tmp)

        assert result["status"] == "ok"
        assert result["type"] == "Venue"
        assert "days" in result and len(result["days"]) == 2

 
