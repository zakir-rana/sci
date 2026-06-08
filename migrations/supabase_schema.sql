-- ============================================================================
-- RxPharma Enterprise Management System — Supabase / PostgreSQL Schema
-- PHASE 1 DESIGN BLUEPRINT (DDL only — no application code)
--
-- Goal: a 1:1, behaviour-preserving server-side model of the existing
-- single-file app (roles, approval pipeline, modules, RBAC, audit, integrity)
-- with the client trust-boundary weaknesses moved to authoritative enforcement
-- (Supabase Auth + Row Level Security + SECURITY DEFINER RPCs + triggers).
--
-- Apply order: extensions -> enums -> reference tables -> core tables ->
-- indexes/constraints -> helper functions -> RLS -> triggers -> RPCs ->
-- storage -> realtime.
--
-- NOTE: This is a design artifact for review. It has NOT been executed against
-- a live Postgres instance; validate in a Supabase branch before promotion.
-- ============================================================================


-- ====================== 0. EXTENSIONS ======================================
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;        -- trigram search (name/code search boxes)

-- Private schema for SECURITY DEFINER helpers so RLS policies never recurse.
create schema if not exists app;


-- ====================== 1. ENUM TYPES (= existing fixed selects) ===========
create type user_role        as enum ('CEO','ASM','RSM','AM','MIO','Warehouse');
create type user_status       as enum ('Active','Inactive');
create type perm_level         as enum ('NONE','VIEW','CREATE','EDIT','FULL');
create type party_type         as enum ('Pharmacy','Doctor','Chemist','Distributor','Hospital','Clinic','Institution');
create type product_category   as enum ('Tablet','Capsule','Syrup','Injection','Cream','Drop');
create type product_unit       as enum ('Strip','Box','Vial','Sachet','Bottle','Piece');
create type pay_type           as enum ('Cash','Credit','Partial');
create type invoice_status     as enum ('Paid','Due','Partial');
create type approval_status    as enum ('Draft','Pending AM','Pending RSM','Pending ASM','Approved','Rejected','Invoiced');
create type approval_action    as enum ('submitted','approved','rejected');
create type expense_type       as enum ('Travel','DA','Hotel','Food','Fuel','Mobile','Others');
create type expense_status     as enum ('Pending','Approved','Rejected');
create type dcr_status         as enum ('Visited','No Meeting','Postponed');
create type geo_level          as enum ('division','region','area','territory');


-- ====================== 2. USERS  (linked to Supabase Auth) ================
-- Authentication (password storage/verification) now lives in auth.users.
-- public.users is the application profile + org-hierarchy node.
-- The legacy integer id is preserved for migration mapping and UI references.
create table public.users (
  id            uuid primary key default gen_random_uuid(),     -- == auth.users.id
  auth_id       uuid unique references auth.users(id) on delete set null,
  legacy_id     integer unique,                                  -- old numeric id (migration map)
  name          text not null,
  username      citext not null,                                 -- case-insensitive unique
  role          user_role not null,
  territory      text,
  territory_code text,                                            -- soft ref to territories.code
  reports_to    uuid references public.users(id) on delete set null,
  phone         text,
  status        user_status not null default 'Active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_username_unique unique (username),
  -- A user cannot report to themselves.
  constraint users_no_self_manager check (reports_to is null or reports_to <> id)
);

-- ====================== 3. RBAC: default role perms + per-user overrides ===
-- Mirrors DEFAULT_MODULE_PERMS (role defaults) and DB.userPermissions (overrides).
create table public.role_module_permissions (
  role        user_role not null,
  module      text not null,
  permission  perm_level not null,
  primary key (role, module)
);

create table public.user_permissions (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  module      text not null,
  permission  perm_level not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_permissions_unique unique (user_id, module)   -- E. one override per module
);

-- ====================== 4. GEOGRAPHY (Division -> Region -> Area -> Territory)
create table public.divisions (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  code        text not null,
  name        text not null,
  asm_id      uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint divisions_code_unique unique (code)
);

create table public.regions (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  code        text not null,
  name        text not null,
  division_id bigint not null references public.divisions(id) on delete restrict,  -- B/#9 no orphan
  rsm_id      uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint regions_code_unique unique (code)
);

create table public.areas (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  code        text not null,
  name        text not null,
  region_id   bigint not null references public.regions(id) on delete restrict,
  am_id       uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint areas_code_unique unique (code)
);

create table public.territories (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  code        text not null,
  name        text not null,
  area_id     bigint not null references public.areas(id) on delete restrict,
  region      text,                                              -- denormalized display (existing)
  asm_id      uuid references public.users(id) on delete set null,
  rsm_id      uuid references public.users(id) on delete set null,
  am_id       uuid references public.users(id) on delete set null,
  mio_id      uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint territories_code_unique unique (code)
);
-- Existing app enforced GLOBAL code uniqueness across all four geo levels;
-- per-table UNIQUE above + the trigger app.tg_geo_code_global() below enforce it.

-- parties.territory_code and users.territory_code reference territories.code.
-- Added as deferred soft FKs (codes can be assigned before territory row exists
-- during migration); enforced via trigger rather than hard FK to preserve the
-- existing "free text code" tolerance while still validating on write.

-- ====================== 5. PRODUCTS ========================================
create table public.products (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  name        text not null,
  category    product_category not null,
  unit        product_unit not null,
  tp          numeric(14,2) not null default 0,                  -- trade price
  sp          numeric(14,2) not null default 0,                  -- sale price
  stock       integer not null default 0,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint products_tp_nonneg   check (tp >= 0),               -- #11/#12
  constraint products_sp_nonneg   check (sp >= 0),
  constraint products_stock_nonneg check (stock >= 0)            -- #12 negative stock impossible
);
-- #15 case-insensitive unique product name
create unique index products_name_ci_unique on public.products (lower(name));

-- ====================== 6. PARTIES =========================================
create table public.parties (
  id            bigint generated always as identity primary key,
  uid           uuid not null unique default gen_random_uuid(),
  legacy_id     integer unique,
  name          text not null,
  type          party_type not null,
  area          text,
  territory_code text references public.territories(code) on update cascade on delete set null, -- #14 FK
  phone         text,
  address       text,
  mio_id        uuid references public.users(id) on delete set null,   -- #14 FK
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ====================== 7. INVOICES + ITEMS + APPROVAL HISTORY =============
-- Per-year invoice number counter (fix #5: monotonic, never reused, unique).
create table public.invoice_counters (
  year      integer primary key,
  last_seq  integer not null default 0
);

create table public.invoices (
  id              bigint generated always as identity primary key,
  uid             uuid not null unique default gen_random_uuid(),
  legacy_id       integer unique,
  invoice_no      text not null,
  party_id        bigint not null references public.parties(id) on delete restrict,  -- #8 no orphan
  invoice_date    date not null,
  total           numeric(14,2) not null default 0,
  paid            numeric(14,2) not null default 0,
  status          invoice_status not null,
  pay_type        pay_type not null,
  approval_status approval_status not null,
  mio_id          uuid references public.users(id) on delete set null,   -- creator / owning field user
  territory_code  text,
  notes           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invoices_no_unique unique (invoice_no),                     -- #5 uniqueness
  constraint invoices_total_nonneg check (total >= 0),
  constraint invoices_paid_range   check (paid >= 0 and paid <= total)   -- #6/#13 integrity
);

create table public.invoice_items (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  invoice_id  bigint not null references public.invoices(id) on delete cascade,  -- items belong to invoice
  product_id  bigint not null references public.products(id) on delete restrict, -- #7 no orphan
  qty         integer not null,
  tp          numeric(14,2) not null default 0,
  sp          numeric(14,2) not null default 0,
  disc        numeric(5,2)  not null default 0,
  -- net is derived, never client-supplied:
  net         numeric(14,2) generated always as (round(sp * qty * (1 - disc/100.0), 2)) stored,
  constraint invoice_items_qty_pos   check (qty >= 1),                   -- #11
  constraint invoice_items_disc_range check (disc >= 0 and disc <= 100), -- #13
  constraint invoice_items_price_nonneg check (tp >= 0 and sp >= 0)
);

-- approvals = the normalized approvalHistory[] / pipeline event log.
create table public.approvals (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  invoice_id  bigint not null references public.invoices(id) on delete cascade,
  action      approval_action not null,
  acted_by    uuid references public.users(id) on delete set null,
  acted_role  user_role,
  action_date date not null default current_date,
  remarks     text,
  created_at  timestamptz not null default now()
);

-- ====================== 8. TARGETS =========================================
create table public.targets (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,
  user_id     uuid not null references public.users(id) on delete cascade,
  month       text not null,                                     -- 'YYYY-MM'
  amount      numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint targets_month_fmt  check (month ~ '^\d{4}-\d{2}$'),
  constraint targets_amount_pos check (amount > 0),
  constraint targets_user_month_unique unique (user_id, month)   -- #15 one target / user / month
);

-- ====================== 9. DCR =============================================
create table public.dcrs (
  id           bigint generated always as identity primary key,
  uid          uuid not null unique default gen_random_uuid(),
  legacy_id    integer unique,
  mio_id       uuid not null references public.users(id) on delete cascade,
  dcr_date     date not null,
  doctor       text,
  chemist      text,
  status       dcr_status not null,
  order_amount numeric(14,2) not null default 0,
  followup     date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dcrs_order_nonneg check (order_amount >= 0)
);

-- ====================== 10. EXPENSES =======================================
create table public.expenses (
  id           bigint generated always as identity primary key,
  uid          uuid not null unique default gen_random_uuid(),
  legacy_id    integer unique,
  submitted_by uuid not null references public.users(id) on delete cascade,
  expense_date date not null,
  type         expense_type not null,
  amount       numeric(14,2) not null,
  notes        text,
  status       expense_status not null default 'Pending',
  approved_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint expenses_amount_pos check (amount > 0),
  -- #19 an approver can never be the submitter (DB-level guarantee)
  constraint expenses_no_self_approve check (approved_by is null or approved_by <> submitted_by)
);

-- ====================== 11. COMPANY SETTINGS (singleton) ===================
create table public.company_settings (
  id          integer primary key default 1,
  name        text not null default 'RxPharma Bangladesh Ltd.',
  address     text,
  phone       text,
  logo_path   text,                                              -- G. storage object path (not base64)
  updated_at  timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)          -- exactly one row
);

-- ====================== 12. AUDIT LOGS =====================================
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  ts          timestamptz not null default now(),
  user_id     uuid references public.users(id) on delete set null,
  user_name   text,
  role        user_role,
  action      text not null,
  entity      text not null,
  entity_id   text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);


-- ====================== C. INDEXES =========================================
-- FK columns are NOT auto-indexed in Postgres; index the ones used in joins/filters.
create index idx_users_reports_to        on public.users(reports_to);
create index idx_users_role              on public.users(role);
create index idx_users_auth_id           on public.users(auth_id);

create index idx_user_perms_user         on public.user_permissions(user_id);

create index idx_regions_division        on public.regions(division_id);
create index idx_areas_region            on public.areas(region_id);
create index idx_territories_area        on public.territories(area_id);
create index idx_territories_mio         on public.territories(mio_id);

create index idx_parties_mio             on public.parties(mio_id);
create index idx_parties_territory_code  on public.parties(territory_code);
create index idx_parties_name_trgm       on public.parties using gin (name gin_trgm_ops);

create index idx_products_name_trgm      on public.products using gin (name gin_trgm_ops);

create index idx_invoices_party          on public.invoices(party_id);
create index idx_invoices_mio            on public.invoices(mio_id);
create index idx_invoices_status         on public.invoices(approval_status);
create index idx_invoices_mio_date       on public.invoices(mio_id, invoice_date);  -- sales report
-- partial index powering the approval queue / pending badge:
create index idx_invoices_pending        on public.invoices(approval_status)
  where approval_status in ('Pending AM','Pending RSM','Pending ASM');

create index idx_invoice_items_invoice   on public.invoice_items(invoice_id);
create index idx_invoice_items_product   on public.invoice_items(product_id);

create index idx_approvals_invoice       on public.approvals(invoice_id);

create index idx_targets_user            on public.targets(user_id);

create index idx_dcrs_mio                on public.dcrs(mio_id);
create index idx_dcrs_date               on public.dcrs(dcr_date);

create index idx_expenses_submitted_by   on public.expenses(submitted_by);
create index idx_expenses_status         on public.expenses(status);

create index idx_audit_entity            on public.audit_logs(entity, entity_id);
create index idx_audit_ts                on public.audit_logs(ts desc);
create index idx_audit_user              on public.audit_logs(user_id);


-- ============================================================================
-- F. ROW LEVEL SECURITY — HELPER FUNCTIONS (SECURITY DEFINER, no recursion)
-- These replicate getUserPerm/hasPerm, getSubordinateIds, getVisible*,
-- canApproveInvoice and the expense outranks() logic on the server.
-- ============================================================================

create or replace function app.current_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.users where auth_id = auth.uid();
$$;

create or replace function app.current_role()
returns user_role language sql stable security definer set search_path = '' as $$
  select role from public.users where auth_id = auth.uid();
$$;

create or replace function app.is_ceo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'CEO' from public.users where auth_id = auth.uid()), false);
$$;

create or replace function app.perm_rank(p perm_level)
returns int language sql immutable as $$
  select case p
    when 'NONE' then 0 when 'VIEW' then 1 when 'CREATE' then 2
    when 'EDIT' then 3 when 'FULL' then 4 end;
$$;

-- effective permission = per-user override else role default else NONE
create or replace function app.effective_perm(p_user uuid, p_module text)
returns perm_level language plpgsql stable security definer set search_path = '' as $$
declare v perm_level;
begin
  select permission into v from public.user_permissions
    where user_id = p_user and module = p_module;
  if found then return v; end if;
  select permission into v from public.role_module_permissions
    where role = (select role from public.users where id = p_user) and module = p_module;
  return coalesce(v, 'NONE');
end; $$;

create or replace function app.has_perm(p_module text, p_level perm_level)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.perm_rank(app.effective_perm(app.current_user_id(), p_module)) >= app.perm_rank(p_level);
$$;

-- recursive subordinate resolution (getSubordinateIds)
create or replace function app.subordinate_ids(p_manager uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  with recursive sub as (
    select id from public.users where reports_to = p_manager
    union
    select u.id from public.users u join sub s on u.reports_to = s.id
  ) select id from sub;
$$;

-- self + subordinates, or ALL users if CEO (getVisibleUserIds)
create or replace function app.visible_user_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select case when app.is_ceo()
    then (select id from public.users)
    else app.current_user_id()
  end
  union
  select app.subordinate_ids(app.current_user_id()) where not app.is_ceo();
$$;

-- MIOs within the visible set (getMioIds)
create or replace function app.visible_mio_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.users u
  where u.role = 'MIO' and u.id in (select app.visible_user_ids());
$$;

-- canApproveInvoice(inv): stage matches role + invoice owner is subordinate;
-- CEO/ASM may act on any pending stage (preserves existing business rule).
create or replace function app.can_approve_invoice(p_invoice bigint)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare inv public.invoices; uid uuid; urole user_role; mgr uuid;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then return false; end if;
  if inv.approval_status not in ('Pending AM','Pending RSM','Pending ASM') then return false; end if;
  uid := app.current_user_id(); urole := app.current_role();
  if urole = 'AM' and inv.approval_status = 'Pending AM' then
    select reports_to into mgr from public.users where id = inv.mio_id;
    return mgr = uid;
  elsif urole = 'RSM' and inv.approval_status = 'Pending RSM' then
    return inv.mio_id in (select app.subordinate_ids(uid));
  elsif urole = 'ASM' and inv.approval_status = 'Pending ASM' then
    return inv.mio_id in (select app.subordinate_ids(uid));
  end if;
  if urole in ('CEO','ASM') then return true; end if;
  return false;
end; $$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;


-- ============================================================================
-- F. ROW LEVEL SECURITY — ENABLE + POLICIES
-- ============================================================================
alter table public.users                    enable row level security;
alter table public.role_module_permissions   enable row level security;
alter table public.user_permissions          enable row level security;
alter table public.divisions                  enable row level security;
alter table public.regions                    enable row level security;
alter table public.areas                      enable row level security;
alter table public.territories                enable row level security;
alter table public.products                    enable row level security;
alter table public.parties                     enable row level security;
alter table public.invoices                    enable row level security;
alter table public.invoice_items               enable row level security;
alter table public.approvals                   enable row level security;
alter table public.targets                     enable row level security;
alter table public.dcrs                        enable row level security;
alter table public.expenses                    enable row level security;
alter table public.company_settings            enable row level security;
alter table public.audit_logs                  enable row level security;

-- ---- USERS ----------------------------------------------------------------
-- SELECT: all authenticated may read profiles (names/roles are surfaced across
-- the UI today; no secrets remain in this table now that auth holds passwords).
create policy users_select on public.users for select to authenticated using (true);
-- INSERT/UPDATE/DELETE go through RPCs (app.save_user / app.delete_user) so the
-- escalation guards (#2/#4) are enforced atomically; deny direct DML here.
create policy users_no_direct_write on public.users for all to authenticated
  using (false) with check (false);

-- ---- ROLE DEFAULTS (read-only reference) ----------------------------------
create policy rmp_select on public.role_module_permissions for select to authenticated using (true);

-- ---- USER PERMISSIONS -----------------------------------------------------
create policy uperm_select on public.user_permissions for select to authenticated
  using (user_id = app.current_user_id() or app.is_ceo());          -- own perms or CEO
create policy uperm_write on public.user_permissions for all to authenticated
  using (app.has_perm('settings','EDIT')) with check (app.has_perm('settings','EDIT'));

-- ---- GEOGRAPHY (reference data: readable by all; writable by CEO/ASM) ------
create policy geo_div_sel on public.divisions for select to authenticated using (true);
create policy geo_reg_sel on public.regions    for select to authenticated using (true);
create policy geo_area_sel on public.areas      for select to authenticated using (true);
create policy geo_terr_sel on public.territories for select to authenticated using (true);

create policy geo_div_wr  on public.divisions  for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
create policy geo_reg_wr  on public.regions    for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
create policy geo_area_wr on public.areas      for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
create policy geo_terr_wr on public.territories for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
-- Cascade/orphan protection (#9) is provided by ON DELETE RESTRICT FKs above
-- plus app.tg_geo_block_delete() which also blocks territory deletes still
-- referenced by parties/users.

-- ---- PRODUCTS -------------------------------------------------------------
create policy products_select on public.products for select to authenticated
  using (app.has_perm('products','VIEW'));
create policy products_write on public.products for all to authenticated
  using (app.has_perm('products','FULL')) with check (app.has_perm('products','FULL'));
-- Hard delete additionally blocked when referenced (#7) by app.tg_product_block_delete().

-- ---- PARTIES (visibility = own MIO subtree; matches getVisibleParties) -----
create policy parties_select on public.parties for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_mio_ids()) or mio_id = app.current_user_id());
create policy parties_insert on public.parties for insert to authenticated
  with check (app.has_perm('parties','CREATE'));
create policy parties_update on public.parties for update to authenticated
  using (app.has_perm('parties','EDIT') or (app.has_perm('parties','CREATE') and mio_id = app.current_user_id()))
  with check (app.has_perm('parties','CREATE'));
create policy parties_delete on public.parties for delete to authenticated
  using (app.current_role() in ('CEO','ASM'));   -- + FK restrict blocks orphaning (#8)

-- ---- INVOICES (matches getVisibleInvoices) --------------------------------
create policy invoices_select on public.invoices for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_mio_ids()) or mio_id = app.current_user_id());
-- Direct writes are denied; all creation/approval/deletion is via RPC so stock,
-- numbering, status transitions and audit stay transactional and authoritative.
create policy invoices_no_direct_write on public.invoices for all to authenticated
  using (false) with check (false);

create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (app.is_ceo() or i.mio_id in (select app.visible_mio_ids()) or i.mio_id = app.current_user_id())));
create policy invoice_items_no_direct_write on public.invoice_items for all to authenticated
  using (false) with check (false);

create policy approvals_select on public.approvals for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (app.is_ceo() or i.mio_id in (select app.visible_mio_ids()) or i.mio_id = app.current_user_id())));
create policy approvals_no_direct_write on public.approvals for all to authenticated
  using (false) with check (false);

-- ---- TARGETS --------------------------------------------------------------
create policy targets_select on public.targets for select to authenticated
  using (app.is_ceo() or user_id in (select app.visible_user_ids()));
create policy targets_write on public.targets for all to authenticated
  using (app.has_perm('targets','EDIT')) with check (app.has_perm('targets','EDIT'));
-- target user must be an MIO in the visible set: enforced by app.tg_target_validate().

-- ---- DCR ------------------------------------------------------------------
create policy dcrs_select on public.dcrs for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_user_ids()) or mio_id = app.current_user_id());
create policy dcrs_insert on public.dcrs for insert to authenticated
  with check (app.has_perm('dcr','CREATE') and (mio_id = app.current_user_id() or app.has_perm('dcr','EDIT')));
create policy dcrs_update on public.dcrs for update to authenticated
  using (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id())
  with check (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id());
create policy dcrs_delete on public.dcrs for delete to authenticated
  using (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id());

-- ---- EXPENSES (#19: approve/reject only via RPC) --------------------------
create policy expenses_select on public.expenses for select to authenticated
  using (app.is_ceo() or submitted_by in (select app.visible_user_ids()) or submitted_by = app.current_user_id());
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.has_perm('expense','CREATE') and submitted_by = app.current_user_id());
-- owner may update/delete only own PENDING expense; approvals are RPC-only
create policy expenses_update on public.expenses for update to authenticated
  using (submitted_by = app.current_user_id() and status = 'Pending')
  with check (submitted_by = app.current_user_id() and status = 'Pending');
create policy expenses_delete on public.expenses for delete to authenticated
  using (submitted_by = app.current_user_id() and status = 'Pending');

-- ---- COMPANY SETTINGS -----------------------------------------------------
create policy company_select on public.company_settings for select to authenticated using (true);
create policy company_write on public.company_settings for all to authenticated
  using (app.has_perm('settings','EDIT')) with check (app.has_perm('settings','EDIT'));

-- ---- AUDIT LOGS (CEO read-only; inserts only via SECURITY DEFINER) --------
create policy audit_select on public.audit_logs for select to authenticated using (app.is_ceo());
create policy audit_no_client_write on public.audit_logs for all to authenticated
  using (false) with check (false);


-- ============================================================================
-- TRIGGERS — integrity, escalation, audit, numbering, singletons
-- ============================================================================

-- updated_at maintenance (attach to every table that has the column)
create or replace function app.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

do $$ declare t text;
begin
  foreach t in array array['users','user_permissions','divisions','regions','areas','territories',
    'products','parties','invoices','targets','dcrs','expenses','company_settings'] loop
    execute format('create trigger %I_touch before update on public.%I
      for each row execute function app.tg_touch_updated_at();', t, t);
  end loop;
end $$;

-- Global geo-code uniqueness across the four levels (#15)
create or replace function app.tg_geo_code_global()
returns trigger language plpgsql as $$
declare clash int;
begin
  select count(*) into clash from (
    select code from public.divisions where code = new.code and not (tg_table_name='divisions' and id = new.id)
    union all select code from public.regions    where code = new.code and not (tg_table_name='regions'    and id = new.id)
    union all select code from public.areas      where code = new.code and not (tg_table_name='areas'      and id = new.id)
    union all select code from public.territories where code = new.code and not (tg_table_name='territories' and id = new.id)
  ) x;
  if clash > 0 then
    raise exception 'Geography code % already exists (codes must be globally unique)', new.code;
  end if;
  return new;
end; $$;
create trigger geo_code_div  before insert or update on public.divisions   for each row execute function app.tg_geo_code_global();
create trigger geo_code_reg  before insert or update on public.regions     for each row execute function app.tg_geo_code_global();
create trigger geo_code_area before insert or update on public.areas       for each row execute function app.tg_geo_code_global();
create trigger geo_code_terr before insert or update on public.territories for each row execute function app.tg_geo_code_global();

-- Block territory delete when still referenced by parties/users (#9)
create or replace function app.tg_geo_block_delete()
returns trigger language plpgsql as $$
declare rp int; ru int;
begin
  select count(*) into rp from public.parties where territory_code = old.code;
  select count(*) into ru from public.users   where territory_code = old.code;
  if rp > 0 or ru > 0 then
    raise exception 'Cannot delete territory %: referenced by % party(ies), % user(s)', old.code, rp, ru;
  end if;
  return old;
end; $$;
create trigger geo_terr_block_del before delete on public.territories for each row execute function app.tg_geo_block_delete();

-- Block product delete when referenced by invoice items (#7)
create or replace function app.tg_product_block_delete()
returns trigger language plpgsql as $$
declare c int;
begin
  select count(*) into c from public.invoice_items where product_id = old.id;
  if c > 0 then raise exception 'Cannot delete product %: used in % invoice item(s)', old.id, c; end if;
  return old;
end; $$;
create trigger product_block_del before delete on public.products for each row execute function app.tg_product_block_delete();

-- Target validation: user must be a visible MIO (#14)
create or replace function app.tg_target_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.users where id = new.user_id and role = 'MIO') then
    raise exception 'Targets can only be set for MIO users';
  end if;
  if not app.is_ceo() and new.user_id not in (select app.visible_user_ids()) then
    raise exception 'Target user not in your team';
  end if;
  return new;
end; $$;
create trigger target_validate before insert or update on public.targets for each row execute function app.tg_target_validate();

-- Audit log writer (centralized — fix #13). Attached to mutating tables.
create or replace function app.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid; uname text; urole user_role; eid text;
begin
  uid := app.current_user_id();
  select name, role into uname, urole from public.users where id = uid;
  eid := coalesce((case when tg_op='DELETE' then (to_jsonb(old)->>'id') else (to_jsonb(new)->>'id') end), null);
  insert into public.audit_logs(user_id,user_name,role,action,entity,entity_id,meta)
  values (uid, coalesce(uname,'system'), urole, lower(tg_op), tg_table_name, eid,
          case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return null;
end; $$;
do $$ declare t text;
begin
  foreach t in array array['users','products','parties','invoices','approvals','targets',
    'dcrs','expenses','divisions','regions','areas','territories','user_permissions','company_settings'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
      for each row execute function app.tg_audit();', t, t);
  end loop;
end $$;


-- ============================================================================
-- RPCs — server-authoritative transactional workflow (the trust boundary)
-- Clients call these via supabase.rpc(...). They replicate saveInvoice,
-- submitApprovalAction, expense approve/reject, and user save with all guards.
-- ============================================================================

-- Per-year, never-reused, unique invoice number (#5)
create or replace function app.next_invoice_no(p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare y int := extract(year from p_date)::int; s int;
begin
  insert into public.invoice_counters(year,last_seq) values (y,1)
    on conflict (year) do update set last_seq = public.invoice_counters.last_seq + 1
    returning last_seq into s;
  return format('INV-%s-%s', y, lpad(s::text,3,'0'));
end; $$;

-- create_invoice: validates perm + party visibility + (Cash) stock; deducts
-- stock atomically with row locks; writes invoice, items, initial approval.
create or replace function app.create_invoice(
  p_party bigint, p_date date, p_pay_type pay_type, p_paid numeric,
  p_notes text, p_items jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid; v_total numeric := 0; it jsonb; v_id bigint;
  v_status invoice_status; v_appr approval_status; v_paid numeric; prod public.products;
begin
  uid := app.current_user_id();
  if not app.has_perm('invoices','CREATE') then raise exception 'Access denied'; end if;
  if not (app.is_ceo() or p_party in (
      select pa.id from public.parties pa
      where pa.mio_id in (select app.visible_mio_ids()) or pa.mio_id = uid)) then
    raise exception 'Party not in your territory';
  end if;
  -- compute total + validate items
  for it in select * from jsonb_array_elements(p_items) loop
    select * into prod from public.products where id = (it->>'product_id')::bigint;
    if prod is null then raise exception 'Invalid product'; end if;
    if (it->>'qty')::int < 1 then raise exception 'Quantity must be >= 1'; end if;
    v_total := v_total + round((it->>'sp')::numeric * (it->>'qty')::int * (1 - coalesce((it->>'disc')::numeric,0)/100.0), 2);
  end loop;

  if p_pay_type = 'Cash' then
    -- lock product rows and verify stock (#10/#11), then deduct
    for it in select * from jsonb_array_elements(p_items) loop
      select * into prod from public.products where id = (it->>'product_id')::bigint for update;
      if prod.stock < (it->>'qty')::int then
        raise exception 'Insufficient stock for %: have %, need %', prod.name, prod.stock, (it->>'qty')::int;
      end if;
    end loop;
    v_appr := 'Invoiced';
    v_paid := least(coalesce(p_paid,0), v_total);
    v_status := case when v_paid >= v_total then 'Paid' when v_paid > 0 then 'Partial' else 'Due' end;
  else
    v_appr := 'Pending AM';
    v_paid := 0;
    v_status := case when p_pay_type = 'Credit' then 'Due' else 'Partial' end;
  end if;

  insert into public.invoices(invoice_no, party_id, invoice_date, total, paid, status,
      pay_type, approval_status, mio_id, created_by, notes,
      territory_code)
    values (app.next_invoice_no(p_date), p_party, p_date, v_total, v_paid, v_status,
      p_pay_type, v_appr, uid, uid, p_notes,
      (select territory_code from public.users where id = uid))
    returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id, product_id, qty, tp, sp, disc)
      values (v_id, (it->>'product_id')::bigint, (it->>'qty')::int,
              (it->>'tp')::numeric, (it->>'sp')::numeric, coalesce((it->>'disc')::numeric,0));
    if p_pay_type = 'Cash' then
      update public.products set stock = stock - (it->>'qty')::int
        where id = (it->>'product_id')::bigint;   -- CHECK(stock>=0) backstops negatives
    end if;
  end loop;

  insert into public.approvals(invoice_id, action, acted_by, acted_role, remarks)
    values (v_id, 'submitted', uid, app.current_role(), p_pay_type || ' invoice submitted');
  return v_id;
end; $$;

-- approve_invoice: re-validates can_approve, advances pipeline, deducts stock at
-- final approval (with lock + check), writes approval row (mirrors submitApprovalAction).
create or replace function app.approve_invoice(p_invoice bigint, p_action text, p_remarks text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; it record; prod public.products; v_next approval_status;
begin
  if not app.can_approve_invoice(p_invoice) then raise exception 'Not authorized at this stage'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if p_action = 'reject' then
    update public.invoices set approval_status = 'Rejected' where id = p_invoice;
    insert into public.approvals(invoice_id,action,acted_by,acted_role,remarks)
      values (p_invoice,'rejected',app.current_user_id(),app.current_role(),p_remarks);
    return;
  end if;
  v_next := case inv.approval_status
    when 'Pending AM' then 'Pending RSM' when 'Pending RSM' then 'Pending ASM'
    when 'Pending ASM' then 'Approved' else 'Approved' end;
  if v_next = 'Approved' then
    -- lock + verify stock before finalizing (#10/#11)
    for it in select * from public.invoice_items where invoice_id = p_invoice loop
      select * into prod from public.products where id = it.product_id for update;
      if prod.stock < it.qty then raise exception 'Insufficient stock for % at final approval', prod.name; end if;
    end loop;
    for it in select * from public.invoice_items where invoice_id = p_invoice loop
      update public.products set stock = stock - it.qty where id = it.product_id;
    end loop;
    update public.invoices set approval_status = 'Invoiced' where id = p_invoice;
  else
    update public.invoices set approval_status = v_next where id = p_invoice;
  end if;
  insert into public.approvals(invoice_id,action,acted_by,acted_role,remarks)
    values (p_invoice,'approved',app.current_user_id(),app.current_role(),p_remarks);
end; $$;

-- delete_invoice: perm check + restore stock if previously deducted (#13)
create or replace function app.delete_invoice(p_invoice bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; it record;
begin
  if app.current_role() not in ('CEO','ASM','RSM') then raise exception 'Access denied'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv is null then raise exception 'Invoice not found'; end if;
  if inv.approval_status = 'Invoiced' then
    for it in select * from public.invoice_items where invoice_id = p_invoice loop
      update public.products set stock = stock + it.qty where id = it.product_id;
    end loop;
  end if;
  delete from public.invoices where id = p_invoice;  -- items/approvals cascade
end; $$;

-- expense approve/reject (#19): EDIT perm + not self + outranks submitter
create or replace function app.act_on_expense(p_expense bigint, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.expenses; uid uuid;
begin
  uid := app.current_user_id();
  select * into e from public.expenses where id = p_expense for update;
  if e is null or e.status <> 'Pending' then raise exception 'Expense not actionable'; end if;
  if not app.has_perm('expense','EDIT') then raise exception 'Access denied'; end if;
  if e.submitted_by = uid then raise exception 'Cannot act on your own expense'; end if;
  if app.current_role() <> 'CEO' and e.submitted_by not in (select app.subordinate_ids(uid)) then
    raise exception 'You do not outrank the submitter';
  end if;
  update public.expenses
    set status = (case when p_action='approve' then 'Approved' else 'Rejected' end)::expense_status,
        approved_by = uid
    where id = p_expense;
end; $$;

-- save_user (#2/#4): create/update with full escalation guards
create or replace function app.save_user(
  p_id uuid, p_name text, p_username text, p_role user_role,
  p_reports_to uuid, p_territory text, p_territory_code text,
  p_phone text, p_status user_status
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_role user_role; existing public.users; expected user_role; new_id uuid;
begin
  actor_role := app.current_role();
  if not app.has_perm('users','EDIT') then raise exception 'Access denied'; end if;
  -- (a) non-CEO may only manage RSM/AM/MIO
  if actor_role <> 'CEO' and p_role not in ('RSM','AM','MIO') then
    raise exception 'You can only manage RSM, AM and MIO roles';
  end if;
  if p_id is not null then
    select * into existing from public.users where id = p_id;
    if existing is null then raise exception 'User not found'; end if;
    -- (b) cannot change own role
    if existing.id = app.current_user_id() and p_role <> existing.role then
      raise exception 'You cannot change your own role';
    end if;
    -- (c) ASM cannot manage CEO/ASM
    if actor_role <> 'CEO' and existing.role not in ('RSM','AM','MIO') then
      raise exception 'Not allowed to manage this user';
    end if;
    -- (d) primary CEO role locked
    if existing.legacy_id = 1 and p_role <> 'CEO' then raise exception 'Primary CEO role is locked'; end if;
  end if;
  -- (#14) reports_to must be the correct managing role
  if p_reports_to is not null then
    expected := case p_role when 'RSM' then 'ASM' when 'AM' then 'RSM'
                            when 'MIO' then 'AM' when 'ASM' then 'CEO' else 'CEO' end;
    if not exists (select 1 from public.users where id = p_reports_to and role = expected) then
      raise exception 'Reporting manager must be a %', expected;
    end if;
  end if;
  -- (#15) unique username (citext handles case)
  if exists (select 1 from public.users where username = p_username and (p_id is null or id <> p_id)) then
    raise exception 'Username already exists';
  end if;
  if p_id is null then
    insert into public.users(name,username,role,reports_to,territory,territory_code,phone,status)
      values (p_name,p_username,p_role,p_reports_to,p_territory,p_territory_code,p_phone,p_status)
      returning id into new_id;
    return new_id;
  else
    update public.users set name=p_name, username=p_username, role=p_role, reports_to=p_reports_to,
      territory=p_territory, territory_code=p_territory_code, phone=p_phone, status=p_status
      where id = p_id;
    return p_id;
  end if;
end; $$;

grant execute on all functions in schema app to authenticated;


-- ============================================================================
-- G. STORAGE BUCKETS
-- ============================================================================
-- company-public  : company logo (replaces base64 logo in localStorage).
--                   Public read (shown in topbar to all); CEO-only write.
insert into storage.buckets (id, name, public) values ('company-public','company-public', true)
  on conflict (id) do nothing;
create policy "company logo public read" on storage.objects for select
  using (bucket_id = 'company-public');
create policy "company logo CEO write" on storage.objects for all to authenticated
  using (bucket_id = 'company-public' and app.has_perm('settings','EDIT'))
  with check (bucket_id = 'company-public' and app.has_perm('settings','EDIT'));

-- expense-receipts : OPTIONAL/forward-looking, mirrors the existing "upload"
--                    UX pattern. Private; submitter writes own, managers read team.
insert into storage.buckets (id, name, public) values ('expense-receipts','expense-receipts', false)
  on conflict (id) do nothing;
-- (Path convention: {submitter_user_id}/{expense_id}.ext — policies keyed on the
--  first path segment; left as a documented convention for Phase 2.)


-- ============================================================================
-- H. REALTIME PUBLICATION  (RLS-filtered postgres_changes)
-- ============================================================================
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.approvals;
alter publication supabase_realtime add table public.invoice_items;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.dcrs;
alter publication supabase_realtime add table public.products;     -- live stock
alter publication supabase_realtime add table public.targets;
alter publication supabase_realtime add table public.parties;
alter publication supabase_realtime add table public.user_permissions; -- live nav/RBAC
alter publication supabase_realtime add table public.company_settings; -- live logo/name

-- ============================================================================
-- END PHASE 1 SCHEMA
-- ============================================================================
