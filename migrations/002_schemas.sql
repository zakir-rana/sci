-- ============================================================================
-- 002_schemas.sql
-- RxPharma ERP — Supabase migration set (2 of 10)
-- Layer: SCHEMAS + base grants
-- ----------------------------------------------------------------------------
-- The private `app` schema holds SECURITY DEFINER helpers so RLS policies never
-- recurse. `grant usage` is moved here (was inline mid-file in the original).
-- Idempotent: create schema if not exists; grants are idempotent.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- Private schema for SECURITY DEFINER helpers so RLS policies never recurse.
create schema if not exists app;

grant usage on schema app to authenticated;
