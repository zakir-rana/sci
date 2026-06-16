-- ============================================================================
-- 009_seed_permissions.sql
-- RxPharma ERP — Supabase migration set (9 of 10)
-- Layer: SEED DATA (RBAC role defaults + company singleton)
-- ----------------------------------------------------------------------------
-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ IMPORTANT — RECONSTRUCTED CONTENT                                        │
-- │ Neither supabase_schema.sql nor the phase 1.5 file contained ANY seed    │
-- │ rows for public.role_module_permissions. But app.effective_perm() falls  │
-- │ back to this table for role defaults, and if it is empty EVERY non-      │
-- │ overridden permission resolves to 'NONE' — the app would be unusable     │
-- │ (even the CEO could not act). To meet the "zero manual fixes / runs from │
-- │ an empty project" goal, sensible defaults are seeded below, DERIVED from │
-- │ the RLS policies and RPC guards (the 8 modules the DB actually checks:    │
-- │ users, products, parties, invoices, dcr, expense, targets, settings).    │
-- │                                                                          │
-- │ >>> VERIFY these against your app's original DEFAULT_MODULE_PERMS and     │
-- │ >>> adjust before production. This is the only authored (non-preserved)  │
-- │ >>> content in the migration set.                                        │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- perm_level scale: NONE < VIEW < CREATE < EDIT < FULL
-- `on conflict do nothing` => re-running will NOT overwrite CEO-customized
-- defaults that already exist.
-- ============================================================================

set search_path = public, extensions, pg_catalog;

insert into public.role_module_permissions (role, module, permission) values
  -- CEO: full control everywhere
  ('CEO','users','FULL'),     ('CEO','products','FULL'), ('CEO','parties','FULL'),
  ('CEO','invoices','FULL'),  ('CEO','dcr','FULL'),      ('CEO','expense','FULL'),
  ('CEO','targets','FULL'),   ('CEO','settings','FULL'),

  -- ASM: manages RSM/AM/MIO, approves final stage, geo + settings authority
  ('ASM','users','EDIT'),     ('ASM','products','FULL'), ('ASM','parties','EDIT'),
  ('ASM','invoices','EDIT'),  ('ASM','dcr','EDIT'),      ('ASM','expense','EDIT'),
  ('ASM','targets','EDIT'),   ('ASM','settings','EDIT'),

  -- RSM: regional approvals + team management
  ('RSM','users','EDIT'),     ('RSM','products','VIEW'), ('RSM','parties','EDIT'),
  ('RSM','invoices','EDIT'),  ('RSM','dcr','EDIT'),      ('RSM','expense','EDIT'),
  ('RSM','targets','EDIT'),   ('RSM','settings','NONE'),

  -- AM: first-stage approver
  ('AM','users','VIEW'),      ('AM','products','VIEW'),  ('AM','parties','EDIT'),
  ('AM','invoices','EDIT'),   ('AM','dcr','EDIT'),       ('AM','expense','EDIT'),
  ('AM','targets','VIEW'),    ('AM','settings','NONE'),

  -- MIO: field rep — creates own parties / invoices / DCRs / expenses
  ('MIO','users','NONE'),     ('MIO','products','VIEW'), ('MIO','parties','CREATE'),
  ('MIO','invoices','CREATE'),('MIO','dcr','CREATE'),    ('MIO','expense','CREATE'),
  ('MIO','targets','NONE'),   ('MIO','settings','NONE'),

  -- Warehouse: inventory-focused
  ('Warehouse','users','NONE'),    ('Warehouse','products','FULL'), ('Warehouse','parties','NONE'),
  ('Warehouse','invoices','VIEW'), ('Warehouse','dcr','NONE'),      ('Warehouse','expense','NONE'),
  ('Warehouse','targets','NONE'),  ('Warehouse','settings','NONE')
on conflict (role, module) do nothing;

-- ---- company settings singleton (id is fixed at 1 by CHECK) ---------------
insert into public.company_settings (id) values (1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- NOTE on the primary CEO user (legacy_id = 1, referenced by app.save_user):
-- A users row cannot be safely seeded here because public.users.auth_id maps to
-- auth.users(id), which is created by Supabase Auth. Bootstrap the CEO after
-- deployment: create the auth user, then insert the matching public.users row
-- with legacy_id = 1 and role = 'CEO' (e.g. via the Supabase dashboard or a
-- one-off service-role script).
-- ----------------------------------------------------------------------------
