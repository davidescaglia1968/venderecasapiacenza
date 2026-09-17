/**
 * csv.mjs — lettura/scrittura CSV senza dipendenze.
 * Il CSV è il canale di import manuale dagli annunci rilevati a mano
 * (Facebook Marketplace, portali che bloccano i crawler).
 */

export function parseCsv(testo, { separatore = ',', intestazione = true } = {}) {
  const righe = splitRighe(String(testo));
  if (!righe.length) return [];
  const [prima, ...resto] = righe;
  const campi = intestazione ? prima : prima.map((_, i) => 'col' + i);
  const dati = intestazione ? resto : righe;
  return dati
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(campi.map((c, i) => [c.trim(), r[i] ?? ''])));
}

function splitRighe(testo) {
  const out = [];
  let riga = [];
  let campo = '';
  let inVirgolette = false;
  // rimuove BOM
  const s = testo.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inVirgolette) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; }
        else inVirgolette = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { inVirgolette = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); out.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); out.push(riga); }
  return out;
}

export function toCsv(oggetti, colonne = null) {
  if (!oggetti.length) return '';
  const cols = colonne || Object.keys(oggetti[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...oggetti.map((o) => cols.map((c) => esc(o[c])).join(','))].join('\n') + '\n';
}
