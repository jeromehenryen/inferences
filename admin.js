// Espace administrateur (chargé après app.js : utilise $, esc, callApi, LEVELS, parseGroup, loadPublic…).
// Toutes les données (défis, codes, réglages, suivi) sont sur le serveur ; le mot de passe n'est gardé qu'en mémoire.
let adminPw = '', adminData = null, trackingLog = [];
let role = 'admin', teacherCode = '', teacherInfo = null; // « teacher » = lecture seule, limitée à ses écoles
const adminCall = (action, extra) => callApi('/admin', Object.assign({ password: adminPw, action }, extra || {}));
const errText = err => 'HTTP ' + (err.status || 'réseau') + (err.detail ? ' – ' + err.detail : '');
async function loadAdmin() {
  const d = await adminCall('getAll');
  adminData = { challenges: d.challenges, codes: d.codes, settings: d.settings, teachers: d.teachers || [] };
  trackingLog = d.events || [];
}
async function loadTeacher() {
  const d = await callApi('/enseignant', { code: teacherCode });
  teacherInfo = { label: d.label, schools: d.schools };
  adminData = { challenges: d.challenges, codes: {}, settings: {}, teachers: [] };
  trackingLog = d.events || [];
}
const reloadData = () => role === 'teacher' ? loadTeacher() : loadAdmin();
const loggedIn = () => role === 'teacher' ? !!(teacherCode && adminData) : !!(adminPw && adminData);
function logout() { adminPw = ''; teacherCode = ''; teacherInfo = null; role = 'admin'; adminData = null; trackingLog = []; showLogin(); }

const LOGIN_HTML = $('#adminContent').innerHTML;
let adminTab = 'tracking';
function showLogin() { $('#adminContent').innerHTML = LOGIN_HTML; bindLogin(); }
function bindLogin() {
  $('#adminPassword').onkeydown = e => { if (e.key === 'Enter') $('#adminLogin').click(); };
  $('#adminLogin').onclick = async () => {
    const val = $('#adminPassword').value, m = $('#adminLoginMessage'), teacher = $('#adminTeacherMode').checked;
    if (!val) { m.textContent = 'Saisis le mot de passe ou le code.'; return; }
    m.textContent = 'Vérification…';
    if (teacher) { role = 'teacher'; teacherCode = val; } else { role = 'admin'; adminPw = val; }
    try { await reloadData(); }
    catch (err) {
      adminPw = ''; teacherCode = ''; role = 'admin';
      m.textContent = err.status === 403 ? (teacher ? 'Code incorrect.' : 'Mot de passe incorrect.') : err.status === 429 ? 'Trop d’essais. Patiente quelques minutes.'
        : err.status === 500 ? 'Le serveur n’est pas configuré (variable ADMIN_PASSWORD).' : 'Le serveur ne répond pas (' + errText(err) + ').';
      return;
    }
    if (role === 'teacher') renderTeacher(); else renderAdmin();
  };
}
$('#adminOpen').onclick = () => {
  $('#adminModal').classList.remove('hidden');
  if (loggedIn()) { if (role === 'teacher') renderTeacher(); else renderAdmin(adminTab); } else showLogin();
};
$('#adminClose').onclick = () => $('#adminModal').classList.add('hidden');
$('#adminModal').onclick = e => { if (e.target.id === 'adminModal') $('#adminModal').classList.add('hidden'); };
bindLogin();

function renderAdmin(tab = 'tracking') {
  adminTab = tab; const root = $('#adminContent');
  root.innerHTML = `<p class="eyebrow">PILOTAGE</p><h2>Espace administrateur</h2>
  <div class="admin-nav">${[['tracking', 'Suivi des groupes'], ['challenges', 'Défis'], ['codes', 'Codes'], ['teachers', 'Enseignants'], ['settings', 'Réglages']].map(([k, l]) => `<button class="button ${k === tab ? 'button-primary' : 'button-outline'}" data-tab="${k}">${l}</button>`).join('')}<button class="button button-quiet" id="adminLogout">Déconnexion</button></div>
  <div id="adminPanel"></div>
  <p class="security-note">Tout est enregistré sur le serveur (défis, codes, réglages, suivi) et se gère depuis n’importe quel poste avec le mot de passe administrateur.</p>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => renderAdmin(b.dataset.tab));
  $('#adminLogout').onclick = logout;
  const panel = $('#adminPanel');
  if (tab === 'tracking') renderTracking(panel);
  if (tab === 'challenges') renderChallengeAdmin(panel);
  if (tab === 'codes') renderCodes(panel);
  if (tab === 'teachers') renderTeachers(panel);
  if (tab === 'settings') renderSettings(panel);
}
// Vue enseignant : suivi seulement, en lecture seule, limité à ses écoles (filtré par le serveur).
function renderTeacher() {
  const root = $('#adminContent');
  root.innerHTML = `<p class="eyebrow">ACCÈS ENSEIGNANT · LECTURE SEULE</p><h2>Suivi – ${esc(teacherInfo.label)}</h2><p class="muted">Écoles : ${esc(teacherInfo.schools.join(', '))}</p><div class="admin-nav"><button class="button button-quiet" id="adminLogout">Déconnexion</button></div><div id="adminPanel"></div>`;
  $('#adminLogout').onclick = logout;
  renderTracking($('#adminPanel'));
}

// =====================================================================
// Suivi des groupes
// =====================================================================
let flt = { level: '', school: '', group: '', cid: '', period: 'all' };
const fmtDate = ts => ts ? new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const chLabel = id => { const c = adminData.challenges.find(x => x.id === id); return c ? `${LEVELS[c.level]} – ${c.title}` : id; };
function summarize(rows) {
  const a = { checks: 0, ok: 0, hints: 0, done: 0, last: 0, wa: 0, wc: 0 };
  rows.forEach(e => {
    a.last = Math.max(a.last, e.ts);
    if (e.type === 'check') { a.checks++; if (e.ok) a.ok++; if (!e.a) a.wa++; if (!e.c) a.wc++; }
    else if (e.type === 'hint') a.hints++; else if (e.type === 'done') a.done++;
  });
  a.rate = a.checks ? Math.round(100 * a.ok / a.checks) + ' %' : '—';
  return a;
}
function trackingRows() {
  const since = { all: 0, '7': Date.now() - 7 * 864e5, '30': Date.now() - 30 * 864e5 }[flt.period];
  return trackingLog.filter(e => e.ts >= since).map(e => Object.assign({}, e, parseGroup(e.group)))
    .filter(e => (!flt.level || e.level === flt.level) && (!flt.school || e.school === flt.school) && (!flt.group || e.group === flt.group) && (!flt.cid || e.cid === flt.cid));
}
function groupTable(rows) {
  const by = {}; rows.forEach(e => (by[e.group] = by[e.group] || []).push(e));
  return Object.entries(by).map(([g, r]) => Object.assign({ group: g }, parseGroup(g), summarize(r))).sort((a, b) => b.last - a.last);
}
function questionTable(rows) {
  const by = {}; rows.filter(e => e.type !== 'done').forEach(e => { const k = e.cid + '#' + e.q; (by[k] = by[k] || []).push(e); });
  return Object.entries(by).map(([k, r]) => {
    const [cid, q] = k.split('#'), c = adminData.challenges.find(x => x.id === cid);
    return Object.assign({ cid, q: +q, groups: new Set(r.map(e => e.group)).size, title: chLabel(cid) + (c && c.questions.length > 1 ? ' · Q' + (+q + 1) : '') }, summarize(r));
  }).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

// --- Graphiques (SVG, sans bibliothèque) ---
function daysChart(rows) {
  const checks = rows.filter(e => e.type === 'check');
  if (!checks.length) return '<p class="muted">Pas encore d’activité pour ces filtres.</p>';
  const day = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const by = {}; checks.forEach(e => { const k = day(e.ts); by[k] = by[k] || { n: 0, ok: 0 }; by[k].n++; if (e.ok) by[k].ok++; });
  const keys = Object.keys(by).sort(); let start = new Date(keys[0] + 'T12:00:00'); const end = new Date(keys[keys.length - 1] + 'T12:00:00');
  if (Math.round((end - start) / 864e5) + 1 > 45) start = new Date(end.getTime() - 44 * 864e5);
  const days = []; for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) days.push(day(d.getTime()));
  const max = Math.max(1, ...days.map(k => (by[k] || { n: 0 }).n)), W = 640, H = 190, pl = 34, pb = 26, pt = 10, bw = (W - pl - 10) / days.length, ch = H - pb - pt;
  const lab = k => k.slice(8) + '/' + k.slice(5, 7);
  const bars = days.map((k, i) => {
    const v = by[k] || { n: 0, ok: 0 }, x = pl + i * bw + bw * 0.15, w = bw * 0.7, hN = v.n / max * ch, hO = v.ok / max * ch;
    return `<rect x="${x.toFixed(1)}" y="${(pt + ch - hN).toFixed(1)}" width="${w.toFixed(1)}" height="${hN.toFixed(1)}" fill="#c9d6fb"/><rect x="${x.toFixed(1)}" y="${(pt + ch - hO).toFixed(1)}" width="${w.toFixed(1)}" height="${hO.toFixed(1)}" fill="#087f79"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Tentatives par jour"><line x1="${pl}" y1="${pt + ch}" x2="${W - 8}" y2="${pt + ch}" stroke="#e2e7f0"/><text x="${pl - 6}" y="${pt + 10}" font-size="11" text-anchor="end" fill="#65718a">${max}</text><text x="${pl - 6}" y="${pt + ch}" font-size="11" text-anchor="end" fill="#65718a">0</text>${bars}<text x="${pl}" y="${H - 8}" font-size="11" fill="#65718a">${lab(days[0])}</text><text x="${W / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#65718a">${lab(days[Math.floor(days.length / 2)])}</text><text x="${W - 8}" y="${H - 8}" font-size="11" text-anchor="end" fill="#65718a">${lab(days[days.length - 1])}</text></svg><p class="muted">Bleu clair : tentatives · vert : tentatives réussies</p>`;
}
function rateChart(rows) {
  const by = {}; rows.filter(e => e.type === 'check').forEach(e => (by[e.cid] = by[e.cid] || []).push(e));
  const items = Object.entries(by).map(([cid, r]) => { const s = summarize(r); return { label: chLabel(cid), rate: s.ok / s.checks, n: s.checks }; }).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  if (!items.length) return '<p class="muted">Pas encore de résultats pour ces filtres.</p>';
  const W = 640, lw = 250, rh = 26, H = items.length * rh + 8;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Taux de réussite par défi">${items.map((it, i) => {
    const y = 4 + i * rh, w = Math.max(2, Math.round((W - lw - 80) * it.rate)), col = it.rate >= 0.7 ? '#087f79' : it.rate >= 0.4 ? '#f4a340' : '#b53c4a', lb = it.label.length > 38 ? it.label.slice(0, 37) + '…' : it.label;
    return `<text x="0" y="${y + 16}" font-size="12" fill="#202b46">${esc(lb)}</text><rect x="${lw}" y="${y + 3}" width="${w}" height="16" rx="4" fill="${col}"/><text x="${lw + w + 6}" y="${y + 16}" font-size="12" fill="#65718a">${Math.round(it.rate * 100)} % (${it.n})</text>`;
  }).join('')}</svg>`;
}

// --- Questions à retravailler : au moins 5 tentatives et moins de 50 % de réussite ---
const hardQuestions = qs => qs.filter(x => x.checks >= 5 && x.ok / x.checks < 0.5).sort((a, b) => a.ok / a.checks - b.ok / b.checks).slice(0, 6);
const diagnosis = x => x.wa >= x.wc * 1.5 ? 'réponse souvent fausse' : x.wc >= x.wa * 1.5 ? 'indices souvent insuffisants' : 'réponse et indices';

function renderTracking(panel) {
  const all = trackingLog.map(e => Object.assign({}, e, parseGroup(e.group)));
  const uniq = k => [...new Set(all.map(e => e[k]))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const opt = (vals, cur, label, lab) => `<option value="">${label}</option>` + vals.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(lab ? lab(v) : v)}</option>`).join('');
  const ro = role === 'teacher', rows = trackingRows(), groups = groupTable(rows), qs = questionTable(rows), tot = summarize(rows), hard = hardQuestions(qs);
  const sel = (id, name, html) => `<div><label for="${id}">${name}</label><select id="${id}">${html}</select></div>`;
  panel.innerHTML = `<div class="admin-editor">${sel('fLvl', 'Niveau', opt(uniq('level'), flt.level, 'Tous les niveaux'))}${sel('fSch', 'École', opt(uniq('school'), flt.school, 'Toutes les écoles'))}${sel('fGrp', 'Groupe', opt(uniq('group'), flt.group, 'Tous les groupes'))}${sel('fCid', 'Défi', opt(uniq('cid'), flt.cid, 'Tous les défis', chLabel))}${sel('fPer', 'Période', [['all', 'Toute la période'], ['7', '7 derniers jours'], ['30', '30 derniers jours']].map(([v, l]) => `<option value="${v}" ${flt.period === v ? 'selected' : ''}>${l}</option>`).join(''))}<div><label>&nbsp;</label><button class="button button-outline" id="fReset">Réinitialiser les filtres</button></div></div>
  <div class="admin-editor"><div class="question-box"><strong>${groups.length}</strong><br>groupe${groups.length > 1 ? 's' : ''}</div><div class="question-box"><strong>${tot.done}</strong><br>défi${tot.done > 1 ? 's' : ''} terminé${tot.done > 1 ? 's' : ''}</div><div class="question-box"><strong>${tot.checks}</strong> tentatives · <strong>${tot.rate}</strong> de réussite</div><div class="question-box"><strong>${tot.hints}</strong><br>aides utilisées</div></div>
  <h3>Activité par jour</h3>${daysChart(rows)}
  <h3>Réussite par défi</h3>${rateChart(rows)}
  <h3>Questions à retravailler</h3>${hard.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Défi / question</th><th>Tentatives</th><th>Réussite</th><th>Diagnostic</th><th></th></tr></thead><tbody>${hard.map(x => `<tr><td>${esc(x.title)}</td><td>${x.checks}</td><td>${x.rate}</td><td>${diagnosis(x)}</td><td>${ro ? '' : `<button class="button button-outline small suggest" data-cid="${esc(x.cid)}" data-q="${x.q}">Suggérer une reformulation</button>`}</td></tr>`).join('')}</tbody></table></div><div id="suggestBox" class="suggest-box hidden"></div>` : '<p class="muted">Aucune question en difficulté pour l’instant (il faut au moins 5 tentatives et moins de 50 % de réussite).</p>'}
  <h3>Résultats par groupe</h3><div class="table-wrap"><table class="data"><thead><tr><th>Groupe</th><th>Niveau</th><th>École</th><th>Défis terminés</th><th>Tentatives</th><th>Réussite</th><th>Aides</th><th>Dernière activité</th></tr></thead><tbody>${groups.length ? groups.map(g => `<tr><td><a href="#" class="grp" data-g="${esc(g.group)}">${esc(g.group)}</a></td><td>${esc(g.level)}</td><td>${esc(g.school)}</td><td>${g.done}</td><td>${g.checks}</td><td>${g.rate}</td><td>${g.hints}</td><td>${fmtDate(g.last)}</td></tr>`).join('') : '<tr><td colspan="8">Aucune donnée pour ces filtres.</td></tr>'}</tbody></table></div>
  <h3>Détail par défi et par question</h3><div class="table-wrap"><table class="data"><thead><tr><th>Défi / question</th><th>Groupes</th><th>Tentatives</th><th>Réussite</th><th>Aides</th></tr></thead><tbody>${qs.length ? qs.map(x => `<tr><td>${esc(x.title)}</td><td>${x.groups}</td><td>${x.checks}</td><td>${x.rate}</td><td>${x.hints}</td></tr>`).join('') : '<tr><td colspan="5">Aucune donnée.</td></tr>'}</tbody></table></div>
  <div class="action-row"><button class="button button-outline" id="exGroups">Exporter le résumé par groupe (CSV)</button> <button class="button button-outline" id="exDetail">Exporter le détail (CSV)</button> <button class="button button-outline" id="refreshLog">Actualiser</button> ${ro ? '' : '<button class="button button-outline danger" id="clearLog">Effacer le suivi</button>'}</div>
  <p class="muted">Suivi centralisé : il regroupe les résultats de tous les appareils. Les réponses écrites des élèves ne sont jamais conservées. ${ro ? 'Accès en lecture seule, limité à vos écoles.' : 'Purge automatique : voir l’onglet Réglages.'}</p>`;
  const bind = (id, k) => $(id).onchange = e => { flt[k] = e.target.value; renderTracking(panel); };
  bind('#fLvl', 'level'); bind('#fSch', 'school'); bind('#fGrp', 'group'); bind('#fCid', 'cid'); bind('#fPer', 'period');
  $('#fReset').onclick = () => { flt = { level: '', school: '', group: '', cid: '', period: 'all' }; renderTracking(panel); };
  panel.querySelectorAll('.grp').forEach(a => a.onclick = e => { e.preventDefault(); flt.group = a.dataset.g; renderTracking(panel); });
  panel.querySelectorAll('.suggest').forEach(b => b.onclick = async () => {
    const x = hard.find(h => h.cid === b.dataset.cid && h.q === +b.dataset.q), box = $('#suggestBox');
    box.classList.remove('hidden'); box.textContent = 'Analyse en cours…'; b.disabled = true;
    try { const d = await adminCall('suggest', { cid: x.cid, q: x.q, stats: { checks: x.checks, rate: x.rate, wrongAnswer: x.wa, wrongClues: x.wc } }); box.textContent = d.text; }
    catch (err) { box.textContent = 'Suggestion impossible (' + errText(err) + ').'; }
    b.disabled = false;
  });
  $('#exGroups').onclick = () => downloadCsv('suivi-groupes', [['Groupe', 'Niveau', 'Ecole', 'Defis termines', 'Tentatives', 'Reussite', 'Aides', 'Derniere activite']].concat(groups.map(g => [g.group, g.level, g.school, g.done, g.checks, g.rate, g.hints, fmtDate(g.last)])));
  $('#exDetail').onclick = () => downloadCsv('suivi-detail', [['Date', 'Groupe', 'Niveau', 'Ecole', 'Defi', 'Question', 'Evenement', 'Reussi', 'Reponse juste', 'Indices justes']].concat(rows.map(e => [fmtDate(e.ts), e.group, e.level, e.school, chLabel(e.cid), e.q + 1, { check: 'tentative', hint: 'aide', done: 'defi termine' }[e.type] || e.type, e.type === 'check' ? (e.ok ? 'oui' : 'non') : '', e.type === 'check' ? (e.a ? 'oui' : 'non') : '', e.type === 'check' ? (e.c ? 'oui' : 'non') : ''])));
  $('#refreshLog').onclick = async () => { try { await reloadData(); } catch (err) { alert('Actualisation impossible (' + errText(err) + ').'); } renderTracking(panel); };
  if ($('#clearLog')) $('#clearLog').onclick = async () => {
    if (!confirm('Effacer définitivement tout le suivi enregistré sur le serveur (tous les groupes) ?')) return;
    try { await adminCall('reset'); await loadAdmin(); } catch (err) { alert('Suppression impossible (' + errText(err) + ').'); }
    renderTracking(panel);
  };
}
function downloadCsv(name, rows) {
  const csv = '\ufeff' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mission-inferences-' + name + '.csv'; a.click(); URL.revokeObjectURL(a.href);
}

// =====================================================================
// Défis (enregistrés sur le serveur)
// =====================================================================
async function saveChallengesNow() {
  const d = await adminCall('saveChallenges', { challenges: adminData.challenges });
  adminData.challenges = d.challenges; await loadPublic();
}
function renderChallengeAdmin(panel) {
  const list = adminData.challenges, codes = adminData.codes;
  panel.innerHTML = `<div class="action-row"><button class="button button-primary" id="newChallenge">+ Créer un défi</button></div>` +
    Object.keys(LEVELS).map(lv => {
      const items = list.filter(c => c.level === lv);
      return `<h3>${LEVELS[lv]}</h3><div class="table-wrap"><table class="data"><tbody>${items.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.title)}<br><small class="muted">${esc(c.type)} · ${c.questions.length} question${c.questions.length > 1 ? 's' : ''}</small>${codes[c.id] && codes[c.id].access ? '' : ' <span class="pill warn">⚠ pas de code d’accès</span>'}</td><td class="actions"><button class="button button-outline small" data-act="edit" data-id="${esc(c.id)}">Modifier</button> <button class="button button-outline small" data-act="up" data-id="${esc(c.id)}" aria-label="Monter">↑</button> <button class="button button-outline small" data-act="down" data-id="${esc(c.id)}" aria-label="Descendre">↓</button> <button class="button button-outline small" data-act="dup" data-id="${esc(c.id)}">Dupliquer</button></td></tr>`).join('') || '<tr><td>Aucun défi</td></tr>'}</tbody></table></div>`;
    }).join('') + '<div id="challengeEditor"></div>';
  $('#newChallenge').onclick = () => challengeForm({ id: 'defi-' + Date.now(), level: 'cpce1', title: 'Nouveau défi', type: 'Inférence', text: '', questions: [emptyQ()] }, true);
  panel.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const id = b.dataset.id, i = list.findIndex(c => c.id === id), c = list[i];
    try {
      if (b.dataset.act === 'edit') { challengeForm(JSON.parse(JSON.stringify(c)), false); return; }
      if (b.dataset.act === 'dup') { const copy = JSON.parse(JSON.stringify(c)); copy.id = 'defi-' + Date.now(); copy.title += ' (copie)'; list.splice(i + 1, 0, copy); }
      else {
        const step = b.dataset.act === 'up' ? -1 : 1; let j = i + step;
        while (j >= 0 && j < list.length && list[j].level !== c.level) j += step;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
      }
      await saveChallengesNow(); renderChallengeAdmin(panel);
    } catch (err) { alert('Enregistrement impossible (' + errText(err) + ').'); }
  });
}
const emptyQ = () => ({ question: '', answers: [], clues: [], hints: [] });
const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
function qBlock(q, i, n) {
  return `<fieldset class="qblock"><legend>Question ${i + 1}</legend><label>Question</label><textarea class="qQuestion">${esc(q.question)}</textarea><label>Réponses de référence pour l’IA (une par ligne, non exhaustives)</label><textarea class="qAnswers">${esc(q.answers.join('\n'))}</textarea><label>Combinaisons d’indices de référence pour l’IA (une par ligne, indices séparés par | )</label><textarea class="qClues">${esc(q.clues.map(x => x.join(' | ')).join('\n'))}</textarea><label>Aides progressives (1 à 3, une par ligne)</label><textarea class="qHints">${esc(q.hints.join('\n'))}</textarea>${n > 1 ? '<button class="button button-outline danger qDelete" type="button">Supprimer cette question</button>' : ''}</fieldset>`;
}
function collectQs() {
  return [...document.querySelectorAll('.qblock')].map(b => ({
    question: b.querySelector('.qQuestion').value.trim(), answers: lines(b.querySelector('.qAnswers').value),
    clues: lines(b.querySelector('.qClues').value).map(x => x.split('|').map(y => y.trim()).filter(Boolean)).filter(x => x.length),
    hints: lines(b.querySelector('.qHints').value).slice(0, 3)
  }));
}
function renderQs(qs) {
  $('#qList').innerHTML = qs.map((q, i) => qBlock(q, i, qs.length)).join('');
  document.querySelectorAll('.qDelete').forEach((b, i) => b.onclick = () => { const cur = collectQs(); cur.splice(i, 1); renderQs(cur); });
}
function challengeForm(c, isNew) {
  const el = $('#challengeEditor');
  el.innerHTML = `<h3>${isNew ? 'Nouveau défi' : 'Modifier le défi'}</h3><div class="admin-editor"><div><label>Niveau</label><select id="fLevel"><option value="cpce1">CP-CE1</option><option value="ce2">CE2</option><option value="cm">CM1-CM2</option></select></div><div><label>Type d’inférence</label><input id="fType"></div><div class="wide"><label>Titre</label><input id="fTitle"></div><div class="wide"><label>Texte</label><textarea id="fText"></textarea></div><div class="wide" id="qList"></div><div class="wide"><button class="button button-outline" id="addQ" type="button">+ Ajouter une question</button></div>
  <div class="wide testbox"><h3>Tester le jugement de l’IA</h3><p class="muted">Essaie une réponse d’élève fictive sur la version affichée ci-dessus (même non enregistrée). Rien n’est ajouté au suivi.</p><label for="tQ">Question testée</label><select id="tQ"></select><label for="tAnswer">Réponse de l’élève (fictive)</label><textarea id="tAnswer" maxlength="400"></textarea><label>Indices cochés dans le texte (clique sur les mots)</label><div class="reading-text" id="tText"></div><button class="button button-outline" id="tRun" type="button">Tester</button><div id="tResult"></div></div><div class="wide"><p class="muted">Identifiant : <strong id="fId"></strong>. Les codes d’accès et de validation se définissent dans l’onglet Codes. Le code de validation est remis à la fin de la dernière question.</p></div><div class="wide"><button class="button button-primary" id="saveChallenge">Enregistrer</button> ${isNew ? '' : '<button class="button button-outline danger" id="deleteChallenge">Supprimer</button>'}</div></div>`;
  $('#fLevel').value = c.level; $('#fType').value = c.type; $('#fTitle').value = c.title; $('#fText').value = c.text; $('#fId').textContent = c.id;
  renderQs(c.questions.map(q => Object.assign({}, q)));
  $('#addQ').onclick = () => { const cur = collectQs(); cur.push(emptyQ()); renderQs(cur); };
  const refreshTestText = () => { $('#tText').innerHTML = renderText($('#fText').value || 'Le texte du défi apparaît ici.'); $('#tText').querySelectorAll('.word').forEach(w => w.onclick = () => w.classList.toggle('selected')); };
  const refreshTestQs = () => { const n = collectQs().length, cur = $('#tQ').value; $('#tQ').innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">Question ${i + 1}</option>`).join(''); if (cur && cur < n) $('#tQ').value = cur; };
  refreshTestText(); refreshTestQs(); $('#fText').oninput = refreshTestText; $('#tQ').onfocus = refreshTestQs; $('#addQ').addEventListener('click', refreshTestQs);
  $('#tRun').onclick = async () => {
    refreshTestQs(); const q = collectQs()[+$('#tQ').value || 0], out = $('#tResult');
    if (!q || !q.question || !q.answers.length || !q.clues.length) { out.innerHTML = '<p class="muted">Complète d’abord la question, les réponses et les indices de référence.</p>'; return; }
    if (!$('#tAnswer').value.trim()) { out.innerHTML = '<p class="muted">Saisis une réponse d’élève fictive.</p>'; return; }
    out.innerHTML = '<p class="muted">Analyse en cours…</p>'; $('#tRun').disabled = true;
    try {
      const r = await adminCall('test', { draft: { level: $('#fLevel').value, type: $('#fType').value, text: $('#fText').value, question: q }, studentAnswer: $('#tAnswer').value, selectedClues: [...$('#tText').querySelectorAll('.word.selected')].map(w => w.dataset.word) });
      out.innerHTML = `<div class="feedback ${r.answer_ok && r.clues_ok ? 'good' : 'bad'}"><strong>${r.answer_ok && r.clues_ok ? 'L’élève réussirait cette question.' : 'L’élève ne réussirait pas encore.'}</strong><br>Réponse : ${r.answer_ok ? '✓ juste' : '✗ à revoir'} · Indices : ${r.clues_ok ? '✓ suffisants' : '✗ insuffisants'}<br><em>Message affiché à l’élève : ${esc(r.feedback || '—')}</em></div>`;
    } catch (err) { out.innerHTML = `<div class="feedback bad">Test impossible (${esc(errText(err))}).</div>`; }
    $('#tRun').disabled = false;
  };
  $('#saveChallenge').onclick = async () => {
    const questions = collectQs(), updated = { id: c.id, level: $('#fLevel').value, type: $('#fType').value, title: $('#fTitle').value, text: $('#fText').value, questions };
    if (!updated.title || !updated.text) { alert('Complète le titre et le texte.'); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.answers.length || !q.clues.length || !q.hints.length) { alert('Question ' + (i + 1) + ' : complète la question, au moins une réponse, une combinaison d’indices et une aide.'); return; }
    }
    const i = adminData.challenges.findIndex(x => x.id === c.id);
    if (i < 0) adminData.challenges.push(updated); else adminData.challenges[i] = updated;
    try { await saveChallengesNow(); alert('Défi enregistré.'); renderChallengeAdmin($('#adminPanel')); }
    catch (err) { alert('Enregistrement impossible (' + errText(err) + ').'); }
  };
  if (!isNew) $('#deleteChallenge').onclick = async () => {
    if (!confirm('Supprimer définitivement ce défi ?')) return;
    adminData.challenges = adminData.challenges.filter(x => x.id !== c.id);
    try { await saveChallengesNow(); renderChallengeAdmin($('#adminPanel')); } catch (err) { alert('Suppression impossible (' + errText(err) + ').'); }
  };
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =====================================================================
// Codes d'accès et de validation
// =====================================================================
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  const s = [...a].map(x => CODE_CHARS[x % CODE_CHARS.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
function renderCodes(panel) {
  const list = adminData.challenges;
  panel.innerHTML = `<p class="muted">Le code d’accès est remis par l’ERUN aux élèves : il ouvre le défi. Le code de validation s’affiche à l’élève à la fin de la dernière question et sert de preuve de réussite.</p>
  <div class="action-row"><button class="button button-outline" id="genMissing">Générer les codes manquants</button> <button class="button button-primary" id="saveCodes">Enregistrer</button> <button class="button button-outline" id="printCodes">Imprimer la liste</button></div>
  <div class="table-wrap"><table class="data"><thead><tr><th>Défi</th><th>Code d’accès</th><th>Code de validation</th><th></th></tr></thead><tbody>${list.map(c => { const k = adminData.codes[c.id] || {}; return `<tr data-id="${esc(c.id)}"><td>${esc(LEVELS[c.level])} – ${esc(c.title)}</td><td><input class="code-in" data-f="access" value="${esc(k.access || '')}"></td><td><input class="code-in" data-f="validation" value="${esc(k.validation || '')}"></td><td><button class="button button-outline small gen" type="button">Générer</button></td></tr>`; }).join('')}</tbody></table></div>`;
  const rowsEl = () => [...panel.querySelectorAll('tbody tr')];
  panel.querySelectorAll('.gen').forEach(b => b.onclick = () => { const tr = b.closest('tr'); tr.querySelector('[data-f=access]').value = genCode(); tr.querySelector('[data-f=validation]').value = genCode(); });
  $('#genMissing').onclick = () => rowsEl().forEach(tr => { ['access', 'validation'].forEach(f => { const i = tr.querySelector('[data-f=' + f + ']'); if (!i.value.trim()) i.value = genCode(); }); });
  const collect = () => { const o = {}; rowsEl().forEach(tr => { o[tr.dataset.id] = { access: tr.querySelector('[data-f=access]').value.trim(), validation: tr.querySelector('[data-f=validation]').value.trim() }; }); return o; };
  $('#saveCodes').onclick = async () => {
    try { const d = await adminCall('saveCodes', { codes: collect() }); adminData.codes = d.codes; alert('Codes enregistrés.'); }
    catch (err) { alert('Enregistrement impossible (' + errText(err) + ').'); }
  };
  $('#printCodes').onclick = () => {
    const codes = collect();
    $('#printArea').innerHTML = `<h1>Mission Inférences – codes des défis</h1><p>Document confidentiel, réservé à l’ERUN.</p><table class="data"><thead><tr><th>Défi</th><th>Code d’accès (à donner aux élèves)</th><th>Code de validation (affiché en fin de défi)</th></tr></thead><tbody>${list.map(c => `<tr><td>${esc(LEVELS[c.level])} – ${esc(c.title)}</td><td>${esc(codes[c.id].access)}</td><td>${esc(codes[c.id].validation)}</td></tr>`).join('')}</tbody></table>`;
    window.print();
  };
}

// =====================================================================
// Enseignants : accès en lecture seule, limité à leurs écoles
// =====================================================================
function renderTeachers(panel) {
  const known = [...new Set(trackingLog.map(e => parseGroup(e.group).school))].sort((a, b) => a.localeCompare(b, 'fr'));
  const row = t => `<tr><td><input class="t-label" maxlength="60" value="${esc(t.label)}" placeholder="Ex. Mme Martin"></td><td><input class="t-schools" value="${esc((t.schools || []).join(', '))}" placeholder="Ex. Victor Hugo, Jules Ferry"></td><td><input class="code-in t-code" value="${esc(t.code || '')}"></td><td class="actions"><button class="button button-outline small t-gen" type="button">Générer</button> <button class="button button-outline small danger t-del" type="button">Supprimer</button></td></tr>`;
  panel.innerHTML = `<p class="muted">Un enseignant voit uniquement le suivi des groupes de ses écoles, en lecture seule (pas de réglages, pas de codes, pas de suppression). Pour se connecter : « Espace administrateur », case « Je suis enseignant·e », puis son code. Écris le nom de l’école comme dans le code de groupe (la casse et les accents sont ignorés).</p>
  ${known.length ? `<p class="muted">Écoles déjà vues : ${known.map(esc).join(', ')}</p>` : ''}
  <div class="table-wrap"><table class="data"><thead><tr><th>Enseignant·e</th><th>École(s), séparées par une virgule</th><th>Code d’accès</th><th></th></tr></thead><tbody id="tBody">${adminData.teachers.map(row).join('')}</tbody></table></div>
  <div class="action-row"><button class="button button-outline" id="addTeacher" type="button">+ Ajouter un enseignant</button> <button class="button button-primary" id="saveTeachers" type="button">Enregistrer</button></div>`;
  const bindRows = () => panel.querySelectorAll('#tBody tr').forEach(tr => {
    tr.querySelector('.t-gen').onclick = () => { tr.querySelector('.t-code').value = genCode(); };
    tr.querySelector('.t-del').onclick = () => tr.remove();
  });
  bindRows();
  $('#addTeacher').onclick = () => { $('#tBody').insertAdjacentHTML('beforeend', row({ label: '', schools: [], code: genCode() })); bindRows(); };
  $('#saveTeachers').onclick = async () => {
    const teachers = [...panel.querySelectorAll('#tBody tr')].map(tr => ({ label: tr.querySelector('.t-label').value, schools: tr.querySelector('.t-schools').value, code: tr.querySelector('.t-code').value }));
    try { const d = await adminCall('saveTeachers', { teachers }); adminData.teachers = d.teachers; alert('Enseignants enregistrés.'); renderTeachers(panel); }
    catch (err) { alert('Enregistrement impossible (' + errText(err) + ').'); }
  };
}

// =====================================================================
// Réglages : signature, voix, limites, conservation des données
// =====================================================================
function renderSettings(panel) {
  const s = adminData.settings, cr = s.creator || DEFAULT_CREATOR;
  panel.innerHTML = `<h3>Créateur de l’application</h3><div class="admin-editor"><div class="wide"><label><input type="checkbox" id="sCrVisible" ${cr.visible ? 'checked' : ''}> Afficher la signature en bas de l’application</label></div><div class="wide"><label for="sCrText">Texte affiché</label><input id="sCrText" maxlength="160" value="${esc(cr.text)}"></div></div>
  <h3>Aide à la lecture</h3><div class="admin-editor"><div class="wide"><label><input type="checkbox" id="sRead" ${s.readAloud !== false ? 'checked' : ''}> Proposer la lecture à voix haute du texte et des questions</label></div><div class="wide"><label><input type="checkbox" id="sDict" ${s.dictation ? 'checked' : ''}> Proposer la dictée de la réponse (micro)</label><p class="muted">Attention : la dictée utilise le service de reconnaissance vocale du navigateur (Chrome, Edge : serveurs externes). À n’activer qu’en connaissance de cause ; la voix de l’élève n’est jamais envoyée à ce site.</p></div></div>
  <h3>Limites d’usage de l’IA</h3><div class="admin-editor"><div><label for="sGrp">Vérifications par groupe et par heure</label><input type="number" id="sGrp" min="5" max="1000" value="${s.perGroupHour}"></div><div><label for="sDay">Vérifications par jour (tous groupes)</label><input type="number" id="sDay" min="50" max="100000" value="${s.perDay}"></div><div class="wide"><p class="muted">Protège votre quota Albert. Le code d’accès est aussi limité à 30 erreurs par 10 minutes et par connexion.</p></div></div>
  <h3>Conservation du suivi</h3><div class="admin-editor"><div><label for="sRet">Supprimer automatiquement les données de suivi de plus de</label><select id="sRet">${[[0, 'Ne jamais supprimer'], [90, '90 jours'], [180, '180 jours'], [365, '1 an'], [730, '2 ans']].map(([v, l]) => `<option value="${v}" ${s.retentionDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label>&nbsp;</label><button class="button button-outline" id="purgeNow" type="button">Purger maintenant</button></div></div>
  <div class="action-row"><button class="button button-primary" id="saveSettings">Enregistrer les réglages</button></div>`;
  $('#saveSettings').onclick = async () => {
    const next = { creator: { visible: $('#sCrVisible').checked, text: $('#sCrText').value.trim() }, readAloud: $('#sRead').checked, dictation: $('#sDict').checked, perGroupHour: $('#sGrp').value, perDay: $('#sDay').value, retentionDays: $('#sRet').value };
    try { const d = await adminCall('saveSettings', { settings: next }); adminData.settings = d.settings; await loadPublic(); alert('Réglages enregistrés.'); renderSettings(panel); }
    catch (err) { alert('Enregistrement impossible (' + errText(err) + ').'); }
  };
  $('#purgeNow').onclick = async () => {
    const days = parseInt($('#sRet').value, 10);
    if (!days) { alert('Choisis d’abord une durée de conservation.'); return; }
    if (!confirm('Supprimer les données de suivi de plus de ' + days + ' jours ?')) return;
    try { const d = await adminCall('purge', { days }); await loadAdmin(); alert(d.deleted + ' évènement(s) supprimé(s).'); }
    catch (err) { alert('Purge impossible (' + errText(err) + ').'); }
  };
}
