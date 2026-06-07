-- ============================================================================
-- RxPharma → Supabase — PHASE 1.5 INCREMENTAL ADDITIONS
-- Adds 4 future-ready enterprise tables. PURELY ADDITIVE.
--
-- Does NOT touch: products, invoices, invoice_items, approvals, the approval
-- workflow, the stock workflow, any existing table/column/FK/RLS policy, or any
-- legacy_id mapping. Apply AFTER supabase_schema.sql. Reuses existing helpers
-- (app.has_perm, app.is_ceo, app.current_user_id, app.visible_user_ids,
-- app.subordinate_ids, app.tg_touch_updated_at, app.tg_audit) verbatim.
--
-- Batch management is FUTURE-READY ONLY: tables exist and are validated, but
-- nothing here forces batch selection or alters how invoices/stock behave today.
-- ============================================================================


-- ====================== NEW ENUM TYPES =====================================
create type batch_status      as enum ('Active','Expired','Exhausted');
create type stock_txn_type    as enum ('OPENING','PURCHASE','SALE','APPROVAL_SALE',
                                        'RETURN','ADJUSTMENT','DAMAGE','TRANSFER');
create type notification_type as enum ('APPROVAL_PENDING','APPROVAL_APPROVED','APPROVAL_REJECTED',
                                        'EXPENSE_PENDING','EXPENSE_APPROVED','EXPENSE_REJECTED',
                                        'TARGET_ASSIGNED','SYSTEM');


-- ============================================================================
-- A. SCHEMA — 1) PRODUCT BATCHES   (future-ready; not wired into invoicing)
-- ============================================================================
create table public.product_batches (
  id          bigint generated always as identity primary key,
  uid         uuid not null unique default gen_random_uuid(),
  legacy_id   integer unique,                                   -- preserves migration convention
  product_id  bigint not null references public.products(id) on delete restrict,  -- B. FK; no orphan
  batch_no    text not null,
  mfg_date    date,
  expiry_date date,
  stock_qty   integer not null default 0,
  mrp         numeric(14,2) not null default 0,
  status      batch_status not null default 'Active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- D. constraints
  constraint product_batches_qty_nonneg  check (stock_qty >= 0),
  constraint product_batches_mrp_nonneg  check (mrp >= 0),
  constraint product_batches_date_order  check (expiry_date is null or mfg_date is null or expiry_date >= mfg_date),
  -- E. prevent duplicate batch_no per product
  constraint product_batches_no_unique   unique (product_id, batch_no)
);


-- ============================================================================
-- A. SCHEMA — 2) STOCK LEDGER   (append-only inventory audit trail)
-- ============================================================================
create table public.stock_ledger (
  id             bigint generated always as identity primary key,
  uid            uuid not null unique default gen_random_uuid(),
  product_id     bigint not null references public.products(id) on delete restrict,    -- B. FK
  txn_type       stock_txn_type not null,
  qty            integer not null,                              -- signed: +in / -out
  balance_after  integer not null,                              -- product stock AFTER this txn
  reference_type text,                                          -- polymorphic, e.g. 'invoice','batch'
  reference_id   text,                                          -- text (matches audit_logs.entity_id)
  notes          text,
  created_by     uuid references public.users(id) on delete set null,  -- B. FK
  created_at     timestamptz not null default now(),
  -- D. constraints
  constraint stock_ledger_qty_nonzero    check (qty <> 0),
  constraint stock_ledger_balance_nonneg check (balance_after >= 0)
);
-- Append-only by design: no updated_at; RLS below permits SELECT only, so no
-- client can forge or edit ledger rows. Rows are written exclusively by the
-- SECURITY DEFINER helper app.record_stock_txn() (Phase 2 wiring).


-- ============================================================================
-- A. SCHEMA — 3) LOGIN HISTORY   (auth audit; CEO reporting)
-- ============================================================================
create table public.login_history (
  id             bigint generated always as identity primary key,
  user_id        uuid references public.users(id) on delete set null,   -- nullable: failed login may not resolve a user
  login_at       timestamptz,
  logout_at      timestamptz,
  ip_address     inet,
  device_info    text,
  browser_info   text,
  success        boolean not null default true,
  failure_reason text,
  created_at     timestamptz not null default now(),
  -- D. constraint
  constraint login_history_failure_consistency
    check (success = true or failure_reason is not null)        -- a failed login must carry a reason
);


-- ============================================================================
-- A. SCHEMA — 4) NOTIFICATIONS   (realtime, per-user)
-- ============================================================================
create table public.notifications (
  id             bigint generated always as identity primary key,
  uid            uuid not null unique default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,  -- B. FK
  type           notification_type not null,
  title          text not null,
  message        text,
  reference_type text,
  reference_id   text,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  -- D. constraint: read_at present iff read
  constraint notifications_read_consistency
    check ((is_read = false and read_at is null) or (is_read = true and read_at is not null))
);


-- ============================================================================
-- C. INDEXES (FK + reporting + unread-count optimizations)
-- ============================================================================
-- product_batches
create index idx_product_batches_product  on public.product_batches(product_id);
create index idx_product_batches_expiry   on public.product_batches(expiry_date);            -- expiry reporting
create index idx_product_batches_active   on public.product_batches(product_id)
  where status = 'Active';                                                                   -- FEFO lookups

-- stock_ledger
create index idx_stock_ledger_product     on public.stock_ledger(product_id);
create index idx_stock_ledger_product_ts  on public.stock_ledger(product_id, created_at);    -- balance reconstruction
create index idx_stock_ledger_ref         on public.stock_ledger(reference_type, reference_id);
create index idx_stock_ledger_created_by  on public.stock_ledger(created_by);
create index idx_stock_ledger_created_at  on public.stock_ledger(created_at desc);
create index idx_stock_ledger_txn_type    on public.stock_ledger(txn_type);

-- login_history
create index idx_login_history_user       on public.login_history(user_id);
create index idx_login_history_user_time  on public.login_history(user_id, login_at desc);
create index idx_login_history_login_at   on public.login_history(login_at desc);            -- CEO reporting
create index idx_login_history_failures   on public.login_history(login_at desc)
  where success = false;                                                                     -- failed-login monitoring

-- notifications
create index idx_notifications_user       on public.notifications(user_id);
create index idx_notifications_unread     on public.notifications(user_id)
  where is_read = false;                                                                     -- fast unread badge count
create index idx_notifications_user_time  on public.notifications(user_id, created_at desc);


-- ============================================================================
-- updated_at + audit triggers (reusing existing helper functions)
-- ============================================================================
-- Only product_batches has updated_at:
create trigger product_batches_touch before update on public.product_batches
  for each row execute function app.tg_touch_updated_at();

-- Audit only the config-style table (CEO traceability). Ledger/login/notifications
-- are themselves operational logs and are intentionally NOT double-audited.
create trigger product_batches_audit after insert or update or delete on public.product_batches
  for each row execute function app.tg_audit();

-- Notifications guard: users may flip read state only; never edit content/type.
create or replace function app.tg_notifications_guard()
returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id or new.type <> old.type or new.title <> old.title
     or coalesce(new.message,'') <> coalesce(old.message,'')
     or coalesce(new.reference_type,'') <> coalesce(old.reference_type,'')
     or coalesce(new.reference_id,'') <> coalesce(old.reference_id,'') then
    raise exception 'Only read-state may be updated on a notification';
  end if;
  if new.is_read = true and new.read_at is null then new.read_at := now(); end if;
  if new.is_read = false then new.read_at := null; end if;
  return new;
end; $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function app.tg_notifications_guard();


-- ============================================================================
-- E. ROW LEVEL SECURITY  (RLS denies by default once enabled; we add only the
--    permissive policies needed — writes with no policy are blocked)
-- ============================================================================
alter table public.product_batches enable row level security;
alter table public.stock_ledger    enable row level security;
alter table public.login_history   enable row level security;
alter table public.notifications   enable row level security;

-- ---- product_batches: reference data, mirrors products policy --------------
create policy product_batches_select on public.product_batches for select to authenticated
  using (app.has_perm('products','VIEW'));
create policy product_batches_write on public.product_batches for all to authenticated
  using (app.has_perm('products','FULL')) with check (app.has_perm('products','FULL'));

-- ---- stock_ledger: read for inventory managers (products EDIT+) / CEO; -----
--      NO client write policy => inserts/updates/deletes denied. Rows are
--      written only by app.record_stock_txn() (SECURITY DEFINER) in Phase 2.
create policy stock_ledger_select on public.stock_ledger for select to authenticated
  using (app.is_ceo() or app.has_perm('products','EDIT'));

-- ---- login_history: own rows + CEO; no client write policy (definer-only) --
create policy login_history_select on public.login_history for select to authenticated
  using (user_id = app.current_user_id() or app.is_ceo());

-- ---- notifications: own rows; may mark own as read; inserts are definer-only
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = app.current_user_id());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());
-- (no INSERT/DELETE policy => denied; created by app.notify() definer helper)


-- ============================================================================
-- SECURITY DEFINER HELPERS (DB-layer; inert until Phase 2 wires them)
-- ============================================================================
-- Append a stock-ledger row. CONTRACT: caller has already applied the stock
-- change to products.stock; this records the post-state balance. NOT attached
-- to any existing workflow yet (stock workflow unchanged).
create or replace function app.record_stock_txn(
  p_product bigint, p_txn stock_txn_type, p_qty integer,
  p_reference_type text default null, p_reference_id text default null, p_notes text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance integer; v_id bigint;
begin
  select stock into v_balance from public.products where id = p_product for update;
  if v_balance is null then raise exception 'Unknown product %', p_product; end if;
  insert into public.stock_ledger(product_id, txn_type, qty, balance_after,
      reference_type, reference_id, notes, created_by)
    values (p_product, p_txn, p_qty, v_balance, p_reference_type, p_reference_id, p_notes,
      app.current_user_id())
    returning id into v_id;
  return v_id;
end; $$;

-- Create a notification (system-generated). Used by Phase 2 hooks on approval/
-- expense/target events; clients cannot INSERT directly.
create or replace function app.notify(
  p_user uuid, p_type notification_type, p_title text, p_message text default null,
  p_reference_type text default null, p_reference_id text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.notifications(user_id, type, title, message, reference_type, reference_id)
    values (p_user, p_type, p_title, p_message, p_reference_type, p_reference_id)
    returning id into v_id;
  return v_id;
end; $$;

-- Mark one of the caller's notifications read (RLS update policy + guard apply).
create or replace function app.mark_notification_read(p_id bigint)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set is_read = true, read_at = now()
    where id = p_id and user_id = app.current_user_id();
$$;

-- Record a login attempt for the current session (success or failure).
create or replace function app.record_login(
  p_success boolean, p_failure_reason text default null,
  p_device text default null, p_browser text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.login_history(user_id, login_at, success, failure_reason, device_info, browser_info)
    values (app.current_user_id(), now(), p_success, p_failure_reason, p_device, p_browser)
    returning id into v_id;
  return v_id;
end; $$;

-- Stamp logout time on the caller's own session row.
create or replace function app.record_logout(p_id bigint)
returns void language sql security definer set search_path = '' as $$
  update public.login_history set logout_at = now()
    where id = p_id and user_id = app.current_user_id();
$$;

grant execute on all functions in schema app to authenticated;


-- ============================================================================
-- F. REALTIME INTEGRATION CHANGES
-- ============================================================================
-- Required: per-user notification stream (unread badge updates live).
alter publication supabase_realtime add table public.notifications;
-- Future warehouse dashboards (RLS-filtered; no effect on current UI):
alter publication supabase_realtime add table public.stock_ledger;
alter publication supabase_realtime add table public.product_batches;
-- login_history intentionally NOT published (no live UI need; CEO reads on demand).

-- ============================================================================
-- END PHASE 1.5 ADDITIONS
-- ============================================================================
