from unittest import mock

from django.test import TestCase

from timetabling_system.utils import excel_parser


class ExcelParserErrorTests(TestCase):
    def test_missing_required_columns_returns_error(self):
        df = mock.MagicMock()
        df.copy.return_value = df
        with mock.patch("timetabling_system.utils.excel_parser.pd.read_excel", return_value=df), mock.patch(
            "timetabling_system.utils.excel_parser.prepare_exam_provision_df"
        ) as prep:
            # Simulate detected file with missing columns for Exam
            prep.return_value = df
            with mock.patch(
                "timetabling_system.utils.excel_parser.detect_provision_file",
                return_value=False,
            ), mock.patch(
                "timetabling_system.utils.excel_parser.detect_exam_file",
                return_value=True,
            ), mock.patch(
                "timetabling_system.utils.excel_parser.validate_required_columns",
                return_value=["exam_code"],
            ):
                result = excel_parser.parse_excel_file(mock.Mock(name="file", spec=["name"]))

        self.assertEqual(result["status"], "error")
        self.assertIn("Missing required columns", result["message"])
        self.assertEqual(result["type"], "Exam")

    def test_unrecognized_file_structure_returns_error(self):
        df = mock.MagicMock()
        df.copy.return_value = df
        with mock.patch("timetabling_system.utils.excel_parser.pd.read_excel", return_value=df), mock.patch(
            "timetabling_system.utils.excel_parser.prepare_exam_provision_df",
            return_value=df,
        ), mock.patch(
            "timetabling_system.utils.excel_parser.detect_provision_file",
            return_value=False,
        ), mock.patch(
            "timetabling_system.utils.excel_parser.detect_exam_file",
            return_value=False,
        ), mock.patch(
            "timetabling_system.utils.excel_parser.detect_venue_file",
            return_value=False,
        ):
            result = excel_parser.parse_excel_file(mock.Mock(name="file", spec=["name"]))

        self.assertEqual(result["status"], "error")
        self.assertIn("Unrecognized file structure", result["message"])

    def test_missing_required_columns_for_provisions(self):
        df = mock.MagicMock()
        df.copy.return_value = df
        with mock.patch("timetabling_system.utils.excel_parser.pd.read_excel", return_value=df), mock.patch(
            "timetabling_system.utils.excel_parser.prepare_exam_provision_df"
        ) as prep:
            prep.return_value = df
            with mock.patch(
                "timetabling_system.utils.excel_parser.detect_provision_file",
                return_value=True,
            ), mock.patch(
                "timetabling_system.utils.excel_parser.validate_required_columns",
                return_value=["student_id"],
            ):
                result = excel_parser.parse_excel_file(mock.Mock(name="file", spec=["name"]))

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["type"], "Provisions")
        self.assertIn("Missing required columns", result["message"])

    def test_fallback_to_venue_parser_on_read_error(self):
        fake_file = mock.Mock(name="file", spec=["name", "seek"])
        fake_file.seek = mock.Mock()
        with mock.patch("timetabling_system.utils.excel_parser.pd.read_excel", side_effect=Exception("boom")), mock.patch(
            "timetabling_system.utils.excel_parser.parse_venue_file", return_value={"status": "ok", "type": "Venue"}
        ) as venue_parse:
            result = excel_parser.parse_excel_file(fake_file)

        fake_file.seek.assert_called_once_with(0)
        venue_parse.assert_called_once()
        self.assertEqual(result["type"], "Venue")
