-- ============================================================================
-- 003_enums.sql
-- RxPharma ERP — Supabase migration set (3 of 10)
-- Layer: ENUM TYPES
-- ----------------------------------------------------------------------------
-- Combines the 14 enums from supabase_schema.sql with the 3 enums from
-- supabase_schema_phase1_5_additions.sql so the entire type layer is created
-- in one place, BEFORE any table references them (fixes the "enum referenced
-- before creation" / "type already exists on re-run" failure mode).
--
-- PostgreSQL `create type` has no IF NOT EXISTS; each is wrapped in a guarded
-- DO block, making this file fully idempotent. All values preserved verbatim.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

do $$
begin
  -- ---- from supabase_schema.sql ----
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('CEO','ASM','RSM','AM','MIO','Warehouse');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type public.user_status as enum ('Active','Inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'perm_level') then
    create type public.perm_level as enum ('NONE','VIEW','CREATE','EDIT','FULL');
  end if;

  if not exists (select 1 from pg_type where typname = 'party_type') then
    create type public.party_type as enum ('Pharmacy','Doctor','Chemist','Distributor','Hospital','Clinic','Institution');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type public.product_category as enum ('Tablet','Capsule','Syrup','Injection','Cream','Drop');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_unit') then
    create type public.product_unit as enum ('Strip','Box','Vial','Sachet','Bottle','Piece');
  end if;

  if not exists (select 1 from pg_type where typname = 'pay_type') then
    create type public.pay_type as enum ('Cash','Credit','Partial');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('Paid','Due','Partial');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('Draft','Pending AM','Pending RSM','Pending ASM','Approved','Rejected','Invoiced');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_action') then
    create type public.approval_action as enum ('submitted','approved','rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'expense_type') then
    create type public.expense_type as enum ('Travel','DA','Hotel','Food','Fuel','Mobile','Others');
  end if;

  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type public.expense_status as enum ('Pending','Approved','Rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'dcr_status') then
    create type public.dcr_status as enum ('Visited','No Meeting','Postponed');
  end if;

  if not exists (select 1 from pg_type where typname = 'geo_level') then
    create type public.geo_level as enum ('division','region','area','territory');
  end if;

  -- ---- from supabase_schema_phase1_5_additions.sql ----
  if not exists (select 1 from pg_type where typname = 'batch_status') then
    create type public.batch_status as enum ('Active','Expired','Exhausted');
  end if;

  if not exists (select 1 from pg_type where typname = 'stock_txn_type') then
    create type public.stock_txn_type as enum ('OPENING','PURCHASE','SALE','APPROVAL_SALE',
                                               'RETURN','ADJUSTMENT','DAMAGE','TRANSFER');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum ('APPROVAL_PENDING','APPROVAL_APPROVED','APPROVAL_REJECTED',
                                                  'EXPENSE_PENDING','EXPENSE_APPROVED','EXPENSE_REJECTED',
                                                  'TARGET_ASSIGNED','SYSTEM');
  end if;
end $$;
