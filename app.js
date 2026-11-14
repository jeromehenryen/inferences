// Mission Inférences – partie élèves (la partie administrateur est dans admin.js).
// Signature par défaut du créateur : modifiable ou masquable dans l'espace administrateur (onglet Réglages).
const DEFAULT_CREATOR = { visible: true, text: 'Jérôme HENRY - ERUN 44 - Saint Brévin les Pins / Saint Nazaire Est' };
const LEVELS = { cpce1: 'CP – CE1', ce2: 'CE2', cm: 'CM1 – CM2' };
const API_BASE = window.MI_API_BASE || '/.netlify/functions';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('mi_' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem('mi_' + k, JSON.stringify(v)); }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let challenges = [], settings = {}, currentLevel = 'cpce1', currentChallenge = null, currentQ = 0;
let selected = [], hintCount = 0, groupCode = store.get('group', ''), accessCodes = {};
const progress = () => store.get('progress', {});

// ---------- Appels au serveur ----------
async function callApi(path, body, timeoutMs = 25000) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API_BASE + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.detail = (data.error || '') + (data.detail ? ' – ' + data.detail : ''); throw e; }
    return data;
  } finally { clearTimeout(t); }
}
async function loadPublic() {
  try {
    const d = await callApi('/defis');
    challenges = d.challenges || []; settings = d.settings || {};
    $('#loadError').classList.add('hidden');
  } catch (err) {
    console.warn('Chargement des défis impossible', err);
    $('#loadError').textContent = 'Impossible de charger les défis pour le moment. Réessaie dans un instant ou préviens l’ERUN.';
    $('#loadError').classList.remove('hidden');
  }
  applyCreator(); renderGrid();
}
function applyCreator() {
  const c = settings.creator || DEFAULT_CREATOR, el = $('#creatorSignature');
  el.textContent = c.text || ''; el.classList.toggle('hidden', !c.visible || !c.text);
}

// ---------- Code de groupe : « niveau-école », par exemple CE2-Victor Hugo ----------
const CL = '(?:CP|CE1|CE2|CM1|CM2)';
function parseGroup(code) {
  const m = String(code || '').match(new RegExp('^\\s*(' + CL + '(?:\\s*[-/]\\s*' + CL + ')*)\\s*-\\s*(.+?)\\s*$', 'i'));
  return m ? { level: m[1].toUpperCase().replace(/\s+/g, ''), school: m[2] } : { level: '?', school: String(code || '').trim() };
}
const SMALL = ['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'en', 'au', 'aux'];
const niceSchool = s => s.toLocaleLowerCase('fr').split(' ').map((w, i) => i && SMALL.includes(w) ? w : w.replace(/(^|[-’'])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr'))).join(' ');

$('#groupSave').onclick = () => {
  const raw = $('#groupCode').value.trim().replace(/\s+/g, ' ');
  if (!raw) { $('#groupMessage').textContent = 'Saisis un code de groupe.'; return; }
  const p = parseGroup(raw);
  groupCode = p.level !== '?' ? p.level + '-' + niceSchool(p.school) : raw;
  $('#groupCode').value = groupCode; store.set('group', groupCode);
  $('#groupMessage').textContent = p.level !== '?' ? 'Code de groupe enregistré. Bonne mission !' : 'Code enregistré. Astuce : écris le niveau, un tiret, puis l’école (par exemple CE2-Victor Hugo).';
  renderGrid();
};

// ---------- Liste des défis ----------
function renderGrid() {
  const done = progress(), g = groupCode || 'ANONYME', grid = $('#challengeGrid');
  grid.innerHTML = '';
  const list = challenges.filter(c => c.level === currentLevel);
  if (!list.length) { grid.innerHTML = '<p class="muted">Aucun défi pour ce niveau pour le moment.</p>'; return; }
  list.forEach((c, i) => {
    const completed = !!done[g + '_' + c.id], unlocked = i === 0 || !!done[g + '_' + list[i - 1].id];
    const b = document.createElement('button');
    b.className = 'challenge-card'; b.disabled = !unlocked;
    b.innerHTML = `<span class="number">DÉFI ${i + 1}</span><strong>${esc(c.title)}</strong><small>${esc(c.type)}</small><span class="card-state">${completed ? '✓ Réussi' : unlocked ? 'Commencer →' : '🔒 À débloquer'}</span>`;
    b.onclick = () => openChallenge(c.id);
    grid.append(b);
  });
}
document.querySelectorAll('.level-tab').forEach(b => b.onclick = () => {
  currentLevel = b.dataset.level;
  document.querySelectorAll('.level-tab').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
  $('#workspace').classList.add('hidden'); $('#completion').classList.add('hidden'); stopVoice(); renderGrid();
});

// ---------- Ouverture d'un défi (le texte n'est remis qu'après le code d'accès) ----------
async function openChallenge(id) {
  if (!groupCode) { $('#groupMessage').textContent = 'Commence par saisir le code de ton groupe.'; $('#groupCode').focus(); return; }
  if (!challenges.find(c => c.id === id)) return;
  const code = prompt('Entre le code d’accès donné par l’ERUN :');
  if (code === null || !code.trim()) return;
  let d;
  try { d = await callApi('/acces', { id, code }); }
  catch (err) {
    if (err.status === 403) alert('Ce code ne correspond pas. Vérifie avec l’ERUN.');
    else if (err.status === 429) alert('Trop d’essais pour le moment. Patiente quelques minutes, puis demande l’aide de l’ERUN.');
    else { console.warn(err); alert('Le service de vérification ne répond pas. Réessaie dans un instant ou préviens l’ERUN.'); }
    return;
  }
  accessCodes[id] = code; currentChallenge = d.challenge;
  const qp = store.get('qprog', {})[groupCode + '_' + id] || 0;
  currentQ = qp < currentChallenge.questions.length ? qp : 0;
  $('#completion').classList.add('hidden'); $('#workspace').classList.remove('hidden');
  renderChallenge(); $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderText(text) {
  let i = 0;
  return text.split(/(\s+)/).map(part => {
    if (!part.trim()) return part;
    const safe = esc(part);
    return `<span class="word" tabindex="0" data-i="${i++}" data-word="${safe}">${safe}</span>`;
  }).join('');
}
function renderChallenge() {
  const c = currentChallenge;
  $('#workspace').innerHTML = `<div class="workspace-head"><div><span class="pill">${esc(LEVELS[c.level])} · ${esc(c.type)}</span><h2>${esc(c.title)}</h2><p class="muted">Lis le texte, réponds puis sélectionne les indices qui justifient ta réponse.</p></div><button class="button button-outline" id="closeChallenge">← Retour aux défis</button></div>
  <h3>1. Lis le texte attentivement ${canSpeak() ? '<button class="button button-outline small" id="readText" type="button">🔊 Écouter le texte</button>' : ''}</h3>
  <div class="reading-text" id="readingText">${renderText(c.text)}</div><div id="questionArea"></div>`;
  $('#closeChallenge').onclick = () => { stopVoice(); $('#workspace').classList.add('hidden'); renderGrid(); };
  if (canSpeak()) $('#readText').onclick = () => speak(c.text);
  $('#readingText').querySelectorAll('.word').forEach(w => {
    const toggle = () => { w.classList.toggle('selected'); syncSelected(); };
    w.onclick = toggle;
    w.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  });
  renderQuestion();
}

// ---------- Brouillon : la réponse en cours et les indices cochés sont gardés sur l'appareil ----------
const draftKey = () => groupCode + '_' + currentChallenge.id + '_' + currentQ;
function syncSelected() {
  selected = [...document.querySelectorAll('#readingText .word.selected')].map(w => w.dataset.word);
  const n = $('#selectedCount'); if (n) n.textContent = selected.length;
  saveDraft();
}
function saveDraft() {
  const a = $('#answer'); if (!a || !currentChallenge) return;
  const dr = store.get('drafts', {}), idx = [...document.querySelectorAll('#readingText .word.selected')].map(w => +w.dataset.i);
  if (!a.value && !idx.length) delete dr[draftKey()]; else dr[draftKey()] = { answer: a.value, idx };
  store.set('drafts', dr);
}
function clearDraft() { const dr = store.get('drafts', {}); delete dr[draftKey()]; store.set('drafts', dr); }

// ---------- Question courante ----------
function renderQuestion() {
  const c = currentChallenge, q = c.questions[currentQ], n = c.questions.length;
  hintCount = 0; stopVoice(); selected = [];
  document.querySelectorAll('#readingText .word').forEach(w => w.classList.remove('selected'));
  $('#questionArea').innerHTML = `<h3>2. Réponds à la question ${n > 1 ? `<span class="pill">Question ${currentQ + 1} sur ${n}</span>` : ''}</h3>
  <div class="question-box"><h3>${esc(q.question)} ${canSpeak() ? '<button class="button button-outline small" id="readQuestion" type="button">🔊</button>' : ''}</h3>
  <textarea id="answer" placeholder="Écris ta réponse avec tes mots…" aria-label="Ta réponse"></textarea>
  ${canDictate() ? '<div class="answer-tools"><button class="button button-outline small" id="dictate" type="button">🎤 Dicter ma réponse</button></div>' : ''}
  <p class="selection-help">3. Dans le texte, clique sur les mots ou groupes de mots qui t’ont aidé à répondre. Tu peux sélectionner plusieurs indices.</p>
  <p class="ai-note">🤖 Ta réponse est lue par une intelligence artificielle (Albert, service de l’État). N’écris ni ton nom ni ton prénom.</p>
  <p class="selection-help"><strong>Indices sélectionnés :</strong> <span id="selectedCount">0</span></p>
  <div class="action-row"><button class="button button-primary" id="checkAnswer">Vérifier ma réponse</button><button class="button button-outline" id="hintBtn" ${q.nHints ? '' : 'disabled'}>💡 Un indice</button><button class="button button-outline" id="clearSelection">Effacer les indices</button></div>
  <div id="feedback" aria-live="polite"></div><div id="hints"></div></div>`;
  $('#clearSelection').onclick = () => { document.querySelectorAll('#readingText .word').forEach(w => w.classList.remove('selected')); syncSelected(); };
  $('#checkAnswer').onclick = checkAnswer; $('#hintBtn').onclick = showHint; $('#answer').oninput = saveDraft;
  if (canSpeak()) $('#readQuestion').onclick = () => speak(q.question);
  if (canDictate()) $('#dictate').onclick = () => toggleDictation($('#dictate'));
  const dr = store.get('drafts', {})[draftKey()];
  if (dr) {
    $('#answer').value = dr.answer || '';
    (dr.idx || []).forEach(i => { const w = document.querySelector('#readingText .word[data-i="' + i + '"]'); if (w) w.classList.add('selected'); });
    syncSelected();
  }
}

// ---------- Vérification par l'IA (côté serveur) ----------
async function checkAnswer() {
  const f = $('#feedback'), btn = $('#checkAnswer'), c = currentChallenge, isLast = currentQ === c.questions.length - 1;
  if (norm($('#answer').value).length < 2) { f.innerHTML = '<div class="feedback bad"><strong>Pas encore…</strong><br>Écris d’abord ta réponse dans la zone de texte.</div>'; return; }
  btn.disabled = true;
  f.innerHTML = '<div class="feedback wait"><strong>Vérification en cours…</strong><br>Ta réponse est en train d’être lue.</div>';
  let res;
  try { res = await callApi('/verifier', { id: c.id, accessCode: accessCodes[c.id], qIndex: currentQ, group: groupCode, studentAnswer: $('#answer').value, selectedClues: selected }); }
  catch (err) {
    console.warn('Vérification impossible :', err); btn.disabled = false;
    const msg = err.status === 403 ? 'Le code d’accès n’est plus valide. Ferme le défi et saisis-le de nouveau.'
      : err.status === 429 ? 'Il y a beaucoup de demandes en ce moment. Patiente quelques minutes, puis réessaie.'
      : 'Le service de vérification ne répond pas. Réessaie dans un instant ou préviens l’ERUN.';
    f.innerHTML = `<div class="feedback bad"><strong>Oups…</strong><br>${msg}<br><small>Détail technique : ${esc((err.status ? 'HTTP ' + err.status + ' ' : '') + (err.detail || err.message || ''))}</small></div>`;
    return;
  }
  const okA = res.answer_ok, okC = res.clues_ok, good = okA && okC && (!isLast || !!res.validation);
  if (good) {
    const key = groupCode + '_' + c.id, qp = store.get('qprog', {}), praise = res.feedback ? esc(res.feedback) : 'Ta réponse est pertinente et tu as trouvé des indices pour la justifier.';
    clearDraft();
    if (!isLast) {
      qp[key] = currentQ + 1; store.set('qprog', qp);
      f.innerHTML = `<div class="feedback good"><strong>Bravo !</strong><br>${praise}</div><div class="action-row"><button class="button button-primary" id="nextQuestion">Question suivante →</button></div>`;
      $('#nextQuestion').onclick = () => { currentQ++; renderQuestion(); $('#questionArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      return;
    }
    const p = progress(); p[key] = true; store.set('progress', p); delete qp[key]; store.set('qprog', qp);
    f.innerHTML = `<div class="feedback good"><strong>Bravo ! Mission réussie !</strong><br>${praise}</div><div class="code-box"><p>Transmets ce code de validation à l’ERUN :</p><div class="code-value">${esc(res.validation)}</div><p class="muted">L’ERUN te donnera le code d’accès du défi suivant.</p></div>`;
    renderGrid(); return;
  }
  btn.disabled = false;
  const msg = [];
  if (!okA) msg.push('Ta réponse ne correspond pas encore à ce que le texte permet de comprendre.');
  if (!okC) msg.push('Les indices sélectionnés ne justifient pas encore suffisamment ta réponse.');
  if (okA && okC) msg.push('Une erreur est survenue, réessaie.');
  if (res.feedback) msg.push('<em>' + esc(res.feedback) + '</em>');
  f.innerHTML = `<div class="feedback bad"><strong>Pas encore…</strong><br>${msg.join('<br>')}<br>Tu peux relire le texte ou demander un indice.</div>`;
  showHint();
}
// Les aides sont remises par le serveur (une à une) : elles ne figurent pas dans le code public.
async function showHint() {
  const q = currentChallenge.questions[currentQ], btn = $('#hintBtn');
  if (hintCount >= q.nHints) return;
  btn.disabled = true;
  try {
    const d = await callApi('/aide', { id: currentChallenge.id, accessCode: accessCodes[currentChallenge.id], group: groupCode, qIndex: currentQ, n: hintCount });
    const labels = ['Indice 1 · Observe', 'Indice 2 · Oriente ta recherche', 'Indice 3 · Va plus loin'];
    $('#hints').insertAdjacentHTML('beforeend', `<div class="hint"><strong>${labels[hintCount]}</strong>${esc(d.hint)}</div>`);
    hintCount++;
    btn.disabled = hintCount >= q.nHints;
    btn.textContent = hintCount >= q.nHints ? '💡 Plus d’indice' : '💡 Un autre indice';
  } catch (err) {
    console.warn(err); btn.disabled = false;
    $('#hints').insertAdjacentHTML('beforeend', '<div class="hint">Impossible d’obtenir l’indice pour le moment. Réessaie dans un instant.</div>');
  }
}

// ---------- Voix : lecture à voix haute et dictée ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canSpeak = () => settings.readAloud !== false && 'speechSynthesis' in window;
const canDictate = () => !!settings.dictation && !!SR;
let rec = null;
function stopVoice() { if ('speechSynthesis' in window) speechSynthesis.cancel(); if (rec) { try { rec.abort(); } catch (e) { /* rien */ } rec = null; } }
function speak(text) {
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(x => x.lang && x.lang.toLowerCase().startsWith('fr'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function toggleDictation(btn) {
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = false; rec.continuous = false;
  btn.textContent = '⏹ Arrêter';
  rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(' '), a = $('#answer'); a.value = (a.value ? a.value + ' ' : '') + t; saveDraft(); };
  rec.onend = () => { rec = null; btn.textContent = '🎤 Dicter ma réponse'; };
  rec.onerror = () => { /* micro refusé ou indisponible */ };
  rec.start();
}

// ---------- Confort de lecture (réglages enregistrés sur l'appareil) ----------
function applyPrefs() {
  const p = Object.assign({ size: 0, spaced: false, readable: false, contrast: false }, store.get('comfort', {})), h = document.documentElement;
  h.classList.remove('pref-size1', 'pref-size2'); if (p.size) h.classList.add('pref-size' + p.size);
  h.classList.toggle('pref-spaced', !!p.spaced); h.classList.toggle('pref-readable', !!p.readable); h.classList.toggle('pref-contrast', !!p.contrast);
  return p;
}
function initComfort() {
  const panel = $('#comfortPanel');
  $('#comfortToggle').onclick = () => panel.classList.toggle('hidden');
  const refresh = () => {
    const p = applyPrefs();
    panel.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', +b.dataset.size === p.size));
    panel.querySelectorAll('[data-pref]').forEach(el => { el.checked = !!p[el.dataset.pref]; });
  };
  const update = patch => { store.set('comfort', Object.assign(store.get('comfort', {}), patch)); refresh(); };
  panel.querySelectorAll('[data-size]').forEach(b => b.onclick = () => update({ size: +b.dataset.size }));
  panel.querySelectorAll('[data-pref]').forEach(el => el.onchange = () => update({ [el.dataset.pref]: el.checked }));
  $('#comfortReset').onclick = () => { store.set('comfort', {}); refresh(); };
  refresh();
}

$('#groupCode').value = groupCode;
initComfort(); applyCreator(); renderGrid(); loadPublic();
