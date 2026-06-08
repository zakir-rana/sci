// ui/pages/products.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { logAudit } from '../../services/auditService.js';
import { canManageProducts } from '../../services/permissionService.js';
import { DB, saveDB } from '../../store/store.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { cleanInput, esc } from '../../utils/esc.js';
import { taka } from '../../utils/format.js';
import { genUid } from '../../utils/uid.js';
import { V } from '../../utils/validate.js';

export function renderProducts() {
  const search = (document.getElementById('productSearch')?.value||'').toLowerCase();
  const cat = document.getElementById('productCatFilter')?.value||'';
  let prods = DB.products.filter(p =>
    p.name.toLowerCase().includes(search) &&
    (cat==='' || p.category===cat)
  );
  const body = document.getElementById('productsBody');
  const canMgr = canManageProducts();

  // Hide/show add button based on role
  const addBtn = document.querySelector('#page-products .btn-primary');
  if (addBtn) addBtn.style.display = canMgr ? '' : 'none';

  if (!prods.length) { body.innerHTML=`<tr><td colspan="8"><div class="empty-state"><p>No products found</p></div></td></tr>`; return; }
  body.innerHTML = prods.map((p,i)=>`
    <tr>
      <td style="color:var(--text3);font-size:12px;">${i+1}</td>
      <td><strong>${esc(p.name)}</strong><br><span style="font-size:11px;color:var(--text3);">${esc(p.desc)}</span></td>
      <td><span class="badge badge-ceo">${esc(p.category)}</span></td>
      <td><span class="badge badge-am">${esc(p.unit)}</span></td>
      <td class="taka">${taka(p.tp)}</td>
      <td class="taka">${taka(p.sp)}</td>
      <td><span style="color:${p.stock<50?'var(--danger)':p.stock<150?'var(--warning)':'var(--success)'}">${p.stock} ${esc(p.unit)}s</span></td>
      <td>
        ${canMgr ? `
          <button class="btn btn-ghost btn-sm" onclick="editProduct(${p.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})" style="margin-left:4px;">Del</button>
        ` : '<span style="color:var(--text3);font-size:12px;">View only</span>'}
      </td>
    </tr>
  `).join('');
}

export function openProductModal(id=null) {
  if (!canManageProducts()) { toast('Only CEO/Warehouse can manage products','error'); return; }
  document.getElementById('productId').value = id||'';
  if (id) {
    const p = DB.products.find(x=>x.id===id);
    document.getElementById('productModalTitle').textContent='Edit Product';
    document.getElementById('pName').value=p.name;
    document.getElementById('pCategory').value=p.category;
    document.getElementById('pUnit').value=p.unit;
    document.getElementById('pStock').value=p.stock;
    document.getElementById('pTP').value=p.tp;
    document.getElementById('pSP').value=p.sp;
    document.getElementById('pDesc').value=p.desc;
  } else {
    document.getElementById('productModalTitle').textContent='Add Product';
    ['pName','pDesc','pStock','pTP','pSP'].forEach(f=>document.getElementById(f).value='');
  }
  openModal('productModal');
}

export function editProduct(id) {
  if (!canManageProducts()) { toast('Only CEO/Warehouse can edit products','error'); return; }
  openProductModal(id);
}

export function saveProduct() {
  if (!canManageProducts()) { toast('Access denied','error'); return; }
  const name = cleanInput(document.getElementById('pName').value, 120);
  if (!V.required(name, 'Product name')) return;
  // #11/#12 — numeric validation, no negatives
  const stockRaw = document.getElementById('pStock').value;
  const tpRaw = document.getElementById('pTP').value;
  const spRaw = document.getElementById('pSP').value;
  if (stockRaw !== '' && !V.nonNegativeNumber(stockRaw, 'Stock')) return;
  if (tpRaw !== '' && !V.nonNegativeNumber(tpRaw, 'Trade Price')) return;
  if (spRaw !== '' && !V.nonNegativeNumber(spRaw, 'Sale Price')) return;
  const id = parseInt(document.getElementById('productId').value)||0;
  // #15 — duplicate product name validation (case-insensitive, excluding self)
  const dup = DB.products.find(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== id);
  if (dup) { toast('A product with this name already exists','error'); return; }
  const data = {
    name, category:document.getElementById('pCategory').value, unit:document.getElementById('pUnit').value,
    stock:V.clampInt(stockRaw), tp:V.clampNonNeg(tpRaw),
    sp:V.clampNonNeg(spRaw), desc:cleanInput(document.getElementById('pDesc').value, 300)
  };
  if (id) {
    Object.assign(DB.products.find(p=>p.id===id), data);
    logAudit('update', 'product', id, { name });
    toast('Product updated','success');
  } else {
    const rec = { id:DB.nextId.product++, uid:genUid(), ...data };
    DB.products.push(rec);
    logAudit('create', 'product', rec.id, { name });
    toast('Product added','success');
  }
  saveDB(); // /// UPDATED SECTION — persist to localStorage
  closeModal('productModal'); renderProducts();
}

export function deleteProduct(id) {
  if (!canManageProducts()) { toast('Access denied','error'); return; }
  // #7 — orphan-record prevention: block delete when referenced by any invoice
  const refCount = DB.invoices.filter(inv => inv.items.some(it => it.productId === id)).length;
  if (refCount > 0) {
    toast(`Cannot delete: product is used in ${refCount} invoice(s). Remove those references first.`, 'error');
    return;
  }
  if (!confirm('Delete this product?')) return;
  DB.products = DB.products.filter(p=>p.id!==id);
  logAudit('delete', 'product', id);
  saveDB(); // /// UPDATED SECTION
  toast('Product deleted','info'); renderProducts();
}

// ===================== PARTIES =====================
/// UPDATED SECTION — Party types extended + territory code display + role-based edit access
