// ui/pages/geography.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { DB, saveDB, userHasRole } from '../../store/store.js';
import { populateDropdowns } from '../components/dropdowns.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export let currentGeoTab = 'division';

export function initGeoPage() {
  // Set default tab
  switchGeoTab(currentGeoTab);
  renderGeoHierarchySummary();
}

export function switchGeoTab(tab) {
  currentGeoTab = tab;
  ['division','region','area','territory'].forEach(t=>{
    const el = document.getElementById('geoTab-'+t);
    if(el) el.classList.toggle('active', t===tab);
  });
  // Update parent filter
  const pf = document.getElementById('geoParentFilter');
  pf.innerHTML = '<option value="">All</option>';
  if (tab==='region') {
    DB.divisions.forEach(d=>pf.innerHTML+=`<option value="${d.id}">${esc(d.name)}</option>`);
  } else if (tab==='area') {
    DB.regions.forEach(r=>pf.innerHTML+=`<option value="${r.id}">${esc(r.name)}</option>`);
  } else if (tab==='territory') {
    DB.areas.forEach(a=>pf.innerHTML+=`<option value="${a.id}">${esc(a.name)}</option>`);
  }
  // Update add button label
  const labels = {division:'+ Add Division',region:'+ Add Region',area:'+ Add Area',territory:'+ Add Territory'};
  document.getElementById('geoAddBtn').textContent = labels[tab];
  renderGeoList();
}

export function renderGeoList() {
  const search = (document.getElementById('geoSearch')?.value||'').toLowerCase();
  const parentVal = document.getElementById('geoParentFilter')?.value||'';
  const head = document.getElementById('geoTableHead');
  const body = document.getElementById('geoTableBody');
  const canMgr = ['CEO','ASM'].includes(currentUser.role);

  if (currentGeoTab==='division') {
    head.innerHTML = '<tr><th>#</th><th>Division Code</th><th>Division Name</th><th>Assigned ASM</th><th>Regions</th><th>Actions</th></tr>';
    const rows = DB.divisions.filter(d=>d.name.toLowerCase().includes(search)||d.code.toLowerCase().includes(search));
    body.innerHTML = rows.length ? rows.map((d,i)=>{
      const asm = DB.users.find(u=>u.id===d.asmId);
      const regCount = DB.regions.filter(r=>r.divisionId===d.id).length;
      return `<tr>
        <td style="color:var(--text3);font-size:12px;">${i+1}</td>
        <td><span class="tc-badge">${esc(d.code)}</span></td>
        <td><strong>${esc(d.name)}</strong></td>
        <td>${asm?`<span class="badge badge-asm">${esc(asm.name)}</span>`:'<span style="color:var(--text3);">—</span>'}</td>
        <td><span class="badge badge-ceo">${regCount} regions</span></td>
        <td>${canMgr?`<button class="btn btn-ghost btn-sm" onclick="openGeoModal('division',${d.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGeoRecord('division',${d.id})" style="margin-left:4px;">Del</button>`:'—'}
        </td></tr>`;
    }).join('') : `<tr><td colspan="6"><div class="empty-state"><p>No divisions found</p></div></td></tr>`;

  } else if (currentGeoTab==='region') {
    head.innerHTML = '<tr><th>#</th><th>Region Code</th><th>Region Name</th><th>Division</th><th>Assigned RSM</th><th>Areas</th><th>Actions</th></tr>';
    const rows = DB.regions.filter(r=>(r.name.toLowerCase().includes(search)||r.code.toLowerCase().includes(search))&&(!parentVal||r.divisionId===parseInt(parentVal)));
    body.innerHTML = rows.length ? rows.map((r,i)=>{
      const div = DB.divisions.find(d=>d.id===r.divisionId);
      const rsm = DB.users.find(u=>u.id===r.rsmId);
      const areaCount = DB.areas.filter(a=>a.regionId===r.id).length;
      return `<tr>
        <td style="color:var(--text3);font-size:12px;">${i+1}</td>
        <td><span class="tc-badge">${esc(r.code)}</span></td>
        <td><strong>${esc(r.name)}</strong></td>
        <td><span class="geo-badge geo-division">${esc(div?.name||'—')}</span></td>
        <td>${rsm?`<span class="badge badge-rsm">${esc(rsm.name)}</span>`:'<span style="color:var(--text3);">—</span>'}</td>
        <td><span class="badge badge-ceo">${areaCount} areas</span></td>
        <td>${canMgr?`<button class="btn btn-ghost btn-sm" onclick="openGeoModal('region',${r.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGeoRecord('region',${r.id})" style="margin-left:4px;">Del</button>`:'—'}
        </td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state"><p>No regions found</p></div></td></tr>`;

  } else if (currentGeoTab==='area') {
    head.innerHTML = '<tr><th>#</th><th>Area Code</th><th>Area Name</th><th>Region</th><th>Assigned AM</th><th>Territories</th><th>Actions</th></tr>';
    const rows = DB.areas.filter(a=>(a.name.toLowerCase().includes(search)||a.code.toLowerCase().includes(search))&&(!parentVal||a.regionId===parseInt(parentVal)));
    body.innerHTML = rows.length ? rows.map((a,i)=>{
      const reg = DB.regions.find(r=>r.id===a.regionId);
      const am = DB.users.find(u=>u.id===a.amId);
      const terrCount = DB.territories.filter(t=>t.areaId===a.id).length;
      return `<tr>
        <td style="color:var(--text3);font-size:12px;">${i+1}</td>
        <td><span class="tc-badge">${esc(a.code)}</span></td>
        <td><strong>${esc(a.name)}</strong></td>
        <td><span class="geo-badge geo-region">${esc(reg?.name||'—')}</span></td>
        <td>${am?`<span class="badge badge-am">${esc(am.name)}</span>`:'<span style="color:var(--text3);">—</span>'}</td>
        <td><span class="badge badge-ceo">${terrCount} territories</span></td>
        <td>${canMgr?`<button class="btn btn-ghost btn-sm" onclick="openGeoModal('area',${a.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGeoRecord('area',${a.id})" style="margin-left:4px;">Del</button>`:'—'}
        </td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state"><p>No areas found</p></div></td></tr>`;

  } else { // territory
    head.innerHTML = '<tr><th>#</th><th>Code</th><th>Territory Name</th><th>Area</th><th>Assigned ASM</th><th>Assigned RSM</th><th>Assigned AM</th><th>Assigned MIO</th><th>Actions</th></tr>';
    const rows = DB.territories.filter(t=>(t.name.toLowerCase().includes(search)||t.code.toLowerCase().includes(search))&&(!parentVal||t.areaId===parseInt(parentVal)));
    body.innerHTML = rows.length ? rows.map((t,i)=>{
      const area = DB.areas.find(a=>a.id===t.areaId);
      const asm = DB.users.find(u=>u.id===t.asmId);
      const rsm = DB.users.find(u=>u.id===t.rsmId);
      const am  = DB.users.find(u=>u.id===t.amId);
      const mio = DB.users.find(u=>u.id===t.mioId);
      return `<tr>
        <td style="color:var(--text3);font-size:12px;">${i+1}</td>
        <td><span class="tc-badge">${esc(t.code)}</span></td>
        <td><strong>${esc(t.name)}</strong></td>
        <td><span class="geo-badge geo-area">${esc(area?.name||'—')}</span></td>
        <td>${asm?`<span class="badge badge-asm">${esc(asm.name)}</span>`:'—'}</td>
        <td>${rsm?`<span class="badge badge-rsm">${esc(rsm.name)}</span>`:'—'}</td>
        <td>${am?`<span class="badge badge-am">${esc(am.name)}</span>`:'—'}</td>
        <td>${mio?`<span class="badge badge-mio">${esc(mio.name)}</span>`:'—'}</td>
        <td>${canMgr?`<button class="btn btn-ghost btn-sm" onclick="openGeoModal('territory',${t.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGeoRecord('territory',${t.id})" style="margin-left:4px;">Del</button>`:'—'}
        </td></tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty-state"><p>No territories found</p></div></td></tr>`;
  }
  renderGeoHierarchySummary();
}

export function renderGeoHierarchySummary() {
  const el = document.getElementById('geoHierarchySummary');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card blue"><div class="stat-label">Divisions</div><div class="stat-value">${DB.divisions.length}</div><div class="stat-sub">Top level</div></div>
    <div class="stat-card orange"><div class="stat-label">Regions</div><div class="stat-value">${DB.regions.length}</div><div class="stat-sub">ASM → RSM</div></div>
    <div class="stat-card green"><div class="stat-label">Areas</div><div class="stat-value">${DB.areas.length}</div><div class="stat-sub">RSM → AM</div></div>
    <div class="stat-card red"><div class="stat-label">Territories</div><div class="stat-value">${DB.territories.length}</div><div class="stat-sub">AM → MIO</div></div>
  `;
}

export let _editingGeoType = 'division';

export let _editingGeoId = null;

export function openGeoModal(type=null, id=null) {
  // #17 — only CEO/ASM may manage geography
  if (!['CEO','ASM'].includes(currentUser.role)) { toast('Access denied','error'); return; }
  const tab = type || currentGeoTab;
  _editingGeoType = tab;
  _editingGeoId = id;
  const labels = {division:'Division',region:'Region',area:'Area',territory:'Territory'};
  document.getElementById('geoModalTitle').textContent = (id?'Edit ':'Add ') + labels[tab];
  const body = document.getElementById('geoModalBody');

  // Build dynamic form based on level
  let rec = null;
  if (id) {
    const col = {division:DB.divisions,region:DB.regions,area:DB.areas,territory:DB.territories}[tab];
    rec = col?.find(x=>x.id===id);
  }

  if (tab==='division') {
    const asmOpts = DB.users.filter(u=>u.role==='ASM').map(u=>`<option value="${u.id}" ${rec?.asmId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    body.innerHTML = `
      <div class="grid-2">
        <div class="form-group"><label>Division Code*</label><input type="text" id="geoCode" placeholder="e.g. DHA-DIV" style="text-transform:uppercase;" value="${esc(rec?.code||'')}" /></div>
        <div class="form-group"><label>Division Name*</label><input type="text" id="geoName" placeholder="e.g. Dhaka Division" value="${esc(rec?.name||'')}" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>Assigned ASM</label><select id="geoAsm"><option value="">—</option>${asmOpts}</select></div>
      </div>`;
  } else if (tab==='region') {
    const divOpts = DB.divisions.map(d=>`<option value="${d.id}" ${rec?.divisionId===d.id?'selected':''}>${esc(d.name)}</option>`).join('');
    const rsmOpts = DB.users.filter(u=>u.role==='RSM').map(u=>`<option value="${u.id}" ${rec?.rsmId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    body.innerHTML = `
      <div class="grid-2">
        <div class="form-group"><label>Region Code*</label><input type="text" id="geoCode" placeholder="e.g. DHA-NTH" style="text-transform:uppercase;" value="${esc(rec?.code||'')}" /></div>
        <div class="form-group"><label>Region Name*</label><input type="text" id="geoName" placeholder="e.g. Dhaka North" value="${esc(rec?.name||'')}" /></div>
        <div class="form-group"><label>Division*</label><select id="geoDivision"><option value="">Select Division</option>${divOpts}</select></div>
        <div class="form-group"><label>Assigned RSM</label><select id="geoRsm"><option value="">—</option>${rsmOpts}</select></div>
      </div>`;
  } else if (tab==='area') {
    const regOpts = DB.regions.map(r=>`<option value="${r.id}" ${rec?.regionId===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
    const amOpts = DB.users.filter(u=>u.role==='AM').map(u=>`<option value="${u.id}" ${rec?.amId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    body.innerHTML = `
      <div class="grid-2">
        <div class="form-group"><label>Area Code*</label><input type="text" id="geoCode" placeholder="e.g. DHA-MIR" style="text-transform:uppercase;" value="${esc(rec?.code||'')}" /></div>
        <div class="form-group"><label>Area Name*</label><input type="text" id="geoName" placeholder="e.g. Mirpur Area" value="${esc(rec?.name||'')}" /></div>
        <div class="form-group"><label>Region*</label><select id="geoRegion"><option value="">Select Region</option>${regOpts}</select></div>
        <div class="form-group"><label>Assigned AM</label><select id="geoAm"><option value="">—</option>${amOpts}</select></div>
      </div>`;
  } else { // territory
    const areaOpts = DB.areas.map(a=>`<option value="${a.id}" ${rec?.areaId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
    const asmOpts = DB.users.filter(u=>u.role==='ASM').map(u=>`<option value="${u.id}" ${rec?.asmId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    const rsmOpts = DB.users.filter(u=>u.role==='RSM').map(u=>`<option value="${u.id}" ${rec?.rsmId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    const amOpts2 = DB.users.filter(u=>u.role==='AM').map(u=>`<option value="${u.id}" ${rec?.amId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    const mioOpts = DB.users.filter(u=>u.role==='MIO').map(u=>`<option value="${u.id}" ${rec?.mioId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
    body.innerHTML = `
      <div class="grid-2">
        <div class="form-group"><label>Territory Code*</label><input type="text" id="geoCode" placeholder="e.g. DHA-M10" style="text-transform:uppercase;" value="${esc(rec?.code||'')}" /></div>
        <div class="form-group"><label>Territory Name*</label><input type="text" id="geoName" placeholder="e.g. Mirpur-10, Dhaka" value="${esc(rec?.name||'')}" /></div>
        <div class="form-group"><label>Area*</label><select id="geoArea"><option value="">Select Area</option>${areaOpts}</select></div>
        <div class="form-group"><label>Assigned ASM</label><select id="geoAsm2"><option value="">—</option>${asmOpts}</select></div>
        <div class="form-group"><label>Assigned RSM</label><select id="geoRsm2"><option value="">—</option>${rsmOpts}</select></div>
        <div class="form-group"><label>Assigned AM</label><select id="geoAm2"><option value="">—</option>${amOpts2}</select></div>
        <div class="form-group"><label>Assigned MIO</label><select id="geoMio"><option value="">—</option>${mioOpts}</select></div>
      </div>`;
    // Set values after render
    if (rec) {
      setTimeout(()=>{
        if(rec.areaId) document.getElementById('geoArea').value=rec.areaId;
        if(rec.asmId) document.getElementById('geoAsm2').value=rec.asmId;
        if(rec.rsmId) document.getElementById('geoRsm2').value=rec.rsmId;
        if(rec.amId) document.getElementById('geoAm2').value=rec.amId;
        if(rec.mioId) document.getElementById('geoMio').value=rec.mioId;
      },30);
    }
  }
  openModal('geoModal');
}

export function saveGeoRecord() {
  // #17 — authorization
  if (!['CEO','ASM'].includes(currentUser.role)) { toast('Access denied','error'); return; }
  const code = cleanInput(document.getElementById('geoCode')?.value, 30).toUpperCase();
  const name = cleanInput(document.getElementById('geoName')?.value, 80);
  if (!V.required(code,'Code') || !V.required(name,'Name')) return;

  const tab = _editingGeoType;
  const id = _editingGeoId;

  // #15 — code uniqueness. Codes are referenced as foreign keys (parties/users use
  // territory codes), so they must be globally unique across ALL geography levels.
  const allGeo = [
    ...DB.divisions.map(x=>({id:x.id,code:x.code,type:'division'})),
    ...DB.regions.map(x=>({id:x.id,code:x.code,type:'region'})),
    ...DB.areas.map(x=>({id:x.id,code:x.code,type:'area'})),
    ...DB.territories.map(x=>({id:x.id,code:x.code,type:'territory'})),
  ];
  if (allGeo.some(g => g.code === code && !(g.type===tab && g.id===id))) {
    toast(`Code "${code}" already exists. Geography codes must be unique.`, 'error'); return;
  }

  if (tab==='division') {
    const asmId = parseInt(document.getElementById('geoAsm')?.value)||null;
    if (asmId && !userHasRole(asmId,'ASM')) { toast('Assigned ASM is invalid','error'); return; }
    const data = { code, name, asmId };
    if (id) { Object.assign(DB.divisions.find(d=>d.id===id), data); logAudit('update','division',id,{code}); }
    else { const rec={id:DB.nextId.division++, uid:genUid(), ...data}; DB.divisions.push(rec); logAudit('create','division',rec.id,{code}); }

  } else if (tab==='region') {
    const divId = parseInt(document.getElementById('geoDivision')?.value)||null;
    if (!divId) { toast('Division required','error'); return; }
    if (!DB.divisions.some(d=>d.id===divId)) { toast('Parent division is invalid','error'); return; } // #14 FK
    const rsmId = parseInt(document.getElementById('geoRsm')?.value)||null;
    if (rsmId && !userHasRole(rsmId,'RSM')) { toast('Assigned RSM is invalid','error'); return; }
    const data = { code, name, divisionId:divId, rsmId };
    if (id) { Object.assign(DB.regions.find(r=>r.id===id), data); logAudit('update','region',id,{code}); }
    else { const rec={id:DB.nextId.region++, uid:genUid(), ...data}; DB.regions.push(rec); logAudit('create','region',rec.id,{code}); }

  } else if (tab==='area') {
    const regId = parseInt(document.getElementById('geoRegion')?.value)||null;
    if (!regId) { toast('Region required','error'); return; }
    if (!DB.regions.some(r=>r.id===regId)) { toast('Parent region is invalid','error'); return; } // #14 FK
    const amId = parseInt(document.getElementById('geoAm')?.value)||null;
    if (amId && !userHasRole(amId,'AM')) { toast('Assigned AM is invalid','error'); return; }
    const data = { code, name, regionId:regId, amId };
    if (id) { Object.assign(DB.areas.find(a=>a.id===id), data); logAudit('update','area',id,{code}); }
    else { const rec={id:DB.nextId.area++, uid:genUid(), ...data}; DB.areas.push(rec); logAudit('create','area',rec.id,{code}); }

  } else { // territory
    const areaId = parseInt(document.getElementById('geoArea')?.value)||null;
    if (!areaId) { toast('Area required','error'); return; }
    if (!DB.areas.some(a=>a.id===areaId)) { toast('Parent area is invalid','error'); return; } // #14 FK
    // #14 — each assigned manager must hold the correct role
    const asmId = parseInt(document.getElementById('geoAsm2')?.value)||null;
    const rsmId = parseInt(document.getElementById('geoRsm2')?.value)||null;
    const amId  = parseInt(document.getElementById('geoAm2')?.value)||null;
    const mioId = parseInt(document.getElementById('geoMio')?.value)||null;
    if (asmId && !userHasRole(asmId,'ASM')) { toast('Assigned ASM is invalid','error'); return; }
    if (rsmId && !userHasRole(rsmId,'RSM')) { toast('Assigned RSM is invalid','error'); return; }
    if (amId && !userHasRole(amId,'AM')) { toast('Assigned AM is invalid','error'); return; }
    if (mioId && !userHasRole(mioId,'MIO')) { toast('Assigned MIO is invalid','error'); return; }
    const data = {
      code, name, areaId, asmId, rsmId, amId, mioId,
      region: DB.areas.find(a=>a.id===areaId) ? (DB.regions.find(r=>r.id===DB.areas.find(a=>a.id===areaId).regionId)?.name||'') : ''
    };
    if (id) { Object.assign(DB.territories.find(t=>t.id===id), data); logAudit('update','territory',id,{code}); }
    else { const rec={id:DB.nextId.territory++, uid:genUid(), ...data}; DB.territories.push(rec); logAudit('create','territory',rec.id,{code}); }
  }

  saveDB();
  toast(`${tab.charAt(0).toUpperCase()+tab.slice(1)} saved!`,'success');
  closeModal('geoModal');
  renderGeoList();
  populateDropdowns(); // refresh territory dropdowns in party/user modals
}

export function deleteGeoRecord(type, id) {
  // #17 — authorization
  if (!['CEO','ASM'].includes(currentUser.role)) { toast('Access denied','error'); return; }
  // #9 — CASCADE / ORPHAN PREVENTION: block deletion while children or
  // dependent records (parties/users referencing a territory code) still exist.
  if (type==='division') {
    const kids = DB.regions.filter(r=>r.divisionId===id).length;
    if (kids>0) { toast(`Cannot delete: division has ${kids} region(s). Delete or reassign them first.`,'error'); return; }
  } else if (type==='region') {
    const kids = DB.areas.filter(a=>a.regionId===id).length;
    if (kids>0) { toast(`Cannot delete: region has ${kids} area(s). Delete or reassign them first.`,'error'); return; }
  } else if (type==='area') {
    const kids = DB.territories.filter(t=>t.areaId===id).length;
    if (kids>0) { toast(`Cannot delete: area has ${kids} territory(ies). Delete or reassign them first.`,'error'); return; }
  } else if (type==='territory') {
    const terr = DB.territories.find(t=>t.id===id);
    const code = terr?.code;
    const refParties = DB.parties.filter(p=>p.territoryCode===code).length;
    const refUsers = DB.users.filter(u=>u.territoryCode===code).length;
    if (refParties>0 || refUsers>0) {
      toast(`Cannot delete: territory is referenced by ${refParties} party(ies) and ${refUsers} user(s).`,'error'); return;
    }
  }
  if (!confirm(`Delete this ${type}?`)) return;
  if (type==='division') DB.divisions = DB.divisions.filter(d=>d.id!==id);
  else if (type==='region') DB.regions = DB.regions.filter(r=>r.id!==id);
  else if (type==='area') DB.areas = DB.areas.filter(a=>a.id!==id);
  else if (type==='territory') DB.territories = DB.territories.filter(t=>t.id!==id);
  logAudit('delete', type, id);
  saveDB();
  toast(`${type} deleted`,'info');
  renderGeoList();
  populateDropdowns();
}

/// UPDATED SECTION — Settings page init (logo + company + permissions)
