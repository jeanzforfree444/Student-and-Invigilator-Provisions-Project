import pandas as pd
from sqlalchemy import create_engine, text
from pathlib import Path

# -------------------------------------------
# DATABASE CONNECTION
# -------------------------------------------
DB_URL = "postgresql://postgres:mysecretpassword@localhost:5432/exam_db"
engine = create_engine(DB_URL)

# -------------------------------------------
# FILE PATHS
# -------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
EXCEL_DIR = BASE_DIR / "excel_files"

# -------------------------------------------
# FILE-TO-TABLE MAPPINGS
# -------------------------------------------
FILES = {
    "august_resit_timetable.xlsx": {
        "Exam": {
            "Exam code": "course_code",
            "Exam name": "exam_name",
            "Online/On Campus/Digital On Campus Exam": "exam_type",
            "School": "exam_school",
            "Exam date": "date_exam",
            "Exam Start": "start_time",
            "Exam Duration (Hours:Minutes) ": "exam_length",
            "Exam Size": "no_students"
        },
        "Venue": {
            "2 Assessment Type (Online Exams/Venue (On Campus Exams)": "venue_name"
        }
    },
    "exam_provision_report.xlsx": {
        "Exam": {
            "School": "exam_school"
        },
        "Student": {
            "Mock IDs": "student_id",
            "Names": "student_name"
        },
        "Provisions": {
            "Exam Code": "exam_id",
            "Mock IDs": "student_id",
            "Registry": "provisions",
            "Additional Information": "notes"
        }
    }
}

# -------------------------------------------
# HELPER FUNCTIONS
# -------------------------------------------
def clean_columns(df: pd.DataFrame):
    df.columns = (
        df.columns.str.strip()
        .str.lower()
        .str.replace(" ", "_")
        .str.replace("-", "_")
    )
    return df


def load_excel(file_path: Path):
    df = pd.read_excel(file_path)
    return clean_columns(df)


def insert_data(df, table_name, conn):
    if df.empty:
        print(f"⚠️  No data to insert for table {table_name}")
        return

    cols = ", ".join(df.columns)
    placeholders = ", ".join([f":{col}" for col in df.columns])
    sql = text(
        f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;"
    )

    count = 0
    for _, row in df.iterrows():
        conn.execute(sql, row.to_dict())
        count += 1
    print(f"✅ Inserted {count} rows into {table_name}")


# -------------------------------------------
# MAIN FUNCTION
# -------------------------------------------
def main():
    with engine.begin() as conn:
        for file_name, tables in FILES.items():
            path = EXCEL_DIR / file_name
            if not path.exists():
                print(f"⚠️ File not found: {file_name}")
                continue

            print(f"\n📥 Loading data from {file_name} ...")
            df = load_excel(path)

            for table_name, columns_map in tables.items():
                renamed_df = df.rename(
                    columns={
                        k.lower(): v
                        for k, v in columns_map.items()
                        if k.lower() in df.columns
                    }
                )

                relevant_cols = list(columns_map.values())
                subset = renamed_df[[c for c in renamed_df.columns if c in relevant_cols]]
                subset = subset.drop_duplicates().dropna(how="all")

                print(f"   ↳ Found {len(subset)} rows for {table_name}")
                insert_data(subset, table_name.lower(), conn)


if __name__ == "__main__":
    main()
