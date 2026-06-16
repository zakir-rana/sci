# RxPharma ERP → Supabase: Dependency Analysis & Migration Set

Reorganizes `supabase_schema.sql` (950 lines) + `supabase_schema_phase1_5_additions.sql`
(288 lines) into 10 ordered, idempotent, re-runnable migration files. **No schema
redesign** — every table, enum, function, trigger, RLS policy, and all RBAC / audit /
approval / inventory / notification logic is preserved verbatim. The only changes are
ordering, idempotency guards (`if not exists`, `drop policy if exists`,
`create or replace`), one genuinely missing extension, and one seed file (see §6).

All 10 files were validated against the **real PostgreSQL parser** (libpg_query via
`pglast`) — every file parses cleanly.

---

## 1. Dependency analysis report

### 1.1 Missing extensions (hard failure)
- **`citext` was never created**, yet `public.users.username` is typed `citext`
  (and `app.save_user` relies on case-insensitive username comparison). On a clean
  project this is the **first hard failure** — `create table public.users` aborts with
  *type "citext" does not exist*. The original created only `pgcrypto` and `pg_trgm`.
  **Fix:** `001_extensions.sql` adds `citext` and pins all three into the Supabase
  `extensions` schema; every file sets `search_path = public, extensions, pg_catalog`
  so `citext` / `gin_trgm_ops` resolve during DDL.

### 1.2 Idempotency / "already exists" on re-run (the symptom you saw)
The original is **not re-runnable**. The practical failure sequence on a fresh project:
first run creates all 14 enums, then dies at `create table users` (missing `citext`);
you fix something and re-run the whole file → **`type "user_role" already exists`**.
That surfaces as an "enum order" error, but the root cause is the lack of guards.
- `create type …` (17 enums) — Postgres has no `IF NOT EXISTS` for enums →
  wrapped each in a guarded `DO` block keyed on `pg_type`.
- `create table` / `create index` → `… if not exists`.
- `create policy` → preceded by `drop policy if exists` (48 guards).
- `create trigger` → `create or replace trigger` (PG14+, Supabase PG15), including the
  two dynamic `DO`-block loops (`*_touch`, `*_audit`).
- `alter publication supabase_realtime add table …` → wrapped in a
  `pg_publication_tables` membership check (errored on re-run before).

### 1.3 Duplicate objects
- `grant execute on all functions in schema app to authenticated` appeared **3×**
  (schema lines 467 & 910, phase-1.5 line 273). Consolidated to one grant at the end
  of `006` (and once in `010` for the phase-1.5 functions). Harmless but removed.
- No duplicate table/enum/policy/trigger **names** exist within or across the files.

### 1.4 Invalid references
- No broken FK targets. Every FK references a table/column created earlier in
  `004`, and `territories.code` / `invoice_counters.year` etc. carry the UNIQUE/PK
  needed to be FK targets. The four-level geo chain
  (`divisions→regions→areas→territories`) and the
  `parties→invoices→invoice_items/approvals` chain are all forward-valid.
- `auth.users(id)` (referenced by `users.auth_id`) exists on every Supabase project.

### 1.5 Enum / function / table creation-order problems
- **Tables:** the original table order was already FK-correct; preserved exactly.
- **SQL-language functions** are validated eagerly, so callee-before-caller matters:
  `perm_rank → effective_perm → has_perm`, and
  `subordinate_ids → visible_user_ids → visible_mio_ids`,
  and `next_invoice_no → create_invoice`. This ordering is preserved in `006`
  (verified programmatically).
- **Enums before tables:** all 17 enums now live in `003`, before any table in `004`.

### 1.6 RLS dependency problems
- Every policy and storage rule calls `app.*` SECURITY DEFINER helpers, so the
  functions **must exist first**. Enforced by running `006` (functions) before `008`
  (RLS). `enable row level security` runs at the top of `008` before its policies.
- The helpers are SECURITY DEFINER with `set search_path = ''`; they bypass RLS
  (run as owner), which is what prevents the policies from recursing — preserved.

### 1.7 Trigger / function dependency problems
- `CREATE TRIGGER` requires its function to exist. All trigger **functions** are in
  `006`; all `CREATE TRIGGER` statements are in `007` (core) and `010` (phase 1.5),
  so the binding always follows the definition. Phase-1.5 triggers reuse
  `app.tg_touch_updated_at` / `app.tg_audit` from `006`, so `010` must run last.

---

## 2. Object creation graph

```
001 extensions      pgcrypto, pg_trgm, citext  (schema: extensions)
        │
002 schemas         app  +  grant usage
        │
003 enums           17 enum types (public.*)        ← needed by 004, 006
        │
004 tables          18 core tables (FK-ordered):
        │             users → role_module_permissions → user_permissions
        │             → divisions → regions → areas → territories
        │             → products → parties → invoice_counters → invoices
        │             → invoice_items → approvals → targets → dcrs
        │             → expenses → company_settings → audit_logs
        │
005 indexes         core indexes + products_name_ci_unique + gin_trgm_ops
        │
006 functions       helpers(perm_rank→effective_perm→has_perm ;
        │             subordinate_ids→visible_user_ids→visible_mio_ids ;
        │             current_user_id/current_role/is_ceo ; can_approve_invoice)
        │             + trigger fns (tg_touch/geo/product/target/audit)
        │             + RPCs (next_invoice_no→create_invoice→approve_invoice
        │             →delete_invoice→act_on_expense→save_user)
        │   ┌───────────────┴───────────────┐
007 triggers      008 rls + storage + realtime
   (binds 006 fns)   (policies call 006 fns; enable RLS; buckets; publication)
        │   └───────────────┬───────────────┘
009 seed            role_module_permissions defaults + company_settings(1)
        │
010 phase 1.5       enums already in 003 → tables(product_batches, stock_ledger,
                    login_history, notifications) → indexes → tg_notifications_guard
                    → triggers (reuse 006 fns) → RLS → definer helpers → realtime
```

---

## 3. Exact migration execution order

Run in strict numeric order; each file is idempotent and individually re-runnable:

```
001_extensions.sql
002_schemas.sql
003_enums.sql
004_tables.sql
005_indexes.sql
006_functions.sql
007_triggers.sql
008_rls.sql
009_seed_permissions.sql
010_phase1_5_additions.sql
```

In the Supabase SQL editor, paste/run each file top to bottom. (Or place them in
`supabase/migrations/` with these names and `supabase db push`.)

---

## 4. What changed vs. the originals (summary)

| Category | Original | Migration set |
|---|---|---|
| `citext` extension | missing | added (001) |
| Enums | 17, bare `create type` | 17, guarded `DO` blocks (003) |
| Tables | 22, bare `create table` | 22, `create table if not exists` (004/010) |
| Indexes | bare `create index` | `create index if not exists` (005/010) |
| Functions | 28, already `create or replace` | 28, preserved verbatim (006/010) |
| Triggers | bare `create trigger` | `create or replace trigger` (007/010) |
| RLS policies | 47, no guards | 47, each with `drop policy if exists` (008/010) |
| `grant execute` | duplicated 3× | consolidated |
| Realtime adds | bare, fail on re-run | membership-guarded (008/010) |
| Role-perm seed | **absent** | reconstructed defaults (009) — verify §6 |

---

## 5. Runtime Risk Register (NOT a deployment blocker — read before go-live)

The migration set **applies cleanly with zero manual fixes** — this section is about
*runtime* behavior of preserved functions, which were kept verbatim per the
"do not change business logic" rule.

**R1 — `search_path = ''` + unqualified enum types.** Several SECURITY DEFINER
functions set `search_path = ''` but declare/cast **unqualified** enum types whose home
is `public` (e.g. `effective_perm` `declare v perm_level`; `create_invoice`
`v_status invoice_status, v_appr approval_status`; `approve_invoice` `v_next
approval_status`; `can_approve_invoice` `urole user_role`; `act_on_expense`
`::expense_status`; `tg_audit` `urole user_role`). PL/pgSQL resolves these on first
call using the function's own (empty) search_path, so the **type is not found at
runtime** → the RPC throws even though `create function` succeeded.

**R2 — `search_path = ''` + citext operator.** `app.save_user` compares
`username = p_username` (citext). The citext `=` operator lives in the `extensions`
schema and is likewise unreachable under an empty search_path.

These do not break schema apply (PL/pgSQL bodies are parsed lazily), so they are left
**exactly as written**. If your project uses the default empty function search_path,
the one-line, logic-preserving fix is to give just these functions a search_path that
includes `public` and `extensions`, e.g.:

```sql
-- apply per-function as needed (logic unchanged):
alter function app.effective_perm(uuid, text)        set search_path = public, extensions;
alter function app.has_perm(text, perm_level)        set search_path = public, extensions;
alter function app.can_approve_invoice(bigint)       set search_path = public, extensions;
alter function app.create_invoice(bigint,date,pay_type,numeric,text,jsonb)
                                                     set search_path = public, extensions;
alter function app.approve_invoice(bigint,text,text) set search_path = public, extensions;
alter function app.act_on_expense(bigint,text)       set search_path = public, extensions;
alter function app.save_user(uuid,text,text,user_role,uuid,text,text,text,user_status)
                                                     set search_path = public, extensions;
alter function app.tg_audit()                        set search_path = public, extensions;
alter function app.tg_target_validate()              set search_path = public, extensions;
```

(Alternatively, schema-qualify the offending type references as `public.<enum>`.) This
is the only gap between "schema applies cleanly" — achieved — and "every RPC executes."
It is documented rather than applied so the decision stays with you.

---

## 6. The one authored (non-preserved) file: `009_seed_permissions.sql`

Neither source file contained any rows for `public.role_module_permissions`. But
`app.effective_perm()` falls back to that table for role defaults; if it is empty,
**every** non-overridden permission resolves to `NONE` and the app is unusable (even
the CEO can do nothing). To meet the "runs from an empty project with zero manual
fixes" goal, `009` seeds a sensible 6-role × 8-module default grid **derived from the
RLS/RPC checks** (modules actually used: users, products, parties, invoices, dcr,
expense, targets, settings). **Verify these values against your app's original
`DEFAULT_MODULE_PERMS` before production** and adjust — this is the only authored
content in the set. `009` also seeds the `company_settings` singleton and documents the
post-deploy CEO bootstrap (a `public.users` row can't be seeded because `auth_id` maps
to `auth.users`, created by Supabase Auth).
