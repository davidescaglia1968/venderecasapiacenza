/**
 * annunci.mjs — normalizzazione e analisi degli annunci.
 *
 * Il punto centrale richiesto: ordinare gli annunci per data di pubblicazione,
 * dal più vecchio al più recente, e far emergere gli immobili fermi da anni.
 *
 * Un annuncio fermo da 700 giorni non è un annuncio: è un venditore deluso,
 * cioè il miglior lead di acquisizione che esista.
 */
import { createHash } from 'node:crypto';
import { mediana, percentile, fasce, raggruppa, arrotonda, media } from './stat.mjs';

export const GIORNO_MS = 24 * 3600 * 1000;

/**
 * Fascia di anzianità di un annuncio.
 * Le soglie sono calibrate sul tempo medio di vendita: a Piacenza il CRM usa
 * 90 giorni per il centro storico (zona z1), quindi 90 giorni è la prima soglia.
 */
export const FASCE_ANZIANITA = [
  { id: 'fresco', etichetta: 'Fresco (0–30 gg)', min: 0, max: 31, segnale: 'nessuno', azione: 'monitorare' },
  { id: 'normale', etichetta: 'In linea (31–90 gg)', min: 31, max: 91, segnale: 'nella norma', azione: 'monitorare' },
  { id: 'rallentato', etichetta: 'Rallentato (91–180 gg)', min: 91, max: 181, segnale: 'attenzione', azione: 'contatto di cortesia: qui si pianta il seme' },
  { id: 'fermo', etichetta: 'Fermo (181–365 gg)', min: 181, max: 366, segnale: 'critico', azione: 'lead caldo: il proprietario ha già provato e non ha ottenuto' },
  { id: 'bloccato', etichetta: 'Bloccato (1–2 anni)', min: 366, max: 731, segnale: 'critico', azione: 'lead caldissimo: probabile prezzo sbagliato o agenzia inefficace' },
  { id: 'storico', etichetta: 'Storico (oltre 2 anni)', min: 731, max: null, segnale: 'emergenza', azione: 'priorità assoluta: sfiducia consolidata, serve un approccio di verità sui numeri' },
];

/**
 * Normalizza un annuncio grezzo da qualunque sorgente.
 * Campi attesi in ingresso (tutti opzionali tranne almeno un identificatore):
 *  { titolo, prezzo, mq, comune, zona, tipo, url, dataPubblicazione, agenzia, sorgente, stanze, bagni, piano, ape }
 */
export function normalizzaAnnuncio(grezzo, oggi = new Date()) {
  const prezzo = toNumber(grezzo.prezzo);
  const mq = toNumber(grezzo.mq);
  const comune = (grezzo.comune || '').toString().trim();
  const dataIso = parseData(grezzo.dataPubblicazione);
  const dataObj = dataIso ? new Date(dataIso) : null;

  const annuncio = {
    id: grezzo.id || null,
    impronta: impronta(grezzo),
    titolo: (grezzo.titolo || '').toString().trim(),
    prezzo,
    mq,
    prezzoMq: prezzo && mq ? arrotonda(prezzo / mq, 0) : null,
    comune,
    zona: (grezzo.zona || '').toString().trim(),
    tipo: normalizzaTipo(grezzo.tipo),
    stanze: toNumber(grezzo.stanze),
    bagni: toNumber(grezzo.bagni),
    piano: (grezzo.piano ?? '').toString().trim(),
    ape: (grezzo.ape || '').toString().trim().toUpperCase(),
    agenzia: (grezzo.agenzia || '').toString().trim(),
    sorgente: (grezzo.sorgente || 'sconosciuta').toString(),
    url: (grezzo.url || '').toString(),
    dataPubblicazione: dataIso,
    giorniInPubblicazione: dataObj
      ? Math.max(0, Math.floor((oggi.getTime() - dataObj.getTime()) / GIORNO_MS))
      : null,
    ultimaVerifica: grezzo.ultimaVerifica ? parseData(grezzo.ultimaVerifica) : new Date(oggi).toISOString(),
    // i tagli si ricavano dall'array esplicito oppure dallo storico dei prezzi
    // (il primo valore dello storico è il prezzo di partenza: i tagli sono i successivi)
    tagliPrezzo: Array.isArray(grezzo.tagliPrezzo)
      ? grezzo.tagliPrezzo.length
      : Array.isArray(grezzo.storicoPrezzi)
        ? Math.max(0, grezzo.storicoPrezzi.length - 1)
        : 0,
    storicoPrezzi: Array.isArray(grezzo.storicoPrezzi) ? grezzo.storicoPrezzi : [],
  };

  annuncio.fasciaAnzianita = fasciaDi(annuncio.giorniInPubblicazione);
  annuncio.scontoDaListinoPct = scontoDaListino(annuncio);
  return annuncio;
}

export function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const pulito = String(v).replace(/[^\d.,-]/g, '');
  if (!pulito || !/\d/.test(pulito)) return null;
  const n = Number(pulito.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseData(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Tipologia normalizzata: serve per confrontare gli annunci tra portali diversi. */
export function normalizzaTipo(t) {
  const s = String(t || '').toLowerCase();
  if (/villa|villetta|bifamiliar|schiera/.test(s)) return 'villa';
  if (/rustico|casale|cascina|colonic/.test(s)) return 'rustico';
  if (/attico|mansard/.test(s)) return 'attico';
  if (/appartamento|trilocale|quadrilocale|bilocale|appartamento/i.test(s)) return 'appartamento';
  if (/terreno/.test(s)) return 'terreno';
  if (/capannone|commerciale|negozio|ufficio/.test(s)) return 'commerciale';
  if (/casa\s*indipendente|indipendente|terra.?cielo/.test(s)) return 'casa indipendente';
  return s || 'non specificato';
}

/**
 * Impronta stabile per il dedupe: stesso immobile su portali diversi
 * viene riconosciuto e non contato due volte.
 */
export function impronta(g) {
  const base = [
    String(g.comune || '').toLowerCase().trim(),
    String(g.zona || '').toLowerCase().trim(),
    String(g.tipo || '').toLowerCase().trim(),
    toNumber(g.mq) || 0,
    toNumber(g.prezzo) || 0,
  ].join('|');
  return createHash('sha1').update(base).digest('hex').slice(0, 16);
}

/** Deduplica per impronta: tiene la copia con la data di pubblicazione più vecchia (la più informativa). */
export function deduplica(annunci) {
  const perImpronta = new Map();
  for (const a of annunci) {
    const k = a.impronta || impronta(a);
    const esistente = perImpronta.get(k);
    if (!esistente) {
      perImpronta.set(k, a);
    } else {
      const vecchia =
        a.dataPubblicazione &&
        (!esistente.dataPubblicazione || a.dataPubblicazione < esistente.dataPubblicazione);
      perImpronta.set(k, vecchia ? a : esistente);
    }
  }
  return [...perImpronta.values()];
}

export function fasciaDi(giorni) {
  if (giorni === null || giorni === undefined) return null;
  const f = FASCE_ANZIANITA.find((x) => giorni >= x.min && (x.max === null || giorni < x.max));
  return f ? f.id : null;
}

export function etichettaFascia(id) {
  return FASCE_ANZIANITA.find((f) => f.id === id)?.etichetta || 'n/d';
}

/** Sconto applicato rispetto al primo prezzo pubblicato, se c'è lo storico. */
export function scontoDaListino(a) {
  const st = a.storicoPrezzi || [];
  if (st.length < 2) return 0;
  const primo = toNumber(st[0]?.prezzo ?? st[0]);
  const ultimo = a.prezzo;
  if (!primo || !ultimo || ultimo >= primo) return 0;
  return arrotonda(((primo - ultimo) / primo) * 100, 1);
}

/**
 * Analisi completa di un insieme di annunci.
 * È la funzione che alimenta la pagina /concorrenza/ e il report venditori.
 */
export function analizzaAnnunci(annunci, opzioni = {}) {
  const oggi = parseData(opzioni.oggi) || new Date().toISOString();
  const lista = annunci
    .filter((a) => a && typeof a === 'object')
    .map((a) => (a.impronta && a.fasciaAnzianita !== undefined ? a : normalizzaAnnuncio(a, new Date(oggi))));

  const unici = deduplica(lista);
  const conData = unici.filter((a) => a.giorniInPubblicazione !== null);
  const giorni = conData.map((a) => a.giorniInPubblicazione);
  const prezzi = unici.map((a) => a.prezzo).filter(Boolean);
  const prezziMq = unici.map((a) => a.prezzoMq).filter(Boolean);

  const perFascia = FASCE_ANZIANITA.map((f) => {
    const gruppo = conData.filter((a) => a.fasciaAnzianita === f.id);
    return {
      id: f.id,
      etichetta: f.etichetta,
      segnale: f.segnale,
      azione: f.azione,
      conteggio: gruppo.length,
      pct: conData.length ? arrotonda((gruppo.length / conData.length) * 100, 1) : 0,
      prezzoMedio: gruppo.length ? Math.round(media(gruppo.map((g) => g.prezzo).filter(Boolean))) : 0,
      prezzoMqMediano: gruppo.length ? Math.round(mediana(gruppo.map((g) => g.prezzoMq).filter(Boolean))) : 0,
    };
  });

  const perComune = Object.entries(raggruppa(unici, 'comune', (g) => g)).map(([comune, g]) => {
    const gg = g.filter((x) => x.giorniInPubblicazione !== null);
    return {
      comune,
      annunci: g.length,
      annunciConData: gg.length,
      giorniMediani: gg.length ? Math.round(mediana(gg.map((x) => x.giorniInPubblicazione))) : null,
      giorniMassimi: gg.length ? Math.max(...gg.map((x) => x.giorniInPubblicazione)) : null,
      prezzoMqMediano: Math.round(mediana(g.map((x) => x.prezzoMq).filter(Boolean))) || null,
      prezzoMedio: Math.round(media(g.map((x) => x.prezzo).filter(Boolean))) || null,
      oltreUnAnno: gg.filter((x) => x.giorniInPubblicazione > 365).length,
    };
  }).sort((a, b) => b.annunci - a.annunci);

  const perAgenzia = Object.entries(raggruppa(unici, 'agenzia', (g) => g))
    .filter(([nome]) => nome && nome !== 'n/d' && nome !== 'privato')
    .map(([agenzia, g]) => {
      const gg = g.filter((x) => x.giorniInPubblicazione !== null);
      return {
        agenzia,
        annunci: g.length,
        giorniMediani: gg.length ? Math.round(mediana(gg.map((x) => x.giorniInPubblicazione))) : null,
        oltreUnAnno: gg.filter((x) => x.giorniInPubblicazione > 365).length,
        prezzoMqMediano: Math.round(mediana(g.map((x) => x.prezzoMq).filter(Boolean))) || null,
      };
    })
    .sort((a, b) => b.annunci - a.annunci);

  // La lista chiave: dal più vecchio al più recente.
  const classificaStallo = [...conData].sort(
    (a, b) => b.giorniInPubblicazione - a.giorniInPubblicazione
  );

  return {
    generatoIl: oggi,
    totali: {
      annunci: unici.length,
      annunciLordi: lista.length,
      duplicatiEliminati: lista.length - unici.length,
      conDataPubblicazione: conData.length,
      senzaData: unici.length - conData.length,
    },
    anzianita: {
      giorniMediani: giorni.length ? Math.round(mediana(giorni)) : null,
      giorniMedi: giorni.length ? Math.round(media(giorni)) : null,
      giorniP90: giorni.length ? Math.round(percentile(giorni, 90)) : null,
      giorniMassimi: giorni.length ? Math.max(...giorni) : null,
      oltre90giorni: giorni.filter((g) => g > 90).length,
      oltreUnAnno: giorni.filter((g) => g > 365).length,
      oltreDueAnni: giorni.filter((g) => g > 730).length,
      distribuzioneFasce: fasce(giorni, FASCE_ANZIANITA),
    },
    prezzi: {
      mediano: Math.round(mediana(prezzi)) || null,
      medio: Math.round(media(prezzi)) || null,
      p10: Math.round(percentile(prezzi, 10)) || null,
      p90: Math.round(percentile(prezzi, 90)) || null,
      prezzoMqMediano: Math.round(mediana(prezziMq)) || null,
    },
    perFascia,
    perComune,
    perAgenzia,
    classificaStallo: classificaStallo.slice(0, opzioni.topStallo || 50),
  };
}

/**
 * Costruisce l'elenco operativo dei lead di acquisizione:
 * annunci vecchi = proprietari delusi da contattare.
 */
export function leadDaAnnunciFermi(analisi, { sogliaGiorni = 180, max = 30 } = {}) {
  return analisi.classificaStallo
    .filter((a) => a.giorniInPubblicazione >= sogliaGiorni)
    .slice(0, max)
    .map((a) => ({
      comune: a.comune,
      zona: a.zona,
      tipo: a.tipo,
      prezzo: a.prezzo,
      mq: a.mq,
      giorniInPubblicazione: a.giorniInPubblicazione,
      anniFermi: arrotonda(a.giorniInPubblicazione / 365, 1),
      fascia: etichettaFascia(a.fasciaAnzianita),
      agenzia: a.agenzia,
      sorgente: a.sorgente,
      url: a.url,
      angoloDiAttacco: angoloDiAttacco(a),
    }));
}

/** Ipotesi di lavoro sul perché l'immobile non si vende — usata nei contenuti e nelle chiamate. */
export function angoloDiAttacco(a) {
  const motivi = [];
  if (a.prezzoMq && a.fasciaAnzianita && ['bloccato', 'storico', 'fermo'].includes(a.fasciaAnzianita)) {
    motivi.push('prezzo fuori mercato');
  }
  if (a.scontoDaListinoPct > 0) {
    motivi.push(`già ${a.scontoDaListinoPct}% di tagli: segnale di stallo, non di strategia`);
  }
  if (!a.ape || a.ape === 'N/D') {
    motivi.push('APE mancante o non dichiarato nell’annuncio');
  }
  if (a.tipo === 'rustico' || a.tipo === 'villa') {
    motivi.push('tipologia a domanda sottile: serve un pubblico specifico, non il traffico generico del portale');
  }
  if (!motivi.length) motivi.push('da approfondire in sopralluogo');
  return motivi;
}
