// ui/pages/outstanding.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from '../../services/authService.js';
import { getVisibleParties } from '../../store/selectors.js';
import { DB, realInvoices } from '../../store/store.js';
import { partyTypeBadge } from './parties.js';
import { esc } from '../../utils/esc.js';
import { taka } from '../../utils/format.js';

export function renderOutstanding() {
  const search = (document.getElementById('outSearch')?.value||'').toLowerCase();
  const areaFilter = document.getElementById('outAreaFilter')?.value||'';
  const visParties = getVisibleParties(currentUser).filter(p =>
    p.name.toLowerCase().includes(search) && (areaFilter===''||p.area===areaFilter)
  );

  let totalDue = 0;
  const rows = visParties.map(party => {
    // #6 — outstanding excludes Rejected/Draft invoices (they are not receivables)
    const partyInvs = realInvoices(DB.invoices.filter(inv=>inv.partyId===party.id));
    const totalSales = partyInvs.reduce((s,i)=>s+i.total,0);
    const totalPaid = partyInvs.reduce((s,i)=>s+i.paid,0);
    const due = totalSales - totalPaid;
    if (due <= 0) return null;
    totalDue += due;
    const mio = DB.users.find(u=>u.id===party.mioId);
    return { party, totalSales, totalPaid, due, mio };
  }).filter(Boolean).sort((a,b)=>b.due-a.due);

  document.getElementById('outstandingTotal').textContent = 'Total Due: ' + taka(totalDue);

  const body = document.getElementById('outstandingBody');
  if (!rows.length) { body.innerHTML=`<tr><td colspan="8"><div class="empty-state"><p>No outstanding dues</p></div></td></tr>`; return; }

  body.innerHTML = rows.map((row,i)=>`
    <tr class="due-row">
      <td style="color:var(--text3);font-size:12px;">${i+1}</td>
      <td><strong>${esc(row.party.name)}</strong></td>
      <td><span class="badge badge-${partyTypeBadge(row.party.type)}">${esc(row.party.type)}</span></td>
      <td>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent2);">${esc(row.party.territoryCode||'—')}</span>
        <span style="font-size:11px;color:var(--text3);margin-left:4px;">${esc(row.party.area)}</span>
      </td>
      <td style="font-size:12px;">${esc(row.mio?.name||'N/A')}</td>
      <td class="taka">${taka(row.totalSales)}</td>
      <td class="taka" style="color:var(--success);">${taka(row.totalPaid)}</td>
      <td class="taka">${taka(row.due)}</td>
    </tr>
  `).join('');

  document.getElementById('outstandingFoot').innerHTML = `
    <tr style="font-weight:700;background:var(--surface2);">
      <td colspan="7" style="padding:12px 16px;text-align:right;">Total Outstanding:</td>
      <td class="taka" style="padding:12px 16px;color:var(--danger);">${taka(totalDue)}</td>
    </tr>
  `;
}

/// UPDATED SECTION — Target Aggregation Logic: MIO personal, AM/RSM/ASM/CEO auto-aggregated
