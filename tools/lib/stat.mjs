/**
 * stat.mjs — statistiche descrittive per l'analisi degli annunci.
 * Nessuna dipendenza, funzioni pure e testate.
 */

export function somma(a) {
  return a.reduce((s, x) => s + (Number(x) || 0), 0);
}

export function media(a) {
  const v = a.filter((x) => Number.isFinite(Number(x))).map(Number);
  return v.length ? somma(v) / v.length : 0;
}

/** Mediana: più robusta della media sui prezzi immobiliari (distribuzione asimmetrica). */
export function mediana(a) {
  const v = a.filter((x) => Number.isFinite(Number(x))).map(Number).sort((x, y) => x - y);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Percentile lineare (0-100). */
export function percentile(a, p) {
  const v = a.filter((x) => Number.isFinite(Number(x))).map(Number).sort((x, y) => x - y);
  if (!v.length) return 0;
  const idx = (Math.max(0, Math.min(100, p)) / 100) * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

export function variazionePct(da, a) {
  if (!da) return 0;
  return ((a - da) / da) * 100;
}

export function arrotonda(n, cifre = 1) {
  const f = 10 ** cifre;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

/**
 * Istogramma per fasce.
 * @param {number[]} valori
 * @param {Array<{etichetta:string, min:number, max:number|null}>} fasce max=null = illimitato
 */
export function fasce(valori, bande) {
  return bande.map((b) => {
    const dentro = valori.filter(
      (v) => v >= b.min && (b.max === null || v < b.max)
    );
    return {
      etichetta: b.etichetta,
      min: b.min,
      max: b.max,
      conteggio: dentro.length,
      pct: valori.length ? arrotonda((dentro.length / valori.length) * 100, 1) : 0,
    };
  });
}

/** Raggruppa una lista di oggetti per chiave e applica un riduttore. */
export function raggruppa(items, chiave, fn = (g) => g.length) {
  const m = new Map();
  for (const it of items) {
    const k = typeof chiave === 'function' ? chiave(it) : it[chiave];
    const kk = k == null ? 'n/d' : String(k);
    if (!m.has(kk)) m.set(kk, []);
    m.get(kk).push(it);
  }
  const out = {};
  for (const [k, g] of m) out[k] = fn(g);
  return out;
}

export function ordinaPerConteggio(oggetto, max = Infinity) {
  return Object.entries(oggetto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([chiave, valore]) => ({ chiave, valore }));
}
