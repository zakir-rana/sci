// utils/uid.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { Auth } from '../services/permissionService.js';

export function genUid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'uid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ---- 1. PASSWORD HASHING (SHA-256 + per-user salt) ----------------------- */
// MIGRATION-SENSITIVE: client-side hashing is defence-in-depth ONLY. Real
// authentication MUST move to Supabase Auth (bcrypt/scrypt server-side) on
// migration. Plaintext passwords are migrated to salted hashes and removed.
