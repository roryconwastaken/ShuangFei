-- ============================================================
-- ShuangFei — Migration 002: Row Level Security Policies
-- Run this second in the Supabase SQL editor
-- These rules enforce all access control at the database level.
-- No backend server needed for auth logic.
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles            enable row level security;
alter table public.student_teacher     enable row level security;
alter table public.documents           enable row level security;
alter table public.document_pages      enable row level security;
alter table public.teacher_annotations enable row level security;
alter table public.whiteboard_shares   enable row level security;

-- ============================================================
-- PROFILES
-- ============================================================

-- Anyone logged in can read any profile
-- (needed so students can look up a teacher by class_code)
create policy "profiles_select_all"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Users can only update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Users can insert their own profile (fired by the signup trigger)
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- STUDENT_TEACHER
-- ============================================================

-- Students can insert, update, and delete their own assignment
create policy "student_teacher_student_manage"
  on public.student_teacher for all
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- Teachers can view all their students
create policy "student_teacher_teacher_select"
  on public.student_teacher for select
  using (auth.uid() = teacher_id);

-- ============================================================
-- DOCUMENTS
-- ============================================================

-- Owners can do everything with their own documents
create policy "documents_owner_all"
  on public.documents for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Teachers can read homework from their students
create policy "documents_teacher_read_homework"
  on public.documents for select
  using (
    type = 'homework'
    and exists (
      select 1 from public.student_teacher
      where student_id = documents.owner_id
        and teacher_id = auth.uid()
    )
  );

-- Students can read whiteboards shared by their teacher
create policy "documents_student_read_whiteboard"
  on public.documents for select
  using (
    type = 'whiteboard'
    and exists (
      select 1 from public.whiteboard_shares ws
      join public.student_teacher st on st.teacher_id = ws.teacher_id
      where ws.document_id = documents.id
        and ws.is_active = true
        and st.student_id = auth.uid()
    )
  );

-- ============================================================
-- DOCUMENT_PAGES
-- ============================================================

-- Owners can do everything with their own pages
create policy "document_pages_owner_all"
  on public.document_pages for all
  using (
    exists (
      select 1 from public.documents
      where id = document_pages.document_id
        and owner_id = auth.uid()
    )
  );

-- Teachers can read pages of their students' homework
create policy "document_pages_teacher_select"
  on public.document_pages for select
  using (
    exists (
      select 1
      from public.documents d
      join public.student_teacher st on st.student_id = d.owner_id
      where d.id = document_pages.document_id
        and d.type = 'homework'
        and st.teacher_id = auth.uid()
    )
  );

-- Students can read pages of shared whiteboards
create policy "document_pages_student_whiteboard_select"
  on public.document_pages for select
  using (
    exists (
      select 1
      from public.documents d
      join public.whiteboard_shares ws on ws.document_id = d.id
      join public.student_teacher st on st.teacher_id = ws.teacher_id
      where d.id = document_pages.document_id
        and d.type = 'whiteboard'
        and ws.is_active = true
        and st.student_id = auth.uid()
    )
  );

-- ============================================================
-- TEACHER_ANNOTATIONS
-- ============================================================

-- Teachers can manage their own annotations
create policy "annotations_teacher_all"
  on public.teacher_annotations for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Students can read annotations on their own documents
create policy "annotations_student_select"
  on public.teacher_annotations for select
  using (
    exists (
      select 1
      from public.document_pages dp
      join public.documents d on d.id = dp.document_id
      where dp.id = teacher_annotations.page_id
        and d.owner_id = auth.uid()
    )
  );

-- ============================================================
-- WHITEBOARD_SHARES
-- ============================================================

-- Teachers manage their own shares
create policy "whiteboard_shares_teacher_all"
  on public.whiteboard_shares for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Students can view shares belonging to their teacher
create policy "whiteboard_shares_student_select"
  on public.whiteboard_shares for select
  using (
    exists (
      select 1 from public.student_teacher
      where student_id = auth.uid()
        and teacher_id = whiteboard_shares.teacher_id
    )
  );
