/**
 * robots.mjs — gate di conformità a robots.txt (RFC 9309).
 *
 * Principio: questo progetto non raccoglie dati da chi lo ha vietato.
 * Ogni richiesta in uscita passa da canFetch(); se il path è bloccato
 * per il nostro user-agent, la richiesta non parte e il risultato è
 * registrato come "bloccato" invece di essere aggirato.
 */
import { fetchHttp, ok } from './net.mjs';

const cache = new Map(); // host -> regole

function parseRobots(txt, ua) {
  const righe = String(txt)
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);

  const gruppi = [];
  let corrente = null;

  for (const riga of righe) {
    const m = riga.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const chiave = m[1].toLowerCase();
    const valore = m[2].trim();
    if (chiave === 'user-agent') {
      if (!corrente || corrente.regole.length) {
        corrente = { agent: [], regole: [] };
        gruppi.push(corrente);
      }
      corrente.agent.push(valore.toLowerCase());
    } else if (corrente && (chiave === 'allow' || chiave === 'disallow')) {
      corrente.regole.push({ tipo: chiave, path: valore });
    }
  }

  // token più specifico vince: ua esatto > substring > *
  const uaLc = ua.toLowerCase();
  const match = (a) => (a === '*' ? 0 : uaLc === a ? 3 : uaLc.includes(a) ? 2 : 1);
  const applicabili = gruppi
    .filter((g) => g.agent.some((a) => a === '*' || uaLc === a || uaLc.includes(a)))
    .map((g) => ({ ...g, score: Math.max(...g.agent.map(match)) }));
  const best = Math.max(0, ...applicabili.map((g) => g.score));
  const regole = applicabili.filter((g) => g.score === best).flatMap((g) => g.regole);

  return regole.length ? regole : [{ tipo: 'allow', path: '' }];
}

/** Confronto di path secondo RFC 9309 (prefisso + wildcard * + $ finale). */
function pathMatch(rulePath, urlPath) {
  if (!rulePath) return false;
  const fineAncora = rulePath.endsWith('$');
  const p = fineAncora ? rulePath.slice(0, -1) : rulePath;
  const parti = p.split('*');
  let idx = 0;
  for (let i = 0; i < parti.length; i++) {
    const seg = parti[i];
    if (!seg) continue;
    const trovato = urlPath.indexOf(seg, idx);
    if (trovato < 0) return false;
    if (i === 0 && trovato !== 0) return false;
    idx = trovato + seg.length;
  }
  if (fineAncora && idx !== urlPath.length) return false;
  return true;
}

export async function getRegole(url, ua = 'ImmobiliareScagliaBot') {
  const u = new URL(url);
  const key = u.origin + '|' + ua;
  if (cache.has(key)) return cache.get(key);

  const robotsUrl = u.origin + '/robots.txt';
  let regole = [{ tipo: 'allow', path: '' }];
  let stato = 'assente';
  try {
    const res = await fetchHttp(robotsUrl, { useCache: true, maxAgeMs: 24 * 3600 * 1000 });
    if (ok(res)) {
      regole = parseRobots(res.body, ua);
      stato = 'letto';
    } else if (res.status === 404 || res.status === 410) {
      stato = 'assente';
    } else {
      // 5xx o inatteso: RFC 9309 suggerisce prudenza → trattare come tutto bloccato
      regole = [{ tipo: 'disallow', path: '/' }];
      stato = 'errore-' + res.status;
    }
  } catch (e) {
    regole = [{ tipo: 'disallow', path: '/' }];
    stato = 'irraggiungibile';
  }
  const out = { regole, stato };
  cache.set(key, out);
  return out;
}

/**
 * canFetch — restituisce { consentito, motivo, regola }.
 * Vince la regola con il path più lungo; a parità, Allow prevale su Disallow.
 */
export async function canFetch(url, ua = 'ImmobiliareScagliaBot') {
  const { regole, stato } = await getRegole(url, ua);
  const u = new URL(url);
  const urlPath = u.pathname + u.search;

  let vincitrice = null;
  for (const r of regole) {
    if (!pathMatch(r.path, urlPath)) continue;
    if (!vincitrice || r.path.length > vincitrice.path.length) vincitrice = r;
    else if (r.path.length === vincitrice.path.length && r.tipo === 'allow') vincitrice = r;
  }

  if (!vincitrice) {
    return { consentito: stato === 'letto', motivo: `nessuna regola corrispondente (robots: ${stato})`, regola: null };
  }
  return {
    consentito: vincitrice.tipo === 'allow',
    motivo: `${vincitrice.tipo.toUpperCase()} ${vincitrice.path} (robots: ${stato})`,
    regola: vincitrice,
  };
}

export { parseRobots, pathMatch };
