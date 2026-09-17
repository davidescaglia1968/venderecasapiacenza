/**
 * adapters.mjs — sorgenti di annunci collegate a un'architettura ad adattatori.
 *
 * REGOLA DI PROGETTO (non negoziabile)
 * ------------------------------------
 * Nessun adattatore fa una richiesta senza il via libera di robots.mjs.
 * Se una sorgente vieta la raccolta, l'adattatore restituisce
 * { stato: 'bloccato', motivo } e il sistema prosegue: non aggira il divieto.
 *
 * Come si riempie quindi il database degli annunci?
 *   1. adapters 'rss' e 'jsonld'  → automatici, solo dove consentito
 *   2. adapter  'csv'             → import del rilievo manuale (canale principale
 *                                   per Facebook Marketplace e i portali chiusi)
 *   3. adapter  'crm'             → import dal CRM immocrm, che resta la fonte
 *                                   primaria perché contiene anche le date reali
 *                                   di primo incarico, non solo di pubblicazione
 *
 * Ogni record porta con sé `sorgente` e `dataRilevamento`: la tracciabilità
 * della fonte è ciò che rende il dato utilizzabile davanti a un cliente.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchHttp, ok } from './net.mjs';
import { canFetch } from './robots.mjs';
import { parseFeed, parseJsonLd, appiattisciLd, decodifica } from './xml.mjs';
import { parseCsv } from './csv.mjs';

/** Legge il registro sorgenti. */
export async function leggiSorgenti(root = process.cwd()) {
  const p = path.join(root, 'tools', 'config', 'sorgenti.json');
  return JSON.parse(await readFile(p, 'utf8'));
}

/* ------------------------------------------------------------------ */
/* Adapter RSS: il canale automatico principale                         */
/* ------------------------------------------------------------------ */
export async function adapterRss({ url, sorgente, query }, { log = () => {} } = {}) {
  const finale = url.replace('{query}', encodeURIComponent(query || ''));
  const permesso = await canFetch(finale);
  if (!permesso.consentito) {
    log(`RSS bloccato da robots: ${finale} (${permesso.motivo})`);
    return { stato: 'bloccato', motivo: permesso.motivo, url: finale, items: [] };
  }
  try {
    const res = await fetchHttp(finale);
    if (!ok(res)) return { stato: 'errore', motivo: 'HTTP ' + res.status, url: finale, items: [] };
    const items = parseFeed(res.body);
    log(`RSS ${sorgente}: ${items.length} elementi`);
    return { stato: 'ok', url: finale, items, dataRilevamento: new Date().toISOString() };
  } catch (e) {
    return { stato: 'errore', motivo: e.message, url: finale, items: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Adapter JSON-LD: legge gli annunci strutturati dalle pagine lecite   */
/* ------------------------------------------------------------------ */
export async function adapterJsonLd({ url, sorgente }, { log = () => {} } = {}) {
  const permesso = await canFetch(url);
  if (!permesso.consentito) {
    log(`JSON-LD bloccato da robots: ${url} (${permesso.motivo})`);
    return { stato: 'bloccato', motivo: permesso.motivo, url, annunci: [] };
  }
  try {
    const res = await fetchHttp(url);
    if (!ok(res)) return { stato: 'errore', motivo: 'HTTP ' + res.status, url, annunci: [] };
    const ld = appiattisciLd(parseJsonLd(res.body));
    const annunci = ld
      .filter((n) => {
        const t = String(n['@type'] || '');
        return /Residence|House|Apartment|SingleFamilyResidence|Accommodation|Offer|Product/.test(t);
      })
      .map((n) => ({
        titolo: n.name || n.headline || '',
        prezzo: n.offers?.price ?? n.price ?? null,
        mq: n.floorSize?.value ?? null,
        comune: n.address?.addressLocality || '',
        zona: n.address?.streetAddress || '',
        tipo: n['@type'],
        url: n.url || url,
        dataPubblicazione: n.datePosted || null,
        sorgente,
      }));
    log(`JSON-LD ${sorgente}: ${annunci.length} annunci`);
    return { stato: 'ok', url, annunci, dataRilevamento: new Date().toISOString() };
  } catch (e) {
    return { stato: 'errore', motivo: e.message, url, annunci: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Adapter CSV: rilievo manuale → database                             */
/* ------------------------------------------------------------------ */
export async function adapterCsv({ file, sorgente = 'manuale' }, { root = process.cwd(), log = () => {} } = {}) {
  const p = path.isAbsolute(file) ? file : path.join(root, file);
  try {
    const txt = await readFile(p, 'utf8');
    const righe = parseCsv(txt);
    log(`CSV ${path.basename(file)}: ${righe.length} righe`);
    return {
      stato: 'ok',
      file: p,
      annunci: righe.map((r) => ({ ...r, sorgente: r.sorgente || sorgente })),
      dataRilevamento: new Date().toISOString(),
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { stato: 'assente', motivo: 'file non presente: ' + file, annunci: [] };
    return { stato: 'errore', motivo: e.message, annunci: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Adapter CRM: import dall'export di immocrm                          */
/* ------------------------------------------------------------------ */
export async function adapterCrm({ file }, { root = process.cwd(), log = () => {} } = {}) {
  const p = path.isAbsolute(file) ? file : path.join(root, file);
  try {
    const db = JSON.parse(await readFile(p, 'utf8'));
    const immobili = Array.isArray(db) ? db : db.immobili || [];
    log(`CRM: ${immobili.length} immobili`);
    return {
      stato: 'ok',
      file: p,
      annunci: immobili.map((i) => ({
        titolo: i.titolo,
        prezzo: i.prezzo,
        mq: i.mq,
        comune: i.comune,
        zona: i.zona,
        tipo: i.tipo,
        dataPubblicazione: i.dataPubblicazione || i.dataIncarico || null,
        agenzia: i.agenzia || 'Immobiliare Scaglia',
        sorgente: 'crm-immocrm',
      })),
      dataRilevamento: new Date().toISOString(),
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { stato: 'assente', motivo: 'file non presente: ' + file, annunci: [] };
    return { stato: 'errore', motivo: e.message, annunci: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Registro adattatori                                                  */
/* ------------------------------------------------------------------ */
export const ADAPTERS = {
  rss: adapterRss,
  jsonld: adapterJsonLd,
  csv: adapterCsv,
  crm: adapterCrm,
};

export async function eseguiAdapter(tipo, config, opt = {}) {
  const fn = ADAPTERS[tipo];
  if (!fn) throw new Error('adattatore sconosciuto: ' + tipo);
  return fn(config, opt);
}

export { decodifica };
