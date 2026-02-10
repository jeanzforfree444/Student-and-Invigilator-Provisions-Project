CREATE EXTENSION IF NOT EXISTS pgtap;
BEGIN;
SELECT plan (34);

-- Check tables exist
SELECT has_table('exam');
SELECT has_table('venue');
SELECT has_table('student');
SELECT has_table('examvenue');
SELECT has_table('studentexam');
SELECT has_table('provisions');

-- Check for primary keys, foreign keys, not null and important columns exist
SELECT col_is_pk('exam', 'exam_id');
SELECT col_not_null('exam', 'course_code');
SELECT has_column('exam', 'exam_type');
SELECT has_column('exam', 'no_students');
SELECT has_column('exam', 'exam_school');
SELECT has_column('exam', 'school_contact');

SELECT col_is_pk('venue', 'venue_name');
SELECT col_not_null('venue', 'capacity');
SELECT has_column('venue', 'venuetype');

SELECT col_is_pk('student', 'student_id');

SELECT col_is_pk('examvenue', 'examvenue_id');
SELECT fk_ok('examvenue', 'exam_id', 'exam', 'exam_id');
SELECT fk_ok('examvenue', 'venue_id', 'venue', 'venue_name');
SELECT has_column('examvenue', 'start_time');
SELECT has_column('examvenue', 'exam_length');

SELECT fk_ok('studentexam', 'student_id', 'student', 'student_id');
SELECT fk_ok('studentexam', 'exam_id', 'exam', 'exam_id');
SELECT fk_ok('studentexam', 'exam_venue_id', 'examvenue', 'examvenue_id');

SELECT col_is_pk('provisions', 'provision_id');
SELECT fk_ok('provisions', 'exam_id', 'exam', 'exam_id');
SELECT fk_ok('provisions', 'student_id', 'student', 'student_id');

-- Check column defaults
SELECT col_default_is('venue', 'is_accessible', 'true');

-- Check Column types, esp for enums and arrays
SELECT col_type_is('venue', 'venuetype', 'venue_type');
SELECT col_type_is('provisions', 'provisions', 'provision_type[]');

-- Ensure ENUM types exist and have values
SELECT has_type('provision_type');
SELECT has_type('venue_type');
SELECT enum_has_labels('provision_type', ARRAY['extra_time', 'computer_needed', 'reader', 'scribe']);
SELECT enum_has_labels('venue_type', ARRAY['main_hall', 'purple_cluster', 'computer_cluster', 'separate_room', 'school_to_sort']);

SELECT * FROM finish();
ROLLBACK;
