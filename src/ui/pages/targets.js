// ui/pages/targets.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth } from '../../services/permissionService.js';
import { getSubordinateIds, getVisibleUserIds } from '../../store/selectors.js';
import { DB, realInvoices, saveDB, userHasRole } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { renderUsers } from './users.js';
import { PERM } from '../../utils/constants.js';
import { esc } from '../../utils/esc.js';
import { taka, thisMonth } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function getAggregatedTarget(userId, month) {
  const user = DB.users.find(u=>u.id===userId);
  if (!user) return 0;
  if (user.role === 'MIO') {
    const t = DB.targets.find(t=>t.userId===userId && t.month===month);
    return t ? t.amount : 0;
  }
  // For AM/RSM/ASM/CEO: sum of all subordinate MIO targets
  const subIds = getSubordinateIds(userId);
  const mioIds = DB.users.filter(u=>u.role==='MIO' && subIds.includes(u.id)).map(u=>u.id);
  if (mioIds.length === 0) {
    // fallback: direct target if set
    const t = DB.targets.find(t=>t.userId===userId && t.month===month);
    return t ? t.amount : 0;
  }
  return mioIds.reduce((sum, mioId) => {
    const t = DB.targets.find(t=>t.userId===mioId && t.month===month);
    return sum + (t ? t.amount : 0);
  }, 0);
}

export function getMioAchievement(mioId, month) {
  // #6 — achievement counts real sales only
  return realInvoices(DB.invoices.filter(inv => inv.mioId===mioId && inv.date.slice(0,7)===month))
    .reduce((s,i)=>s+i.total, 0);
}

// ===================== TARGETS =====================
/// UPDATED SECTION — renderTargets: aggregated targets for managers, personal for MIO

export function renderTargets() {
  const visIds = getVisibleUserIds(currentUser);
  const month = thisMonth();
  const canEdit = ['CEO','ASM','RSM'].includes(currentUser.role);
  document.getElementById('addTargetBtn').style.display = canEdit ? '' : 'none';
  document.getElementById('targetEditHead').style.display = canEdit ? '' : 'none';

  // Build rows: for non-MIO users, show aggregated; for MIO show personal
  const users = DB.users.filter(u => visIds.includes(u.id) && u.role!=='CEO' && u.role!=='Warehouse');
  const body = document.getElementById('targetsBody');
  if (!users.length) { body.innerHTML=`<tr><td colspan="9"><div class="empty-state"><p>No team members found</p></div></td></tr>`; return; }

  body.innerHTML = users.map(u=>{
    const target = getAggregatedTarget(u.id, month);
    const achieved = u.role==='MIO' ? getMioAchievement(u.id, month)
      : DB.users.filter(x=>x.role==='MIO' && getSubordinateIds(u.id).includes(x.id))
          .reduce((s,mio)=>s+getMioAchievement(mio.id, month), 0);
    const pct = target>0 ? Math.round(achieved/target*100) : 0;
    const color = pct>=100?'var(--success)':pct>=70?'var(--warning)':'var(--danger)';
    const isAggr = u.role!=='MIO';
    const mioTarget = DB.targets.find(t=>t.userId===u.id && t.month===month);
    const targetId = mioTarget?.id;

    return `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td><span class="badge badge-${u.role.toLowerCase()}">${esc(u.role)}</span></td>
      <td style="font-size:12px;color:var(--text3);">${esc(u.territory)}</td>
      <td><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent2);">${esc(u.territoryCode||'—')}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;">${esc(month)}</td>
      <td class="taka">${target>0?taka(target):'<span style="color:var(--text3)">No Target</span>'}</td>
      <td class="taka">${taka(achieved)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;min-width:60px;">
            <div style="width:${Math.min(pct,100)}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${color};min-width:36px;">${pct}%</span>
          ${isAggr?'<span style="font-size:10px;color:var(--text3);">auto</span>':''}
        </div>
      </td>
      <td>
        ${canEdit && u.role==='MIO'?`
          ${targetId?`<button class="btn btn-ghost btn-sm" onclick="editTarget(${targetId})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTarget(${targetId})" style="margin-left:4px;">Del</button>`
          :`<button class="btn btn-primary btn-sm" onclick="quickSetTarget(${u.id})">Set</button>`}`
        : canEdit&&isAggr?'<span style="font-size:11px;color:var(--text3);">Auto-calc</span>':'—'}
      </td>
    </tr>`;
  }).join('');
}

export function quickSetTarget(userId) {
  if (!Auth.require('targets', PERM.EDIT)) return;
  document.getElementById('targetId').value='';
  document.getElementById('tUser').value=userId;
  document.getElementById('tMonth').value=thisMonth();
  document.getElementById('tAmount').value='';
  openModal('targetModal');
}

export function openTargetModal() {
  if (!Auth.require('targets', PERM.EDIT)) return;
  document.getElementById('targetId').value='';
  document.getElementById('tMonth').value=thisMonth();
  document.getElementById('tAmount').value='';
  openModal('targetModal');
}

export function editTarget(id) {
  if (!Auth.require('targets', PERM.EDIT)) return;
  const t = DB.targets.find(x=>x.id===id);
  if (!t) { toast('Target not found','error'); return; }
  document.getElementById('targetId').value=id;
  document.getElementById('tUser').value=t.userId;
  document.getElementById('tMonth').value=t.month;
  document.getElementById('tAmount').value=t.amount;
  openModal('targetModal');
}

export function saveTarget() {
  // #17 — authorization
  if (!Auth.require('targets', PERM.EDIT)) return;
  const userId = parseInt(document.getElementById('tUser').value);
  const month = document.getElementById('tMonth').value;
  const amount = parseFloat(document.getElementById('tAmount').value)||0;
  if (!userId||!month) { toast('Fill all fields','error'); return; }
  if (!V.nonNegativeNumber(amount, 'Target amount') || amount <= 0) { toast('Target amount must be greater than 0','error'); return; }
  // #14 — FK validation: targets are only set for MIOs that are visible to this user
  if (!userHasRole(userId, 'MIO') || !getVisibleUserIds(currentUser).includes(userId)) {
    toast('Targets can only be set for MIOs in your team','error'); return;
  }
  const id = parseInt(document.getElementById('targetId').value)||0;
  // #15 — duplicate prevention: one target per user per month
  const dup = DB.targets.find(t=>t.userId===userId && t.month===month && t.id!==id);
  if (dup) {
    Object.assign(dup, {amount}); // update existing instead of creating a duplicate
    logAudit('update', 'target', dup.id, { userId, month, amount });
    saveDB(); closeModal('targetModal'); renderTargets();
    toast('Existing target for this month updated','success'); return;
  }
  if (id) {
    Object.assign(DB.targets.find(t=>t.id===id), {userId,month,amount});
    logAudit('update', 'target', id, { userId, month, amount });
    toast('Target updated','success');
  } else {
    const rec = {id:DB.nextId.target++, uid:genUid(), userId, month, amount};
    DB.targets.push(rec);
    logAudit('create', 'target', rec.id, { userId, month, amount });
    toast('Target set','success');
  }
  saveDB(); // /// UPDATED SECTION
  closeModal('targetModal'); renderTargets();
}

export function deleteTarget(id) {
  if (!Auth.require('targets', PERM.EDIT)) return;
  DB.targets = DB.targets.filter(t=>t.id!==id);
  logAudit('delete', 'target', id);
  saveDB(); // /// UPDATED SECTION
  toast('Target deleted','info'); renderTargets();
}

// ===================== USERS =====================
/// UPDATED SECTION — renderUsers: show territory code column
