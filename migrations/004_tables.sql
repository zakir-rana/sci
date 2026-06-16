-- ============================================================================
-- 004_tables.sql
-- RxPharma ERP — Supabase migration set (4 of 10)
-- Layer: TABLES (core / Phase 1)  — Phase 1.5 tables live in 010
-- ----------------------------------------------------------------------------
-- All 18 core tables, in strict FK-dependency order (preserved from original,
-- which was already correct):
--   users -> role_module_permissions -> user_permissions ->
--   divisions -> regions -> areas -> territories -> products -> parties ->
--   invoice_counters -> invoices -> invoice_items -> approvals ->
--   targets -> dcrs -> expenses -> company_settings -> audit_logs
--
-- Fixes: `create table if not exists` added (idempotent). All columns, types,
-- defaults, CHECK constraints, UNIQUE constraints and FKs preserved verbatim.
-- The inline unique index products_name_ci_unique was moved to 005_indexes.sql.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- ====================== 2. USERS  (linked to Supabase Auth) ================
create table if not exists public.users (
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
create table if not exists public.role_module_permissions (
  role        user_role not null,
  module      text not null,
  permission  perm_level not null,
  primary key (role, module)
);

create table if not exists public.user_permissions (
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
create table if not exists public.divisions (
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

create table if not exists public.regions (
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

create table if not exists public.areas (
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

create table if not exists public.territories (
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

-- ====================== 5. PRODUCTS ========================================
create table if not exists public.products (
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

-- ====================== 6. PARTIES =========================================
create table if not exists public.parties (
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
create table if not exists public.invoice_counters (
  year      integer primary key,
  last_seq  integer not null default 0
);

create table if not exists public.invoices (
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

create table if not exists public.invoice_items (
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
create table if not exists public.approvals (
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
create table if not exists public.targets (
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
create table if not exists public.dcrs (
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
create table if not exists public.expenses (
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
create table if not exists public.company_settings (
  id          integer primary key default 1,
  name        text not null default 'RxPharma Bangladesh Ltd.',
  address     text,
  phone       text,
  logo_path   text,                                              -- G. storage object path (not base64)
  updated_at  timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1)          -- exactly one row
);

-- ====================== 12. AUDIT LOGS =====================================
create table if not exists public.audit_logs (
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
