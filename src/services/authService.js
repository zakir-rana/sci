// services/authService.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { buildNav } from '../app/nav.js';
import { showPage } from '../app/router.js';
import { logAudit } from './auditService.js';
import { DB, saveDB } from '../store/store.js';
import { populateDropdowns } from '../ui/components/dropdowns.js';
import { toast } from '../ui/components/toast.js';
import { renderDashboard } from '../ui/pages/dashboard.js';
import { applyLogoToTopbar } from '../ui/pages/settings.js';
import { genSalt, hashPassword, verifyPassword } from '../utils/crypto.js';
import { cleanInput } from '../utils/esc.js';

export async function migratePasswords() {
  let changed = false;
  for (const u of DB.users) {
    if (u.password !== undefined && !u.passwordHash) {
      try {
        u.salt = genSalt();
        u.passwordHash = await hashPassword(u.password, u.salt);
        delete u.password;
        changed = true;
      } catch (e) { /* crypto unavailable (insecure context) — leave as-is */ }
    }
  }
  if (changed) saveDB();
}

/* ---- 13/14. REFERENTIAL-INTEGRITY HELPERS (FK-style validation) ---------- */

export let currentUser = null;

export async function doLogin() {
  const username = cleanInput(document.getElementById('loginUser').value, 60);
  const password = document.getElementById('loginPass').value;
  if (!username || !password) { toast('Enter username and password', 'error'); return; }
  // 1. Look up by username + active status ONLY; verify password via hash (fix #1)
  const user = DB.users.find(u => u.username === username && u.status === 'Active');
  let ok = false;
  if (user) {
    if (user.passwordHash) {
      ok = await verifyPassword(password, user);
    } else if (user.password !== undefined) {
      // Legacy fallback (insecure context where crypto.subtle unavailable):
      ok = (user.password === password);
      if (ok) {
        // Opportunistically upgrade to a salted hash.
        try { user.salt = genSalt(); user.passwordHash = await hashPassword(password, user.salt); delete user.password; saveDB(); }
        catch (e) {}
      }
    }
  }
  if (!ok) { toast('Invalid credentials!', 'error'); logAudit('login_failed', 'auth', null, { username }); return; }
  currentUser = user;
  logAudit('login', 'auth', user.id, { username });
  initApp();
}

export function doLogout() {
  logAudit('logout', 'auth', currentUser ? currentUser.id : null);
  currentUser = null;
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  // Clear sensitive field on logout
  const pf = document.getElementById('loginPass'); if (pf) pf.value = '';
  toast('Logged out','info');
}

// ===================== APP INIT =====================

export function initApp() {
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';

  // Set user info
  const colors = { CEO:'#4f7bff', ASM:'#a14fff', RSM:'#ffa94d', AM:'#00d4aa', MIO:'#ff6b6b' };
  document.getElementById('topAvatar').style.background = colors[currentUser.role]+'33';
  document.getElementById('topAvatar').style.color = colors[currentUser.role];
  document.getElementById('topAvatar').textContent = currentUser.name.split(' ').map(n=>n[0]).join('').slice(0,2);
  document.getElementById('topUserName').textContent = currentUser.name;
  document.getElementById('topUserRole').textContent = currentUser.role;

  buildNav();
  showPage('dashboard');
  renderDashboard();
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-BD',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  populateDropdowns();
  applyLogoToTopbar(); // /// UPDATED SECTION
}

/// UPDATED SECTION — RBAC helper functions
