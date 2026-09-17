/**
 * sitemap.mjs — genera sitemap.xml partendo dai file che esistono davvero.
 *
 * Regola: nessuna URL in sitemap senza il file corrispondente sul disco.
 * La sitemap precedente elencava 23 URL di cui 21 non esistevano: Google
 * riceveva 21 segnali di pagina inesistente a ogni scansione.
 *
 * Le pagine interne (concorrenza, contenuti) e le pagine legali sono escluse.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SITE = 'https://venderecasapiacenza.it';

/** Percorsi esclusi dalla sitemap: strumenti interni, risorse, pagine legali. */
const ESCLUSI = [
  /^concorrenza\//,
  /^contenuti\//,
  /^data\//,
  /^tools\//,
  /^analisi\//,
  /^\.github\//,
  /^\.cache\//,
  /^privacy-policy\.html$/,
  /^cookie-policy\.html$/,
  /^termini-condizioni\.html$/,
  /^404\.html$/,
  /^grazie\.html$/,
  /^wizard\.html$/, // raggiunto dalla home con /wizard
  /^blog\.html$/, // duplicato di /blog/
  /^README\.md$/,
];

const PRIORITA = [
  { re: /^index\.html$/, priorita: '1.0', freq: 'weekly' },
  { re: /^mercato\//, priorita: '0.9', freq: 'weekly' },
  { re: /^quartieri\/[^/]+\.html$/, priorita: '0.9', freq: 'weekly' },
  { re: /^guide\//, priorita: '0.8', freq: 'monthly' },
  { re: /^blog\//, priorita: '0.7', freq: 'weekly' },
  { re: /^osservatorio-ai\//, priorita: '0.6', freq: 'monthly' },
];

export function prioritaDi(p) {
  for (const p0 of PRIORITA) if (p0.re.test(p)) return p0;
  return { priorita: '0.5', freq: 'monthly' };
}

async function percorri(dir, base = '') {
  const out = [];
  let voci = [];
  try {
    voci = await readdir(dir);
  } catch {
    return out;
  }
  for (const v of voci) {
    if (v === '.git' || v === 'node_modules' || v.startsWith('.')) continue;
    const full = path.join(dir, v);
    const rel = path.join(base, v).split(path.sep).join('/');
    const info = await stat(full);
    if (info.isDirectory()) {
      out.push(...(await percorri(full, rel)));
    } else if (v.endsWith('.html')) {
      out.push(rel);
    }
  }
  return out;
}

export async function generaSitemap({ root = process.cwd(), log = () => {} } = {}) {
  const tutti = await percorri(root);
  const inclusi = tutti.filter((f) => !ESCLUSI.some((re) => re.test(f)));
  const scartati = tutti.filter((f) => ESCLUSI.some((re) => re.test(f)));

  // verifica incrociata: niente URL senza file
  const url = inclusi
    .map((f) => {
      const percorso = f === 'index.html' ? '/' : '/' + f.replace(/\/index\.html$/, '/');
      const p = prioritaDi(f);
      return { percorso, priorita: p.priorita, freq: p.freq, file: f };
    })
    .sort((a, b) => b.priorita.localeCompare(a.priorita) || a.percorso.localeCompare(b.percorso));

  const oggi = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url
  .map(
    (u) => `  <url>
    <loc>${SITE}${u.percorso}</loc>
    <lastmod>${oggi}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priorita}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  await writeFile(path.join(root, 'sitemap.xml'), xml, 'utf8');
  log(`sitemap.xml: ${url.length} URL (${scartati.length} percorsi esclusi)`);
  return { url, scartati };
}

/**
 * Verifica che ogni collegamento interno del sito punti a un file esistente.
 * È il controllo che avrebbe evitato la sitemap con 21 URL inesistenti.
 */
export async function verificaCollegamenti({ root = process.cwd(), log = () => {} } = {}) {
  const file = (await percorri(root)).filter((f) => f.endsWith('.html'));
  const problemi = [];

  for (const f of file) {
    const html = await readFile(path.join(root, f), 'utf8');
    const href = [...html.matchAll(/href="([^"#]+)"/g)].map((m) => m[1]);
    for (const h of new Set(href)) {
      if (/^(https?:)?\/\//.test(h) && !h.includes('venderecasapiacenza.it')) continue; // esterno
      if (/^(mailto:|tel:|javascript:|data:)/.test(h)) continue;
      const pulito = h.replace(/^https:\/\/(www\.)?venderecasapiacenza\.it/, '').split('?')[0];
      if (!pulito || pulito === '/') continue;
      const senzaSlash = pulito.replace(/^\//, '').replace(/\/$/, '');
      const candidati = [senzaSlash, senzaSlash + '.html', senzaSlash + '/index.html', senzaSlash + '/'];
      const esiste = candidati.some((c) => existsSync(path.join(root, c)));
      if (!esiste) problemi.push({ file: f, href: h, risolto: senzaSlash });
    }
  }

  log(`collegamenti interni verificati su ${file.length} pagine: ${problemi.length} interrotti`);
  return problemi;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generaSitemap({ log: console.log })
    .then(() => verificaCollegamenti({ log: console.log }))
    .then((p) => {
      if (p.length) console.table(p.slice(0, 40));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
