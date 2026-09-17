/**
 * concorrenza.mjs — analisi competitiva: agenzie, portali e piattaforme
 * generaliste, con il presidio per zona e le debolezze sfruttabili.
 *
 * Incrocia:
 *  - tools/config/concorrenti.json (registro, dati pubblici con fonte)
 *  - data/annunci.json (osservato: annunci per agenzia e per comune)
 *  - tools/config/zone.json (le zone da presidiare)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mediana, arrotonda } from './lib/stat.mjs';

export async function costruisciConcorrenza({ root = process.cwd(), log = () => {} } = {}) {
  const reg = JSON.parse(await readFile(path.join(root, 'tools/config/concorrenti.json'), 'utf8'));
  const zoneCfg = JSON.parse(await readFile(path.join(root, 'tools/config/zone.json'), 'utf8'));

  let annunci = null;
  try {
    annunci = JSON.parse(await readFile(path.join(root, 'data/annunci.json'), 'utf8'));
  } catch {
    log('data/annunci.json non presente: analisi basata solo sul registro');
  }

  const nomiZone = zoneCfg.zone.map((z) => z.nome);

  const agenzie = (reg.concorrenti || []).filter((c) =>
    ['agenzia-locale', 'franchising'].includes(c.tipo)
  );
  const digitali = (reg.concorrenti || []).filter((c) =>
    ['portale', 'portale-valuation', 'agenzia-online', 'software-ai'].includes(c.tipo)
  );

  // Presidio per zona: chi c'è già, e dove il territorio è scoperto.
  const presidio = nomiZone.map((zona) => {
    const presenti = agenzie.filter((a) => (a.zona || []).some((z) => normalizza(z) === normalizza(zona)));
    const annunciZona = annunci?.perComune?.find((c) => normalizza(c.comune) === normalizza(zona)) || null;
    const annunciTotali = presenti.reduce((s, a) => s + (a.annunciTotali || 0), 0);
    return {
      zona,
      agenziePresenti: presenti.length,
      agenzie: presenti.map((a) => a.nome),
      annunciDichiarati: annunciTotali,
      annunciOsservati: annunciZona ? annunciZona.annunci : null,
      giorniMedianiOsservati: annunciZona ? annunciZona.giorniMediani : null,
      oltreUnAnnoOsservati: annunciZona ? annunciZona.oltreUnAnno : null,
      saturazione: livelloSaturazione(presenti.length),
      spazio: presenti.length <= 2 ? 'territorio scoperto: presidio ad alta resa' : presenti.length <= 4 ? 'contendibile' : 'saturo: serve un angolo specifico',
    };
  });

  const osservatoPerAgenzia = annunci?.perAgenzia || [];

  const indicatori = agenzie
    .map((a) => {
      const osservato = osservatoPerAgenzia.find((o) => normalizza(o.agenzia) === normalizza(a.nome));
      return {
        nome: a.nome,
        tipo: a.tipo,
        annunciDichiarati: a.annunciTotali ?? null,
        caseVendita: a.caseVendita ?? null,
        qualitaPubblicazionePct: a.qualitaPubblicazionePct ?? null,
        tempoRispostaOre: a.tempoRispostaOre ?? null,
        anniSuIdealista: a.anniSuIdealista ?? null,
        zone: a.zona || [],
        minaccia: a.minaccia,
        nota: a.nota || '',
        osservato: osservato
          ? { annunci: osservato.annunci, giorniMediani: osservato.giorniMediani, oltreUnAnno: osservato.oltreUnAnno }
          : null,
        debolezze: debolezzeDi(a),
      };
    })
    .sort((a, b) => pesoMinaccia(b.minaccia) - pesoMinaccia(a.minaccia) || (b.annunciDichiarati || 0) - (a.annunciDichiarati || 0));

  const output = {
    generatoIl: new Date().toISOString(),
    densitaMercato: reg._meta.densitaMercato,
    totali: {
      agenzieMonitorate: agenzie.length,
      concorrentiDigitali: digitali.length,
      annunciDichiaratiTotali: agenzie.reduce((s, a) => s + (a.annunciTotali || 0), 0),
      annunciOsservati: annunci?.totali?.annunci ?? 0,
      zonePresidiate: presidio.filter((p) => p.agenziePresenti > 0).length,
      zoneScoperte: presidio.filter((p) => p.agenziePresenti <= 2).length,
    },
    indicatori,
    presidioZone: presidio,
    concorrentiDigitali: digitali.map((d) => ({
      nome: d.nome,
      tipo: d.tipo,
      percheContano: d.nota,
      contromisura: contromisuraPer(d),
    })),
    metricheDaTracciare: reg.metricheDaTracciare,
    posizionamento: {
      dichiarazione:
        'Non si vince sulla quantità di annunci: 101 agenzie a Piacenza hanno già saturato quel terreno. Si vince sulla competenza verificabile su un numero limitato di zone e sulla qualità della scheda, dove i concorrenti monitorati si fermano sotto il 60%.',
      leve: [
        { id: 'zona', leva: 'Specializzazione dichiarata e misurabile su Piacenza + 5 comuni, con dati pubblici per ciascuno', evidenza: 'Nessun concorrente monitorato pubblica dati di mercato per singola zona servita.' },
        { id: 'qualita-scheda', leva: 'Qualità di pubblicazione annuncio sopra il 90% contro il 49–55% osservato sui concorrenti principali', evidenza: 'Idealista rende pubblica la percentuale di qualità di pubblicazione.' },
        { id: 'reattivita', leva: 'Risposta entro 2 ore: il benchmark attuale del mercato locale', evidenza: 'Il sito promette 24 ore; il concorrente più rapido dichiara meno di 2 ore.' },
        { id: 'anzianita-annunci', leva: 'Uso dell’archivio annunci fermi: contattare i proprietari delusi, non aspettare i lead', evidenza: 'L’archivio ordina gli annunci per data di pubblicazione e segnala quelli oltre i 180 giorni.' },
        { id: 'dati-aperti', leva: 'Pubblicare i dati di mercato con fonte e data: citabilità da parte dei motori AI e dei giornalisti locali', evidenza: 'I contenuti datati e verificabili sono il criterio con cui Perplexity e Gemini scelgono le fonti.' },
      ],
    },
  };

  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/concorrenza.json'), JSON.stringify(output, null, 2), 'utf8');
  log(`data/concorrenza.json: ${agenzie.length} agenzie, ${presidio.length} zone analizzate, ${output.totali.zoneScoperte} zone scoperte`);
  return output;
}

function normalizza(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function livelloSaturazione(n) {
  if (n === 0) return 'assente';
  if (n <= 2) return 'bassa';
  if (n <= 4) return 'media';
  return 'alta';
}

function pesoMinaccia(m) {
  return { alta: 3, media: 2, bassa: 1, 'competitor-di-attenzione': 2, 'competitor-di-modello': 2, 'competitor-di-posizionamento': 2 }[m] || 0;
}

function debolezzeDi(a) {
  const d = [];
  if (a.qualitaPubblicazionePct !== undefined && a.qualitaPubblicazionePct !== null && a.qualitaPubblicazionePct < 70) {
    d.push(`schede annuncio al ${a.qualitaPubblicazionePct}% di qualità: foto e testi sotto standard`);
  }
  if (a.tempoRispostaOre) d.push(`dichiara risposta in ${a.tempoRispostaOre} ore: è il benchmark, non un vantaggio`);
  if ((a.annunciTotali || 0) > 120) d.push('volume alto: difficile seguire ogni immobile con attenzione — il venditore lo percepisce');
  if (a.tipo === 'franchising') d.push('modello in franchising: turnover degli agenti e metodo standardizzato');
  if (!d.length) d.push('nessuna debolezza evidente dai dati pubblici: serve rilievo diretto');
  return d;
}

function contromisuraPer(d) {
  switch (d.id) {
    case 'idealista':
    case 'immobiliare-it':
      return 'Il portale vince sulla ricerca generica. Si vince sulla ricerca specifica: "vendere casa a Gossolengo" deve portare a una pagina con i numeri di Gossolengo, non a un elenco di annunci.';
    case 'realadvisor':
      return 'La valutazione automatica dà un numero senza contesto. La risposta è una valutazione che spiega il numero con i comparabili della via, e che resta in mano al proprietario.';
    case 'dove-it':
      return 'Il modello a provvigione ridotta compete sul prezzo. La contromisura è spostare la conversazione sul risultato netto in tasca, non sulla percentuale.';
    case 'agenteimmobiliareai':
      return 'Presidiare per primi il posizionamento "valutazione con dati a Piacenza": se lo occupa un concorrente locale, recuperarlo costa molto.';
    default:
      return 'Monitorare.';
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  costruisciConcorrenza({ log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
