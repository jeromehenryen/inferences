// Remet une aide à l'élève (après vérification du code d'accès) et l'enregistre dans le suivi.
const { accessOk } = require('./lib/codes');
const { reply, preflight, body, clean } = require('./lib/http');
const { getChallenges, getCodes, getSettings } = require('./lib/data');
const { bump } = require('./lib/limits');
const { record } = require('./lib/track');

exports.handler = async (event) => {
  const p = preflight(event); if (p) return p;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const d = body(event); if (!d) return reply(400, { error: 'JSON invalide' });
  try {
    const id = String(d.id || '').slice(0, 60);
    const [codes, list, s] = await Promise.all([getCodes(event), getChallenges(event), getSettings(event)]);
    if (!accessOk(codes[id], String(d.accessCode || '').slice(0, 80))) return reply(403, { error: 'Code d’accès invalide' });
    const c = list.find(x => x.id === id), qi = parseInt(d.qIndex, 10) || 0, n = parseInt(d.n, 10) || 0;
    const q = c && c.questions[qi];
    if (!q || n < 0 || n >= Math.min(3, q.hints.length)) return reply(400, { error: 'Aide inexistante' });
    const group = clean(d.group, 60) || 'inconnu';
    if (await bump(event, 'ah', group, 3600e3) > s.perGroupHour * 4) return reply(429, { error: 'Trop de demandes. Patiente un peu.' });
    try { await record(event, { group, cid: id, q: qi, type: 'hint' }); } catch (e) { console.error('suivi', e); }
    return reply(200, { hint: q.hints[n] });
  } catch (e) { console.error('aide', e); return reply(502, { error: 'Stockage indisponible' }); }
};
