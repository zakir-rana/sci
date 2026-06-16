// ui/pages/settings.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { buildNav } from '../../app/nav.js';
import { logAudit } from '../../services/auditService.js';
import { currentUser } from '../../services/authService.js';
import { Auth } from '../../services/permissionService.js';
import { DB, saveDB } from '../../store/store.js';
import { toast } from '../components/toast.js';
import { DEFAULT_MODULE_PERMS, PERM } from '../../utils/constants.js';
import { cleanInput, esc } from '../../utils/esc.js';

export function initSettingsPage() {
  // Load company settings
  const c = DB.company || {};
  document.getElementById('companyName').value = c.name || 'RxPharma Bangladesh Ltd.';
  document.getElementById('companyAddr').value = c.address || 'Dhaka, Bangladesh';
  document.getElementById('companyPhone').value = c.phone || '+880 1700-000000';

  // Load logo
  if (c.logo) {
    document.getElementById('logoPreviewImg').src = c.logo;
    document.getElementById('logoPreviewImg').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  } else {
    document.getElementById('logoPreviewImg').style.display = 'none';
    document.getElementById('logoPlaceholder').style.display = '';
  }

  // Populate permission user select
  const sel = document.getElementById('permUserSelect');
  sel.innerHTML = '<option value="">— Select User —</option>';
  DB.users.filter(u=>u.id!==1).forEach(u=>{
    sel.innerHTML += `<option value="${u.id}">${esc(u.name)} (${esc(u.role)})</option>`;
  });

  // Populate module filter
  const mf = document.getElementById('permModuleFilter');
  mf.innerHTML = '<option value="">All Modules</option>';
  Object.keys(DEFAULT_MODULE_PERMS.CEO).forEach(m=>{
    mf.innerHTML += `<option value="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</option>`;
  });

  // Apply logo to topbar
  applyLogoToTopbar();
}

export function saveCompanySettings() {
  if (!Auth.require('settings', PERM.EDIT)) return; // #10
  DB.company = DB.company || {};
  DB.company.name = cleanInput(document.getElementById('companyName').value, 120);
  DB.company.address = cleanInput(document.getElementById('companyAddr').value, 200);
  DB.company.phone = cleanInput(document.getElementById('companyPhone').value, 40);
  logAudit('update', 'company_settings', null);
  saveDB();
  toast('Company settings saved!','success');
}

/// UPDATED SECTION — Logo upload handlers

export let _pendingLogo = null;

export function handleLogoUpload(e) {
  if (!Auth.require('settings', PERM.EDIT)) return; // #10
  const file = e.target.files[0];
  if (!file) return;
  // #16 — validate file type and size before reading
  if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.type)) { toast('Only image files are allowed','error'); return; }
  if (file.size > 2*1024*1024) { toast('File too large (max 2MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    _pendingLogo = ev.target.result;
    document.getElementById('logoPreviewImg').src = _pendingLogo;
    document.getElementById('logoPreviewImg').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
    toast('Logo loaded — click Save Logo to apply','info');
  };
  reader.readAsDataURL(file);
}

export function saveCompanyLogo() {
  if (!Auth.require('settings', PERM.EDIT)) return; // #10
  if (!_pendingLogo && !(DB.company && DB.company.logo)) { toast('No logo to save','error'); return; }
  DB.company = DB.company || {};
  if (_pendingLogo) DB.company.logo = _pendingLogo;
  logAudit('update', 'company_logo', null);
  saveDB();
  applyLogoToTopbar();
  _pendingLogo = null;
  toast('Logo saved!','success');
}

export function removeLogo() {
  if (!Auth.require('settings', PERM.EDIT)) return; // #10
  DB.company = DB.company || {};
  DB.company.logo = null;
  _pendingLogo = null;
  logAudit('delete', 'company_logo', null);
  saveDB();
  document.getElementById('logoPreviewImg').style.display = 'none';
  document.getElementById('logoPlaceholder').style.display = '';
  applyLogoToTopbar();
  toast('Logo removed','info');
}

export function applyLogoToTopbar() {
  const logo = DB.company && DB.company.logo;
  const logoEl = document.getElementById('topbarLogoImg');
  const textLogo = document.querySelector('.topbar-logo');
  if (logo) {
    if (!logoEl) {
      const img = document.createElement('img');
      img.id = 'topbarLogoImg';
      img.style.cssText = 'height:30px;object-fit:contain;border-radius:4px;';
      img.src = logo;
      textLogo.insertAdjacentElement('afterend', img);
      textLogo.style.display = 'none';
    } else {
      logoEl.src = logo;
      logoEl.style.display = '';
      if (textLogo) textLogo.style.display = 'none';
    }
  } else {
    if (logoEl) logoEl.style.display = 'none';
    if (textLogo) textLogo.style.display = '';
  }
}

/// UPDATED SECTION — Permission manager

export function loadUserPermissions() {
  const userId = parseInt(document.getElementById('permUserSelect').value)||0;
  const modFilter = document.getElementById('permModuleFilter').value;
  const container = document.getElementById('permissionEditor');
  if (!userId) { container.innerHTML = '<p style="color:var(--text3);font-size:13px;">Select a user to manage permissions.</p>'; return; }
  const user = DB.users.find(u=>u.id===userId);
  const modules = Object.keys(DEFAULT_MODULE_PERMS.CEO).filter(m=>!modFilter||m===modFilter);
  const permLevels = [PERM.NONE, PERM.VIEW, PERM.CREATE, PERM.EDIT, PERM.FULL];

  container.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:var(--text2);">
      Editing permissions for: <strong>${esc(user.name)}</strong> <span class="badge badge-${user.role.toLowerCase()}">${esc(user.role)}</span>
    </div>
    <div class="table-wrap" style="margin-bottom:12px;">
      <table>
        <thead><tr><th>Module</th><th>Default (Role)</th><th>Override</th><th>Current</th></tr></thead>
        <tbody>
          ${modules.map(mod=>{
            const defPerm = DEFAULT_MODULE_PERMS[user.role]?.[mod] || PERM.NONE;
            const overPerm = DB.userPermissions[userId]?.[mod];
            const current = overPerm || defPerm;
            return `<tr>
              <td style="font-weight:600;">${mod.charAt(0).toUpperCase()+mod.slice(1)}</td>
              <td><span class="badge perm-${defPerm.toLowerCase()}">${defPerm}</span></td>
              <td>
                <select id="perm_${userId}_${mod}" style="width:110px;padding:6px 10px;font-size:12px;">
                  <option value="">Default</option>
                  ${permLevels.map(p=>`<option value="${p}" ${overPerm===p?'selected':''}>${p}</option>`).join('')}
                </select>
              </td>
              <td><span class="badge perm-${current.toLowerCase()}">${current}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-primary btn-sm" onclick="saveUserPermissions(${userId})">Save Permissions</button>
      <button class="btn btn-ghost btn-sm" onclick="resetUserPermissions(${userId})">Reset to Default</button>
    </div>
  `;
}

export function saveUserPermissions(userId) {
  if (!Auth.require('settings', PERM.EDIT)) return; // #2/#10 — prevents privilege escalation via permission editor
  const user = DB.users.find(u=>u.id===userId);
  if (!user) { toast('User not found','error'); return; }
  const modules = Object.keys(DEFAULT_MODULE_PERMS.CEO);
  const allowed = [PERM.NONE, PERM.VIEW, PERM.CREATE, PERM.EDIT, PERM.FULL];
  if (!DB.userPermissions[userId]) DB.userPermissions[userId] = {};
  modules.forEach(mod=>{
    const sel = document.getElementById(`perm_${userId}_${mod}`);
    if (sel && sel.value && allowed.includes(sel.value)) { // #16 — validate against whitelist
      DB.userPermissions[userId][mod] = sel.value;
    } else {
      delete DB.userPermissions[userId][mod];
    }
  });
  logAudit('update', 'user_permissions', userId);
  saveDB();
  toast(`Permissions saved for ${user.name}. They'll see changes on next login.`, 'success');
  loadUserPermissions();
  // If editing current user, rebuild nav
  if (userId === currentUser.id) buildNav();
}

export function resetUserPermissions(userId) {
  if (!Auth.require('settings', PERM.EDIT)) return; // #10
  delete DB.userPermissions[userId];
  logAudit('reset', 'user_permissions', userId);
  saveDB();
  toast('Permissions reset to role defaults','info');
  loadUserPermissions();
}


// ===================== DCR MODULE =====================
/// UPDATED SECTION — DCR full CRUD + role-based access
