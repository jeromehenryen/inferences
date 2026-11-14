// Données gérées par l'administrateur : défis, codes, réglages (Netlify Blobs, boîte « config »).
const { st } = require('./store');
const { clean } = require('./http');
const SEED = require('./seed.json');

const DEFAULT_SETTINGS = { creator: null, readAloud: true, dictation: false, perGroupHour: 60, perDay: 2000, retentionDays: 365 };
const LEVELS = ['cpce1', 'ce2', 'cm'];

async function readJson(event, key) {
  try { return (await st(event, 'config').get(key, { type: 'json' })) || null; } catch (e) { return null; }
}
const writeJson = (event, key, v) => st(event, 'config').set(key, JSON.stringify(v));

const getChallenges = async (event) => (await readJson(event, 'challenges.json')) || SEED;
async function getCodes(event) {
  const c = await readJson(event, 'codes.json');
  if (c) return c;
  try { return JSON.parse(process.env.CODES_JSON || '{}') || {}; } catch (e) { return {}; } // ancienne méthode
}
const getTeachers = async (event) => (await readJson(event, 'teachers.json')) || [];
function sanitizeTeachers(arr) {
  if (!Array.isArray(arr)) throw bad('Format invalide');
  const codes = new Set();
  return arr.slice(0, 100).map(t => {
    const code = clean(t.code, 40), key = code.toLocaleLowerCase('fr').replace(/[^a-z0-9]/g, '');
    if (key.length < 6) throw bad('Chaque code enseignant doit comporter au moins 6 caractères');
    if (codes.has(key)) throw bad('Deux enseignants ont le même code');
    codes.add(key);
    const schools = lst(Array.isArray(t.schools) ? t.schools : String(t.schools || '').split(','), 10, 80);
    if (!schools.length) throw bad('Indique au moins une école par enseignant');
    return { label: clean(t.label, 60) || 'Enseignant', schools, code };
  });
}
const getSettings = async (event) => Object.assign({}, DEFAULT_SETTINGS, (await readJson(event, 'settings.json')) || {});

const bad = (m) => Object.assign(new Error(m), { status: 400, error: m });
const lst = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map(x => clean(x, m)).filter(Boolean);
const sanitizeQuestion = q => ({
  question: clean(q.question, 500),
  answers: lst(q.answers, 20, 200),
  clues: (Array.isArray(q.clues) ? q.clues : []).slice(0, 15).map(s => lst(s, 10, 150)).filter(s => s.length),
  hints: lst(q.hints, 3, 400)
});
function sanitizeChallenges(arr) {
  if (!Array.isArray(arr)) throw bad('Format invalide');
  const seen = new Set();
  return arr.slice(0, 200).map(c => {
    const id = String((c && c.id) || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!id || seen.has(id)) throw bad('Identifiant de défi vide ou en double');
    seen.add(id);
    const questions = (Array.isArray(c.questions) ? c.questions : []).slice(0, 20).map(sanitizeQuestion);
    if (!questions.length) throw bad('Un défi doit avoir au moins une question');
    return { id, level: LEVELS.includes(c.level) ? c.level : 'cpce1', title: clean(c.title, 120), type: clean(c.type, 80), text: String(c.text || '').trim().slice(0, 5000), questions };
  });
}
function sanitizeCodes(o) {
  const out = {};
  Object.keys(o || {}).slice(0, 300).forEach(k => {
    const id = String(k).replace(/[^\w-]/g, '').slice(0, 40);
    if (id) out[id] = { access: clean(o[k].access, 40), validation: clean(o[k].validation, 40) };
  });
  return out;
}
function sanitizeSettings(s) {
  s = s || {};
  const n = (v, d, min, max) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d; };
  const ret = parseInt(s.retentionDays, 10);
  return {
    creator: s.creator ? { visible: !!s.creator.visible, text: clean(s.creator.text, 160) } : null,
    readAloud: s.readAloud !== false, dictation: !!s.dictation,
    perGroupHour: n(s.perGroupHour, 60, 5, 1000), perDay: n(s.perDay, 2000, 50, 100000),
    retentionDays: [0, 90, 180, 365, 730].includes(ret) ? ret : 365
  };
}
module.exports = { getTeachers, sanitizeTeachers, sanitizeQuestion, getChallenges, getCodes, getSettings, writeJson, sanitizeChallenges, sanitizeCodes, sanitizeSettings, DEFAULT_SETTINGS };
