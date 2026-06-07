// ui/components/modal.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

export function openModal(id) { document.getElementById(id).classList.add('open'); }

/// UPDATED SECTION — ROLE HELPERS + PRODUCT ACCESS CONTROL
