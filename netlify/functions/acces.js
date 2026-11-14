// Vérifie le code d'accès (donné par l'ERUN) et remet alors le défi : texte et questions, sans réponses ni indices.
const { accessOk } = require('./lib/codes');
const { reply, preflight, body, sleep, clientIp } = require('./lib/http');
const { getChallenges, getCodes } = require('./lib/data');
const { peek, bump } = require('./lib/limits');

exports.handler = async (event) => {
  const p = preflight(event); if (p) return p;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const d = body(event); if (!d) return reply(400, { error: 'JSON invalide' });
  const ip = clientIp(event);
  if (await peek(event, 'af', ip, 600e3) >= 30) return reply(429, { error: 'Trop d’essais. Patiente quelques minutes.' });
  try {
    const id = String(d.id || '').slice(0, 60), code = String(d.code || '').slice(0, 80);
    const [codes, list] = await Promise.all([getCodes(event), getChallenges(event)]);
    const c = list.find(x => x.id === id);
    if (!c || !accessOk(codes[id], code)) { await bump(event, 'af', ip, 600e3); await sleep(300); return reply(403, { ok: false }); }
    return reply(200, { ok: true, challenge: { id: c.id, level: c.level, title: c.title, type: c.type, text: c.text, questions: c.questions.map(q => ({ question: q.question, nHints: Math.min(3, q.hints.length) })) } });
  } catch (e) { console.error('acces', e); return reply(502, { error: 'Stockage indisponible' }); }
};
