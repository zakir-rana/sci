-- ============================================================================
-- 008_rls.sql
-- RxPharma ERP — Supabase migration set (8 of 10)
-- Layer: ROW LEVEL SECURITY (enable + policies) + STORAGE + REALTIME (Phase 1)
-- ----------------------------------------------------------------------------
-- Runs AFTER 006 (every policy/storage rule calls app.* helpers, which must
-- already exist — this was the original RLS dependency coupling).
--
-- Fixes:
--   * `alter table ... enable row level security` is idempotent (no-op if on).
--   * Every policy is preceded by `drop policy if exists` (the requested DROP
--     POLICY guards) so the file is fully re-runnable.
--   * Storage object policies get the same drop guards.
--   * `alter publication ... add table` is wrapped in a membership check so it
--     no longer errors with "table is already member of publication" on re-run.
-- Policy logic, USING/WITH CHECK expressions and role lists preserved verbatim.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- ---- enable RLS on every core table ---------------------------------------
alter table public.users                    enable row level security;
alter table public.role_module_permissions  enable row level security;
alter table public.user_permissions         enable row level security;
alter table public.divisions                 enable row level security;
alter table public.regions                   enable row level security;
alter table public.areas                     enable row level security;
alter table public.territories               enable row level security;
alter table public.products                  enable row level security;
alter table public.parties                   enable row level security;
alter table public.invoices                  enable row level security;
alter table public.invoice_items             enable row level security;
alter table public.approvals                 enable row level security;
alter table public.targets                   enable row level security;
alter table public.dcrs                      enable row level security;
alter table public.expenses                  enable row level security;
alter table public.company_settings          enable row level security;
alter table public.audit_logs                enable row level security;

-- ---- USERS ----------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated using (true);
drop policy if exists users_no_direct_write on public.users;
create policy users_no_direct_write on public.users for all to authenticated
  using (false) with check (false);

-- ---- ROLE DEFAULTS (read-only reference) ----------------------------------
drop policy if exists rmp_select on public.role_module_permissions;
create policy rmp_select on public.role_module_permissions for select to authenticated using (true);

-- ---- USER PERMISSIONS -----------------------------------------------------
drop policy if exists uperm_select on public.user_permissions;
create policy uperm_select on public.user_permissions for select to authenticated
  using (user_id = app.current_user_id() or app.is_ceo());          -- own perms or CEO
drop policy if exists uperm_write on public.user_permissions;
create policy uperm_write on public.user_permissions for all to authenticated
  using (app.has_perm('settings','EDIT')) with check (app.has_perm('settings','EDIT'));

-- ---- GEOGRAPHY (reference data: readable by all; writable by CEO/ASM) ------
drop policy if exists geo_div_sel on public.divisions;
create policy geo_div_sel on public.divisions for select to authenticated using (true);
drop policy if exists geo_reg_sel on public.regions;
create policy geo_reg_sel on public.regions    for select to authenticated using (true);
drop policy if exists geo_area_sel on public.areas;
create policy geo_area_sel on public.areas      for select to authenticated using (true);
drop policy if exists geo_terr_sel on public.territories;
create policy geo_terr_sel on public.territories for select to authenticated using (true);

drop policy if exists geo_div_wr on public.divisions;
create policy geo_div_wr  on public.divisions  for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
drop policy if exists geo_reg_wr on public.regions;
create policy geo_reg_wr  on public.regions    for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
drop policy if exists geo_area_wr on public.areas;
create policy geo_area_wr on public.areas      for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));
drop policy if exists geo_terr_wr on public.territories;
create policy geo_terr_wr on public.territories for all to authenticated
  using (app.current_role() in ('CEO','ASM')) with check (app.current_role() in ('CEO','ASM'));

-- ---- PRODUCTS -------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (app.has_perm('products','VIEW'));
drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (app.has_perm('products','FULL')) with check (app.has_perm('products','FULL'));

-- ---- PARTIES (visibility = own MIO subtree; matches getVisibleParties) -----
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_mio_ids()) or mio_id = app.current_user_id());
drop policy if exists parties_insert on public.parties;
create policy parties_insert on public.parties for insert to authenticated
  with check (app.has_perm('parties','CREATE'));
drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties for update to authenticated
  using (app.has_perm('parties','EDIT') or (app.has_perm('parties','CREATE') and mio_id = app.current_user_id()))
  with check (app.has_perm('parties','CREATE'));
drop policy if exists parties_delete on public.parties;
create policy parties_delete on public.parties for delete to authenticated
  using (app.current_role() in ('CEO','ASM'));   -- + FK restrict blocks orphaning (#8)

-- ---- INVOICES (matches getVisibleInvoices) --------------------------------
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_mio_ids()) or mio_id = app.current_user_id());
drop policy if exists invoices_no_direct_write on public.invoices;
create policy invoices_no_direct_write on public.invoices for all to authenticated
  using (false) with check (false);

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (app.is_ceo() or i.mio_id in (select app.visible_mio_ids()) or i.mio_id = app.current_user_id())));
drop policy if exists invoice_items_no_direct_write on public.invoice_items;
create policy invoice_items_no_direct_write on public.invoice_items for all to authenticated
  using (false) with check (false);

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (app.is_ceo() or i.mio_id in (select app.visible_mio_ids()) or i.mio_id = app.current_user_id())));
drop policy if exists approvals_no_direct_write on public.approvals;
create policy approvals_no_direct_write on public.approvals for all to authenticated
  using (false) with check (false);

-- ---- TARGETS --------------------------------------------------------------
drop policy if exists targets_select on public.targets;
create policy targets_select on public.targets for select to authenticated
  using (app.is_ceo() or user_id in (select app.visible_user_ids()));
drop policy if exists targets_write on public.targets;
create policy targets_write on public.targets for all to authenticated
  using (app.has_perm('targets','EDIT')) with check (app.has_perm('targets','EDIT'));

-- ---- DCR ------------------------------------------------------------------
drop policy if exists dcrs_select on public.dcrs;
create policy dcrs_select on public.dcrs for select to authenticated
  using (app.is_ceo() or mio_id in (select app.visible_user_ids()) or mio_id = app.current_user_id());
drop policy if exists dcrs_insert on public.dcrs;
create policy dcrs_insert on public.dcrs for insert to authenticated
  with check (app.has_perm('dcr','CREATE') and (mio_id = app.current_user_id() or app.has_perm('dcr','EDIT')));
drop policy if exists dcrs_update on public.dcrs;
create policy dcrs_update on public.dcrs for update to authenticated
  using (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id())
  with check (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id());
drop policy if exists dcrs_delete on public.dcrs;
create policy dcrs_delete on public.dcrs for delete to authenticated
  using (app.has_perm('dcr','EDIT') or mio_id = app.current_user_id());

-- ---- EXPENSES (#19: approve/reject only via RPC) --------------------------
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (app.is_ceo() or submitted_by in (select app.visible_user_ids()) or submitted_by = app.current_user_id());
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.has_perm('expense','CREATE') and submitted_by = app.current_user_id());
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (submitted_by = app.current_user_id() and status = 'Pending')
  with check (submitted_by = app.current_user_id() and status = 'Pending');
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (submitted_by = app.current_user_id() and status = 'Pending');

-- ---- COMPANY SETTINGS -----------------------------------------------------
drop policy if exists company_select on public.company_settings;
create policy company_select on public.company_settings for select to authenticated using (true);
drop policy if exists company_write on public.company_settings;
create policy company_write on public.company_settings for all to authenticated
  using (app.has_perm('settings','EDIT')) with check (app.has_perm('settings','EDIT'));

-- ---- AUDIT LOGS (CEO read-only; inserts only via SECURITY DEFINER) --------
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (app.is_ceo());
drop policy if exists audit_no_client_write on public.audit_logs;
create policy audit_no_client_write on public.audit_logs for all to authenticated
  using (false) with check (false);


-- ============================================================================
-- G. STORAGE BUCKETS + OBJECT POLICIES
-- ============================================================================
insert into storage.buckets (id, name, public) values ('company-public','company-public', true)
  on conflict (id) do nothing;
drop policy if exists "company logo public read" on storage.objects;
create policy "company logo public read" on storage.objects for select
  using (bucket_id = 'company-public');
drop policy if exists "company logo CEO write" on storage.objects;
create policy "company logo CEO write" on storage.objects for all to authenticated
  using (bucket_id = 'company-public' and app.has_perm('settings','EDIT'))
  with check (bucket_id = 'company-public' and app.has_perm('settings','EDIT'));

insert into storage.buckets (id, name, public) values ('expense-receipts','expense-receipts', false)
  on conflict (id) do nothing;
-- (Path convention: {submitter_user_id}/{expense_id}.ext — policies keyed on the
--  first path segment; left as a documented convention for Phase 2.)


-- ============================================================================
-- H. REALTIME PUBLICATION  (RLS-filtered postgres_changes)
-- Guarded so re-running does not error on already-published tables.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['invoices','approvals','invoice_items','expenses','dcrs',
    'products','targets','parties','user_permissions','company_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
