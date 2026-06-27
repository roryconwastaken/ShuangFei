-- ============================================================
-- ShuangFei — Seed Data (for local testing only)
-- ============================================================
-- Steps to use:
-- 1. Go to Supabase dashboard → Authentication → Users
-- 2. Create two test users manually:
--      teacher@test.com  (any password)
--      student@test.com  (any password)
-- 3. Note their UUIDs from the Users table
-- 4. Replace TEACHER_UUID and STUDENT_UUID below and run this SQL
-- ============================================================

-- After the signup trigger fires, profiles are created automatically.
-- This seed just sets up the student-teacher relationship.

-- Update teacher's name (the trigger sets it from metadata, but you can override here)
-- update public.profiles set name = 'Teacher Wang' where id = 'TEACHER_UUID';
-- update public.profiles set name = 'Test Student'  where id = 'STUDENT_UUID';

-- Link student to teacher (student enters teacher's class_code in the app normally)
-- insert into public.student_teacher (student_id, teacher_id)
-- values ('STUDENT_UUID', 'TEACHER_UUID');

-- Create a test homework document for the student
-- insert into public.documents (owner_id, title, type)
-- values ('STUDENT_UUID', '第一课作业', 'homework');
