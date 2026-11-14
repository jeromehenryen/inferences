// Administration : défis, codes, réglages, suivi. Toutes les actions exigent ADMIN_PASSWORD.
const crypto = require('crypto');
const { reply, preflight, body, sleep, clean, clientIp } = require('./lib/http');
const { getChallenges, getCodes, getSettings, getTeachers, writeJson, sanitizeChallenges, sanitizeCodes, sanitizeSettings, sanitizeTeachers, sanitizeQuestion } = require('./lib/data');
const { judge } = require('./lib/judge');
const { listEvents, clearEvents, purgeOld } = require('./lib/track');
const { peek, bump, cleanup } = require('./lib/limits');
const { chat } = require('./lib/albert');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

exports.handler = async (event) => {
  const p = preflight(event); if (p) return p;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return reply(500, { error: 'ADMIN_PASSWORD non configurée' });
  const d = body(event); if (!d) return reply(400, { error: 'JSON invalide' });
  const ip = clientIp(event);
  if (await peek(event, 'adm', ip, 600e3) >= 10) return reply(429, { error: 'Trop d’essais. Patiente quelques minutes.' });
  if (!crypto.timingSafeEqual(sha(pw), sha(String(d.password || '').slice(0, 200)))) { await bump(event, 'adm', ip, 600e3); await sleep(800); return reply(403, { error: 'Mot de passe incorrect' }); }
  try {
    switch (d.action) {
      case 'getAll': {
        const settings = await getSettings(event);
        if (settings.retentionDays) { await purgeOld(event, settings.retentionDays); await cleanup(event); } // purge automatique
        const [challenges, codes, events, teachers] = await Promise.all([getChallenges(event), getCodes(event), listEvents(event), getTeachers(event)]);
        return reply(200, { challenges, codes, settings, events, teachers });
      }
      case 'saveChallenges': { const v = sanitizeChallenges(d.challenges); await writeJson(event, 'challenges.json', v); return reply(200, { ok: true, challenges: v }); }
      case 'saveCodes': { const v = sanitizeCodes(d.codes); await writeJson(event, 'codes.json', v); return reply(200, { ok: true, codes: v }); }
      case 'saveSettings': { const v = sanitizeSettings(d.settings); await writeJson(event, 'settings.json', v); return reply(200, { ok: true, settings: v }); }
      case 'saveTeachers': { const v = sanitizeTeachers(d.teachers); await writeJson(event, 'teachers.json', v); return reply(200, { ok: true, teachers: v }); }
      case 'test': { // essai du jugement de l'IA sur une version (même non enregistrée) d'une question ; rien n'est enregistré dans le suivi
        const t = d.draft || {}, q = sanitizeQuestion(t.question || {});
        if (!q.question || !q.answers.length || !q.clues.length) return reply(400, { error: 'Complète la question, les réponses et les indices de référence avant de tester' });
        const studentAnswer = clean(d.studentAnswer, 400);
        if (!studentAnswer) return reply(400, { error: 'Saisis une réponse d’élève fictive' });
        const out = await judge({ level: clean(t.level, 10), type: clean(t.type, 80), text: String(t.text || '').slice(0, 5000), question: q.question, answers: q.answers, clues: q.clues, studentAnswer, selectedClues: (Array.isArray(d.selectedClues) ? d.selectedClues : []).slice(0, 60).map(x => clean(x, 80)) });
        return reply(200, out);
      }
      case 'reset': return reply(200, { ok: true, deleted: await clearEvents(event) });
      case 'purge': { const days = parseInt(d.days, 10); if (!(days > 0)) return reply(400, { error: 'Durée invalide' }); return reply(200, { ok: true, deleted: await purgeOld(event, days) }); }
      case 'suggest': {
        const c = (await getChallenges(event)).find(x => x.id === String(d.cid || '')), q = c && c.questions[parseInt(d.q, 10) || 0];
        if (!q) return reply(400, { error: 'Question inexistante' });
        const st = d.stats || {};
        const prompt = 'Tu es conseiller pédagogique pour des élèves de cycles 2 et 3 (inférences en lecture).\n' +
          'Texte du défi : ' + c.text + '\nQuestion : ' + q.question + '\nRéponses de référence : ' + q.answers.join(' / ') + '\n' +
          'Résultats observés : ' + (parseInt(st.checks, 10) || 0) + ' tentatives, réussite ' + clean(st.rate, 10) + ', réponse fausse dans ' + (parseInt(st.wrongAnswer, 10) || 0) + ' cas, indices insuffisants dans ' + (parseInt(st.wrongClues, 10) || 0) + ' cas.\n' +
          'Propose : 1) deux reformulations plus claires de la question (même objectif), 2) un conseil court sur le texte ou les indices attendus. Réponds en français, de façon concise.';
        const { raw } = await chat([{ role: 'user', content: prompt }], { max_tokens: 1500, temperature: 0.3 });
        return reply(200, { text: raw || 'Pas de suggestion obtenue.' });
      }
      default: return reply(400, { error: 'Action inconnue' });
    }
  } catch (e) {
    console.error('admin', d.action, e);
    return reply(e.status || 502, { error: e.error || e.message || 'Erreur', detail: e.detail });
  }
};
