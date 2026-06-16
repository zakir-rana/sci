// utils/validate.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { Auth, getUserPerm, hasPerm } from '../services/permissionService.js';
import { toast } from '../ui/components/toast.js';

export const V = {
  required(val, label) {
    if (val === null || val === undefined || String(val).trim() === '') {
      toast(`${label} is required`, 'error'); return false;
    }
    return true;
  },
  nonNegativeNumber(val, label) {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) { toast(`${label} must be a valid non-negative number`, 'error'); return false; }
    return true;
  },
  positiveInt(val, label) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1) { toast(`${label} must be at least 1`, 'error'); return false; }
    return true;
  },
  range(val, min, max, label) {
    const n = parseFloat(val);
    if (isNaN(n) || n < min || n > max) { toast(`${label} must be between ${min} and ${max}`, 'error'); return false; }
    return true;
  },
  // Generic clamp used to guarantee no negative / out-of-range stored values
  clampNonNeg(val) { const n = parseFloat(val) || 0; return n < 0 ? 0 : n; },
  clampInt(val, min = 0) { const n = parseInt(val) || 0; return n < min ? min : n; }
};

/* ---- E. AUTHORIZATION UTILITIES ------------------------------------------ */
// Thin wrapper over hasPerm()/getUserPerm() that also surfaces a toast and
// returns a boolean. Every state-mutating function calls Auth.require(...) so
// that privileged actions cannot be triggered directly (e.g. from the console)
// even when the corresponding UI control is hidden.
