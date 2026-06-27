-- ============================================================
-- ShuangFei — Migration 001: Initial Schema
-- Run this first in the Supabase SQL editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- Extends Supabase's built-in auth.users table.
-- Created automatically after a user signs up (via trigger below).
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null check (role in ('student', 'teacher')),
  class_code text unique,  -- teachers only: 6-char code students enter to join
  created_at timestamptz default now()
);

-- ============================================================
-- STUDENT_TEACHER
-- One teacher per student (enforced by UNIQUE on student_id).
-- To change teacher: delete old row and insert new one.
-- ============================================================
create table public.student_teacher (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid unique references public.profiles(id) on delete cascade,
  teacher_id uuid        references public.profiles(id) on delete cascade,
  joined_at  timestamptz default now()
);

-- ============================================================
-- DOCUMENTS
-- homework = shared to teacher | notes = student private | whiteboard = teacher only
-- title supports Unicode (Chinese characters OK)
-- ============================================================
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  type       text not null check (type in ('homework', 'notes', 'whiteboard')),
  page_count integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- DOCUMENT_PAGES
-- Stroke format: [{ id, tool, color, width, points: [{x,y,t}] }]
-- student_strokes: ONLY written by students, teachers cannot touch this column
-- ============================================================
create table public.document_pages (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  page_number     integer not null,
  student_strokes jsonb default '[]'::jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(document_id, page_number)
);

-- ============================================================
-- TEACHER_ANNOTATIONS
-- Red-ink stored separately from student_strokes.
-- Teachers can never modify student_strokes.
-- ============================================================
create table public.teacher_annotations (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.document_pages(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  strokes    jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(page_id, teacher_id)
);

-- ============================================================
-- WHITEBOARD_SHARES
-- Teacher toggles is_active to share/unshare with their class.
-- ============================================================
create table public.whiteboard_shares (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  is_active   boolean default true,
  shared_at   timestamptz default now()
);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on public.documents
  for each row execute procedure public.handle_updated_at();

create trigger document_pages_updated_at
  before update on public.document_pages
  for each row execute procedure public.handle_updated_at();

create trigger teacher_annotations_updated_at
  before update on public.teacher_annotations
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile after signup
-- App must pass { name, role } in supabase.auth.signUp({ options: { data: { name, role } } })
-- Teachers automatically get a random 6-char class code.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_class_code text;
begin
  if (new.raw_user_meta_data->>'role') = 'teacher' then
    v_class_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  insert into public.profiles (id, name, role, class_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Unknown'),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    v_class_code
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
