// Appel à l'API Albert (compatible OpenAI). La clé reste dans la variable ALBERT_API_KEY.
const API_URL = process.env.ALBERT_API_URL || 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
const MODEL = process.env.ALBERT_MODEL || 'albert-large';
const fail = (status, error, detail) => Object.assign(new Error(error), { status, error, detail });

async function chat(messages, opts) {
  const o = Object.assign({ max_tokens: 2000, temperature: 0 }, opts);
  const key = process.env.ALBERT_API_KEY;
  if (!key) throw fail(500, 'ALBERT_API_KEY non configurée');
  let r;
  try {
    r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model: MODEL, temperature: o.temperature, max_tokens: o.max_tokens, messages }) });
  } catch (e) { console.error('Albert injoignable', e); throw fail(502, 'Albert injoignable', String(e && e.message || e).slice(0, 200)); }
  if (!r.ok) { const t = (await r.text().catch(() => '')).slice(0, 300); console.error('Albert HTTP', r.status, t); throw fail(502, 'Albert HTTP ' + r.status, t); }
  const data = await r.json();
  const choice = (data && data.choices && data.choices[0]) || {};
  const raw = ((choice.message && choice.message.content) || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim();
  return { raw, finish: choice.finish_reason || '?' };
}
module.exports = { chat, fail };
