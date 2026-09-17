/**
 * annunci.mjs — raccoglie gli annunci, li normalizza e produce l'analisi.
 *
 * Obiettivo dichiarato: avere sotto controllo TUTTI gli annunci di Piacenza e
 * delle zone servite, ordinati per data di pubblicazione dal più vecchio al
 * più recente, con in evidenza gli immobili fermi da anni.
 *
 * Il risultato è data/annunci.json + data/annunci.csv, e la lista operativa
 * dei lead di acquisizione (data/lead-acquisizione.json).
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { eseguiAdapter, leggiSorgenti } from './lib/adapters.mjs';
import {
  normalizzaAnnuncio,
  analizzaAnnunci,
  deduplica,
  leadDaAnnunciFermi,
} from './lib/annunci.mjs';
import { toCsv } from './lib/csv.mjs';

const DIR_SEMI = path.join('data', 'seeds');
const DIR_DEMO = path.join('tools', 'test', 'fixtures');

/**
 * Raccolta.
 * @param {object} opt { root, demo, log, sorgentiCsv }
 */
export async function raccogli({ root = process.cwd(), demo = false, offline = false, log = () => {}, sorgentiCsv = null } = {}) {
  const registro = await leggiSorgenti(root);
  const risultati = [];
  const grezzi = [];

  // 1) import CSV: è il canale che funziona sempre, anche senza rete.
  const cartelle = sorgentiCsv ? [{ dir: path.dirname(sorgentiCsv), filtro: path.basename(sorgentiCsv) }] : [];
  if (demo) cartelle.push({ dir: DIR_DEMO, filtro: /^annunci-.*\.csv$/ });
  if (!sorgentiCsv) cartelle.push({ dir: DIR_SEMI, filtro: /\.csv$/ });

  for (const { dir, filtro } of cartelle) {
    const assoluto = path.isAbsolute(dir) ? dir : path.join(root, dir);
    let file = [];
    try {
      file = (await readdir(assoluto)).filter((f) =>
        filtro instanceof RegExp ? filtro.test(f) : f === filtro
      );
    } catch {
      continue;
    }
    for (const f of file) {
      const r = await eseguiAdapter('csv', { file: path.join(assoluto, f), sorgente: 'csv' }, { root, log });
      risultati.push({ tipo: 'csv', file: f, stato: r.stato, conteggio: r.annunci?.length || 0, motivo: r.motivo });
      (r.annunci || []).forEach((a) => grezzi.push(a));
    }
  }

  // 2) sorgenti automatiche consentite dal robots.txt
  const automatiche = [
    ...(registro.portaliImmobiliari || []),
    ...(registro.aggregatoriDati || []),
  ].filter((s) => s.endpointAnnunci);

  for (const s of automatiche) {
    const r = await eseguiAdapter(s.endpointAnnunci.tipo, { ...s.endpointAnnunci, sorgente: s.id }, { root, log });
    risultati.push({ tipo: s.endpointAnnunci.tipo, sorgente: s.id, stato: r.stato, conteggio: r.annunci?.length || 0, motivo: r.motivo });
    (r.annunci || []).forEach((a) => grezzi.push({ ...a, sorgente: a.sorgente || s.id }));
  }

  // 3) import dal CRM, se presente
  const crm = await eseguiAdapter('crm', { file: path.join(root, 'data', 'seeds', 'crm-immocrm.json') }, { root, log });
  if (crm.stato === 'ok') {
    risultati.push({ tipo: 'crm', stato: crm.stato, conteggio: crm.annunci.length });
    crm.annunci.forEach((a) => grezzi.push(a));
  } else {
    risultati.push({ tipo: 'crm', stato: crm.stato, motivo: crm.motivo, conteggio: 0 });
  }

  // 4) verifica di conformità: per ogni portale dichiariamo cosa possiamo e cosa no
  const conformita = offline
    ? dichiaraConformita(registro, 'non verificabile in modalità offline')
    : await verificaConformita(registro, { log });

  const oggi = new Date();
  const normalizzati = grezzi.map((g) => normalizzaAnnuncio(g, oggi));
  const unici = deduplica(normalizzati);
  const analisi = analizzaAnnunci(unici, { oggi, topStallo: 200 });

  return { grezzi: grezzi.length, normalizzati, unici, analisi, risultati, conformita, oggi };
}

/**
 * Verifica robots.txt delle sorgenti dichiarate: produce la tabella di
 * conformità pubblicata sulla pagina interna, così è evidente cosa il sistema
 * raccoglie da solo e cosa richiede rilievo manuale.
 */
export async function verificaConformita(registro, { log = () => {} } = {}) {
  const { canFetch } = await import('./lib/robots.mjs');
  const righe = [];
  const gruppi = ['portaliImmobiliari', 'piattaformeGeneraliste', 'aggregatoriDati', 'stampa'];
  for (const g of gruppi) {
    for (const s of registro[g] || []) {
      const url = s.rss || s.url;
      if (!url) continue;
      const finale = url.includes('{query}') ? url.replace('{query}', encodeURIComponent('test')) : url;
      try {
        const p = await canFetch(finale);
        righe.push({
          id: s.id,
          nome: s.nome,
          categoria: g,
          url: finale,
          consentito: p.consentito,
          motivo: p.motivo,
          raccoltaDichiarata: s.raccoltaAutomatica,
        });
      } catch (e) {
        righe.push({ id: s.id, nome: s.nome, categoria: g, url: finale, consentito: false, motivo: 'verifica fallita: ' + e.message, raccoltaDichiarata: s.raccoltaAutomatica });
      }
    }
  }
  log(`conformità robots verificata su ${righe.length} sorgenti (${righe.filter((r) => r.consentito).length} consentite)`);
  return righe;
}

/** Elenco delle sorgenti senza verifica di rete (modalità offline). */
export function dichiaraConformita(registro, motivo) {
  const gruppi = ['portaliImmobiliari', 'piattaformeGeneraliste', 'aggregatoriDati', 'stampa'];
  const righe = [];
  for (const g of gruppi) {
    for (const s of registro[g] || []) {
      righe.push({
        id: s.id,
        nome: s.nome,
        categoria: g,
        url: s.rss || s.url,
        consentito: false,
        motivo,
        raccoltaDichiarata: s.raccoltaAutomatica,
      });
    }
  }
  return righe;
}

export async function costruisciAnnunci({ root = process.cwd(), demo = false, offline = false, log = () => {} } = {}) {
  const r = await raccogli({ root, demo, offline, log });
  const lead = leadDaAnnunciFermi(r.analisi, { sogliaGiorni: 180, max: 60 });

  const payload = {
    generatoIl: r.oggi.toISOString(),
    modalita: demo ? 'demo' : 'produzione',
    sorgenti: r.risultati,
    conformitaRobots: r.conformita,
    ...r.analisi,
    leadAcquisizione: lead,
  };

  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/annunci.json'), JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(path.join(root, 'data/lead-acquisizione.json'), JSON.stringify(lead, null, 2), 'utf8');

  // sempre riscritti: altrimenti restano i file della build precedente
  // e il repository dichiara annunci che non esistono più
  const colonne = [
    'comune', 'zona', 'tipo', 'prezzo', 'mq', 'prezzoMq', 'dataPubblicazione',
    'giorniInPubblicazione', 'fasciaAnzianita', 'agenzia', 'sorgente', 'url',
  ];
  await writeFile(
    path.join(root, 'data/annunci.csv'),
    toCsv(r.unici.map((a) => Object.fromEntries(colonne.map((c) => [c, a[c]]))), colonne),
    'utf8'
  );

  log(`data/annunci.json: ${r.analisi.totali.annunci} annunci unici (${r.analisi.totali.duplicatiEliminati} duplicati eliminati), ${lead.length} lead di acquisizione`);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = process.argv.includes('--demo');
  const offline = process.argv.includes('--offline');
  costruisciAnnunci({ demo, offline, log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
