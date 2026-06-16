// ui/components/dropdowns.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from '../../services/authService.js';
import { getMioIds, getVisibleParties, getVisibleUserIds } from '../../store/selectors.js';
import { DB } from '../../store/store.js';
import { updateApprovalQueueButton } from '../pages/invoices.js';
import { esc } from '../../utils/esc.js';

export function populateDropdowns() {
  // Party MIO dropdown
  const mioSelect = document.getElementById('ptMIO');
  mioSelect.innerHTML = '<option value="">Unassigned</option>';
  DB.users.filter(u=>u.role==='MIO').forEach(u => {
    mioSelect.innerHTML += `<option value="${u.id}">${esc(u.name)} (${esc(u.territoryCode||u.territory)})</option>`;
  });

  // Territory code dropdown in party modal — from DB.territories
  const tcSel = document.getElementById('ptTerritoryCode');
  if (tcSel) {
    tcSel.innerHTML = '<option value="">Select Territory</option>';
    DB.territories.forEach(t => {
      tcSel.innerHTML += `<option value="${esc(t.code)}">${esc(t.code)} — ${esc(t.name)}</option>`;
    });
    // Auto-fill MIO when territory changes
    tcSel.onchange = function() {
      const terr = DB.territories.find(t=>t.code===this.value);
      if (terr && terr.mioId) {
        document.getElementById('ptMIO').value = terr.mioId;
      }
    };
  }

  // Invoice party
  const invParty = document.getElementById('invParty');
  invParty.innerHTML = '';
  getVisibleParties(currentUser).forEach(p => {
    invParty.innerHTML += `<option value="${p.id}">${esc(p.name)} (${esc(p.type)})</option>`;
  });

  // Target user (MIO only for setting; managers are auto-aggregated)
  const tUser = document.getElementById('tUser');
  tUser.innerHTML = '';
  const visIds = getVisibleUserIds(currentUser);
  DB.users.filter(u => visIds.includes(u.id) && u.role==='MIO').forEach(u => {
    tUser.innerHTML += `<option value="${u.id}">${esc(u.name)} (${esc(u.territoryCode||u.territory)})</option>`;
  });

  // Outstanding area filter — territory codes
  const outArea = document.getElementById('outAreaFilter');
  const allAreas = [...new Set(DB.parties.map(p=>p.area).filter(Boolean))];
  outArea.innerHTML = '<option value="">All Areas</option>';
  allAreas.forEach(a => outArea.innerHTML += `<option>${esc(a)}</option>`);

  // Sales user filter
  const suf = document.getElementById('salesUserFilter');
  suf.innerHTML = '<option value="">All Users</option>';
  getMioIds(currentUser).forEach(id => {
    const u = DB.users.find(x=>x.id===id);
    if (u) suf.innerHTML += `<option value="${u.id}">${esc(u.name)} (${esc(u.territoryCode||u.territory)})</option>`;
  });

  updateApprovalQueueButton();
}

// ===================== DASHBOARD =====================
/// UPDATED SECTION — Role-based dashboard: CEO shows national summary, ASM shows regional KPIs, RSM/AM/MIO show recent invoices
