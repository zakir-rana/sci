# Phase 3.0 — Migration Map (function / state → module)

Single-file `pharma_management_system_v2_1.html` split into ES modules. **Logic is unchanged** — each top-level declaration only gained an `export` keyword and `import` lines; no statement inside any function body was edited. Mutable state lives in the module that reassigns it; every other module reads it via an ES live binding.

| Module file | Symbols moved here |
|---|---|
| `src/utils/constants.js` | `APPROVAL_STATUS`, `DEFAULT_MODULE_PERMS`, `PARTY_TYPES`, `PERM`, `ROLE_COLORS`, `ROLE_ORDER`, `TERRITORY_LIST` |
| `src/utils/esc.js` | `cleanInput`, `esc` |
| `src/utils/uid.js` | `genUid` |
| `src/utils/crypto.js` | `genSalt`, `hashPassword`, `sha256Hex`, `verifyPassword` |
| `src/utils/validate.js` | `V` |
| `src/utils/format.js` | `fmtDate`, `taka`, `thisMonth`, `today` |
| `src/store/store.js` | `DB`, `DEFAULT_DB`, `backfillUids`, `isVoidInvoice`, `loadDB`, `partyExists`, `productExists`, `realInvoices`, `saveDB`, `userExists`, `userHasRole` |
| `src/store/selectors.js` | `getMioIds`, `getSubordinateIds`, `getVisibleInvoices`, `getVisibleParties`, `getVisibleUserIds` |
| `src/services/auditService.js` | `logAudit` |
| `src/services/authService.js` | `currentUser`, `doLogin`, `doLogout`, `initApp`, `migratePasswords` |
| `src/services/permissionService.js` | `Auth`, `canManageProducts`, `getUserPerm`, `hasPerm` |
| `src/ui/components/toast.js` | `toast` |
| `src/ui/components/modal.js` | `closeModal`, `openModal` |
| `src/ui/components/dropdowns.js` | `populateDropdowns` |
| `src/app/nav.js` | `buildNav`, `buildQuickRoles`, `getPendingApprovalCount` |
| `src/app/router.js` | `profileClick`, `showPage` |
| `src/ui/pages/dashboard.js` | `_renderASMDashboard`, `_renderCEODashboard`, `_renderFieldDashboard`, `renderDashboard` |
| `src/ui/pages/products.js` | `deleteProduct`, `editProduct`, `openProductModal`, `renderProducts`, `saveProduct` |
| `src/ui/pages/parties.js` | `deleteParty`, `editParty`, `openPartyModal`, `partyTypeBadge`, `renderParties`, `saveParty` |
| `src/ui/pages/invoices.js` | `addInvoiceItem`, `calcInvoice`, `canApproveInvoice`, `canEditInvoice`, `checkStockAvailability`, `deleteInvoice`, `editingInvoiceItems`, `genInvoiceNo`, `getApprovalStatusBadgeClass`, `getNextApprovalStatus`, `onInvPartyChange`, `onInvPayTypeChange`, `onProductSelect`, `openInvoiceModal`, `removeInvoiceItem`, `renderInvoiceItems`, `renderInvoices`, `saveInvoice`, `updateApprovalQueueButton`, `viewInvoice` |
| `src/ui/pages/approvals.js` | `openApprovalModal`, `renderApprovalQueue`, `submitApprovalAction` |
| `src/ui/pages/sales.js` | `exportSalesReport`, `getDateRange`, `initSalesPage`, `renderSalesReport`, `salesFilterMode`, `setSalesFilter` |
| `src/ui/pages/outstanding.js` | `renderOutstanding` |
| `src/ui/pages/targets.js` | `deleteTarget`, `editTarget`, `getAggregatedTarget`, `getMioAchievement`, `openTargetModal`, `quickSetTarget`, `renderTargets`, `saveTarget` |
| `src/ui/pages/users.js` | `_populateUserTerritorySelect`, `canManageUser`, `deleteUser`, `editUser`, `openUserModal`, `renderUsers`, `saveUser`, `updateUserRoleOptions` |
| `src/ui/pages/geography.js` | `_editingGeoId`, `_editingGeoType`, `currentGeoTab`, `deleteGeoRecord`, `initGeoPage`, `openGeoModal`, `renderGeoHierarchySummary`, `renderGeoList`, `saveGeoRecord`, `switchGeoTab` |
| `src/ui/pages/settings.js` | `_pendingLogo`, `applyLogoToTopbar`, `handleLogoUpload`, `initSettingsPage`, `loadUserPermissions`, `removeLogo`, `resetUserPermissions`, `saveCompanyLogo`, `saveCompanySettings`, `saveUserPermissions` |
| `src/ui/pages/dcr.js` | `deleteDCR`, `editDCR`, `getVisibleDCRs`, `initDCRPage`, `openDCRModal`, `renderDCR`, `saveDCR` |
| `src/ui/pages/expense.js` | `_canActOnExpense`, `approveExpense`, `deleteExpense`, `getVisibleExpenses`, `initExpensePage`, `openExpenseModal`, `rejectExpense`, `renderExpenses`, `saveExpense` |

**Boot side-effects** (originally bare statements at the end of the `<script>`) were moved verbatim into `src/app/bootstrap.js → boot()`, order preserved:

`loadDB()` → `backfillUids()` → `migratePasswords()` → `buildQuickRoles()` → global listeners (login Enter key, mobile-menu toggle) → modal-overlay close listeners.

**Window exposure:** `src/main.js` imports every module and publishes all exported **functions** on `window`, so the unchanged inline `onclick`/`onchange` handlers in `index.html` resolve exactly as in the single-file build.

