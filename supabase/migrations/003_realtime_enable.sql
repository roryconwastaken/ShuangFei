-- ============================================================
-- ShuangFei — Migration 003: Enable Realtime
-- Run this third in the Supabase SQL editor
--
-- Enables Supabase Realtime WebSocket broadcasts on tables
-- that need live updates:
--   document_pages      → teacher sees student writing homework live
--   teacher_annotations → student sees teacher red ink appear live
--   whiteboard_shares   → students know when teacher shares/unshares
-- ============================================================

alter publication supabase_realtime add table public.document_pages;
alter publication supabase_realtime add table public.teacher_annotations;
alter publication supabase_realtime add table public.whiteboard_shares;
