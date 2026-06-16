// ui/pages/invoices.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { buildNav, getPendingApprovalCount } from '../../app/nav.js';
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth, hasPerm } from '../../services/permissionService.js';
import { getSubordinateIds, getVisibleInvoices, getVisibleParties } from '../../store/selectors.js';
import { DB, partyExists, productExists, saveDB } from '../../store/store.js';
import { populateDropdowns } from '../components/dropdowns.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openApprovalModal } from './approvals.js';
import { PERM } from '../../utils/constants.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { fmtDate, taka, today } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export let editingInvoiceItems = [];

// ===================== HELPERS =====================

export function getApprovalStatusBadgeClass(st) {
  const map = {
    'Draft':'ap-draft','Pending AM':'ap-pending-am','Pending RSM':'ap-pending-rsm',
    'Pending ASM':'ap-pending-asm','Approved':'ap-approved','Rejected':'ap-rejected','Invoiced':'ap-invoiced'
  };
  return map[st]||'ap-draft';
}

export function renderInvoices() {
  const search = (document.getElementById('invoiceSearch')?.value||'').toLowerCase();
  const status = document.getElementById('invoiceStatusFilter')?.value||'';
  const payType = document.getElementById('invoicePayTypeFilter')?.value||'';
  const visInv = getVisibleInvoices(currentUser);
  const invs = visInv.filter(inv=>{
    const party = DB.parties.find(p=>p.id===inv.partyId);
    const matchSearch = inv.invoiceNo.toLowerCase().includes(search)||party?.name.toLowerCase().includes(search);
    const matchStatus = !status || inv.approvalStatus===status || inv.status===status;
    const matchPayType = !payType || inv.payType===payType;
    return matchSearch && matchStatus && matchPayType;
  }).sort((a,b)=>b.date.localeCompare(a.date));
  const body = document.getElementById('invoicesBody');
  if (!invs.length) { body.innerHTML=`<tr><td colspan="10"><div class="empty-state"><p>No invoices found</p></div></td></tr>`; return; }
  body.innerHTML = invs.map(inv=>{
    const party = DB.parties.find(p=>p.id===inv.partyId);
    const itemCount = inv.items.length;
    const due = inv.total-inv.paid;
    const apSt = inv.approvalStatus||'Invoiced';
    const needsAction = canApproveInvoice(inv);
    return `<tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">${esc(inv.invoiceNo)}</td>
      <td style="font-size:12px;">${fmtDate(inv.date)}</td>
      <td>${esc(party?.name||'N/A')}<br><span style="font-size:11px;color:var(--text3);">${esc(party?.area||'')}</span></td>
      <td><span class="badge ${inv.payType==='Cash'?'badge-paid':inv.payType==='Credit'?'badge-due':'badge-partial'}">${esc(inv.payType||'Cash')}</span></td>
      <td style="color:var(--text3);font-size:12px;">${itemCount} item${itemCount!==1?'s':''}</td>
      <td class="taka">${taka(inv.total)}</td>
      <td class="taka" style="color:var(--success);">${taka(inv.paid)}</td>
      <td class="taka" style="color:${due>0?'var(--danger)':'var(--text3)'};">${taka(due)}</td>
      <td><span class="badge ${getApprovalStatusBadgeClass(apSt)}">${esc(apSt)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewInvoice(${inv.id})">View</button>
        ${needsAction?`<button class="btn btn-warning btn-sm" onclick="openApprovalModal(${inv.id})" style="margin-left:4px;">Approve</button>`:''}
        ${canEditInvoice()?`<button class="btn btn-danger btn-sm" onclick="deleteInvoice(${inv.id})" style="margin-left:4px;">Del</button>`:''}
      </td>
    </tr>`;
  }).join('');
  updateApprovalQueueButton();
}

export function canEditInvoice() { return ['CEO','ASM','RSM'].includes(currentUser.role); }

/// UPDATED SECTION — Determines if current user can approve a given invoice

export function canApproveInvoice(inv) {
  const apSt = inv.approvalStatus;
  if (!apSt || apSt==='Invoiced' || apSt==='Approved' || apSt==='Rejected' || apSt==='Draft') return false;
  if (apSt==='Pending AM' && currentUser.role==='AM') {
    // Must be the AM assigned to the MIO
    const mio = DB.users.find(u=>u.id===inv.mioId);
    return mio && mio.reportsTo===currentUser.id;
  }
  if (apSt==='Pending RSM' && currentUser.role==='RSM') {
    const subIds = getSubordinateIds(currentUser.id);
    return subIds.includes(inv.mioId);
  }
  if (apSt==='Pending ASM' && currentUser.role==='ASM') {
    const subIds = getSubordinateIds(currentUser.id);
    return subIds.includes(inv.mioId);
  }
  if ((currentUser.role==='CEO'||currentUser.role==='ASM') && ['Pending AM','Pending RSM','Pending ASM'].includes(apSt)) return true;
  return false;
}

/// UPDATED SECTION — Next approval status in pipeline

export function getNextApprovalStatus(currentStatus, action) {
  if (action==='reject') return 'Rejected';
  const chain = ['Pending AM','Pending RSM','Pending ASM','Approved'];
  const idx = chain.indexOf(currentStatus);
  return chain[idx+1] || 'Approved';
}

/// UPDATED SECTION — Get pending count for current user's approval role

export function updateApprovalQueueButton() {
  const btn = document.getElementById('approvalQueueBtn');
  const ct = document.getElementById('pendingApprovalCount');
  if (!btn) return;
  const count = getPendingApprovalCount();
  if (count>0 && hasPerm('approvals', PERM.EDIT)) {
    btn.style.display='';
    ct.textContent=count;
  } else {
    btn.style.display='none';
  }
}

/// UPDATED SECTION — Invoice modal: show/hide paid field for credit, show notice

export function onInvPayTypeChange() {
  const pt = document.getElementById('invPayType').value;
  const notice = document.getElementById('invApprovalNotice');
  const paidGroup = document.getElementById('invPaidGroup');
  const submitBtn = document.getElementById('invSubmitBtn');
  if (pt==='Cash') {
    notice.style.display='none';
    paidGroup.style.display='';
    submitBtn.textContent='Create Invoice';
  } else if (pt==='Credit') {
    notice.style.display='';
    paidGroup.style.display='none';
    document.getElementById('invPaid').value='0';
    submitBtn.textContent='Submit for Approval';
  } else { // Partial
    notice.style.display='';
    paidGroup.style.display='';
    submitBtn.textContent='Submit for Approval';
  }
}

export function onInvPartyChange() {} // Placeholder for future territory auto-fill

/// UPDATED SECTION (fix #5) — robust, collision-free invoice number generation.
// Uses a dedicated monotonic sequence (never reused even after deletes) and the
// invoice's own year, then guarantees uniqueness against existing numbers.

export function genInvoiceNo(dateStr) {
  const year = (dateStr && /^\d{4}/.test(dateStr)) ? dateStr.slice(0,4) : String(new Date().getFullYear());
  let seq = DB.nextId.invoiceSeq || 1;
  let candidate;
  do {
    candidate = `INV-${year}-${String(seq).padStart(3,'0')}`;
    seq++;
  } while (DB.invoices.some(inv => inv.invoiceNo === candidate));
  DB.nextId.invoiceSeq = seq; // persist advanced sequence
  return candidate;
}

// #11/#12 — validate that requested quantities do not exceed available stock.
// Returns null if OK, or an error message string.

export function checkStockAvailability(items) {
  for (const it of items) {
    const prod = DB.products.find(p => p.id === it.productId);
    if (!prod) return 'One or more products no longer exist';
    if (it.qty > prod.stock) {
      return `Insufficient stock for "${prod.name}": requested ${it.qty}, available ${prod.stock}`;
    }
  }
  return null;
}

export function openInvoiceModal() {
  // #17 — authorization: need at least CREATE on invoices module
  if (!Auth.require('invoices', PERM.CREATE)) return;
  editingInvoiceItems = [{productId:'', qty:1, tp:0, sp:0, disc:0}];
  document.getElementById('invDate').value = today();
  document.getElementById('invPaid').value = '';
  document.getElementById('invNotes').value = '';
  document.getElementById('invPayType').value = 'Cash';
  // refresh party dropdown so deleted/added parties stay consistent
  populateDropdowns();
  onInvPayTypeChange();
  renderInvoiceItems();
  openModal('invoiceModal');
}

/// UPDATED SECTION — saveInvoice: approval pipeline for Credit/Partial, instant for Cash

export function saveInvoice() {
  // #17 — authorization
  if (!Auth.require('invoices', PERM.CREATE)) return;
  const partyId = parseInt(document.getElementById('invParty').value);
  const date = document.getElementById('invDate').value;
  if (!partyId||!date) { toast('Select party and date','error'); return; }
  // #13/#14 — referential integrity: party must exist AND be visible to this user
  if (!partyExists(partyId) || !getVisibleParties(currentUser).some(p=>p.id===partyId)) {
    toast('Selected party is invalid or not in your territory','error'); return;
  }
  const validItems = editingInvoiceItems.filter(it=>it.productId);
  if (!validItems.length) { toast('Add at least one product','error'); return; }
  // #13/#14 — every line item must reference an existing product; qty/disc sane
  for (const it of validItems) {
    if (!productExists(it.productId)) { toast('An invoice item references a missing product','error'); return; }
    if (!V.positiveInt(it.qty, 'Quantity')) return;
    if (!V.range(it.disc||0, 0, 100, 'Discount %')) return;
    if (it.sp < 0) { toast('Sale price cannot be negative','error'); return; }
  }
  const total = validItems.reduce((s,it)=>s+(it.sp*it.qty*(1-(it.disc||0)/100)),0);
  const payType = document.getElementById('invPayType').value;
  const paidRaw = document.getElementById('invPaid').value;
  if (payType !== 'Credit' && paidRaw !== '' && !V.nonNegativeNumber(paidRaw, 'Paid amount')) return;
  const paid = payType==='Credit' ? 0 : Math.min(V.clampNonNeg(paidRaw), total);

  // Approval pipeline setup
  let approvalStatus, payStatus;
  if (payType==='Cash') {
    // #11/#12 — validate stock BEFORE creating a Cash invoice (no overselling)
    const stockErr = checkStockAvailability(validItems);
    if (stockErr) { toast(stockErr, 'error'); return; }
    approvalStatus = 'Invoiced';
    payStatus = paid>=total?'Paid':paid>0?'Partial':'Due';
    // Deduct stock immediately for Cash (guaranteed non-negative by validation)
    validItems.forEach(it=>{
      const prod = DB.products.find(p=>p.id===it.productId);
      if (prod) prod.stock = Math.max(0, prod.stock - it.qty);
    });
  } else {
    // Credit or Partial — needs AM approval first
    approvalStatus = 'Pending AM';
    payStatus = payType==='Credit'?'Due':'Partial';
    // NO stock deduction yet (validated at final approval instead)
  }

  const approvalHistory = [{
    action:'submitted', by:currentUser.id, role:currentUser.role,
    date:today(), remarks:`${payType} invoice submitted`
  }];

  const newId = DB.nextId.invoice++;
  const inv = {
    id: newId,
    uid: genUid(), // H. MIGRATION-SENSITIVE
    invoiceNo: genInvoiceNo(date), // fix #5
    partyId, date, items: validItems.map(it=>({productId:it.productId, qty:V.clampInt(it.qty,1), tp:V.clampNonNeg(it.tp), sp:V.clampNonNeg(it.sp), disc:V.clampNonNeg(it.disc)})),
    total, paid,
    status: payStatus,
    payType, approvalStatus, approvalHistory,
    mioId: currentUser.id,
    territoryCode: currentUser.territoryCode || '',
    notes: cleanInput(document.getElementById('invNotes').value, 500)
  };
  DB.invoices.push(inv);
  logAudit('create', 'invoice', inv.id, { invoiceNo: inv.invoiceNo, payType, total });
  saveDB();
  if (payType==='Cash') {
    toast('Invoice created & invoiced!','success');
  } else {
    toast(`${payType} invoice submitted for AM approval!`,'info');
  }
  buildNav(); // refresh badge
  closeModal('invoiceModal');
  renderInvoices();
}

export function addInvoiceItem() {
  editingInvoiceItems.push({productId:'', qty:1, tp:0, sp:0, disc:0});
  renderInvoiceItems();
}

export function removeInvoiceItem(idx) {
  editingInvoiceItems.splice(idx,1);
  renderInvoiceItems();
}

export function renderInvoiceItems() {
  const container = document.getElementById('invoiceItems');
  container.innerHTML = editingInvoiceItems.map((item,idx)=>`
    <div class="inv-item-row">
      <select onchange="onProductSelect(${idx},this)">
        <option value="">Select Product</option>
        ${DB.products.map(p=>`<option value="${p.id}" ${p.id===item.productId?'selected':''}>${esc(p.name)}</option>`).join('')}
      </select>
      <input type="text" value="${item.unit||''}" readonly placeholder="Unit" style="background:var(--surface3);" />
      <input type="number" value="${item.qty}" min="1" onchange="editingInvoiceItems[${idx}].qty=parseInt(this.value)||1;calcInvoice()" />
      <input type="number" value="${item.tp}" step="0.01" readonly style="background:var(--surface3);" />
      <input type="number" value="${item.sp}" step="0.01" onchange="editingInvoiceItems[${idx}].sp=parseFloat(this.value)||0;calcInvoice()" />
      <input type="number" value="${item.disc}" min="0" max="100" onchange="editingInvoiceItems[${idx}].disc=parseFloat(this.value)||0;calcInvoice()" />
      <span class="taka" style="font-size:12px;font-family:'JetBrains Mono',monospace;">${taka(item.sp*item.qty*(1-item.disc/100))}</span>
      <button class="btn btn-danger btn-sm" onclick="removeInvoiceItem(${idx})" ${editingInvoiceItems.length<=1?'disabled':''}>×</button>
    </div>
  `).join('');
  calcInvoice();
}

export function onProductSelect(idx, el) {
  const prodId = parseInt(el.value)||'';
  editingInvoiceItems[idx].productId = prodId;
  if (prodId) {
    const p = DB.products.find(x=>x.id===prodId);
    editingInvoiceItems[idx].tp = p.tp;
    editingInvoiceItems[idx].sp = p.sp;
    editingInvoiceItems[idx].unit = p.unit;
  }
  renderInvoiceItems();
}

export function calcInvoice() {
  const subtotal = editingInvoiceItems.reduce((s,it)=>s+(it.sp*it.qty*(1-(it.disc||0)/100)),0);
  const paid = parseFloat(document.getElementById('invPaid')?.value)||0;
  const due = Math.max(0, subtotal-paid);
  document.getElementById('invSubtotal').textContent = taka(subtotal);
  document.getElementById('invTotalDisp').textContent = taka(subtotal);
  document.getElementById('invDueDisp').textContent = taka(due);
}

export function deleteInvoice(id) {
  // #17 — authorization
  if (!canEditInvoice()) { toast('Access denied','error'); return; }
  const inv = DB.invoices.find(i=>i.id===id);
  if (!inv) { toast('Invoice not found','error'); return; }
  if (!confirm('Delete this invoice?')) return;
  // #13 — data integrity: if stock was already deducted (Invoiced), restore it
  if (inv.approvalStatus === 'Invoiced') {
    inv.items.forEach(it=>{
      const prod = DB.products.find(p=>p.id===it.productId);
      if (prod) prod.stock = prod.stock + (parseInt(it.qty)||0);
    });
  }
  DB.invoices = DB.invoices.filter(i=>i.id!==id);
  logAudit('delete', 'invoice', id, { invoiceNo: inv.invoiceNo });
  saveDB(); // /// UPDATED SECTION
  toast('Invoice deleted','info'); renderInvoices();
}

export function viewInvoice(id) {
  const inv = DB.invoices.find(i=>i.id===id);
  if (!inv) { toast('Invoice not found','error'); return; }
  const party = DB.parties.find(p=>p.id===inv.partyId);
  const gp = currentUser.role==='CEO' ? inv.items.reduce((s,it)=>s+((it.sp-it.tp)*it.qty*(1-(it.disc||0)/100)),0) : 0;
  document.getElementById('invoiceViewBody').innerHTML = `
    <div style="background:var(--surface2);border-radius:10px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--accent);">RxPharma</div>
          <div style="font-size:12px;color:var(--text3);">Pharmaceutical Management System</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:700;font-family:'JetBrains Mono',monospace;">${esc(inv.invoiceNo)}</div>
          <div style="font-size:12px;color:var(--text3);">${fmtDate(inv.date)}</div>
          <span class="badge badge-${inv.status.toLowerCase()}" style="margin-top:6px;">${esc(inv.status)}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
        <div><span style="color:var(--text3);">Party: </span><strong>${esc(party?.name)}</strong></div>
        <div><span style="color:var(--text3);">Type: </span>${esc(party?.type)}</div>
        <div><span style="color:var(--text3);">Area: </span>${esc(party?.area)}</div>
        <div><span style="color:var(--text3);">Phone: </span>${esc(party?.phone)}</div>
      </div>
    </div>
    <div class="table-wrap" style="margin-bottom:16px;">
      <table>
        <thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>TP (৳)</th><th>SP (৳)</th><th>Disc%</th><th>Net (৳)</th>${currentUser.role==='CEO'?'<th>GP (৳)</th>':''}</tr></thead>
        <tbody>
          ${inv.items.map(it=>{
            const p = DB.products.find(x=>x.id===it.productId);
            const net = it.sp*it.qty*(1-(it.disc||0)/100);
            const itgp = (it.sp-it.tp)*it.qty*(1-(it.disc||0)/100);
            return `<tr>
              <td>${esc(p?.name||'N/A')}</td>
              <td><span class="badge badge-am">${esc(p?.unit||it.unit||'—')}</span></td>
              <td>${esc(it.qty)}</td>
              <td class="taka">${taka(it.tp)}</td>
              <td class="taka">${taka(it.sp)}</td>
              <td>${esc(it.disc||0)}%</td>
              <td class="taka"><strong>${taka(net)}</strong></td>
              ${currentUser.role==='CEO'?`<td class="taka" style="color:var(--success);">${taka(itgp)}</td>`:''}
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;background:var(--surface2);">
            <td colspan="${currentUser.role==='CEO'?6:5}" style="text-align:right;padding:12px 16px;">Total:</td>
            <td class="taka" style="padding:12px 16px;">${taka(inv.total)}</td>
            ${currentUser.role==='CEO'?`<td class="taka" style="color:var(--success);padding:12px 16px;">${taka(gp)}</td>`:''}
          </tr>
          <tr><td colspan="${currentUser.role==='CEO'?7:6}" style="text-align:right;padding:8px 16px;color:var(--success);">Paid: ${taka(inv.paid)}</td></tr>
          <tr><td colspan="${currentUser.role==='CEO'?7:6}" style="text-align:right;padding:8px 16px;color:var(--danger);font-weight:700;">Due: ${taka(inv.total-inv.paid)}</td></tr>
        </tfoot>
      </table>
    </div>
    ${inv.notes?`<div style="font-size:13px;color:var(--text3);padding:12px;background:var(--surface2);border-radius:8px;">Notes: ${esc(inv.notes)}</div>`:''}
  `;
  openModal('viewInvoiceModal');
}

// ===================== SALES REPORT =====================
