// ui/pages/expense.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth, hasPerm } from '../../services/permissionService.js';
import { getVisibleUserIds } from '../../store/selectors.js';
import { DB, saveDB } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { PERM } from '../../utils/constants.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { fmtDate, taka, thisMonth, today } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function initExpensePage() {
  const canCreate = hasPerm('expense', PERM.CREATE);
  document.getElementById('addExpenseBtn').style.display = canCreate?'':'none';

  const myExp = getVisibleExpenses();
  const total = myExp.reduce((s,e)=>s+e.amount,0);
  const approved = myExp.filter(e=>e.status==='Approved').reduce((s,e)=>s+e.amount,0);
  const pending = myExp.filter(e=>e.status==='Pending').length;
  document.getElementById('expenseStats').innerHTML = `
    <div class="stat-card blue"><div class="stat-label">Total Expenses</div><div class="stat-value taka">${taka(total)}</div><div class="stat-sub">${myExp.length} records</div></div>
    <div class="stat-card green"><div class="stat-label">Approved</div><div class="stat-value taka">${taka(approved)}</div><div class="stat-sub">Approved expenses</div></div>
    <div class="stat-card orange"><div class="stat-label">Pending Approval</div><div class="stat-value">${pending}</div><div class="stat-sub">Awaiting review</div></div>
  `;

  // Set default month filter
  const mf = document.getElementById('expenseMonthFilter');
  if (!mf.value) mf.value = thisMonth();
}

export function getVisibleExpenses() {
  const visIds = getVisibleUserIds(currentUser);
  if (currentUser.role==='CEO') return DB.expenses;
  return DB.expenses.filter(e=>visIds.includes(e.submittedBy)||e.submittedBy===currentUser.id);
}

export function renderExpenses() {
  const search = (document.getElementById('expenseSearch')?.value||'').toLowerCase();
  const type = document.getElementById('expenseTypeFilter')?.value||'';
  const status = document.getElementById('expenseStatusFilter')?.value||'';
  const month = document.getElementById('expenseMonthFilter')?.value||'';
  let exps = getVisibleExpenses().filter(e=>
    (!type||e.type===type) &&
    (!status||e.status===status) &&
    (!month||e.date.slice(0,7)===month) &&
    (!search||(e.notes||'').toLowerCase().includes(search)||(e.type||'').toLowerCase().includes(search))
  ).sort((a,b)=>b.date.localeCompare(a.date));

  const canApprove = hasPerm('expense', PERM.EDIT);
  const body = document.getElementById('expenseBody');
  if (!exps.length) { body.innerHTML=`<tr><td colspan="8"><div class="empty-state"><p>No expense records found</p></div></td></tr>`; return; }
  body.innerHTML = exps.map(e=>{
    const sub = DB.users.find(u=>u.id===e.submittedBy);
    const appr = DB.users.find(u=>u.id===e.approvedBy);
    return `<tr>
      <td style="font-size:12px;">${fmtDate(e.date)}</td>
      <td><span class="badge badge-${(sub?.role||'mio').toLowerCase()}">${esc(sub?.name||'N/A')}</span></td>
      <td><span class="badge badge-ceo">${esc(e.type)}</span></td>
      <td class="taka" style="font-weight:700;">${taka(e.amount)}</td>
      <td style="font-size:12px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.notes||'—')}</td>
      <td><span class="status-chip ${e.status==='Approved'?'sc-approved':e.status==='Rejected'?'sc-rejected':'sc-pending'}">${esc(e.status)}</span></td>
      <td style="font-size:12px;">${esc(appr?appr.name:'—')}</td>
      <td>
        ${e.status==='Pending'&&canApprove&&e.submittedBy!==currentUser.id?`
          <button class="btn btn-success btn-sm" onclick="approveExpense(${e.id})">✓</button>
          <button class="btn btn-danger btn-sm" onclick="rejectExpense(${e.id})" style="margin-left:4px;">✗</button>`:
        (e.submittedBy===currentUser.id&&e.status==='Pending'?
          `<button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">Del</button>`:'—')}
      </td>
    </tr>`;
  }).join('');
}

export function openExpenseModal(id=null) {
  // #17 — need CREATE to submit; editing own pending requires ownership
  if (!id && !hasPerm('expense', PERM.CREATE)) { toast('Access denied','error'); return; }
  if (id) {
    const e = DB.expenses.find(x=>x.id===id);
    if (!e) { toast('Expense not found','error'); return; }
    if (e.submittedBy!==currentUser.id) { toast('You can only edit your own expense','error'); return; }
    if (e.status!=='Pending') { toast('Only pending expenses can be edited','error'); return; }
  }
  document.getElementById('expenseId').value=id||'';
  document.getElementById('expenseModalTitle').textContent=id?'Edit Expense':'Submit Expense';
  if (!id) {
    document.getElementById('expDate').value=today();
    document.getElementById('expAmount').value='';
    document.getElementById('expNotes').value='';
  } else {
    const e = DB.expenses.find(x=>x.id===id);
    document.getElementById('expDate').value=e.date;
    document.getElementById('expType').value=e.type;
    document.getElementById('expAmount').value=e.amount;
    document.getElementById('expNotes').value=e.notes||'';
  }
  openModal('expenseModal');
}

export function saveExpense() {
  if (!hasPerm('expense', PERM.CREATE) && !hasPerm('expense', PERM.EDIT)) { toast('Access denied','error'); return; }
  const date = document.getElementById('expDate').value;
  const amountRaw = document.getElementById('expAmount').value;
  if (!V.required(date,'Date')) return;
  if (!V.nonNegativeNumber(amountRaw,'Amount') || parseFloat(amountRaw)<=0) { toast('Amount must be greater than 0','error'); return; }
  const id = parseInt(document.getElementById('expenseId').value)||0;
  if (id) {
    const existing = DB.expenses.find(e=>e.id===id);
    // #19 — only owner may edit, and only while pending
    if (!existing || existing.submittedBy!==currentUser.id || existing.status!=='Pending') { toast('Cannot edit this expense','error'); return; }
    Object.assign(existing, {
      date, type:document.getElementById('expType').value,
      amount:V.clampNonNeg(amountRaw), notes:cleanInput(document.getElementById('expNotes').value, 400)
    });
    logAudit('update','expense',id);
    toast('Expense updated','success');
  } else {
    const rec = {
      id:DB.nextId.expense++, uid:genUid(), submittedBy:currentUser.id, date,
      type:document.getElementById('expType').value, amount:V.clampNonNeg(amountRaw),
      notes:cleanInput(document.getElementById('expNotes').value, 400), status:'Pending', approvedBy:null
    };
    DB.expenses.push(rec);
    logAudit('create','expense',rec.id,{amount:rec.amount});
    toast('Expense submitted!','success');
  }
  saveDB(); closeModal('expenseModal'); initExpensePage(); renderExpenses();
}

// #19 — centralised guard: approver must have EDIT, must NOT be the submitter,
// and must outrank the submitter in the reporting hierarchy.

export function _canActOnExpense(e) {
  if (!e || e.status!=='Pending') return false;
  if (!hasPerm('expense', PERM.EDIT)) return false;
  if (e.submittedBy===currentUser.id) return false;
  if (currentUser.role==='CEO') return true;
  return Auth.outranks(currentUser.id, e.submittedBy);
}

export function approveExpense(id) {
  const e = DB.expenses.find(x=>x.id===id);
  if (!_canActOnExpense(e)) { toast('You are not authorized to approve this expense','error'); return; }
  e.status='Approved'; e.approvedBy=currentUser.id;
  logAudit('approve','expense',id,{amount:e.amount});
  saveDB(); toast('Expense approved','success'); renderExpenses(); initExpensePage();
}

export function rejectExpense(id) {
  const e = DB.expenses.find(x=>x.id===id);
  if (!_canActOnExpense(e)) { toast('You are not authorized to reject this expense','error'); return; }
  e.status='Rejected'; e.approvedBy=currentUser.id;
  logAudit('reject','expense',id,{amount:e.amount});
  saveDB(); toast('Expense rejected','info'); renderExpenses(); initExpensePage();
}

export function deleteExpense(id) {
  const e = DB.expenses.find(x=>x.id===id);
  if (!e) { toast('Expense not found','error'); return; }
  // #19 — only the submitter may delete, and only while pending
  if (e.submittedBy!==currentUser.id || e.status!=='Pending') { toast('You can only delete your own pending expense','error'); return; }
  if (!confirm('Delete expense?')) return;
  DB.expenses = DB.expenses.filter(e=>e.id!==id);
  logAudit('delete','expense',id);
  saveDB(); toast('Expense deleted','info'); renderExpenses(); initExpensePage();
}

// ===================== BOOT =====================
// 1. MIGRATION-SENSITIVE — convert any plaintext passwords to salted hashes.
