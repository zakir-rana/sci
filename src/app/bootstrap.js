// app/bootstrap.js — runs the original boot side-effects, order preserved.
import { buildQuickRoles } from './nav.js';
import { doLogin, migratePasswords } from '../services/authService.js';
import { backfillUids, loadDB } from '../store/store.js';

export function boot() {
  loadDB();
  backfillUids();
  migratePasswords();
  buildQuickRoles();
  
  // A. Event listeners (replacing/augmenting inline handlers where safe)
  // B. Registered exactly once at boot to avoid duplicate handlers.
  (function bindGlobalListeners() {
    const loginPass = document.getElementById('loginPass');
    if (loginPass) loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    const loginUser = document.getElementById('loginUser');
    if (loginUser) loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    // fix #18 — mobile navigation toggle
    const mb = document.getElementById('mobileMenuBtn');
    if (mb) mb.addEventListener('click', () => {
      const nav = document.getElementById('topNav');
      if (nav) nav.classList.toggle('mobile-open');
    });
  })();
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay=>{
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.classList.remove('open'); });
  });
}
