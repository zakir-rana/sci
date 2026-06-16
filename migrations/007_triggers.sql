-- ============================================================================
-- 007_triggers.sql
-- RxPharma ERP — Supabase migration set (7 of 10)
-- Layer: TRIGGERS (core / Phase 1)  — Phase 1.5 triggers live in 010
-- ----------------------------------------------------------------------------
-- Binds the trigger FUNCTIONS defined in 006 to their tables. Split out so the
-- function->trigger dependency is unambiguous (006 before 007).
--
-- Fixes: every `create trigger` becomes `create or replace trigger` (PostgreSQL
-- 14+, available on Supabase PG15) so this file is fully idempotent — this is
-- the clean replacement for the original DO-block `create trigger` loops that
-- failed with "trigger already exists" on re-run. Trigger names, timing, events
-- and target tables are all preserved verbatim.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- ---- updated_at maintenance (every table that has the column) -------------
do $$ declare t text;
begin
  foreach t in array array['users','user_permissions','divisions','regions','areas','territories',
    'products','parties','invoices','targets','dcrs','expenses','company_settings'] loop
    execute format('create or replace trigger %I_touch before update on public.%I
      for each row execute function app.tg_touch_updated_at();', t, t);
  end loop;
end $$;

-- ---- global geo-code uniqueness (#15) -------------------------------------
create or replace trigger geo_code_div  before insert or update on public.divisions   for each row execute function app.tg_geo_code_global();
create or replace trigger geo_code_reg  before insert or update on public.regions     for each row execute function app.tg_geo_code_global();
create or replace trigger geo_code_area before insert or update on public.areas       for each row execute function app.tg_geo_code_global();
create or replace trigger geo_code_terr before insert or update on public.territories for each row execute function app.tg_geo_code_global();

-- ---- block territory delete when referenced (#9) --------------------------
create or replace trigger geo_terr_block_del before delete on public.territories for each row execute function app.tg_geo_block_delete();

-- ---- block product delete when referenced (#7) ----------------------------
create or replace trigger product_block_del before delete on public.products for each row execute function app.tg_product_block_delete();

-- ---- target validation (#14) ----------------------------------------------
create or replace trigger target_validate before insert or update on public.targets for each row execute function app.tg_target_validate();

-- ---- centralized audit writer (#13) ---------------------------------------
do $$ declare t text;
begin
  foreach t in array array['users','products','parties','invoices','approvals','targets',
    'dcrs','expenses','divisions','regions','areas','territories','user_permissions','company_settings'] loop
    execute format('create or replace trigger %I_audit after insert or update or delete on public.%I
      for each row execute function app.tg_audit();', t, t);
  end loop;
end $$;
