// ui/pages/users.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth } from '../../services/permissionService.js';
import { getVisibleUserIds } from '../../store/selectors.js';
import { DB, saveDB, userHasRole } from '../../store/store.js';
import { populateDropdowns } from '../components/dropdowns.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { PERM } from '../../utils/constants.js';
import { genSalt, hashPassword } from '../../utils/crypto.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function renderUsers() {
  const visIds = getVisibleUserIds(currentUser);
  const users = DB.users.filter(u => {
    if (currentUser.role==='CEO') return true;
    if (currentUser.role==='ASM') return visIds.includes(u.id) && u.role!=='CEO';
    return false;
  });
  const body = document.getElementById('usersBody');
  body.innerHTML = users.map((u,i)=>{
    const manager = DB.users.find(x=>x.id===u.reportsTo);
    return `<tr>
      <td style="color:var(--text3);font-size:12px;">${i+1}</td>
      <td><strong>${esc(u.name)}</strong><br><span style="font-size:11px;color:var(--text3);">${esc(u.username)}</span></td>
      <td><span class="badge badge-${u.role.toLowerCase()}">${esc(u.role)}</span></td>
      <td>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent2);">${esc(u.territoryCode||'—')}</span>
        <br><span style="font-size:11px;color:var(--text3);">${esc(u.territory)}</span>
      </td>
      <td style="font-size:13px;color:var(--text3);">${esc(manager?.name||'—')}</td>
      <td><span class="badge" style="background:${u.status==='Active'?'rgba(0,212,170,0.15)':'rgba(255,107,107,0.15)'};color:${u.status==='Active'?'var(--success)':'var(--danger)'};">${esc(u.status)}</span></td>
      <td>
        ${canManageUser(u)?`<button class="btn btn-ghost btn-sm" onclick="editUser(${u.id})">Edit</button>
        ${currentUser.role==='CEO'&&u.id!==1?`<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})" style="margin-left:4px;">Del</button>`:''}`:
        '<span style="color:var(--text3);font-size:12px;">—</span>'}
      </td>
    </tr>`;
  }).join('');
}

export function canManageUser(u) {
  if (currentUser.role==='CEO') return true;
  // #2 — ASM may manage RSM/AM/MIO ONLY (never CEO/ASM, never self-escalation)
  if (currentUser.role==='ASM' && ['RSM','AM','MIO'].includes(u.role) && u.id!==currentUser.id) return true;
  return false;
}

/// UPDATED SECTION — openUserModal/editUser/saveUser with territory code from DB

export function _populateUserTerritorySelect() {
  const sel = document.getElementById('uTerritoryCode');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Code</option>';
  DB.territories.forEach(t => {
    sel.innerHTML += `<option value="${esc(t.code)}">${esc(t.code)} — ${esc(t.name)}</option>`;
  });
}

export function openUserModal() {
  if (!Auth.require('users', PERM.EDIT)) return;
  document.getElementById('userId').value='';
  document.getElementById('userModalTitle').textContent='Add User';
  ['uName','uUsername','uTerritory','uPhone'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('uPass').value='1234';
  _populateUserTerritorySelect();
  updateUserRoleOptions();
  openModal('userModal');
}

export function editUser(id) {
  const u = DB.users.find(x=>x.id===id);
  if (!u) { toast('User not found','error'); return; }
  // #2/#17 — only users you are allowed to manage may be edited
  if (!canManageUser(u)) { toast('You are not allowed to manage this user','error'); return; }
  document.getElementById('userId').value=id;
  document.getElementById('userModalTitle').textContent='Edit User';
  document.getElementById('uName').value=u.name;
  document.getElementById('uUsername').value=u.username;
  document.getElementById('uRole').value=u.role;
  document.getElementById('uTerritory').value=u.territory;
  document.getElementById('uPhone').value=u.phone;
  document.getElementById('uStatus').value=u.status;
  // Leave password blank on edit — empty means "keep current password".
  document.getElementById('uPass').value='';
  _populateUserTerritorySelect();
  updateUserRoleOptions();
  setTimeout(()=>{
    document.getElementById('uReportsTo').value=u.reportsTo||'';
    document.getElementById('uTerritoryCode').value=u.territoryCode||'';
  },50);
  openModal('userModal');
}

export function updateUserRoleOptions() {
  const role = document.getElementById('uRole').value;
  const reportsTo = document.getElementById('uReportsTo');
  const managerRole = {RSM:'ASM',AM:'RSM',MIO:'AM',ASM:'CEO'}[role]||'CEO';
  reportsTo.innerHTML = '<option value="">Select Manager</option>';
  DB.users.filter(u=>u.role===managerRole).forEach(u=>{
    reportsTo.innerHTML += `<option value="${u.id}">${esc(u.name)} (${esc(u.territory)})</option>`;
  });
}

export async function saveUser() {
  // #17 — authorization
  if (!Auth.require('users', PERM.EDIT)) return;
  const name = cleanInput(document.getElementById('uName').value, 80);
  const username = cleanInput(document.getElementById('uUsername').value, 60).toLowerCase().replace(/\s+/g,'');
  if (!V.required(name,'Name') || !V.required(username,'Username')) return;
  const id = parseInt(document.getElementById('userId').value)||0;
  const newRole = document.getElementById('uRole').value;
  const reportsTo = parseInt(document.getElementById('uReportsTo').value)||null;
  const existing = id ? DB.users.find(u=>u.id===id) : null;

  // #2 — PRIVILEGE-ESCALATION GUARDS
  // (a) Non-CEO can never create/assign CEO or ASM roles.
  if (currentUser.role!=='CEO' && !['RSM','AM','MIO'].includes(newRole)) {
    toast('You can only manage RSM, AM and MIO roles','error'); return;
  }
  // (b) Nobody may edit their own role/permission via this form (self-escalation).
  if (existing && existing.id===currentUser.id && newRole!==existing.role) {
    toast('You cannot change your own role','error'); return;
  }
  // (c) When editing, the target must be one the current user is allowed to manage.
  if (existing && !canManageUser(existing)) { toast('Not allowed to manage this user','error'); return; }
  // (d) The CEO seed account role cannot be downgraded.
  if (existing && existing.id===1 && newRole!=='CEO') { toast('The primary CEO role cannot be changed','error'); return; }
  // #14 — FK validation: reportsTo (if set) must reference an existing user with the correct managing role.
  if (reportsTo!==null) {
    const expectedMgr = {RSM:'ASM',AM:'RSM',MIO:'AM',ASM:'CEO'}[newRole]||'CEO';
    if (!userHasRole(reportsTo, expectedMgr)) { toast(`Reporting manager must be a ${expectedMgr}`,'error'); return; }
  }
  // #14 — territory code (if set) must exist
  const territoryCode = document.getElementById('uTerritoryCode').value;
  if (territoryCode && !DB.territories.some(t=>t.code===territoryCode)) { toast('Invalid territory code','error'); return; }
  // #15 — duplicate username check on BOTH create and edit (excluding self)
  if (DB.users.find(u=>u.username===username && u.id!==id)) { toast('Username already exists','error'); return; }

  const base = {
    name, username, role:newRole,
    territory:cleanInput(document.getElementById('uTerritory').value, 80),
    territoryCode,
    phone:cleanInput(document.getElementById('uPhone').value, 40),
    status:document.getElementById('uStatus').value,
    reportsTo
  };
  // 1. Hash any newly entered password; never store plaintext.
  const enteredPass = document.getElementById('uPass').value;
  if (id) {
    const target = DB.users.find(u=>u.id===id);
    Object.assign(target, base);
    if (enteredPass && enteredPass !== '••••••') {
      try { target.salt = genSalt(); target.passwordHash = await hashPassword(enteredPass, target.salt); delete target.password; } catch(e){}
    }
    logAudit('update', 'user', id, { username, role:newRole });
    toast('User updated','success');
  } else {
    const salt = genSalt();
    let passwordHash = '';
    try { passwordHash = await hashPassword(enteredPass || '1234', salt); } catch(e){}
    const rec = { id:DB.nextId.user++, uid:genUid(), salt, passwordHash, ...base };
    DB.users.push(rec);
    logAudit('create', 'user', rec.id, { username, role:newRole });
    toast('User added','success');
  }
  saveDB(); // /// UPDATED SECTION
  closeModal('userModal'); renderUsers(); populateDropdowns();
}

export function deleteUser(id) {
  if (id===1) { toast('Cannot delete CEO','error'); return; }
  const u = DB.users.find(x=>x.id===id);
  if (!u) { toast('User not found','error'); return; }
  // #2/#17 — authorization + cannot delete self
  if (!canManageUser(u)) { toast('Not allowed to delete this user','error'); return; }
  if (id===currentUser.id) { toast('You cannot delete your own account','error'); return; }
  // #13/#14 — referential integrity: block delete while user is still referenced
  const hasReports = DB.users.some(x=>x.reportsTo===id);
  const hasInvoices = DB.invoices.some(inv=>inv.mioId===id);
  const hasParties = DB.parties.some(p=>p.mioId===id);
  if (hasReports || hasInvoices || hasParties) {
    toast('Cannot delete: user still has subordinates, invoices, or assigned parties. Reassign them first.', 'error');
    return;
  }
  if (!confirm('Delete this user?')) return;
  DB.users = DB.users.filter(u=>u.id!==id);
  if (DB.userPermissions[id]) delete DB.userPermissions[id];
  logAudit('delete', 'user', id, { username: u.username });
  saveDB(); // /// UPDATED SECTION
  toast('User deleted','info'); renderUsers(); populateDropdowns();
}

// ===================== APPROVAL QUEUE =====================
/// UPDATED SECTION — Full approval pipeline: MIO → AM → RSM → ASM
