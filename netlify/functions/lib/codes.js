// Comparaison des codes (insensible aux accents, espaces, tirets et à la casse).
const crypto = require('crypto');
const norm = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const digest = s => crypto.createHash('sha256').update(norm(s)).digest();
function accessOk(entry, code) {
  if (!entry || !entry.access || !norm(code)) return false;
  return crypto.timingSafeEqual(digest(entry.access), digest(code));
}
module.exports = { norm, accessOk };
