// Vérifie le code d'accès d'un défi (donné par l'ERUN). Le code n'est jamais envoyé au navigateur.
const { loadCodes, accessOk } = require('./lib/codes');

const cors = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const reply = (status, body) => ({ statusCode: status, headers: cors, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const codes = loadCodes();
  if (!codes) return reply(500, { error: 'CODES_JSON non configurée' });
  let d; try { d = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'JSON invalide' }); }
  const id = String(d.id || '').slice(0, 60), code = String(d.code || '').slice(0, 80);
  if (!accessOk(codes[id], code)) return reply(403, { ok: false });
  return reply(200, { ok: true });
};
