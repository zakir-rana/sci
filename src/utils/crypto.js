// utils/crypto.js — Phase 3.0 modular extraction (logic unchanged from single-file v2_1)

export function genSalt() {
  const a = new Uint8Array(16);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 256));
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(plain, salt) { return sha256Hex(salt + ':' + plain); }

export async function verifyPassword(plain, user) {
  if (user.passwordHash && user.salt) {
    try { return (await hashPassword(plain, user.salt)) === user.passwordHash; }
    catch (e) { return false; }
  }
  return false;
}
// One-time migration of any plaintext passwords still present in storage.
