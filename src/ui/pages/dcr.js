// ui/pages/dcr.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { hasPerm } from '../../services/permissionService.js';
import { getVisibleUserIds } from '../../store/selectors.js';
import { DB, saveDB, userHasRole } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { PERM } from '../../utils/constants.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { fmtDate, taka, today } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function initDCRPage() {
  const canCreate = hasPerm('dcr', PERM.CREATE);
  document.getElementById('addDCRBtn').style.display = canCreate?'':'none';

  // Populate MIO filter
  const mioSel = document.getElementById('dcrUserFilter');
  mioSel.innerHTML = '<option value="">All MIOs</option>';
  const visIds = getVisibleUserIds(currentUser);
  DB.users.filter(u=>u.role==='MIO'&&visIds.includes(u.id)).forEach(u=>{
    mioSel.innerHTML += `<option value="${u.id}">${esc(u.name)}</option>`;
  });

  // Stats
  const myDcrs = getVisibleDCRs();
  const total = myDcrs.length;
  const visited = myDcrs.filter(d=>d.status==='Visited').length;
  const orders = myDcrs.reduce((s,d)=>s+(d.orderAmount||0),0);
  document.getElementById('dcrStats').innerHTML = `
    <div class="stat-card blue"><div class="stat-label">Total DCRs</div><div class="stat-value">${total}</div><div class="stat-sub">All field reports</div></div>
    <div class="stat-card green"><div class="stat-label">Visits Done</div><div class="stat-value">${visited}</div><div class="stat-sub">${total>0?Math.round(visited/total*100):0}% visit rate</div></div>
    <div class="stat-card orange"><div class="stat-label">Orders Generated</div><div class="stat-value taka">${taka(orders)}</div><div class="stat-sub">From field visits</div></div>
  `;
}

export function getVisibleDCRs() {
  const visIds = getVisibleUserIds(currentUser);
  if (currentUser.role==='CEO') return DB.dcrs;
  return DB.dcrs.filter(d=>visIds.includes(d.mioId)||d.mioId===currentUser.id);
}

export function renderDCR() {
  const search = (document.getElementById('dcrSearch')?.value||'').toLowerCase();
  const status = document.getElementById('dcrStatusFilter')?.value||'';
  const userFilter = parseInt(document.getElementById('dcrUserFilter')?.value)||0;
  const dateFilter = document.getElementById('dcrDateFilter')?.value||'';
  let dcrs = getVisibleDCRs().filter(d=>
    (!search||(d.doctor||'').toLowerCase().includes(search)||(d.chemist||'').toLowerCase().includes(search)||(d.notes||'').toLowerCase().includes(search)) &&
    (!status||d.status===status) &&
    (!userFilter||d.mioId===userFilter) &&
    (!dateFilter||d.date===dateFilter)
  ).sort((a,b)=>b.date.localeCompare(a.date));

  const canEdit = hasPerm('dcr', PERM.EDIT);
  const body = document.getElementById('dcrBody');
  if (!dcrs.length) { body.innerHTML=`<tr><td colspan="9"><div class="empty-state"><p>No DCR records found</p></div></td></tr>`; return; }
  body.innerHTML = dcrs.map(d=>{
    const mio = DB.users.find(u=>u.id===d.mioId);
    return `<tr>
      <td style="font-size:12px;">${fmtDate(d.date)}</td>
      <td><span class="badge badge-mio">${esc(mio?.name||'N/A')}</span></td>
      <td style="font-size:12px;">${esc(d.doctor||'—')}</td>
      <td style="font-size:12px;">${esc(d.chemist||'—')}</td>
      <td><span class="status-chip ${d.status==='Visited'?'sc-visited':d.status==='No Meeting'?'sc-no-meet':'sc-pending'}">${esc(d.status)}</span></td>
      <td class="taka">${d.orderAmount>0?taka(d.orderAmount):'—'}</td>
      <td style="font-size:11px;color:var(--text3);">${d.followup?fmtDate(d.followup):'—'}</td>
      <td style="font-size:12px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.notes||'—')}</td>
      <td>
        ${(canEdit||d.mioId===currentUser.id)?`
          <button class="btn btn-ghost btn-sm" onclick="editDCR(${d.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDCR(${d.id})" style="margin-left:4px;">Del</button>`:'—'}
      </td>
    </tr>`;
  }).join('');
}

export function openDCRModal(id=null) {
  // #17 — need CREATE (own) or EDIT (others) to open the DCR form
  if (id) {
    const d = DB.dcrs.find(x=>x.id===id);
    if (!d) { toast('DCR not found','error'); return; }
    if (!hasPerm('dcr', PERM.EDIT) && d.mioId!==currentUser.id) { toast('You can only edit your own DCRs','error'); return; }
  } else if (!hasPerm('dcr', PERM.CREATE)) { toast('Access denied','error'); return; }
  document.getElementById('dcrId').value=id||'';
  document.getElementById('dcrModalTitle').textContent=id?'Edit DCR':'New DCR';
  if (!id) {
    document.getElementById('dcrDate').value=today();
    document.getElementById('dcrStatus').value='Visited';
    ['dcrDoctor','dcrChemist','dcrNotes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('dcrOrder').value='';
    document.getElementById('dcrFollowup').value='';
  } else {
    const d = DB.dcrs.find(x=>x.id===id);
    document.getElementById('dcrDate').value=d.date;
    document.getElementById('dcrStatus').value=d.status;
    document.getElementById('dcrDoctor').value=d.doctor||'';
    document.getElementById('dcrChemist').value=d.chemist||'';
    document.getElementById('dcrOrder').value=d.orderAmount||'';
    document.getElementById('dcrFollowup').value=d.followup||'';
    document.getElementById('dcrNotes').value=d.notes||'';
  }
  openModal('dcrModal');
}

export function editDCR(id) { openDCRModal(id); }

export function saveDCR() {
  if (!hasPerm('dcr', PERM.CREATE) && !hasPerm('dcr', PERM.EDIT)) { toast('Access denied','error'); return; }
  const date = document.getElementById('dcrDate').value;
  if (!V.required(date,'Date')) return;
  const orderRaw = document.getElementById('dcrOrder').value;
  if (orderRaw !== '' && !V.nonNegativeNumber(orderRaw, 'Order amount')) return;
  const id = parseInt(document.getElementById('dcrId').value)||0;
  // ownership: editing someone else's DCR requires EDIT
  if (id) {
    const existing = DB.dcrs.find(d=>d.id===id);
    if (existing && existing.mioId!==currentUser.id && !hasPerm('dcr', PERM.EDIT)) { toast('You can only edit your own DCRs','error'); return; }
  }
  const data = {
    mioId: currentUser.role==='MIO'?currentUser.id:(parseInt(document.getElementById('dcrUserFilter')?.value)||currentUser.id),
    date, status:document.getElementById('dcrStatus').value,
    doctor:cleanInput(document.getElementById('dcrDoctor').value, 120),
    chemist:cleanInput(document.getElementById('dcrChemist').value, 120),
    orderAmount:V.clampNonNeg(orderRaw),
    followup:document.getElementById('dcrFollowup').value,
    notes:cleanInput(document.getElementById('dcrNotes').value, 500)
  };
  // #14 — assigned MIO must be valid
  if (!userHasRole(data.mioId, 'MIO') && data.mioId!==currentUser.id) { toast('Invalid MIO assignment','error'); return; }
  if (id) {
    Object.assign(DB.dcrs.find(d=>d.id===id), data);
    logAudit('update','dcr',id);
    toast('DCR updated','success');
  } else {
    const rec = {id:DB.nextId.dcr++, uid:genUid(), ...data};
    DB.dcrs.push(rec);
    logAudit('create','dcr',rec.id);
    toast('DCR submitted','success');
  }
  saveDB(); closeModal('dcrModal'); initDCRPage(); renderDCR();
}

export function deleteDCR(id) {
  const d = DB.dcrs.find(x=>x.id===id);
  if (!d) { toast('DCR not found','error'); return; }
  // #17 — owner may delete own; others need EDIT
  if (d.mioId!==currentUser.id && !hasPerm('dcr', PERM.EDIT)) { toast('Access denied','error'); return; }
  if (!confirm('Delete DCR?')) return;
  DB.dcrs = DB.dcrs.filter(d=>d.id!==id);
  logAudit('delete','dcr',id);
  saveDB(); toast('DCR deleted','info'); renderDCR();
}

// ===================== EXPENSE MODULE =====================
/// UPDATED SECTION — Expense full CRUD + approval workflow
