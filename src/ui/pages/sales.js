// ui/pages/sales.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from '../../services/authService.js';
import { getVisibleInvoices } from '../../store/selectors.js';
import { DB, realInvoices } from '../../store/store.js';
import { populateDropdowns } from '../components/dropdowns.js';
import { toast } from '../components/toast.js';
import { esc } from '../../utils/esc.js';
import { fmtDate, taka, thisMonth, today } from '../../utils/format.js';

export let salesFilterMode = 'today';

export function initSalesPage() {
  document.getElementById('salesFrom').value = today();
  document.getElementById('salesTo').value = today();
  populateDropdowns();
  // show GP column only for CEO
  document.getElementById('gpHeader').style.display = currentUser.role==='CEO'?'':'none';
}

export function setSalesFilter(mode, btn) {
  salesFilterMode = mode;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('customDateRange').style.display = mode==='custom'?'flex':'none';
  if (mode!=='custom') renderSalesReport();
}

export function getDateRange() {
  const t = today();
  const m = thisMonth();
  if (salesFilterMode==='today') return [t, t];
  if (salesFilterMode==='month') return [m+'-01', m+'-31'];
  return [document.getElementById('salesFrom').value, document.getElementById('salesTo').value];
}

export function renderSalesReport() {
  const [from, to] = getDateRange();
  const userFilter = document.getElementById('salesUserFilter')?.value||'';
  // #6 — sales report reflects real sales only (exclude Rejected/Draft)
  let invs = realInvoices(getVisibleInvoices(currentUser)).filter(inv => inv.date >= from && inv.date <= to);
  if (userFilter) invs = invs.filter(inv=>inv.mioId===parseInt(userFilter));

  const totalSales = invs.reduce((s,i)=>s+i.total,0);
  const totalDue = invs.reduce((s,i)=>s+(i.total-i.paid),0);
  const totalPaid = invs.reduce((s,i)=>s+i.paid,0);
  const totalGP = invs.reduce((s,inv)=>s+inv.items.reduce((a,it)=>a+((it.sp-it.tp)*it.qty*(1-(it.disc||0)/100)),0),0);

  let statsHtml = `
    <div class="stat-card blue"><div class="stat-label">Total Sales</div><div class="stat-value taka" style="font-size:20px;">${taka(totalSales)}</div><div class="stat-sub">${invs.length} invoices</div></div>
    <div class="stat-card green"><div class="stat-label">Collected</div><div class="stat-value taka" style="font-size:20px;">${taka(totalPaid)}</div><div class="stat-sub">Paid amount</div></div>
    <div class="stat-card red"><div class="stat-label">Total Due</div><div class="stat-value taka" style="font-size:20px;">${taka(totalDue)}</div><div class="stat-sub">Unpaid amount</div></div>
  `;
  if (currentUser.role==='CEO') statsHtml += `<div class="stat-card green"><div class="stat-label">Gross Profit</div><div class="stat-value taka" style="font-size:20px;">${taka(totalGP)}</div><div class="stat-sub">CEO only</div></div>`;
  document.getElementById('salesStats').innerHTML = statsHtml;

  const body = document.getElementById('salesBody');
  if (!invs.length) { body.innerHTML=`<tr><td colspan="9"><div class="empty-state"><p>No sales in this period</p></div></td></tr>`; return; }

  body.innerHTML = invs.sort((a,b)=>b.date.localeCompare(a.date)).map(inv=>{
    const party = DB.parties.find(p=>p.id===inv.partyId);
    const products = inv.items.map(it=>{ const p=DB.products.find(x=>x.id===it.productId); return p?.name||'N/A'; }).join(', ');
    const totalQty = inv.items.reduce((s,it)=>s+it.qty,0);
    const due = inv.total-inv.paid;
    const gp = inv.items.reduce((s,it)=>s+((it.sp-it.tp)*it.qty*(1-(it.disc||0)/100)),0);
    return `<tr>
      <td style="font-size:12px;">${fmtDate(inv.date)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">${esc(inv.invoiceNo)}</td>
      <td>${esc(party?.name||'N/A')}</td>
      <td style="font-size:12px;color:var(--text3);">${esc(products.length>30?products.slice(0,30)+'...':products)}</td>
      <td style="text-align:center;">${totalQty}</td>
      <td class="taka">${taka(inv.total)}</td>
      <td class="taka" style="color:${due>0?'var(--danger)':'var(--text3)'};">${taka(due)}</td>
      <td><span class="badge badge-${inv.status.toLowerCase()}">${esc(inv.status)}</span></td>
      <td style="display:${currentUser.role==='CEO'?'':'none'};color:var(--success);" class="taka">${taka(gp)}</td>
    </tr>`;
  }).join('');

  document.getElementById('salesFoot').innerHTML = `
    <tr>
      <td colspan="4" style="padding:12px 16px;text-align:right;color:var(--text2);">TOTAL</td>
      <td style="padding:12px 16px;">${invs.reduce((s,i)=>s+i.items.reduce((a,it)=>a+it.qty,0),0)}</td>
      <td style="padding:12px 16px;" class="taka">${taka(totalSales)}</td>
      <td style="padding:12px 16px;color:var(--danger);" class="taka">${taka(totalDue)}</td>
      <td style="padding:12px 16px;"></td>
      <td style="padding:12px 16px;color:var(--success);display:${currentUser.role==='CEO'?'':'none'};" class="taka">${taka(totalGP)}</td>
    </tr>
  `;
}

export function exportSalesReport() {
  toast('Export feature: copy table data to Excel','info');
}

// ===================== OUTSTANDING =====================
