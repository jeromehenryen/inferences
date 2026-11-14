// Vérifie la réponse d'un élève avec l'IA Albert. Tout ce qui sert à juger (texte, réponses et indices de référence) vient du serveur,
// jamais du navigateur. Le code de validation n'est remis qu'à la réussite de la dernière question.
const { accessOk, norm } = require('./lib/codes');
const { reply, preflight, body, clean } = require('./lib/http');
const { getChallenges, getCodes, getSettings } = require('./lib/data');
const { bump, cleanup } = require('./lib/limits');
const { record, purgeOld } = require('./lib/track');
const { judge } = require('./lib/judge');

const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v : []).slice(0, maxItems).map(x => str(x, maxLen));

exports.handler = async (event) => {
  const pre = preflight(event); if (pre) return pre;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const d = body(event); if (!d) return reply(400, { error: 'JSON invalide' });
  let c, q, qi, s, group;
  try {
    const id = str(d.id, 60);
    const [codes, challenges] = await Promise.all([getCodes(event), getChallenges(event)]);
    if (!accessOk(codes[id], str(d.accessCode, 80))) return reply(403, { error: 'Code d’accès invalide' });
    c = challenges.find(x => x.id === id);
    qi = parseInt(d.qIndex, 10) || 0;
    q = c && c.questions[qi];
    if (!q) return reply(400, { error: 'Question inexistante' });
    s = await getSettings(event);
    group = clean(d.group, 60) || 'inconnu';
  } catch (e) { console.error('verifier', e); return reply(502, { error: 'Stockage indisponible' }); }

  const studentAnswer = str(d.studentAnswer, 400);
  if (!studentAnswer.trim()) return reply(400, { error: 'Réponse vide' });

  // Limites d'usage : par groupe et par heure, et au total par jour (protège le quota Albert).
  if (await bump(event, 'ig', norm(group), 3600e3) > s.perGroupHour) return reply(429, { error: 'Limite par groupe atteinte', detail: 'Réessaie dans un moment.' });
  if (await bump(event, 'id', 'jour', 864e5) > s.perDay) return reply(429, { error: 'Limite quotidienne atteinte', detail: 'Réessaie demain.' });

  let out;
  try {
    out = await judge({ level: c.level, type: c.type, text: c.text, question: q.question, answers: q.answers, clues: q.clues, studentAnswer, selectedClues: list(d.selectedClues, 60, 80) });
  } catch (e) { return reply(e.status || 502, { error: e.error || 'Albert injoignable', detail: e.detail }); }

  const isLast = qi === c.questions.length - 1, success = out.answer_ok && out.clues_ok;
  const ev = { group, cid: c.id, q: qi };
  try {
    await Promise.all([record(event, Object.assign({ type: 'check', ok: success, a: out.answer_ok, c: out.clues_ok }, ev))]
      .concat(success && isLast ? [record(event, Object.assign({ type: 'done', ok: true, a: true, c: true }, ev))] : []));
    if (Math.random() < 0.02) { if (s.retentionDays) await purgeOld(event, s.retentionDays); await cleanup(event); } // purge automatique
  } catch (e) { console.error('suivi', e); }
  let validation;
  if (success && isLast) { const codes = await getCodes(event); validation = (codes[c.id] || {}).validation; }
  return reply(200, { answer_ok: out.answer_ok, clues_ok: out.clues_ok, feedback: out.feedback, validation });
};
