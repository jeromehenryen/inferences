// Utilitaires HTTP communs aux fonctions.
const cors = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};
exports.reply = (status, body) => ({ statusCode: status, headers: cors, body: JSON.stringify(body) });
exports.preflight = (event) => (event.httpMethod === 'OPTIONS' ? { statusCode: 204, headers: cors, body: '' } : null);
exports.body = (event) => { try { return JSON.parse(event.body || '{}'); } catch (e) { return null; } };
exports.sleep = (ms) => new Promise(r => setTimeout(r, ms));
exports.clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
exports.clientIp = (event) => {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'ip').trim();
};
