// ui/pages/dashboard.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from '../../services/authService.js';
import { getSubordinateIds, getVisibleInvoices, getVisibleParties, getVisibleUserIds } from '../../store/selectors.js';
import { DB, realInvoices } from '../../store/store.js';
import { getAggregatedTarget } from './targets.js';
import { esc } from '../../utils/esc.js';
import { taka, thisMonth } from '../../utils/format.js';

export function renderDashboard() {
  const myInvoices = getVisibleInvoices(currentUser);
  // #6 — only real (non-void) invoices count toward money totals
  const realMy = realInvoices(myInvoices);
  const totalSales = realMy.reduce((s,i)=>s+i.total,0);
  const totalDue = realMy.reduce((s,i)=>s+(i.total-i.paid),0);
  const totalPaid = realMy.reduce((s,i)=>s+i.paid,0);
  const myParties = getVisibleParties(currentUser);

  if (currentUser.role === 'CEO') {
    _renderCEODashboard(myInvoices, totalSales, totalDue, totalPaid, myParties);
  } else if (currentUser.role === 'ASM') {
    _renderASMDashboard(myInvoices, totalSales, totalDue, totalPaid);
  } else {
    _renderFieldDashboard(myInvoices, totalSales, totalDue, totalPaid, myParties);
  }
}

/// UPDATED SECTION — CEO Dashboard: National Summary, Territory Performance, Gross Profit

export function _renderCEODashboard(myInvoices, totalSales, totalDue, totalPaid, myParties) {
  const allInvoices = realInvoices(DB.invoices); // #6 — exclude rejected/draft
  const natSales = allInvoices.reduce((s,i)=>s+i.total,0);
  const natPaid  = allInvoices.reduce((s,i)=>s+i.paid,0);
  const natDue   = allInvoices.reduce((s,i)=>s+(i.total-i.paid),0);
  const tpTotal  = allInvoices.reduce((s,inv)=>s+inv.items.reduce((a,it)=>a+(it.tp*it.qty),0),0);
  const gp       = natSales - tpTotal;
  const gpPct    = natSales > 0 ? Math.round(gp/natSales*100) : 0;

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card blue"><div class="stat-label">National Total Sales</div><div class="stat-value taka">${taka(natSales)}</div><div class="stat-sub">${allInvoices.length} invoices nationwide</div></div>
    <div class="stat-card green"><div class="stat-label">Total Collection</div><div class="stat-value taka">${taka(natPaid)}</div><div class="stat-sub">All territories combined</div></div>
    <div class="stat-card red"><div class="stat-label">Total Outstanding</div><div class="stat-value taka">${taka(natDue)}</div><div class="stat-sub">${allInvoices.filter(i=>i.status!=='Paid').length} pending invoices</div></div>
    <div class="stat-card green"><div class="stat-label">Gross Profit</div><div class="stat-value taka">${taka(gp)}</div><div class="stat-sub">GP Margin: ${gpPct}% — CEO View</div></div>
    <div class="stat-card orange"><div class="stat-label">Active Parties</div><div class="stat-value">${DB.parties.length}</div><div class="stat-sub">Pharma / Doctor / Chemist</div></div>
  `;

  // Territory performance table
  const asmList = DB.users.filter(u=>u.role==='ASM');
  const rsmPerf = DB.users.filter(u=>u.role==='RSM').map(rsm=>{
    const subIds = getSubordinateIds(rsm.id).concat([rsm.id]);
    const mioIds = DB.users.filter(u=>u.role==='MIO' && subIds.includes(u.id)).map(u=>u.id);
    const sales  = realInvoices(DB.invoices.filter(inv=>mioIds.includes(inv.mioId))).reduce((s,i)=>s+i.total,0);
    const target = getAggregatedTarget(rsm.id, thisMonth());
    const pct    = target>0 ? Math.round(sales/target*100) : 0;
    const color  = pct>=100?'var(--success)':pct>=70?'var(--warning)':'var(--danger)';
    const asm    = DB.users.find(u=>u.id===rsm.reportsTo);
    return { rsm, sales, target, pct, color, asm };
  });

  document.getElementById('dashBottom').innerHTML = `
    <div class="card" style="grid-column:1/-1;">
      <div style="font-weight:700;margin-bottom:14px;font-size:14px;">📊 National Territory Performance</div>
      <div class="table-wrap" style="border:none;">
        <table>
          <thead><tr><th>RSM</th><th>Territory</th><th>Territory Code</th><th>Under ASM</th><th>Sales (৳)</th><th>Target (৳)</th><th>Achievement</th></tr></thead>
          <tbody>
            ${rsmPerf.map(r=>`<tr>
              <td><strong>${esc(r.rsm.name)}</strong></td>
              <td style="font-size:12px;">${esc(r.rsm.territory)}</td>
              <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${esc(r.rsm.territoryCode||'—')}</span></td>
              <td><span class="badge badge-asm">${esc(r.asm?.name||'—')}</span></td>
              <td class="taka">${taka(r.sales)}</td>
              <td class="taka">${r.target>0?taka(r.target):'No Target'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;min-width:80px;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;">
                    <div style="width:${Math.min(r.pct,100)}%;height:100%;background:${r.color};border-radius:3px;"></div>
                  </div>
                  <span style="font-size:12px;font-weight:700;color:${r.color};min-width:36px;">${r.pct}%</span>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/// UPDATED SECTION — ASM Dashboard: Regional KPI, Team Achievement, RSM-wise performance

export function _renderASMDashboard(myInvoices, totalSales, totalDue, totalPaid) {
  const subIds = getSubordinateIds(currentUser.id).concat([currentUser.id]);
  const rsmList = DB.users.filter(u=>u.role==='RSM' && subIds.includes(u.id));
  const amCount = DB.users.filter(u=>u.role==='AM' && subIds.includes(u.id)).length;
  const mioCount= DB.users.filter(u=>u.role==='MIO' && subIds.includes(u.id)).length;
  const totalTarget = getAggregatedTarget(currentUser.id, thisMonth());
  const achPct = totalTarget>0 ? Math.round(totalSales/totalTarget*100) : 0;
  const achColor = achPct>=100?'var(--success)':achPct>=70?'var(--warning)':'var(--danger)';

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card blue"><div class="stat-label">Regional Sales</div><div class="stat-value taka">${taka(totalSales)}</div><div class="stat-sub">${myInvoices.length} invoices in region</div></div>
    <div class="stat-card green"><div class="stat-label">Total Collection</div><div class="stat-value taka">${taka(totalPaid)}</div><div class="stat-sub">Collected from region</div></div>
    <div class="stat-card red"><div class="stat-label">Total Outstanding</div><div class="stat-value taka">${taka(totalDue)}</div><div class="stat-sub">Region-wide due amount</div></div>
    <div class="stat-card orange"><div class="stat-label">Team Size</div><div class="stat-value">${rsmList.length} RSM · ${amCount} AM · ${mioCount} MIO</div><div class="stat-sub">Under your region</div></div>
    <div class="stat-card ${achPct>=100?'green':achPct>=70?'orange':'red'}"><div class="stat-label">Regional Achievement</div><div class="stat-value" style="color:${achColor};">${achPct}%</div><div class="stat-sub">Target: ${taka(totalTarget)}</div></div>
  `;

  // RSM-wise performance
  const rsmPerf = rsmList.map(rsm => {
    const rsmSubIds = getSubordinateIds(rsm.id).concat([rsm.id]);
    const mioIds = DB.users.filter(u=>u.role==='MIO' && rsmSubIds.includes(u.id)).map(u=>u.id);
    const sales = realInvoices(DB.invoices.filter(inv=>mioIds.includes(inv.mioId))).reduce((s,i)=>s+i.total,0);
    const target = getAggregatedTarget(rsm.id, thisMonth());
    const pct = target>0 ? Math.round(sales/target*100) : 0;
    const color = pct>=100?'var(--success)':pct>=70?'var(--warning)':'var(--danger)';
    return { rsm, sales, target, pct, color };
  });

  document.getElementById('dashBottom').innerHTML = `
    <div class="card" style="grid-column:1/-1;">
      <div style="font-weight:700;margin-bottom:14px;font-size:14px;">🗂 RSM-wise Performance</div>
      <div class="table-wrap" style="border:none;">
        <table>
          <thead><tr><th>RSM Name</th><th>Territory</th><th>Code</th><th>Sales (৳)</th><th>Target (৳)</th><th>Achievement</th></tr></thead>
          <tbody>
            ${rsmPerf.map(r=>`<tr>
              <td><strong>${esc(r.rsm.name)}</strong></td>
              <td style="font-size:12px;">${esc(r.rsm.territory)}</td>
              <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">${esc(r.rsm.territoryCode||'—')}</span></td>
              <td class="taka">${taka(r.sales)}</td>
              <td class="taka">${r.target>0?taka(r.target):'No Target'}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;min-width:80px;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;">
                    <div style="width:${Math.min(r.pct,100)}%;height:100%;background:${r.color};border-radius:3px;"></div>
                  </div>
                  <span style="font-size:12px;font-weight:700;color:${r.color};min-width:36px;">${r.pct}%</span>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/// UPDATED SECTION — RSM/AM/MIO Dashboard: Recent Invoices + Territory Overview

export function _renderFieldDashboard(myInvoices, totalSales, totalDue, totalPaid, myParties) {
  const totalTarget = getAggregatedTarget(currentUser.id, thisMonth());
  const achPct = totalTarget>0 ? Math.round(totalSales/totalTarget*100) : 0;
  const achColor = achPct>=100?'var(--success)':achPct>=70?'var(--warning)':'var(--danger)';

  let statsHtml = `
    <div class="stat-card blue"><div class="stat-label">Total Sales</div><div class="stat-value taka">${taka(totalSales)}</div><div class="stat-sub">${myInvoices.length} invoices</div></div>
    <div class="stat-card green"><div class="stat-label">Total Collected</div><div class="stat-value taka">${taka(totalPaid)}</div><div class="stat-sub">Paid amount</div></div>
    <div class="stat-card red"><div class="stat-label">Outstanding Due</div><div class="stat-value taka">${taka(totalDue)}</div><div class="stat-sub">${myInvoices.filter(i=>i.status!=='Paid').length} pending</div></div>
    <div class="stat-card orange"><div class="stat-label">Active Parties</div><div class="stat-value">${myParties.length}</div><div class="stat-sub">Pharmacy/Doctor/Chemist</div></div>
    <div class="stat-card ${achPct>=100?'green':achPct>=70?'orange':'red'}"><div class="stat-label">Achievement</div><div class="stat-value" style="color:${achColor};">${achPct}%</div><div class="stat-sub">Target: ${taka(totalTarget)}</div></div>
  `;
  document.getElementById('dashStats').innerHTML = statsHtml;

  // Recent invoices (RSM, AM, MIO only)
  const recentInv = [...myInvoices].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('dashBottom').innerHTML = `
    <div class="card">
      <div style="font-weight:700;margin-bottom:14px;font-size:14px;">Recent Invoices</div>
      <div class="table-wrap" style="border:none;">
        <table>
          <thead><tr><th>Invoice#</th><th>Party</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${recentInv.map(inv=>{
              const party = DB.parties.find(p=>p.id===inv.partyId);
              return `<tr>
                <td style="font-family:'JetBrains Mono',monospace;font-size:12px;">${esc(inv.invoiceNo)}</td>
                <td>${esc(party?.name||'N/A')}</td>
                <td class="taka">${taka(inv.total)}</td>
                <td><span class="badge badge-${inv.status.toLowerCase()}">${esc(inv.status)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:14px;font-size:14px;">Territory Overview</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${['MIO','AM','RSM'].filter(r=>getSubordinateIds(currentUser.id).some(id=>DB.users.find(u=>u.id===id)?.role===r)).map(role=>{
          const count = DB.users.filter(u=>u.role===role && getVisibleUserIds(currentUser).includes(u.id)).length;
          if (count===0) return '';
          const sales = realInvoices(myInvoices).filter(inv=>{
            const mioUser = DB.users.find(u=>u.id===inv.mioId);
            return mioUser?.role===role || (role==='MIO' && inv.mioId===currentUser.id);
          }).reduce((s,i)=>s+i.total,0);
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--surface2);border-radius:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="badge badge-${role.toLowerCase()}">${role}</span>
              <span style="font-size:13px;color:var(--text2);">${count} member${count!==1?'s':''}</span>
            </div>
            <span class="taka" style="font-weight:700;font-size:13px;">${taka(sales)}</span>
          </div>`;
        }).join('')}
        ${currentUser.role==='MIO'?`<div style="padding:10px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text3);">Your personal sales: <strong class="taka" style="color:var(--text);">${taka(realInvoices(myInvoices).reduce((s,i)=>s+i.total,0))}</strong></div><div style="padding:10px;background:var(--surface2);border-radius:8px;font-size:13px;color:var(--text3);">Territory Code: <strong style="font-family:'JetBrains Mono',monospace;color:var(--accent2);">${esc(currentUser.territoryCode||'N/A')}</strong></div>`:''}
      </div>
    </div>
  `;
}

// ===================== PRODUCTS =====================
/// UPDATED SECTION — Product access control: only CEO and Warehouse can add/edit/delete
