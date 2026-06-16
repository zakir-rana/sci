-- ============================================================================
-- 006_functions.sql
-- RxPharma ERP — Supabase migration set (6 of 10)
-- Layer: FUNCTIONS (RLS helpers + trigger functions + workflow RPCs)
-- ----------------------------------------------------------------------------
-- ALL functions are created here, BEFORE the triggers (007) that bind them and
-- BEFORE the RLS policies (008) that call them. This resolves the original
-- ordering coupling where SQL-language helpers (has_perm, visible_user_ids,
-- visible_mio_ids) must exist before their callers.
--
-- Ordering within this file (dependency-correct for SQL-language functions):
--   1. current_user_id, current_role, is_ceo
--   2. perm_rank -> effective_perm -> has_perm
--   3. subordinate_ids -> visible_user_ids -> visible_mio_ids
--   4. can_approve_invoice
--   5. trigger functions: tg_touch_updated_at, tg_geo_code_global,
--      tg_geo_block_delete, tg_product_block_delete, tg_target_validate, tg_audit
--   6. RPCs: next_invoice_no -> create_invoice -> approve_invoice ->
--      delete_invoice -> act_on_expense -> save_user
--
-- All bodies preserved verbatim. `create or replace` makes this idempotent.
--
-- PATCH: All enum type references inside the SECURITY DEFINER functions that use
-- `set search_path = ''` are now schema-qualified as public.<enum> (in signatures,
-- DECLARE blocks, and casts). This resolves runtime risk R1 — those functions
-- could not resolve unqualified enum types under an empty search_path at call
-- time. Business logic is unchanged; only type references were qualified.
-- (app.perm_rank is intentionally left as-is: it is `immutable`, not SECURITY
-- DEFINER, and sets no search_path, so it falls outside the patch scope and has
-- no runtime exposure.) The citext `=` operator in app.save_user (runtime risk
-- R2) is operator resolution, not a type reference, and is unaffected here.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- ---- 1. identity helpers ---------------------------------------------------
create or replace function app.current_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.users where auth_id = auth.uid();
$$;

create or replace function app.current_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.users where auth_id = auth.uid();
$$;

create or replace function app.is_ceo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'CEO' from public.users where auth_id = auth.uid()), false);
$$;

-- ---- 2. permission helpers -------------------------------------------------
create or replace function app.perm_rank(
  p public.perm_level
)
returns int
language sql
immutable
as $$
  select case p
    when 'NONE' then 0
    when 'VIEW' then 1
    when 'CREATE' then 2
    when 'EDIT' then 3
    when 'FULL' then 4
  end;
$$;

-- effective permission = per-user override else role default else NONE
create or replace function app.effective_perm(p_user uuid, p_module text)
returns public.perm_level language plpgsql stable security definer set search_path = '' as $$
declare v public.perm_level;
begin
  select permission into v from public.user_permissions
    where user_id = p_user and module = p_module;
  if found then return v; end if;
  select permission into v from public.role_module_permissions
    where role = (select role from public.users where id = p_user) and module = p_module;
  return coalesce(v, 'NONE');
end; $$;

create or replace function app.has_perm(p_module text, p_level public.perm_level)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.perm_rank(app.effective_perm(app.current_user_id(), p_module)) >= app.perm_rank(p_level);
$$;

-- ---- 3. hierarchy / visibility helpers ------------------------------------
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

-- ---- 4. approval authority -------------------------------------------------
-- canApproveInvoice(inv): stage matches role + invoice owner is subordinate;
-- CEO/ASM may act on any pending stage (preserves existing business rule).
create or replace function app.can_approve_invoice(p_invoice bigint)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare inv public.invoices; uid uuid; urole public.user_role; mgr uuid;
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

-- ============================================================================
-- 5. TRIGGER FUNCTIONS (bound to triggers in 007_triggers.sql)
-- ============================================================================

-- updated_at maintenance (attach to every table that has the column)
create or replace function app.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

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

-- Block product delete when referenced by invoice items (#7)
create or replace function app.tg_product_block_delete()
returns trigger language plpgsql as $$
declare c int;
begin
  select count(*) into c from public.invoice_items where product_id = old.id;
  if c > 0 then raise exception 'Cannot delete product %: used in % invoice item(s)', old.id, c; end if;
  return old;
end; $$;

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

-- Audit log writer (centralized — fix #13). Attached to mutating tables.
create or replace function app.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid; uname text; urole public.user_role; eid text;
begin
  uid := app.current_user_id();
  select name, role into uname, urole from public.users where id = uid;
  eid := coalesce((case when tg_op='DELETE' then (to_jsonb(old)->>'id') else (to_jsonb(new)->>'id') end), null);
  insert into public.audit_logs(user_id,user_name,role,action,entity,entity_id,meta)
  values (uid, coalesce(uname,'system'), urole, lower(tg_op), tg_table_name, eid,
          case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return null;
end; $$;

-- ============================================================================
-- 6. RPCs — server-authoritative transactional workflow (the trust boundary)
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
  p_party bigint, p_date date, p_pay_type public.pay_type, p_paid numeric,
  p_notes text, p_items jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid; v_total numeric := 0; it jsonb; v_id bigint;
  v_status public.invoice_status; v_appr public.approval_status; v_paid numeric; prod public.products;
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
declare inv public.invoices; it record; prod public.products; v_next public.approval_status;
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
    set status = (case when p_action='approve' then 'Approved' else 'Rejected' end)::public.expense_status,
        approved_by = uid
    where id = p_expense;
end; $$;

-- save_user (#2/#4): create/update with full escalation guards
create or replace function app.save_user(
  p_id uuid, p_name text, p_username text, p_role public.user_role,
  p_reports_to uuid, p_territory text, p_territory_code text,
  p_phone text, p_status public.user_status
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; existing public.users; expected public.user_role; new_id uuid;
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

-- Single consolidated grant (replaces the 2 duplicate grants in the original).
grant execute on all functions in schema app to authenticated;
