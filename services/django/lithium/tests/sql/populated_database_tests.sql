CREATE EXTENSION IF NOT EXISTS pgtap;
BEGIN;
SELECT plan (28);

-- Check tables aren't empty (6)
SELECT isnt_empty('SELECT * FROM exam');
SELECT isnt_empty('SELECT * FROM venue');
SELECT isnt_empty('SELECT * FROM student');
SELECT isnt_empty('SELECT * FROM examvenue');
SELECT isnt_empty('SELECT * FROM studentexam');
SELECT isnt_empty('SELECT * FROM provisions');

-- Check references are valid (6)
SELECT set_eq('SELECT DISTINCT exam_id FROM examvenue WHERE exam_id IS NOT NULL', 
        'SELECT exam_id FROM exam');
SELECT set_eq('SELECT DISTINCT venue_id FROM examvenue WHERE venue_id IS NOT NULL',
        'SELECT venue_name FROM venue');
SELECT set_eq('SELECT DISTINCT student_id FROM studentexam WHERE student_id IS NOT NULL',
        'SELECT student_id FROM student');
SELECT set_eq('SELECT DISTINCT exam_id FROM studentexam WHERE exam_id IS NOT NULL',
        'SELECT exam_id FROM exam');
SELECT set_eq('SELECT DISTINCT exam_id FROM provisions WHERE exam_id IS NOT NULL',
        'SELECT exam_id FROM exam');
SELECT set_eq('SELECT DISTINCT student_id FROM provisions WHERE student_id IS NOT NULL',
        'SELECT student_id FROM student');

-- Check primary keys are unique (6)
SELECT is_unique('exam', 'exam_id');
SELECT is_unique('venue', 'venue_name');
SELECT is_unique('student', 'student_id');
SELECT is_unique('examvenue', 'examvenue_id');
SELECT is_unique('studentexam', 'student_id, exam_id');
SELECT is_unique('provisions', 'provision_id');

-- Exam checks (2)
SELECT isnt_null('SELECT start_time FROM examvenue', 'ExamVenue.start_time is NOT NULL');
SELECT isnt_null('SELECT course_code FROM exam', 'Exam.course_code is NOT NULL');

-- Business Logic (8)
SELECT ok((SELECT COUNT(*) FROM examvenue WHERE exam_length <0) = 0, 'Exam length should not be negative');
SELECT ok((SELECT COUNT(*) FROM venue WHERE capacity <0) = 0, 'Venue capacity should not be negative');
SELECT ok((SELECT COUNT(*) FROM exam WHERE no_students <0) = 0, 'Exams should not contain a negative no of students');
SELECT ok((SELECT COUNT(*)
                FROM studentexam AS se1
                JOIN examvenue ev1 ON se1.exam_id = ev1.exam_id
                JOIN studentexam se2 ON se1.student_id = se2.student_id
                JOIN examvenue ev2 ON se2.exam_id = ev2.exam_id
                WHERE se1.exam_id < se2.exam_id
                        AND ev1.start_time IS NOT NULL
                        AND ev2.start_time IS NOT NULL
                        AND ev1.start_time < ev2.start_time + INTERVAL '1 minute' * COALESCE(ev2.exam_length, 0)
                        AND ev2.start_time < ev1.start_time + INTERVAL '1 minute' * COALESCE(ev1.exam_length, 0) )=0, 'Student has an exam clash'); 
SELECT ok((SELECT COUNT(*)
                FROM provisions p
                JOIN studentexam se ON p.student_id = se.student_id AND p.exam_id = se.exam_id
                JOIN examvenue ev ON se.exam_id = ev.exam_id
                JOIN venue v ON ev.venue_id = v.venue_name
                WHERE 'computer_needed' = ANY(p.provisions) AND v.venue_type !='computer_cluster')=0, 'Students requiring a computer should be in a computer cluster');
--SELECT ok ((SELECT COUNT(*)
--                FROM student s
--                JOIN provisions p ON p.student_id = s.student_id
--                JOIN studentexam se ON s.student_id=se.student_id
--                JOIN examvenue ev ON se.exam_id = ex.exam_id
--                JOIN venue v ON ev.venue_id=v.venue_id
--                WHERE 'accessible_hall' = ANY(p.provisions) AND v.is_accessible = FALSE)=0, 'Students requiring an accesssible hall should be in an accessible hall');
SELECT ok((SELECT COUNT(*) FROM exam e
                LEFT JOIN examvenue ev ON e.exam_id=ev.exam_id
                WHERE ev.exam_id IS NULL)=0, 'Every exam should be assigned to at least one venue');
SELECT ok((SELECT COUNT(*)-COUNT(DISTINCT (student_id, exam_id))FROM provisions)=0, 'Students sould not have multiple provision arrays for one exam');



SELECT * FROM finish();
ROLLBACK;
