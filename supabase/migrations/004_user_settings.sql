-- ============================================================
-- ShuangFei — Migration 004: User Settings
-- Run this fourth in the Supabase SQL editor
--
-- Adds a per-user settings row: pen size (S/M/L widths, must stay
-- ascending) and 5 pen-color swatches (teacher whiteboard only, but
-- the column exists for all users — students simply never read/write
-- it). Extends handle_new_user() so new signups get a default row,
-- and backfills existing users who signed up before this migration.
-- ============================================================

create table public.user_settings (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  pen_size_s   integer not null default 2,
  pen_size_m   integer not null default 4,
  pen_size_l   integer not null default 8,
  pen_colors   jsonb   not null default '["#1a1a1a", "#8B1A1A", "#2563eb", "#16a34a", "#f97316"]'::jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  constraint pen_size_ascending check (pen_size_s < pen_size_m and pen_size_m < pen_size_l),
  constraint pen_size_positive  check (pen_size_s > 0),
  constraint pen_colors_length  check (jsonb_array_length(pen_colors) = 5)
);

-- ============================================================
-- TRIGGER: auto-update updated_at (reuses the function from 001)
-- ============================================================
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.user_settings enable row level security;

create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "user_settings_insert_own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "user_settings_update_own"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Extend handle_new_user() (from 001) to also seed default settings
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

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

-- Trigger `on_auth_user_created` already points at this function (from
-- migration 001) — create or replace is sufficient, no need to recreate
-- the trigger itself.

-- ============================================================
-- Backfill: give every existing profile a default settings row
-- ============================================================
insert into public.user_settings (user_id)
select p.id
from public.profiles p
left join public.user_settings us on us.user_id = p.id
where us.user_id is null;
