// services/permissionService.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { currentUser } from './authService.js';
import { getSubordinateIds } from '../store/selectors.js';
import { DB } from '../store/store.js';
import { toast } from '../ui/components/toast.js';
import { DEFAULT_MODULE_PERMS, PERM } from '../utils/constants.js';

export const Auth = {
  can(module, level) {
    if (!currentUser) return false;
    return hasPerm(module, level);
  },
  require(module, level, msg) {
    if (!this.can(module, level)) {
      toast(msg || 'Access denied — insufficient permission', 'error');
      return false;
    }
    return true;
  },
  isCEO() { return !!currentUser && currentUser.role === 'CEO'; },
  // Returns true if `actor` outranks `subject` in the reporting hierarchy.
  outranks(actorId, subjectId) {
    if (actorId === subjectId) return false;
    const actor = DB.users.find(u => u.id === actorId);
    if (actor && actor.role === 'CEO') return true;
    return getSubordinateIds(actorId).includes(subjectId);
  }
};

/* ---- G. AUDIT LOGGING HOOKS ---------------------------------------------- */
// MIGRATION-SENSITIVE: maps 1:1 to a future `audit_log` table in Supabase.
// Kept bounded client-side; on migration these rows are written server-side.

export function canManageProducts() {
  return ['CEO','Warehouse'].includes(currentUser.role);
}

export function getUserPerm(module) {
  const uid = currentUser.id;
  // Per-user override first
  if (DB.userPermissions[uid] && DB.userPermissions[uid][module] !== undefined) {
    return DB.userPermissions[uid][module];
  }
  // Default role permissions
  const roleDef = DEFAULT_MODULE_PERMS[currentUser.role];
  return roleDef ? (roleDef[module] || PERM.NONE) : PERM.NONE;
}

export function hasPerm(module, required) {
  const order = [PERM.NONE, PERM.VIEW, PERM.CREATE, PERM.EDIT, PERM.FULL];
  const userPerm = getUserPerm(module);
  return order.indexOf(userPerm) >= order.indexOf(required);
}
