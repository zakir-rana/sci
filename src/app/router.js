// app/router.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from '../services/authService.js';
import { hasPerm } from '../services/permissionService.js';
import { DB } from '../store/store.js';
import { populateDropdowns } from '../ui/components/dropdowns.js';
import { toast } from '../ui/components/toast.js';
import { renderApprovalQueue } from '../ui/pages/approvals.js';
import { renderDashboard } from '../ui/pages/dashboard.js';
import { initDCRPage, renderDCR } from '../ui/pages/dcr.js';
import { initExpensePage, renderExpenses } from '../ui/pages/expense.js';
import { initGeoPage, renderGeoList } from '../ui/pages/geography.js';
import { renderInvoices, updateApprovalQueueButton } from '../ui/pages/invoices.js';
import { renderOutstanding } from '../ui/pages/outstanding.js';
import { renderParties } from '../ui/pages/parties.js';
import { renderProducts } from '../ui/pages/products.js';
import { initSalesPage, renderSalesReport } from '../ui/pages/sales.js';
import { initSettingsPage } from '../ui/pages/settings.js';
import { renderTargets } from '../ui/pages/targets.js';
import { renderUsers } from '../ui/pages/users.js';
import { PERM } from '../utils/constants.js';

export function showPage(id) {
  // #10/#17 — authorization guard: block navigation to modules the user can't view,
  // even if invoked directly (console) or via a stale nav element.
  const moduleMap = { dashboard:'dashboard', products:'products', parties:'parties', invoices:'invoices',
    approvals:'approvals', sales:'sales', outstanding:'outstanding', targets:'targets', territory:'territory',
    dcr:'dcr', expense:'expense', users:'users', settings:'settings' };
  const mod = moduleMap[id];
  if (mod && currentUser && !hasPerm(mod, PERM.VIEW)) {
    toast('Access denied — you do not have permission to view this page', 'error');
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  if (page) page.classList.add('active');
  const navItem = document.getElementById('nav-'+id);
  if (navItem) navItem.classList.add('active');
  // Close mobile nav dropdown after selecting (fix #18)
  const topNav = document.getElementById('topNav');
  if (topNav) topNav.classList.remove('mobile-open');

  if (id==='products') renderProducts();
  else if (id==='parties') renderParties();
  else if (id==='invoices') { renderInvoices(); updateApprovalQueueButton(); }
  else if (id==='approvals') renderApprovalQueue();
  else if (id==='sales') { initSalesPage(); renderSalesReport(); }
  else if (id==='outstanding') renderOutstanding();
  else if (id==='targets') renderTargets();
  else if (id==='users') renderUsers();
  else if (id==='dashboard') renderDashboard();
  else if (id==='territory') { initGeoPage(); renderGeoList(); }
  else if (id==='dcr') { initDCRPage(); renderDCR(); }
  else if (id==='expense') { initExpensePage(); renderExpenses(); }
  else if (id==='settings') initSettingsPage();
}

export function profileClick() {
  if (hasPerm('settings', PERM.VIEW)) { showPage('settings'); }
  else { toast('Settings access restricted', 'info'); }
}

// ===================== DROPDOWNS =====================
/// UPDATED SECTION — populateDropdowns: territory codes from DB, extended areas, new party types
