// app/nav.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { showPage } from './router.js';
import { currentUser } from '../services/authService.js';
import { hasPerm } from '../services/permissionService.js';
import { DB } from '../store/store.js';
import { canApproveInvoice } from '../ui/pages/invoices.js';
import { PERM } from '../utils/constants.js';

export function buildQuickRoles() {
  const roles = DB.users;
  const container = document.getElementById('quickRoles');
  container.innerHTML = '';
  // show unique roles
  const shown = [];
  roles.forEach(u => {
    if (!shown.includes(u.role)) {
      shown.push(u.role);
      const el = document.createElement('div');
      el.className = 'role-pill';
      el.textContent = u.role + ' (' + u.username + ')';
      el.onclick = () => {
        document.querySelectorAll('.role-pill').forEach(r=>r.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('loginUser').value = u.username;
      };
      container.appendChild(el);
    }
  });
}

export function buildNav() {
  const nav = document.getElementById('topNav');
  /// UPDATED SECTION — Nav items now respect RBAC + new modules
  const pages = [
    { id:'dashboard', label:'📊 Dashboard', module:'dashboard' },
    { id:'products', label:'💊 Products', module:'products' },
    { id:'parties', label:'👥 Parties', module:'parties' },
    { id:'invoices', label:'🧾 Invoices', module:'invoices' },
    { id:'approvals', label:'⏳ Approvals', module:'approvals' },
    { id:'sales', label:'📈 Sales Report', module:'sales' },
    { id:'outstanding', label:'⚠️ Outstanding', module:'outstanding' },
    { id:'targets', label:'🎯 Targets', module:'targets' },
    { id:'territory', label:'🗺 Geography', module:'territory' },
    { id:'dcr', label:'📋 DCR', module:'dcr' },
    { id:'expense', label:'💸 Expense', module:'expense' },
    { id:'users', label:'👤 Users', module:'users' },
    { id:'settings', label:'⚙️ Settings', module:'settings' },
  ];
  nav.innerHTML = '';
  pages.forEach(p => {
    if (!hasPerm(p.module, PERM.VIEW)) return;
    const el = document.createElement('div');
    el.className = 'nav-item';
    el.id = 'nav-'+p.id;
    // /// UPDATED SECTION — Show pending count badge on Approvals nav
    if (p.id === 'approvals') {
      const pCount = getPendingApprovalCount();
      el.innerHTML = p.label + (pCount>0?`<span class="nav-badge">${pCount}</span>`:'');
    } else {
      el.textContent = p.label;
    }
    el.onclick = () => showPage(p.id);
    nav.appendChild(el);
  });
}

export function getPendingApprovalCount() {
  if (!currentUser) return 0;
  return DB.invoices.filter(inv => canApproveInvoice(inv)).length;
}

/// UPDATED SECTION — Update the approval queue button badge in invoices page header
