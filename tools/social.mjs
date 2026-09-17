/**
 * social.mjs — fabbrica dei contenuti social.
 *
 * Da un solo argomento produce il pacchetto completo per ogni piattaforma,
 * nel formato giusto: testo rispettando i limiti di caratteri, copertina
 * alle dimensioni esatte in pixel, script video con tempi, e sottotitoli SRT
 * pronti da caricare.
 *
 * Principio: un master verticale 1080×1920 copre Instagram Reels, Facebook
 * Reels, TikTok, YouTube Shorts, Threads, WhatsApp Stato. Da lì si derivano
 * i formati specifici. Non si rigira niente: si riusa lo stesso girato.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { esc } from './lib/pagine.mjs';

const ORO = '#B8860B';
const NERO = '#1c1a17';
const CREMA = '#fdfcf9';

/* ------------------------------------------------------------------ */
/* Copertine SVG alle dimensioni esatte di ogni piattaforma             */
/* ------------------------------------------------------------------ */
export function copertinaSvg({ larghezza, altezza, titolo, sottotitolo = '', kicker = 'MERCATO IMMOBILIARE' }) {
  const scala = larghezza / 1080;
  const fs = (n) => Math.round(n * scala);
  const parole = spezzaRighe(titolo, Math.max(14, Math.round(larghezza / (fs(58) * 0.52))));
  const righe = parole.map(
    (r, i) =>
      `<text x="${larghezza / 2}" y="${fs(330) + i * fs(78)}" text-anchor="middle" font-family="Georgia,serif" font-size="${fs(66)}" font-weight="700" fill="${CREMA}">${esc(r)}</text>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${larghezza}" height="${altezza}" viewBox="0 0 ${larghezza} ${altezza}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${NERO}"/><stop offset="100%" stop-color="#3a332a"/>
</linearGradient></defs>
<rect width="${larghezza}" height="${altezza}" fill="url(#g)"/>
<rect x="0" y="${altezza - fs(14)}" width="${larghezza}" height="${fs(14)}" fill="${ORO}"/>
<text x="${larghezza / 2}" y="${fs(180)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${fs(26)}" letter-spacing="${fs(7)}" fill="${ORO}">${esc(kicker.toUpperCase())}</text>
${righe}
${sottotitolo ? `<text x="${larghezza / 2}" y="${altezza - fs(150)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${fs(32)}" fill="rgba(253,252,249,.72)">${esc(sottotitolo)}</text>` : ''}
<text x="${larghezza / 2}" y="${altezza - fs(70)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${fs(28)}" letter-spacing="${fs(3)}" fill="${ORO}">DAVIDE SCAGLIA · PIACENZA · DAL 2007</text>
</svg>`;
}

function spezzaRighe(testo, maxParolePerRiga) {
  const parole = String(testo).split(/\s+/);
  const righe = [];
  let riga = [];
  for (const p of parole) {
    riga.push(p);
    if (riga.join(' ').length > maxParolePerRiga * 3.2 || riga.length > maxParolePerRiga) {
      righe.push(riga.join(' '));
      riga = [];
    }
  }
  if (riga.length) righe.push(riga.join(' '));
  return righe.slice(0, 5);
}

/* ------------------------------------------------------------------ */
/* Sottotitoli SRT                                                      */
/* ------------------------------------------------------------------ */
export function srt(battute) {
  const t = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return battute
    .map((b, i) => `${i + 1}\n${t(b.da)} --> ${t(b.a)}\n${b.testo}\n`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Scrittura dei testi, con rispetto dei limiti                         */
/* ------------------------------------------------------------------ */
export function adattaTesto(testo, limite, { puntini = true } = {}) {
  const s = String(testo || '').trim();
  if (s.length <= limite) return s;
  const finestra = s.slice(0, Math.max(0, limite - 1));
  // prima prova a chiudere su una frase completa
  const fineFrase = Math.max(finestra.lastIndexOf('. '), finestra.lastIndexOf('? '), finestra.lastIndexOf('! '));
  if (fineFrase > limite * 0.45) return finestra.slice(0, fineFrase + 1);
  // altrimenti taglia sull'ultima parola intera
  const ultimoSpazio = finestra.lastIndexOf(' ');
  const base = ultimoSpazio > limite * 0.45 ? finestra.slice(0, ultimoSpazio) : finestra;
  return base + (puntini ? '…' : '');
}

export function scegliHashtag(tema, n = 8) {
  const base = ['#venderecasapiacenza', '#piacenza', '#immobiliarepiacenza', '#daviderescaglia'];
  const perTema = {
    mercato: ['#mercatimmobiliare', '#prezzicase', '#quotazioniimmobiliari', '#omipiacenza'],
    errore: ['#errorivendita', '#consigliimmobiliari', '#venditacasa', '#prezzogiusto'],
    metodo: ['#valutazioneimmobiliare', '#ape', '#conformitacatastale', '#rogito'],
    storia: ['#eredita', '#successioni', '#separazione', '#casiimmobiliari'],
    zona: ['#valtrebbia', '#valnure', '#rivergaro', '#gossolengo', '#vigolzone', '#podenzano'],
    ai: ['#intelligenzaartificiale', '#proptech', '#aiimmobiliare'],
  };
  const pool = [...base, ...(perTema[tema] || [])];
  return pool.slice(0, n);
}

/**
 * Genera il pacchetto contenuti per tutte le piattaforme da un argomento.
 * @param {object} argomento { titolo, hook, corpo, cta, tema, zona, dato, fonte, urlFonte }
 */
export function generaPacchetto(argomento, config) {
  const { titolo, hook, corpo, cta, tema = 'mercato', zona = '', dato = '', fonte = '', urlFonte = '' } = argomento;
  const dataOdierna = new Date().toISOString().slice(0, 10);

  const hookBreve = adattaTesto(hook, 40);
  const corpoPulito = String(corpo).replace(/\s+/g, ' ').trim();
  const firma = '\n\n— Davide Scaglia, agente immobiliare a Piacenza dal 2007';
  const ctaStandard = cta || 'Se hai una casa da vendere a Piacenza e vuoi un parere basato sui numeri, scrivimi.';

  const battute = costruisciBattute({ hook, corpo, cta: ctaStandard, zona });

  const out = { tema, zona, titolo, generatoIl: new Date().toISOString(), dataOdierna, piattaforme: [] };

  for (const p of config.piattaforme) {
    const hashtag = p.hashtagConsigliati ? scegliHashtag(tema, p.hashtagConsigliati) : [];
    const limiteTesto = p.limiteCaratteriPost ?? p.limiteCaratteriCaption ?? p.limiteCaratteriOttimale ?? null;
    const limiteOttimale = p.limiteCaratteriOttimale ?? limiteTesto;

    let testo = componiTesto(p, { titolo, hook: hookBreve, corpo: corpoPulito, cta: ctaStandard, dato, fonte, hashtag, firma });
    if (limiteOttimale) testo = adattaTesto(testo, limiteOttimale, { puntini: false });

    const voce = {
      id: p.id,
      piattaforma: p.piattaforma,
      formato: p.formato,
      canale: p.canale,
      priorita: p.priorita,
      specifiche: {
        larghezza: p.larghezza,
        altezza: p.altezza,
        rapporto: p.rapporto,
        ...(p.durataTargetSec ? { durataTargetSec: p.durataTargetSec } : {}),
        ...(p.durataMaxSec ? { durataMaxSec: p.durataMaxSec } : {}),
        ...(p.codec ? { codec: p.codec } : {}),
      },
      testo,
      caratteri: testo.length,
      limiteCaratteri: limiteOttimale,
      entroLimite: limiteOttimale ? testo.length <= limiteOttimale : true,
      hashtag,
      titoloVideo: p.limiteCaratteriTitolo ? adattaTesto(titolo, p.limiteCaratteriTitolo) : null,
      descrizioneVideo: p.limiteCaratteriDescrizione
        ? adattaTesto(`${corpoPulito} ${ctaStandard}`, p.limiteCaratteriDescrizione)
        : null,
      asset: {
        copertina: { file: `contenuti/${dataOdierna}/${p.id}.svg`, larghezza: p.larghezza, altezza: p.altezza },
        ...(p.canale === 'video'
          ? {
              scriptVideo: battute,
              sottotitoli: `contenuti/${dataOdierna}/${p.id}.srt`,
              durataStimataSec: Math.round(battute[battute.length - 1]?.a || 0),
              notaProduzione: p.stile,
            }
          : { notaProduzione: p.stile }),
      },
    };
    out.piattaforme.push(voce);
  }

  out.piattaforme.sort((a, b) => a.priorita - b.priorita);
  out.master = {
    descrizione: 'Master verticale unico da cui derivano tutti i formati video',
    larghezza: 1080,
    altezza: 1920,
    rapporto: '9:16',
    codec: 'MP4 H.264, audio AAC 48 kHz',
    sottotitoliSempre: true,
    battute,
    riuso: config.piattaforme.filter((x) => x.accettaMaster9x16).map((x) => x.id),
  };
  return out;
}

function componiTesto(p, { titolo, hook, corpo, cta, dato, fonte, hashtag, firma }) {
  const id = p.id;
  const tag = hashtag.length ? '\n\n' + hashtag.join(' ') : '';

  if (id === 'x' || id === 'bluesky') {
    const nucleo = dato ? `${dato}. ` : '';
    return adattaTesto(`${nucleo}${titolo}. ${cta}${fonte ? ` (fonte: ${fonte})` : ''}`, p.limiteCaratteriPost, { puntini: false });
  }

  if (id === 'threads') {
    return adattaTesto(`${titolo}\n\n${corpo}\n\n${cta}`, p.limiteCaratteriPost, { puntini: false });
  }

  if (id === 'linkedin') {
    return `${titolo}\n\n${corpo}\n\n${dato ? `Il dato: ${dato}\n` : ''}${fonte ? `Fonte: ${fonte}\n` : ''}\n${cta}${firma}\n\n${hashtag.slice(0, 3).join(' ')}`;
  }

  if (id === 'facebook-feed' || id === 'google-business') {
    return `${titolo}\n\n${corpo}\n\n${cta}`;
  }

  if (id === 'whatsapp') {
    return `Ciao, ${hook}\n\n${corpo}\n\n${cta}\n\nDavide — Immobiliare Scaglia, Piacenza`;
  }

  // Instagram, TikTok, YouTube: hook forte + corpo + CTA + hashtag
  return `${hook}\n\n${corpo}\n\n${cta}${fonte ? `\n\nFonte: ${fonte}` : ''}${firma}${tag}`;
}

/** Divide il messaggio in battute con tempi, per script video e SRT. */
export function costruisciBattute({ hook, corpo, cta, zona }, { paroleAlSecondo = 2.6 } = {}) {
  const frasi = String(corpo)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);

  const righe = [hook, ...frasi, cta].filter(Boolean);
  const battute = [];
  let tempo = 0;
  for (const r of righe) {
    const durata = Math.max(2, Math.min(7, r.split(/\s+/).length / paroleAlSecondo));
    battute.push({ da: arrotonda2(tempo), a: arrotonda2(tempo + durata), testo: adattaTesto(r, 90) });
    tempo += durata;
  }
  return battute;
}

function arrotonda2(n) {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Scrittura su disco                                                   */
/* ------------------------------------------------------------------ */
export async function scriviPacchetto(pacchetto, { root = process.cwd(), config, log = () => {} } = {}) {
  const dir = path.join(root, 'contenuti', pacchetto.dataOdierna);
  await mkdir(dir, { recursive: true });

  const assetDir = path.join(dir, 'asset');
  await mkdir(assetDir, { recursive: true });

  for (const p of pacchetto.piattaforme) {
    const svg = copertinaSvg({
      larghezza: p.specifiche.larghezza,
      altezza: p.specifiche.altezza,
      titolo: pacchetto.titolo,
      sottotitolo: p.specifiche.rapporto === '9:16' ? adattaTesto(pacchetto.piattaforme[0]?.hashtag?.[0] || 'Piacenza', 40) : 'venderecasapiacenza.it',
      kicker: p.piattaforma,
    });
    await writeFile(path.join(assetDir, `${p.id}.svg`), svg, 'utf8');

    if (p.asset.scriptVideo) {
      await writeFile(path.join(assetDir, `${p.id}.srt`), srt(p.asset.scriptVideo), 'utf8');
    }
    await writeFile(path.join(dir, `${p.id}.txt`), p.testo, 'utf8');
  }

  const indice = buildIndiceMarkdown(pacchetto, config);
  await writeFile(path.join(dir, 'README.md'), indice, 'utf8');
  log(`contenuti/${pacchetto.dataOdierna}: ${pacchetto.piattaforme.length} piattaforme`);
  return { dir, indice };
}

export function buildIndiceMarkdown(pacchetto, config) {
  const righe = pacchetto.piattaforme.map((p) => {
    const s = p.specifiche;
    const dim = `${s.larghezza}×${s.altezza} (${s.rapporto})`;
    const dur = s.durataTargetSec ? ` · ${s.durataTargetSec}s` : '';
    return `### ${p.piattaforma} — ${p.formato}\n\n\`${dim}${dur}\` · ${p.caratteri}/${p.limiteCaratteri ?? '∞'} caratteri ${p.entroLimite ? '✓' : '⚠️ fuori limite'}\n\n${p.testo}\n`;
  });
  return `# Pacchetto contenuti — ${pacchetto.dataOdierna}

**Tema:** ${pacchetto.tema} · **Zona:** ${pacchetto.zona || 'tutte'}

## Argomento
**${pacchetto.titolo}**

## Master video (1080×1920, 9:16)
Girato unico, sottotitoli sempre attivi. Riuso su: ${pacchetto.master.riuso.join(', ')}.

| # | Battuta | Da | A |
|---|---------|----|----|
${pacchetto.master.battute.map((b, i) => `| ${i + 1} | ${b.testo} | ${b.da}s | ${b.a}s |`).join('\n')}

---

${righe.join('\n---\n')}

## Come pubblicare
1. Esporta il master video in 1080×1920 con i sottotitoli bruciati.
2. Carica la copertina della cartella \`asset/\` come immagine di ogni post.
3. Copia il testo da \`<piattaforma>.txt\`: è già entro i limiti della piattaforma.
4. Pubblica nell'ordine di priorità indicato: prima Facebook e Google Business (canali di acquisizione venditori), poi Instagram e TikTok.
`;
}

/* ------------------------------------------------------------------ */
/* Generazione a partire dai dati reali del sistema                      */
/* ------------------------------------------------------------------ */
export async function costruisciContenuti({ root = process.cwd(), log = () => {}, scrivi = true, limite = 8 } = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'tools/config/social.json'), 'utf8'));

  let mercato = null;
  try {
    mercato = JSON.parse(await readFile(path.join(root, 'data/mercato.json'), 'utf8'));
  } catch {
    log('data/mercato.json assente');
  }
  let notizie = null;
  try {
    notizie = JSON.parse(await readFile(path.join(root, 'data/notizie.json'), 'utf8'));
  } catch {
    log('data/notizie.json assente');
  }
  let annunci = null;
  try {
    annunci = JSON.parse(await readFile(path.join(root, 'data/annunci.json'), 'utf8'));
  } catch {
    /* opzionale */
  }

  const argomenti = [];

  // 1) dal mercato: un contenuto per zona
  for (const z of mercato?.zone || []) {
    const v = z.variazioni?.annualePct ?? 0;
    const direzione = v >= 3 ? 'sale' : v <= -3 ? 'scende' : 'è fermo';
    argomenti.push({
      tema: 'mercato',
      zona: z.nome,
      titolo: `${z.nome}: ${z.prezzoMq.media} €/mq e il mercato ${direzione}`,
      hook: `${z.prezzoMq.media} euro al metro quadro. È quanto si chiede oggi a ${z.nome}.`,
      corpo:
        `A ${z.nome} il prezzo richiesto medio è ${z.prezzoMq.media} €/mq, con una variazione annua del ${String(v).replace('.', ',')}%. ` +
        (z.segnaleMercato ? `Il segnale del mercato è: ${z.segnaleMercato}. ` : '') +
        `${(z.driver || []).slice(0, 2).join(' ')}. ` +
        `Un numero da solo non dice se la tua casa vale quella cifra: contano la via, lo stato, il piano, l'APE e cosa ha davvero comprato qualcuno negli ultimi sei mesi.`,
      dato: `${z.prezzoMq.media} €/mq a ${z.nome}, variazione annua ${String(v).replace('.', ',')}%`,
      fonte: (z.fonti?.[0]?.nome || 'fonti di mercato'),
      urlFonte: z.fonti?.[0]?.url || '',
      cta: `Se hai una casa a ${z.nome} e vuoi sapere quanto vale davvero, scrivimi: ti porto i comparabili reali, non una stima automatica.`,
    });
  }

  // 2) dall'archivio annunci: il contenuto più forte che esista
  if (annunci?.anzianita?.oltreUnAnno > 0) {
    argomenti.push({
      tema: 'errore',
      zona: 'Piacenza e provincia',
      titolo: `${annunci.anzianita.oltreUnAnno} annunci fermi da oltre un anno`,
      hook: `Ci sono ${annunci.anzianita.oltreUnAnno} case in vendita da più di un anno.`,
      corpo:
        `Nel nostro archivio di annunci su Piacenza e provincia, ${annunci.anzianita.oltreUnAnno} immobili sono pubblicati da oltre 365 giorni` +
        (annunci.anzianita.oltreDueAnni ? ` e ${annunci.anzianita.oltreDueAnni} da oltre due anni` : '') +
        `. Il tempo mediano in pubblicazione è ${annunci.anzianita.giorniMediani} giorni. ` +
        `Un annuncio che resta lì per un anno non è sfortuna: quasi sempre è un prezzo costruito su quello che il proprietario spera, non su quello che gli acquirenti stanno pagando. ` +
        `E ogni mese che passa l'annuncio diventa "quello vecchio", quello che tutti hanno già visto e scartato.`,
      dato: `tempo mediano in pubblicazione ${annunci.anzianita.giorniMediani} giorni; ${annunci.anzianita.oltreUnAnno} annunci oltre l'anno`,
      fonte: 'archivio annunci Immobiliare Scaglia',
      cta: 'Se la tua casa è in vendita da mesi e non si muove, il problema quasi mai è il mercato. Parliamone: ti dico cosa vedo nei numeri, anche se non ti piace.',
    });
  }

  // 3) dalle notizie
  for (const s of notizie?.spuntiEditoriali?.slice(0, 5) || []) {
    argomenti.push({
      tema: s.pilastri[0] || 'mercato',
      zona: 'Piacenza',
      titolo: s.titolo,
      hook: adattaTesto(s.titolo, 40),
      corpo: `${s.titolo}. ${s.angolo} ${s.descrizione || ''}`.replace(/\s+/g, ' ').trim(),
      fonte: s.sorgente || '',
      urlFonte: s.link || '',
      cta: 'Se vuoi capire cosa significa questo per casa tua, scrivimi.',
    });
  }

  // 4) pilastri evergreen (sempre disponibili, anche a sistema vuoto)
  argomenti.push(
    {
      tema: 'errore',
      zona: 'Piacenza',
      titolo: 'L\'errore numero uno di chi vende casa a Piacenza',
      hook: 'Il primo errore non è il prezzo. È come ci arrivi.',
      corpo:
        'La maggior parte dei proprietari parte da una cifra che ha in testa da anni, o da quello che dice il vicino. ' +
        'Poi pubblica, aspetta, e dopo sei mesi abbassa. ' +
        'Il problema è che la prima settimana è l\'unica in cui l\'annuncio è "nuovo": i portali lo spingono, gli acquirenti lo guardano. ' +
        'Se il prezzo è fuori, quella finestra si chiude e l\'immobile entra nella lista di quelli già visti. ' +
        'Abbassare dopo non riporta indietro l\'attenzione: la recupera solo in parte, e sempre a un prezzo più basso di quello che avresti ottenuto partendo giusti.',
      dato: 'il tempo mediano di pubblicazione degli annunci a Piacenza supera i 90 giorni',
      fonte: 'archivio annunci e dati OMI',
      cta: 'Prima di pubblicare, fatti fare una valutazione sui comparabili reali della tua via. Costa una telefonata.',
    },
    {
      tema: 'metodo',
      zona: 'Piacenza',
      titolo: 'I documenti che servono per vendere casa, prima di pubblicare',
      hook: 'Il 90% dei venditori scopre questi documenti a dieci giorni dal rogito.',
      corpo:
        'Atto di provenienza, visura catastale, planimetria conforme, titolo edilizio, APE. ' +
        'Se manca la conformità catastale, la vendita si blocca: non si rinvia, si blocca. ' +
        'L\'APE va fatto prima di pubblicare, non dopo la proposta. ' +
        'Verificare tutto all\'inizio costa qualche giorno. Scoprirlo alla fine costa mesi.',
      fonte: 'prassi notarile e normativa vigente',
      cta: 'Se vuoi, ti mando la lista completa aggiornata e verifichiamo insieme cosa manca per casa tua.',
    }
  );

  const scelti = argomenti.slice(0, limite);
  const pacchetti = [];
  for (const a of scelti) {
    const p = generaPacchetto(a, config);
    pacchetti.push(p);
    if (scrivi) await scriviPacchetto(p, { root, config, log });
  }

  const indice = {
    generatoIl: new Date().toISOString(),
    piattaformeConfigurate: config.piattaforme.length,
    pilastriContenuto: config.pilastriContenuto,
    pacchetti: pacchetti.map((p) => ({
      tema: p.tema,
      zona: p.zona,
      titolo: p.titolo,
      dataOdierna: p.dataOdierna,
      piattaforme: p.piattaforme.length,
      entroLimiti: p.piattaforme.every((x) => x.entroLimite),
      fuoriLimite: p.piattaforme.filter((x) => !x.entroLimite).map((x) => x.id),
    })),
  };

  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/contenuti.json'), JSON.stringify(indice, null, 2), 'utf8');
  log(`data/contenuti.json: ${pacchetti.length} pacchetti × ${config.piattaforme.length} piattaforme`);
  return { indice, pacchetti };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limiteArg = process.argv.find((a) => a.startsWith('--limite='));
  const limite = limiteArg ? Number(limiteArg.split('=')[1]) : 8;
  costruisciContenuti({ limite, log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
