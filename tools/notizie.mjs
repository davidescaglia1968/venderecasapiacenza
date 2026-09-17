/**
 * notizie.mjs — monitoraggio continuo di notizie, curiosità e analisi
 * sul mercato immobiliare, pubblicate da testate e piattaforme di settore.
 *
 * Canale principale: Google News RSS (feed pubblico documentato), filtrato
 * sulle query di tools/config/sorgenti.json. Solo sorgenti consentite dal
 * robots.txt: la verifica è in tools/lib/robots.mjs.
 *
 * Produce data/notizie.json, ordinato dal più recente al più vecchio e già
 * classificato per pilastro di contenuto (mercato / errore / metodo / storia / zona),
 * così ogni notizia è immediatamente utilizzabile come spunto editoriale.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { adapterRss, leggiSorgenti } from './lib/adapters.mjs';
import { canFetch } from './lib/robots.mjs';
import { decodifica } from './lib/xml.mjs';

const REGOLE_PILASTRO = [
  { id: 'mercato', re: /\b(prezzo|prezzi|quotazion|valore|mercato|omì|omi|tasso|mutui|compravendit|transazion|ntn|imi|eurirs|bce|domanda|offert|statistic|report)\b/i },
  { id: 'errore', re: /\b(errore|errori|sbagliat|truffa|rischio|contenzios|causa|vizio|difett|abus|condon|inutile|attenzione)\b/i },
  { id: 'metodo', re: /\b(ape|certificazion|visura|catast|conformit|notai|rogito|compromesso|proposta|mandato|esclusiv|home\s*staging|fotografi|annunci|portale)\b/i },
  { id: 'storia', re: /\b(eredit|succession|separazion|divorz|asta|falliment|pignorament|donazion|usufrutt|nuda propriet|famiglia)\b/i },
  { id: 'zona', re: /\b(piacenza|rivergaro|gossolengo|vigolzone|podenzano|ponte dell'olio|val trebbia|val nure|emilia-romagna)\b/i },
  { id: 'ai', re: /\b(intelligenza artificiale|ai\b|chatgpt|gemini|claude|perplexity|automazion|proptech|software)\b/i },
];

export function classificaNotizia(testo) {
  const t = String(testo || '');
  const colpiti = REGOLE_PILASTRO.filter((r) => r.re.test(t)).map((r) => r.id);
  return colpiti.length ? colpiti : ['mercato'];
}

export function rilevanzaLocale(item) {
  const t = `${item.titolo} ${item.descrizione}`.toLowerCase();
  let punti = 0;
  for (const k of ['piacenza', 'rivergaro', 'gossolengo', 'vigolzone', 'podenzano', "ponte dell'olio", 'val trebbia', 'val nure']) {
    if (t.includes(k)) punti += 3;
  }
  if (t.includes('emilia-romagna')) punti += 1;
  if (/\b(casa|immobil|vendita|acquisto|mutuo|affitto)\b/.test(t)) punti += 1;
  return punti;
}

function pulisciTitolo(t) {
  // Google News accoda " - Testata" al titolo
  return decodifica(t).replace(/\s+-\s+[^-]{2,40}$/, '').trim();
}

export async function raccogliNotizie({ root = process.cwd(), log = () => {}, offline = false, query = null } = {}) {
  const registro = await leggiSorgenti(root);
  const queryList = query ? [query] : registro.queryMonitoraggio || [];
  const googleNews = (registro.stampa || []).find((s) => s.id === 'googlenews');
  const feeds = (registro.stampa || []).filter((s) => s.rss && s.id !== 'googlenews');

  const visti = new Map();
  const esiti = [];

  const aggiungi = (item, sorgente) => {
    const chiave = (item.link || item.titolo || '').trim();
    if (!chiave) return;
    if (visti.has(chiave)) {
      const e = visti.get(chiave);
      if (!e.sorgenti.includes(sorgente)) e.sorgenti.push(sorgente);
      return;
    }
    const titolo = pulisciTitolo(item.titolo);
    const testo = `${titolo} ${item.descrizione}`;
    visti.set(chiave, {
      titolo,
      link: item.link,
      descrizione: item.descrizione,
      data: item.data,
      sorgente: item.sorgente || sorgente,
      sorgenti: [sorgente],
      pilastri: classificaNotizia(testo),
      rilevanza: rilevanzaLocale(item),
    });
  };

  if (!offline) {
    // Google News RSS
    if (googleNews) {
      const permesso = await canFetch(
        googleNews.rss.replace('{query}', encodeURIComponent('test'))
      );
      if (permesso.consentito) {
        for (const q of queryList) {
          const r = await adapterRss({ url: googleNews.rss, sorgente: 'googlenews', query: q }, { log });
          esiti.push({ sorgente: 'googlenews', query: q, stato: r.stato, conteggio: r.items.length, motivo: r.motivo });
          r.items.forEach((i) => aggiungi(i, 'googlenews'));
        }
      } else {
        esiti.push({ sorgente: 'googlenews', stato: 'bloccato', motivo: permesso.motivo, conteggio: 0 });
      }
    }

    // Feed diretti delle testate
    for (const f of feeds) {
      const r = await adapterRss({ url: f.rss, sorgente: f.id }, { log });
      esiti.push({ sorgente: f.id, stato: r.stato, conteggio: r.items.length, motivo: r.motivo });
      r.items.forEach((i) => aggiungi(i, f.id));
    }
  } else {
    esiti.push({ sorgente: 'offline', stato: 'salto', motivo: 'esecuzione offline: nessuna richiesta di rete', conteggio: 0 });
  }

  let note = [...visti.values()];

  // se la rete non ha restituito nulla, conserva l'archivio precedente
  if (!note.length) {
    try {
      const prec = JSON.parse(await readFile(path.join(root, 'data/notizie.json'), 'utf8'));
      note = prec.notizie || [];
      esiti.push({ sorgente: 'archivio', stato: 'riusato', conteggio: note.length });
    } catch {
      /* nessun archivio: lista vuota, non è un errore */
    }
  }

  note.sort((a, b) => {
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  const perPilastro = {};
  for (const n of note) for (const p of n.pilastri) perPilastro[p] = (perPilastro[p] || 0) + 1;

  const output = {
    generatoIl: new Date().toISOString(),
    esiti,
    totali: {
      notizie: note.length,
      queryMonitorate: queryList.length,
      altaRilevanzaLocale: note.filter((n) => n.rilevanza >= 3).length,
    },
    perPilastro,
    notizie: note,
    spuntiEditoriali: generaSpunti(note),
  };

  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/notizie.json'), JSON.stringify(output, null, 2), 'utf8');
  log(`data/notizie.json: ${note.length} notizie uniche da ${esiti.filter((e) => e.stato === 'ok').length} sorgenti`);
  return output;
}

/** Trasforma le notizie in spunti pubblicabili (input di tools/social.mjs). */
export function generaSpunti(note, max = 24) {
  return note
    .filter((n) => n.titolo)
    .sort((a, b) => b.rilevanza - a.rilevanza)
    .slice(0, max)
    .map((n) => ({
      titolo: n.titolo,
      link: n.link,
      data: n.data,
      pilastri: n.pilastri,
      rilevanza: n.rilevanza,
      angolo: angoloEditoriale(n),
    }));
}

function angoloEditoriale(n) {
  if (n.pilastri.includes('ai')) {
    return 'Cosa cambia per chi vende casa a Piacenza, in concreto — senza fantascienza.';
  }
  if (n.pilastri.includes('errore')) {
    return 'Questo errore a Piacenza si vede spesso: ecco come evitarlo prima di pubblicare.';
  }
  if (n.pilastri.includes('storia')) {
    return 'Situazione complessa, decisione da prendere: serve un valore condiviso e difendibile.';
  }
  if (n.pilastri.includes('metodo')) {
    return 'Il dettaglio che blocca le vendite all’ultimo minuto: meglio saperlo prima.';
  }
  if (n.rilevanza >= 3) {
    return 'Dato locale: cosa significa per il valore della tua casa nella tua zona.';
  }
  return 'Il numero che nessuno spiega: tradotto per chi deve vendere, non per gli addetti ai lavori.';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offline = process.argv.includes('--offline');
  raccogliNotizie({ offline, log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
