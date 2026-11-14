// Suivi centralisé : chaque évènement est enregistré dans Netlify Blobs sous forme d'une CLÉ (aucune réponse d'élève n'est conservée).
// Clé : ev/<horodatage>|<aléa>|<groupe encodé>|<défi>|<question>|<type>|<drapeaux réponse/indices>
const crypto = require('crypto');
const { st } = require('./store');
const { clean } = require('./http');

async function record(event, e) {
  const s = st(event, 'suivi');
  const g = clean(e.group, 60) || 'inconnu';
  let enc = encodeURIComponent(g);
  if (enc.length > 300) enc = encodeURIComponent(g.slice(0, 25));
  const cid = String(e.cid || '').replace(/[^\w-]/g, '').slice(0, 40);
  const q = Math.max(0, Math.min(99, parseInt(e.q, 10) || 0));
  const type = ['check', 'hint', 'done'].includes(e.type) ? e.type : 'check';
  const flags = (e.ok ? '1' : '0') + (e.a ? '1' : '0') + (e.c ? '1' : '0');
  await s.set(['ev/' + Date.now(), crypto.randomBytes(3).toString('hex'), enc, cid, q, type, flags].join('|'), '1');
}
function parseKey(key) {
  const p = String(key).split('|');
  if (p.length !== 7) return null;
  const ts = Number(p[0].slice(3));
  if (!ts) return null;
  let group; try { group = decodeURIComponent(p[2]); } catch (e) { group = p[2]; }
  return { ts, group, cid: p[3], q: Number(p[4]) || 0, type: p[5], ok: p[6][0] === '1', a: p[6][1] === '1', c: p[6][2] === '1' };
}
const keys = async (event) => (await st(event, 'suivi').list({ prefix: 'ev/' })).blobs;
async function listEvents(event) {
  return (await keys(event)).map(b => parseKey(b.key)).filter(Boolean).sort((a, b) => a.ts - b.ts).slice(-20000);
}
async function removeWhere(event, test) {
  const s = st(event, 'suivi'), list = (await keys(event)).filter(b => { const e = parseKey(b.key); return e && test(e); });
  for (let i = 0; i < list.length; i += 25) await Promise.all(list.slice(i, i + 25).map(b => s.delete(b.key)));
  return list.length;
}
const clearEvents = (event) => removeWhere(event, () => true);
const purgeOld = (event, days) => { const limit = Date.now() - days * 864e5; return removeWhere(event, e => e.ts < limit); };
module.exports = { record, listEvents, clearEvents, purgeOld };
