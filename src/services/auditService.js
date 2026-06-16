// services/auditService.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from './authService.js';
import { DB } from '../store/store.js';
import { genUid } from '../utils/uid.js';

export function logAudit(action, entity, entityId, meta) {
  try {
    if (!DB.auditLog) DB.auditLog = [];
    DB.auditLog.push({
      uid: genUid(),
      ts: new Date().toISOString(),
      userId: currentUser ? currentUser.id : null,
      userName: currentUser ? currentUser.name : 'system',
      role: currentUser ? currentUser.role : null,
      action, entity,
      entityId: entityId !== undefined ? entityId : null,
      meta: meta || null
    });
    // Keep only the most recent 1000 entries to bound localStorage growth.
    if (DB.auditLog.length > 1000) DB.auditLog = DB.auditLog.slice(-1000);
  } catch (e) { console.warn('audit log failed', e); }
}

/* ---- H. MIGRATION-READY UNIQUE IDENTIFIERS ------------------------------- */
// MIGRATION-SENSITIVE: `uid` is a stable, collision-resistant identifier that
// survives export/import and becomes the natural primary key in Supabase
// (the numeric `id` remains for backward-compatible UI references).
