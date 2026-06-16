-- ============================================================================
-- 001_extensions.sql
-- RxPharma ERP — Supabase migration set (1 of 10)
-- Layer: EXTENSIONS
-- ----------------------------------------------------------------------------
-- Fixes applied vs. original:
--   * ADDED missing `citext` extension (public.users.username is citext; the
--     original schema referenced the type but never created the extension —
--     this was the first hard failure on a clean project).
--   * Pinned all extensions into the Supabase-standard `extensions` schema.
--   * Every file in this set begins with an explicit search_path that includes
--     `extensions`, so citext / gin_trgm_ops / gen_random_uuid resolve during
--     DDL regardless of the project's default search_path.
-- Idempotent: safe to re-run (create extension if not exists).
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- gen_random_uuid() (core in PG13+, also provided here for compatibility)
create extension if not exists pgcrypto with schema extensions;

-- trigram search (name/code search boxes; powers gin_trgm_ops indexes)
create extension if not exists pg_trgm  with schema extensions;

-- case-insensitive text (public.users.username) — MISSING IN ORIGINAL
create extension if not exists citext   with schema extensions;
