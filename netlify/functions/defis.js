// Liste publique des défis (titres seulement : textes et questions ne sont remis qu'après le code d'accès) + réglages publics.
const { reply, preflight } = require('./lib/http');
const { getChallenges, getSettings } = require('./lib/data');

exports.handler = async (event) => {
  const p = preflight(event); if (p) return p;
  try {
    const [list, s] = await Promise.all([getChallenges(event), getSettings(event)]);
    return reply(200, {
      challenges: list.map(c => ({ id: c.id, level: c.level, title: c.title, type: c.type })),
      settings: { creator: s.creator, readAloud: s.readAloud, dictation: s.dictation }
    });
  } catch (e) { console.error('defis', e); return reply(502, { error: 'Stockage indisponible' }); }
};
