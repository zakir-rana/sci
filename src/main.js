// src/main.js — entry. Imports styles, exposes inline-handler functions on window (HTML unchanged), boots.
import './styles/fonts.css';
import './styles/app.css';
import * as m0 from './app/nav.js';
import * as m1 from './app/router.js';
import * as m2 from './services/auditService.js';
import * as m3 from './services/authService.js';
import * as m4 from './services/permissionService.js';
import * as m5 from './store/selectors.js';
import * as m6 from './store/store.js';
import * as m7 from './ui/components/dropdowns.js';
import * as m8 from './ui/components/modal.js';
import * as m9 from './ui/components/toast.js';
import * as m10 from './ui/pages/approvals.js';
import * as m11 from './ui/pages/dashboard.js';
import * as m12 from './ui/pages/dcr.js';
import * as m13 from './ui/pages/expense.js';
import * as m14 from './ui/pages/geography.js';
import * as m15 from './ui/pages/invoices.js';
import * as m16 from './ui/pages/outstanding.js';
import * as m17 from './ui/pages/parties.js';
import * as m18 from './ui/pages/products.js';
import * as m19 from './ui/pages/sales.js';
import * as m20 from './ui/pages/settings.js';
import * as m21 from './ui/pages/targets.js';
import * as m22 from './ui/pages/users.js';
import * as m23 from './utils/constants.js';
import * as m24 from './utils/crypto.js';
import * as m25 from './utils/esc.js';
import * as m26 from './utils/format.js';
import * as m27 from './utils/uid.js';
import * as m28 from './utils/validate.js';
import { boot } from './app/bootstrap.js';

// Inline onclick/onchange handlers in index.html call these by bare name,
// so every exported function is published on window (HTML structure unchanged).
for (const ns of [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28]) {
  for (const k of Object.keys(ns)) {
    const v = ns[k];
    if (typeof v === 'function') window[k] = v;
  }
}

boot();

