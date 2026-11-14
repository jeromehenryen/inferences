// Limites d'usage (compteurs à fenêtre fixe dans Netlify Blobs). En cas de panne du stockage, on ne bloque personne.
const crypto = require('crypto');
const { st } = require('./store');
const keyOf = (name, key, windowMs) => {
  const bucket = Math.floor(Date.now() / windowMs);
  return `lim|${name}|${crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16)}|${(bucket + 1) * windowMs}`;
};
async function peek(event, name, key, windowMs) {
  try { return parseInt(await st(event, 'limites').get(keyOf(name, key, windowMs)), 10) || 0; } catch (e) { return 0; }
}
async function bump(event, name, key, windowMs) {
  try {
    const s = st(event, 'limites'), k = keyOf(name, key, windowMs);
    const n = (parseInt(await s.get(k), 10) || 0) + 1;
    await s.set(k, String(n));
    return n;
  } catch (e) { return 0; }
}
async function cleanup(event) {
  try {
    const s = st(event, 'limites'), res = await s.list({ prefix: 'lim|' });
    const old = res.blobs.filter(b => Number(b.key.split('|')[3]) < Date.now());
    for (let i = 0; i < old.length; i += 25) await Promise.all(old.slice(i, i + 25).map(b => s.delete(b.key)));
  } catch (e) { /* sans importance */ }
}
module.exports = { peek, bump, cleanup };
