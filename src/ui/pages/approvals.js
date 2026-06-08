// ui/pages/approvals.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { buildNav } from '../../app/nav.js';
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { DB, saveDB } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { canApproveInvoice, checkStockAvailability, getApprovalStatusBadgeClass, getNextApprovalStatus, renderInvoices, viewInvoice } from './invoices.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { fmtDate, taka, today } from '../../utils/format.js';

export function renderApprovalQueue() {
  // Stats
  const all = DB.invoices.filter(inv=>inv.payType&&inv.payType!=='Cash');
  const pending = all.filter(inv=>['Pending AM','Pending RSM','Pending ASM'].includes(inv.approvalStatus));
  const approved = all.filter(inv=>inv.approvalStatus==='Approved'||inv.approvalStatus==='Invoiced');
  const rejected = all.filter(inv=>inv.approvalStatus==='Rejected');
  document.getElementById('approvalStats').innerHTML = `
    <div class="stat-card orange"><div class="stat-label">Pending</div><div class="stat-value">${pending.length}</div><div class="stat-sub">Awaiting approval</div></div>
    <div class="stat-card green"><div class="stat-label">Approved</div><div class="stat-value">${approved.length}</div><div class="stat-sub">Fully approved</div></div>
    <div class="stat-card red"><div class="stat-label">Rejected</div><div class="stat-value">${rejected.length}</div><div class="stat-sub">Rejected invoices</div></div>
    <div class="stat-card blue"><div class="stat-label">Total Credit/Partial</div><div class="stat-value">${all.length}</div><div class="stat-sub">Non-cash invoices</div></div>
  `;

  const body = document.getElementById('approvalQueueBody');
  if (!all.length) { body.innerHTML=`<tr><td colspan="8"><div class="empty-state"><p>No credit/partial invoices</p></div></td></tr>`; return; }

  body.innerHTML = all.sort((a,b)=>{
    const order={'Pending AM':0,'Pending RSM':1,'Pending ASM':2,'Approved':3,'Rejected':4,'Invoiced':5,'Draft':6};
    return (order[a.approvalStatus]||9)-(order[b.approvalStatus]||9);
  }).map(inv=>{
    const party = DB.parties.find(p=>p.id===inv.partyId);
    const mio = DB.users.find(u=>u.id===inv.mioId);
    const apSt = inv.approvalStatus||'Draft';
    const needsAction = canApproveInvoice(inv);
    return `<tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">${esc(inv.invoiceNo)}</td>
      <td style="font-size:12px;">${fmtDate(inv.date)}</td>
      <td>${esc(party?.name||'N/A')}</td>
      <td><span class="badge ${inv.payType==='Credit'?'badge-due':'badge-partial'}">${esc(inv.payType)}</span></td>
      <td class="taka">${taka(inv.total)}</td>
      <td><span class="badge badge-mio">${esc(mio?.name||'N/A')}</span></td>
      <td><span class="badge ${getApprovalStatusBadgeClass(apSt)}">${esc(apSt)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewInvoice(${inv.id})">View</button>
        ${needsAction?`<button class="btn btn-success btn-sm" onclick="openApprovalModal(${inv.id})" style="margin-left:4px;">⚡ Act</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

/// UPDATED SECTION — Open approval modal with invoice info + history

export function openApprovalModal(invoiceId) {
  const inv = DB.invoices.find(i=>i.id===invoiceId);
  if (!inv) return;
  const party = DB.parties.find(p=>p.id===inv.partyId);
  document.getElementById('approvalInvoiceId').value = invoiceId;
  document.getElementById('approvalModalTitle').textContent = `${inv.approvalStatus} — ${inv.invoiceNo}`;
  document.getElementById('approvalRemarks').value = '';

  document.getElementById('approvalInvoiceInfo').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div><span style="color:var(--text3);">Invoice:</span> <strong>${esc(inv.invoiceNo)}</strong></div>
      <div><span style="color:var(--text3);">Date:</span> ${fmtDate(inv.date)}</div>
      <div><span style="color:var(--text3);">Party:</span> ${esc(party?.name||'N/A')}</div>
      <div><span style="color:var(--text3);">Pay Type:</span> <span class="badge ${inv.payType==='Credit'?'badge-due':'badge-partial'}">${esc(inv.payType)}</span></div>
      <div><span style="color:var(--text3);">Total:</span> <strong class="taka">${taka(inv.total)}</strong></div>
      <div><span style="color:var(--text3);">Paid:</span> <span class="taka">${taka(inv.paid)}</span></div>
    </div>
  `;

  // Render approval history
  const hist = inv.approvalHistory||[];
  const histList = document.getElementById('approvalHistoryList');
  if (!hist.length) {
    histList.innerHTML = '<li style="color:var(--text3);font-size:12px;">No history yet</li>';
  } else {
    histList.innerHTML = hist.map(h=>{
      const usr = DB.users.find(u=>u.id===h.by);
      const color = h.action==='approved'?'var(--success)':h.action==='rejected'?'var(--danger)':'var(--accent)';
      return `<li>
        <div class="ap-dot" style="background:${color};"></div>
        <div>
          <strong>${esc(h.action.toUpperCase())}</strong> by ${esc(usr?.name||'System')} (${esc(h.role||usr?.role||'—')})
          <span style="color:var(--text3);font-size:11px;margin-left:8px;">${esc(h.date)}</span>
          ${h.remarks?`<br><span style="color:var(--text3);font-size:12px;">${esc(h.remarks)}</span>`:''}
        </div>
      </li>`;
    }).join('');
  }

  // Show/hide approve button based on whether user can approve
  const canAct = canApproveInvoice(inv);
  document.getElementById('approvalApproveBtn').style.display = canAct?'':'none';
  document.getElementById('approvalRejectBtn').style.display = canAct?'':'none';

  openModal('approvalModal');
}

/// UPDATED SECTION — Submit approve/reject action, advance pipeline, trigger invoice on ASM approval

export function submitApprovalAction(action) {
  const invoiceId = parseInt(document.getElementById('approvalInvoiceId').value);
  const remarks = cleanInput(document.getElementById('approvalRemarks').value, 300);
  const inv = DB.invoices.find(i=>i.id===invoiceId);
  if (!inv) { toast('Invoice not found','error'); return; }
  // #17/#19 — re-verify authorization at action time (modal visibility is not trust)
  if (!canApproveInvoice(inv)) { toast('You are not authorized to act on this invoice at its current stage','error'); return; }

  const histEntry = { action, by:currentUser.id, role:currentUser.role, date:today(), remarks };
  inv.approvalHistory = inv.approvalHistory||[];
  inv.approvalHistory.push(histEntry);

  if (action==='reject') {
    inv.approvalStatus = 'Rejected';
    logAudit('reject', 'invoice', inv.id, { invoiceNo: inv.invoiceNo, remarks });
    toast(`Invoice ${inv.invoiceNo} rejected.`,'error');
  } else {
    const next = getNextApprovalStatus(inv.approvalStatus, 'approve');
    if (next==='Approved') {
      // Final approval: #11/#12 validate stock BEFORE deducting / finalizing
      const stockErr = checkStockAvailability(inv.items);
      if (stockErr) {
        // roll back the just-pushed history entry so state stays consistent
        inv.approvalHistory.pop();
        toast(stockErr + ' — cannot finalize approval', 'error');
        return;
      }
      inv.approvalStatus = 'Approved';
      inv.items.forEach(it=>{
        const prod = DB.products.find(p=>p.id===it.productId);
        if (prod) prod.stock = Math.max(0, prod.stock - it.qty);
      });
      inv.approvalStatus = 'Invoiced';
      logAudit('approve_final', 'invoice', inv.id, { invoiceNo: inv.invoiceNo });
      toast(`Invoice ${inv.invoiceNo} APPROVED & invoiced! Stock deducted.`,'success');
    } else {
      inv.approvalStatus = next;
      logAudit('approve_advance', 'invoice', inv.id, { invoiceNo: inv.invoiceNo, to: next });
      toast(`Invoice ${inv.invoiceNo} advanced to ${next}`,'info');
    }
  }

  saveDB();
  closeModal('approvalModal');
  buildNav(); // refresh badge count
  renderApprovalQueue();
  renderInvoices();
}

// ===================== GEOGRAPHY HIERARCHY =====================
/// UPDATED SECTION — 4-level geo: Division → Region → Area → Territory
