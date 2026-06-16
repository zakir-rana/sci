// utils/format.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export const taka = v => '৳ ' + parseFloat(v||0).toLocaleString('en-BD', {minimumFractionDigits:2, maximumFractionDigits:2});

export const today = () => new Date().toISOString().slice(0,10);

export const thisMonth = () => new Date().toISOString().slice(0,7);

export const fmtDate = d => new Date(d+'T00:00:00').toLocaleDateString('en-BD',{day:'2-digit',month:'short',year:'numeric'});
