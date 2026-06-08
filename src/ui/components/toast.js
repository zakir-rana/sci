// ui/components/toast.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
