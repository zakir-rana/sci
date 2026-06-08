// ui/pages/parties.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth, hasPerm } from '../../services/permissionService.js';
import { getVisibleParties } from '../../store/selectors.js';
import { DB, realInvoices, saveDB, userHasRole } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderInvoices } from './invoices.js';
import { PERM } from '../../utils/constants.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { taka } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function partyTypeBadge(type) {
  const map = { Doctor:'ceo', Pharmacy:'am', Chemist:'am', Distributor:'rsm', Hospital:'asm', Clinic:'mio', Institution:'mio' };
  return map[type] || 'ceo';
}

export function renderParties() {
  const search = (document.getElementById('partySearch')?.value||'').toLowerCase();
  const type = document.getElementById('partyTypeFilter')?.value||'';
  const visParties = getVisibleParties(currentUser);
  const parties = visParties.filter(p=>
    (p.name.toLowerCase().includes(search) || (p.area||'').toLowerCase().includes(search)) &&
    (type===''||p.type===type)
  );
  const body = document.getElementById('partiesBody');
  const canMgr = ['CEO','ASM'].includes(currentUser.role);
  const canEdit = hasPerm('parties', PERM.CREATE); // VIEW-only roles cannot edit
  if (!parties.length) { body.innerHTML=`<tr><td colspan="8"><div class="empty-state"><p>No parties found</p></div></td></tr>`; return; }
  body.innerHTML = parties.map((p,i)=>{
    const due = realInvoices(DB.invoices.filter(inv=>inv.partyId===p.id)).reduce((s,inv)=>s+(inv.total-inv.paid),0);
    return `<tr>
      <td style="color:var(--text3);font-size:12px;">${i+1}</td>
      <td><strong>${esc(p.name)}</strong><br><span style="font-size:11px;color:var(--text3);">${esc(p.address)}</span></td>
      <td><span class="badge badge-${partyTypeBadge(p.type)}">${esc(p.type)}</span></td>
      <td>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent2);">${esc(p.territoryCode||'—')}</span>
        <br><span style="font-size:11px;color:var(--text3);">${esc(p.area)}</span>
      </td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;">${esc(p.phone)}</td>
      <td class="taka" style="color:${due>0?'var(--danger)':'var(--success)'};">${taka(due)}</td>
      <td>
        ${canEdit?`<button class="btn btn-ghost btn-sm" onclick="editParty(${p.id})">Edit</button>`:''}
        ${canMgr?`<button class="btn btn-danger btn-sm" onclick="deleteParty(${p.id})" style="margin-left:4px;">Del</button>`:''}
        ${(!canEdit&&!canMgr)?'<span style="color:var(--text3);font-size:12px;">View only</span>':''}
      </td>
    </tr>`;
  }).join('');
}

/// UPDATED SECTION — openPartyModal: territory code + new party types

export function openPartyModal(id=null) {
  if (!hasPerm('parties', PERM.CREATE)) { toast('Access denied','error'); return; }
  document.getElementById('partyId').value=id||'';
  if (id) {
    const p = DB.parties.find(x=>x.id===id);
    document.getElementById('partyModalTitle').textContent='Edit Party';
    document.getElementById('ptName').value=p.name;
    document.getElementById('ptType').value=p.type;
    document.getElementById('ptTerritoryCode').value=p.territoryCode||'';
    document.getElementById('ptArea').value=p.area;
    document.getElementById('ptPhone').value=p.phone;
    document.getElementById('ptAddr').value=p.address;
    document.getElementById('ptMIO').value=p.mioId||'';
  } else {
    document.getElementById('partyModalTitle').textContent='Add Party';
    ['ptName','ptPhone','ptAddr','ptArea'].forEach(f=>document.getElementById(f).value='');
  }
  openModal('partyModal');
}

export function editParty(id) {
  if (!hasPerm('parties', PERM.CREATE)) { toast('Access denied','error'); return; }
  openPartyModal(id);
}

/// UPDATED SECTION — saveParty: include territoryCode + validation/authz/FK/audit

export function saveParty() {
  // #17 — authorization: need at least CREATE on parties module
  if (!Auth.require('parties', PERM.CREATE)) return;
  const name = cleanInput(document.getElementById('ptName').value, 120);
  if (!V.required(name, 'Party name')) return;
  const id = parseInt(document.getElementById('partyId').value)||0;
  // #17 — editing requires EDIT permission (CREATE-only roles can add, not edit existing)
  if (id && !hasPerm('parties', PERM.EDIT) && !['CEO','ASM'].includes(currentUser.role)) {
    // CREATE-only roles may edit parties they own (assigned MIO) only
    const existing = DB.parties.find(p=>p.id===id);
    if (existing && existing.mioId !== currentUser.id) { toast('You can only edit parties assigned to you','error'); return; }
  }
  const tcSel = document.getElementById('ptTerritoryCode').value;
  // #14 — FK-style validation: territory code must exist in geography master
  if (tcSel && !DB.territories.some(t=>t.code===tcSel)) { toast('Invalid territory code','error'); return; }
  const mioId = parseInt(document.getElementById('ptMIO').value)||null;
  // #14 — FK-style validation: assigned MIO must exist and actually be an MIO
  if (mioId && !userHasRole(mioId, 'MIO')) { toast('Assigned MIO is invalid','error'); return; }
  const data = {
    name, type:document.getElementById('ptType').value,
    territoryCode: tcSel||'',
    area:cleanInput(document.getElementById('ptArea').value, 80)||'General',
    phone:cleanInput(document.getElementById('ptPhone').value, 40),
    address:cleanInput(document.getElementById('ptAddr').value, 300),
    mioId
  };
  if (id) {
    Object.assign(DB.parties.find(p=>p.id===id), data);
    logAudit('update', 'party', id, { name });
    toast('Party updated','success');
  } else {
    const rec = { id:DB.nextId.party++, uid:genUid(), ...data };
    DB.parties.push(rec);
    logAudit('create', 'party', rec.id, { name });
    toast('Party added','success');
  }
  saveDB(); // /// UPDATED SECTION
  closeModal('partyModal'); renderParties();
}

export function deleteParty(id) {
  // #17 — only CEO/ASM may delete parties
  if (!['CEO','ASM'].includes(currentUser.role)) { toast('Access denied','error'); return; }
  // #8 — orphan-record prevention: block delete when invoices reference this party
  const refCount = DB.invoices.filter(inv => inv.partyId === id).length;
  if (refCount > 0) {
    toast(`Cannot delete: party has ${refCount} invoice(s). Archive or reassign them first.`, 'error');
    return;
  }
  if (!confirm('Delete this party?')) return;
  DB.parties = DB.parties.filter(p=>p.id!==id);
  logAudit('delete', 'party', id);
  saveDB(); // /// UPDATED SECTION
  toast('Party deleted','info'); renderParties();
}

// ===================== INVOICES =====================
/// UPDATED SECTION — renderInvoices: shows payType + approvalStatus pipeline
