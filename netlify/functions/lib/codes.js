// Codes d'accès et de validation : uniquement côté serveur.
// Variable d'environnement CODES_JSON, par exemple :
// {"cp1":{"access":"...","validation":"..."},"cp2":{"access":"...","validation":"..."}}
const crypto = require('crypto');

const norm = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const digest = s => crypto.createHash('sha256').update(norm(s)).digest();

function loadCodes() {
  try { return JSON.parse(process.env.CODES_JSON || ''); } catch { return null; }
}
function accessOk(entry, code) {
  if (!entry || !entry.access || !norm(code)) return false;
  return crypto.timingSafeEqual(digest(entry.access), digest(code));
}
module.exports = { loadCodes, accessOk };
