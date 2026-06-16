-- ============================================================================
-- 005_indexes.sql
-- RxPharma ERP — Supabase migration set (5 of 10)
-- Layer: INDEXES (core / Phase 1)  — Phase 1.5 indexes live in 010
-- ----------------------------------------------------------------------------
-- All core indexes, including:
--   * products_name_ci_unique  (was inline in the tables section originally)
--   * idx_invoices_pending      (partial index powering the approval queue)
--   * gin_trgm_ops indexes      (resolve via `extensions` on search_path)
-- Fixes: `create index if not exists` added throughout (idempotent).
-- All index definitions preserved verbatim.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- #15 case-insensitive unique product name (relocated from tables section)
create unique index if not exists products_name_ci_unique on public.products (lower(name));

-- FK columns are NOT auto-indexed in Postgres; index the ones used in joins/filters.
create index if not exists idx_users_reports_to        on public.users(reports_to);
create index if not exists idx_users_role              on public.users(role);
create index if not exists idx_users_auth_id           on public.users(auth_id);

create index if not exists idx_user_perms_user         on public.user_permissions(user_id);

create index if not exists idx_regions_division        on public.regions(division_id);
create index if not exists idx_areas_region            on public.areas(region_id);
create index if not exists idx_territories_area        on public.territories(area_id);
create index if not exists idx_territories_mio         on public.territories(mio_id);

create index if not exists idx_parties_mio             on public.parties(mio_id);
create index if not exists idx_parties_territory_code  on public.parties(territory_code);
create index if not exists idx_parties_name_trgm       on public.parties using gin (name gin_trgm_ops);

create index if not exists idx_products_name_trgm      on public.products using gin (name gin_trgm_ops);

create index if not exists idx_invoices_party          on public.invoices(party_id);
create index if not exists idx_invoices_mio            on public.invoices(mio_id);
create index if not exists idx_invoices_status         on public.invoices(approval_status);
create index if not exists idx_invoices_mio_date       on public.invoices(mio_id, invoice_date);  -- sales report
-- partial index powering the approval queue / pending badge:
create index if not exists idx_invoices_pending        on public.invoices(approval_status)
  where approval_status in ('Pending AM','Pending RSM','Pending ASM');

create index if not exists idx_invoice_items_invoice   on public.invoice_items(invoice_id);
create index if not exists idx_invoice_items_product   on public.invoice_items(product_id);

create index if not exists idx_approvals_invoice       on public.approvals(invoice_id);

create index if not exists idx_targets_user            on public.targets(user_id);

create index if not exists idx_dcrs_mio                on public.dcrs(mio_id);
create index if not exists idx_dcrs_date               on public.dcrs(dcr_date);

create index if not exists idx_expenses_submitted_by   on public.expenses(submitted_by);
create index if not exists idx_expenses_status         on public.expenses(status);

create index if not exists idx_audit_entity            on public.audit_logs(entity, entity_id);
create index if not exists idx_audit_ts                on public.audit_logs(ts desc);
create index if not exists idx_audit_user              on public.audit_logs(user_id);
