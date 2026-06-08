# Phase 3.0 — Feature Parity Verification Checklist

Goal: prove the modular Vite project behaves **100% identically** to the single-file
`pharma_management_system_v2_1.html`. Phase 3.0 is mechanical extraction only.

## A. Automated checks already performed during extraction

| Check | Method | Result |
|---|---|---|
| Logic unchanged | Functions moved by source span; only `export` prefixed; no body edited | PASS |
| All symbols resolve | Static scan: every cross-module symbol used is imported or local | PASS (0 missing) |
| No import reassignment | Scan for assignment to an imported binding (live-binding hazard) | PASS (0) |
| State ownership | Each mutable global (`DB`, `currentUser`, `salesFilterMode`, `editingInvoiceItems`, `currentGeoTab`, `_editingGeoType`, `_editingGeoId`, `_pendingLogo`) reassigned only in its owning module | PASS |
| Import paths valid | Every `from '…'` resolves to an existing file | PASS |
| ESM syntax | `node --check` on all 30 modules | PASS |
| Inline handlers covered | All 47 inline `onclick/onchange` identifiers map to a published function (3 remaining are browser built-ins: `print`, `click`, `getElementById`) | PASS |
| CSS verbatim | `app.css` + `fonts.css` byte-equal to original `<style>` (multi-family `@import` preserved) | PASS |
| Boot order preserved | `loadDB → backfillUids → migratePasswords → buildQuickRoles → listeners → overlay` | PASS |

## B. Manual runtime parity (run `npm run dev`, compare side-by-side with the single file)

Tick each; behaviour, layout, colors, and numbers must match exactly.

### Visual / shell
- [ ] Login screen renders identically (logo, fields, role quick-cards).
- [ ] After login, topbar, nav items, badges, fonts, colors identical.
- [ ] Mobile (≤768px): hamburger toggles the nav dropdown (fix #18) exactly as before.
- [ ] Modal open/close (overlay click + close button) works on every modal.

### Auth & RBAC (localStorage, unchanged)
- [ ] Login with each role (CEO/ASM/RSM/AM/MIO/Warehouse) using existing credentials.
- [ ] Nav items shown/hidden per role match the single-file app.
- [ ] `profileClick` opens Settings only where permitted.
- [ ] Logout returns to login and clears the password field.

### Products
- [ ] List renders with same columns/badges; View-only vs manage buttons per role.
- [ ] Add/edit/delete; duplicate-name block; orphan-delete block (product used in invoice).

### Parties
- [ ] List, due column, territory code/area display; edit gated by permission.
- [ ] Orphan-delete block (party with invoices); CEO/ASM-only delete.

### Invoices (the critical path)
- [ ] Cash invoice: stock validated, deducted, status Paid/Partial/Due; invoice number `INV-YYYY-NNN`.
- [ ] Credit/Partial: enters `Pending AM`; no stock deducted.
- [ ] Item add/remove, product select autofill, live total calc identical.
- [ ] View invoice modal (items, GP for CEO) identical; delete restores stock for Invoiced.

### Approvals
- [ ] Pending queue + badge count correct.
- [ ] Approve advances AM→RSM→ASM→Invoiced (stock deducted at final); reject sets Rejected.
- [ ] CEO/ASM can act on any pending stage; wrong-role denied.

### Sales / Outstanding
- [ ] Sales report filters (today/week/month/custom) and totals match; void invoices excluded.
- [ ] Outstanding totals exclude Rejected/Draft and match the single-file figures.

### Targets / Users / Geography / DCR / Expense / Settings
- [ ] Targets: set/edit/delete; one-per-user-per-month; achievement %.
- [ ] Users: create/edit with escalation guards; duplicate username block.
- [ ] Geography: 4-level CRUD; global code uniqueness; cascade-delete blocks.
- [ ] DCR: create/edit/delete with ownership rules.
- [ ] Expense: submit; approve/reject (not own; outranks); owner-only pending edit/delete.
- [ ] Settings: company info, logo upload/remove, permission editor — all CEO-gated.

### Persistence
- [ ] Reload the page → data persists from `localStorage` exactly as before.
- [ ] Audit entries still recorded in `DB.auditLog` on the same actions.

## C. Exit criteria for Phase 3.0
All of section A passing (done) **and** all of section B ticked against the frozen single-file app.
Only then proceed to Phase 3.1 (Supabase client + auth). The single file remains the rollback target.
