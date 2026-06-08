# RxPharma Enterprise Management System — Phase 3.0 (Modular)

This is the **Phase 3.0 modularization** of the RxPharma single-file ERP. The single HTML file
(`pharma_management_system_v2_1.html`) has been split into a Vite ES-module project **with no
behavioural change**: the data source is still `localStorage`, and every workflow, approval rule,
permission check, invoice/stock calculation, and UI element is identical to the single-file build.

> **No Supabase, no auth change, no realtime, no IndexedDB, no offline queue** are introduced in this
> phase. Those are Phase 3.1–3.3. The architecture (schema/workflow/roles/approvals/UI) remains FROZEN.

## Run

```
npm install
npm run dev      # local dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

The app boots from `index.html` → `src/main.js`, which loads styles, publishes inline-handler
functions on `window`, and runs `src/app/bootstrap.js → boot()` (the original startup sequence).

## Structure (Phase 3.0 scope)

```
index.html              App shell (original <body> markup, unchanged; script + style externalized)
src/
  main.js               Entry: imports styles + all modules; exposes functions on window; boot()
  app/                  bootstrap.js (boot sequence), router.js (showPage), nav.js (buildNav)
  core/                 (reserved for Phase 3.1: supabase client, config, errorMap)
  store/                store.js (DB + loadDB/saveDB + integrity helpers), selectors.js (getVisible*)
  services/             auditService, authService, permissionService (logic unchanged)
  ui/components/         toast, modal, dropdowns
  ui/pages/             one module per screen (dashboard, products, parties, invoices, approvals,
                        sales, outstanding, targets, users, geography, settings, dcr, expense)
  utils/                esc, validate (V), format (taka/date), crypto, uid, constants
  styles/               app.css + fonts.css (extracted verbatim — no value changed)
migrations/             FROZEN reference SQL (not executed by the app)
docs/                   MIGRATION_MAP.md, VERIFICATION_CHECKLIST.md
```

## Guarantees held in this phase

- localStorage remains the data source; `DB`, `saveDB()`, `loadDB()` behave identically.
- No CSS value, HTML structure, business rule, or permission was modified.
- All 129 functions + state were relocated only; bodies are byte-identical to v2.1.
- Inline `onclick`/`onchange` handlers work unchanged (functions republished on `window`).

See `docs/MIGRATION_MAP.md` for where each function moved and
`docs/VERIFICATION_CHECKLIST.md` for the feature-parity proof.
