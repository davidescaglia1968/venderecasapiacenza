/**
 * build.mjs — orchestratore della macchina.
 *
 * Ordine di esecuzione (le dipendenze contano):
 *   1. annunci      → data/annunci.json        (serve al mercato e alla concorrenza)
 *   2. notizie      → data/notizie.json        (serve ai contenuti)
 *   3. mercato      → data/mercato.json        (usa annunci)
 *   4. concorrenza  → data/concorrenza.json    (usa annunci)
 *   5. social       → contenuti/ + data/contenuti.json (usa mercato e notizie)
 *   6. crm-bridge   → data/crm/                (usa annunci)
 *   7. pagine       → tutte le pagine HTML     (usa tutti i dati)
 *   8. sitemap      → sitemap.xml              (dai file che esistono davvero)
 *   9. verifica     → controlli di coerenza
 *
 * Uso:
 *   node tools/build.mjs            # produzione: senza dati di esempio
 *   node tools/build.mjs --demo     # con il dataset dimostrativo di test
 *   node tools/build.mjs --offline  # nessuna richiesta di rete
 */
import { costruisciAnnunci } from './annunci.mjs';
import { raccogliNotizie } from './notizie.mjs';
import { costruisciMercato } from './market.mjs';
import { costruisciConcorrenza } from './concorrenza.mjs';
import { costruisciContenuti } from './social.mjs';
import { costruisciPonteCrm } from './crm-bridge.mjs';
import { generaPagine } from './pagine.mjs';
import { generaSitemap, verificaCollegamenti } from './sitemap.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const demo = args.includes('--demo');
const offline = args.includes('--offline');
const limiteContenutiArg = args.find((a) => a.startsWith('--contenuti='));
const limiteContenuti = limiteContenutiArg ? Number(limiteContenutiArg.split('=')[1]) : 8;

const log = (...a) => console.log('·', ...a);
const inizio = Date.now();

async function passo(nome, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`✓ ${nome} (${Date.now() - t} ms)`);
    return r;
  } catch (e) {
    console.error(`✗ ${nome}: ${e.message}`);
    throw e;
  }
}

console.log(`\n=== BUILD venderecasapiacenza.it ===`);
console.log(`modalità: ${demo ? 'DEMO (con dataset di esempio)' : 'produzione'} · rete: ${offline ? 'disattivata' : 'attiva'}\n`);

await passo('1/9 annunci', () => costruisciAnnunci({ demo, offline, log }));
await passo('2/9 notizie', () => raccogliNotizie({ offline, log }));
await passo('3/9 mercato', () => costruisciMercato({ log }));
await passo('4/9 concorrenza', () => costruisciConcorrenza({ log }));
await passo('5/9 contenuti', () => costruisciContenuti({ limite: limiteContenuti, log }));
await passo('6/9 ponte CRM', () => costruisciPonteCrm({ log }));
await passo('7/9 pagine', () => generaPagine({ log }));
const sitemap = await passo('8/9 sitemap', () => generaSitemap({ log }));
const interrotti = await passo('9/9 verifica collegamenti', () => verificaCollegamenti({ log }));

if (interrotti.length) {
  console.log('\n⚠ Collegamenti interni che non risolvono su un file:');
  for (const p of interrotti.slice(0, 30)) console.log(`   ${p.file} → ${p.href}`);
  if (interrotti.length > 30) console.log(`   ...e altri ${interrotti.length - 30}`);
}

// riepilogo finale
const sommario = {
  generatoIl: new Date().toISOString(),
  modalita: demo ? 'demo' : 'produzione',
  durataMs: Date.now() - inizio,
  urlInSitemap: sitemap.url.length,
  collegamentiInterrotti: interrotti,
};

const dataDir = path.join(process.cwd(), 'data');
await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, 'build.json'), JSON.stringify(sommario, null, 2), 'utf8');

console.log(`\n=== BUILD COMPLETATA in ${sommario.durataMs} ms ===`);
console.log(`URL in sitemap: ${sommario.urlInSitemap}`);
console.log(`Collegamenti interrotti: ${interrotti.length}`);
if (interrotti.length) process.exitCode = 0; // segnalato, non bloccante
