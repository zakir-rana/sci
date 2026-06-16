// store/selectors.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)
import { DB } from './store.js';

export function getSubordinateIds(userId) {
  // returns all user IDs that report (directly or indirectly) under userId
  const result = [];
  const queue = [userId];
  while (queue.length) {
    const id = queue.shift();
    const subs = DB.users.filter(u => u.reportsTo === id);
    subs.forEach(s => { result.push(s.id); queue.push(s.id); });
  }
  return result;
}

export function getVisibleUserIds(forUser) {
  if (forUser.role === 'CEO') return DB.users.map(u=>u.id);
  const subs = getSubordinateIds(forUser.id);
  return [forUser.id, ...subs];
}

export function getMioIds(forUser) {
  const visible = getVisibleUserIds(forUser);
  return DB.users.filter(u => u.role==='MIO' && visible.includes(u.id)).map(u=>u.id);
}

export function getVisibleInvoices(forUser) {
  const mioIds = getMioIds(forUser);
  if (forUser.role === 'CEO') return DB.invoices;
  return DB.invoices.filter(inv => mioIds.includes(inv.mioId) || inv.mioId === forUser.id);
}

export function getVisibleParties(forUser) {
  const mioIds = getMioIds(forUser);
  if (forUser.role === 'CEO') return DB.parties;
  return DB.parties.filter(p => mioIds.includes(p.mioId) || p.mioId === forUser.id);
}

// ===================== LOGIN =====================
