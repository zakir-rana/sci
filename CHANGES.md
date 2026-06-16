# RxPharma — Stability & Cleanup Pass

Scope: **stability + bug fix + cleanup only.** No architecture rewrite, no UI redesign,
no framework changes, no new features. The localStorage `authService`, the window-based
inline-handler system, the router, the store, and all UI/business logic are **unchanged**.

## 1. Build-failure fix (root cause)

`npm run build` failed with:

```
[vite]: Rollup failed to resolve import "@supabase/supabase-js" from "src/lib/supabaseClient.js"
```

Cause: `src/main.js` pulled in dead Supabase scaffolding that imports the
`@supabase/supabase-js` package, which is not a dependency and is not installed.
- A **static** (eager, uncatchable) import of `services/authBridge.js` → `lib/supabaseClient.js`.
- A deferred `import('./services/supabaseAuthBridge.js')` → `lib/supabaseClient.js`.

Both chains reach the missing package, so Rollup aborts the build.

### Modified file
- **`src/main.js`** — removed exactly two things:
  1. `import { initAuthBridgeSafe } from './services/authBridge.js';` (imported, never called)
  2. the `setTimeout(() => import('./services/supabaseAuthBridge.js')…)` block

  Everything else in `main.js` is byte-for-byte the same, including the
  `m0..m28` loop that republishes every exported function onto `window`.

## 2. Dead-code removal (safe — verified zero live importers)

These modules formed a disconnected Supabase/auth limb. None are republished on `window`,
none are referenced by `index.html` inline handlers, and after the `main.js` edit none are
imported anywhere in `src/`. `window.__USER__` (the only thing the live bridge set) was read
by nothing in the running app.

### Deleted files
- `src/services/authBridge.js`         (only main.js imported it; now removed)
- `src/services/supabaseAuthBridge.js` (only main.js imported it; now removed)
- `src/services/authCore.js`           (zero importers)
- `src/services/roleService.js`        (see §3 — security)
- `src/lib/supabaseClient.js`          (imported the missing package)
- `src/auth/auth.js`                   (zero importers)
- `src/auth/authState.js`              (zero importers)
- `src/app/authGuard.js`               (zero importers; only consumer of roleService)
- `src/services/New Text Document.txt` (empty junk file)

### Removed empty directories
- `src/lib/`
- `src/auth/`

## 3. Security bug fix (minimal — no RBAC redesign)

`src/services/roleService.js` assigned roles by **email substring**
(`email.includes('admin') → 'admin'`), which would let anyone self-assign privileges by
choosing their signup email. It was dead code (only `authGuard.js`, itself unused, referenced
it), and its role names (`admin/mio/doctor/user`) did not even match the real role model
(`CEO/ASM/RSM/AM/MIO/Warehouse`).

Fix: **deleted** `roleService.js` and `authGuard.js`. The vulnerable logic no longer exists.
The live authorization system — `permissionService.js` + `DEFAULT_MODULE_PERMS` in
`utils/constants.js` — is untouched and remains the single source of truth. (For a future
Phase 3.1, `migrations/supabase_schema.sql` already defines the correct server-side,
RLS-based role model.)

## 4. Verification

- `npm install` → succeeds (only dependency is `vite`).
- `npm run build` → **succeeds**: `dist/index.html` + hashed CSS/JS assets emitted.
- No references to `supabase`, `__USER__`, `roleService`, `authGuard`, `authBridge`,
  or `authCore` remain anywhere in `src/`.

## 5. Intentionally NOT touched (reported, not changed)

Per the "if uncertain, don't touch — report instead" rule:
- **`src/styles/app.css`** emits two esbuild warnings for `///` lines used as comments
  (`//` isn't valid CSS). Cosmetic only; does not affect the build output or rendering.
  Left as-is to avoid any stylesheet change.
- **`supabase confg.env` / `.env.example`** left in place. They are now orphaned config
  (no code reads them). Harmless. Note: Vite only auto-loads files literally named `.env*`,
  and the filename has a space; rename to `.env` if/when Supabase work resumes.
- **`migrations/` SQL and `docs/`** kept — reference material, not part of the build.
- **`README.md`** left unchanged; after this cleanup it again accurately describes a
  localStorage-only app (no Supabase code present).
- **No performance/offline-mode/memory changes** were made: those are feature/architecture
  work, which is explicitly out of scope for a stability pass.
