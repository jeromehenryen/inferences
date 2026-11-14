// Accès enseignant en LECTURE SEULE : le serveur ne renvoie que le suivi des groupes des écoles autorisées.
const { accessOk } = require('./lib/codes');
const { reply, preflight, body, sleep, clientIp } = require('./lib/http');
const { getChallenges, getTeachers } = require('./lib/data');
const { listEvents } = require('./lib/track');
const { peek, bump } = require('./lib/limits');
const { parseGroup, normSchool } = require('./lib/groups');

exports.handler = async (event) => {
  const p = preflight(event); if (p) return p;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const d = body(event); if (!d) return reply(400, { error: 'JSON invalide' });
  const ip = clientIp(event);
  if (await peek(event, 'ens', ip, 600e3) >= 10) return reply(429, { error: 'Trop d’essais. Patiente quelques minutes.' });
  try {
    const code = String(d.code || '').slice(0, 80);
    const t = (await getTeachers(event)).find(x => accessOk({ access: x.code }, code));
    if (!t) { await bump(event, 'ens', ip, 600e3); await sleep(800); return reply(403, { error: 'Code incorrect' }); }
    const allowed = new Set(t.schools.map(normSchool));
    const [events, challenges] = await Promise.all([listEvents(event), getChallenges(event)]);
    return reply(200, {
      label: t.label, schools: t.schools,
      events: events.filter(e => allowed.has(normSchool(parseGroup(e.group).school))),
      challenges: challenges.map(c => ({ id: c.id, level: c.level, title: c.title, type: c.type, questions: c.questions.map(() => ({})) }))
    });
  } catch (e) { console.error('enseignant', e); return reply(502, { error: 'Stockage indisponible' }); }
};
