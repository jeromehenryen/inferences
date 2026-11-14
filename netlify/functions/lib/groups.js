// Code de groupe « niveau-école » (ex. CE2-Victor Hugo) : même règle que dans le navigateur.
const CL = '(?:CP|CE1|CE2|CM1|CM2)';
const RE = new RegExp('^\\s*(' + CL + '(?:\\s*[-/]\\s*' + CL + ')*)\\s*-\\s*(.+?)\\s*$', 'i');
const normSchool = s => String(s || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function parseGroup(code) {
  const m = String(code || '').match(RE);
  return m ? { level: m[1].toUpperCase().replace(/\s+/g, ''), school: m[2] } : { level: '?', school: String(code || '').trim() };
}
module.exports = { parseGroup, normSchool };
