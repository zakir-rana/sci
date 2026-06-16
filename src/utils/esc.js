// utils/esc.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}
// Input cleaning for values being written to storage: trims, removes control
// chars and collapses dangerous whitespace. Does NOT HTML-encode (we encode on
// output via esc()) so round-tripping through edit forms stays lossless.

export function cleanInput(val, maxLen = 500) {
  if (val === null || val === undefined) return '';
  let s = String(val).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/* ---- D. VALIDATION UTILITIES --------------------------------------------- */
