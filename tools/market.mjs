/**
 * market.mjs — costruisce data/mercato.json: la fotografia del mercato.
 *
 * Unisce:
 *  - quotazioni comunali e di quartiere (tools/config/zone.json, con fonti e data)
 *  - indicatori macro OMI / Agenzia delle Entrate
 *  - l'archivio annunci, se presente (tempi di vendita reali osservati)
 *
 * Ogni numero mantiene la sua fonte e la sua data: un dato senza fonte non
 * è difendibile davanti a un cliente né citabile da un motore AI.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mediana, arrotonda, variazionePct } from './lib/stat.mjs';

export async function costruisciMercato({ root = process.cwd(), log = () => {} } = {}) {
  const zone = JSON.parse(
    await readFile(path.join(root, 'tools/config/zone.json'), 'utf8')
  );

  let analisi = null;
  try {
    analisi = JSON.parse(await readFile(path.join(root, 'data/annunci.json'), 'utf8'));
  } catch {
    log('data/annunci.json non presente: mercato costruito solo su quotazioni e macro');
  }

  const zoneElaborate = zone.zone.map((z) => {
    const osservati = analisi
      ? analisi.perComune.find((c) => c.comune?.toLowerCase() === z.nome.toLowerCase())
      : null;

    const spreadFonti = (z.fonti || [])
      .filter((f) => Number.isFinite(Number(f.valore)))
      .map((f) => Number(f.valore));
    const gapDaMassimo = null;

    return {
      ...z,
      osservato: osservati
        ? {
            annunci: osservati.annunci,
            giorniMediani: osservati.giorniMediani,
            giorniMassimi: osservati.giorniMassimi,
            prezzoMqMedianoAnnunci: osservati.prezzoMqMediano,
            oltreUnAnno: osservati.oltreUnAnno,
          }
        : null,
      coerenzaFonti: spreadFonti.length
        ? {
            minimo: Math.min(...spreadFonti),
            massimo: Math.max(...spreadFonti),
            mediana: Math.round(mediana(spreadFonti)),
            dispersionePct: arrotonda(
              variazionePct(Math.min(...spreadFonti), Math.max(...spreadFonti)),
              1
            ),
            nFonti: spreadFonti.length,
          }
        : null,
      gapDaMassimo,
    };
  });

  // Classifica delle zone per opportunità: prezzo × crescita × liquidità.
  const classifica = [...zoneElaborate]
    .map((z) => {
      const crescita = z.variazioni?.annualePct ?? 0;
      const prezzo = z.prezzoMq?.media ?? 0;
      // indice sintetico e trasparente: crescita annua pesata sul prezzo relativo
      const prezzoRelativo = prezzo / (zone.provincia.prezzoMq || 1);
      const indice = arrotonda(crescita / Math.max(0.5, prezzoRelativo), 2);
      return {
        id: z.id,
        nome: z.nome,
        prezzoMq: prezzo,
        crescitaAnnuaPct: crescita,
        indiceOpportunita: indice,
        segnale: segnaleDi(crescita),
      };
    })
    .sort((a, b) => b.indiceOpportunita - a.indiceOpportunita);

  const output = {
    generatoIl: new Date().toISOString(),
    copertura: {
      zone: zoneElaborate.length,
      comuniProvincia: zone.provincia.comuniCensiti,
      provincia: zone.provincia.nome,
    },
    provincia: zone.provincia,
    macro: zone.macro,
    zone: zoneElaborate,
    classificaOpportunita: classifica,
    osservazioni: generaOsservazioni(zone, classifica),
    metodo: {
      cosaMisura:
        'Prezzi RICHIESTI (asking price) rilevati dagli annunci, non prezzi di compravendita registrati. I due valori divergono: il prezzo di chiusura è in media più basso del prezzo richiesto.',
      fonti:
        'Idealista (report prezzi provincia), Immobiliare.it (quotazioni comunali), RealAdvisor, PiacenzaSera. Ogni valore ha la sua fonte e la sua data nel campo `fonti`.',
      frequenzaAggiornamento: 'settimanale via GitHub Actions; i valori di mercato dei portali si aggiornano mensilmente.',
      avvertenza:
        'Questi dati servono a orientare una conversazione con il proprietario. La valutazione di un singolo immobile richiede sopralluogo, verifica catastale, APE e comparabili reali.',
    },
  };

  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(path.join(root, 'data/mercato.json'), JSON.stringify(output, null, 2), 'utf8');
  log(`data/mercato.json scritto: ${zoneElaborate.length} zone`);
  return output;
}

function segnaleDi(crescita) {
  if (crescita >= 10) return 'in forte ascesa';
  if (crescita >= 3) return 'in crescita';
  if (crescita > -3) return 'stabile';
  return 'in correzione';
}

/**
 * Le osservazioni sono il cuore editoriale: trasformano numeri in argomenti
 * utilizzabili nelle chiamate e nei contenuti.
 */
export function generaOsservazioni(zone, classifica) {
  const out = [];
  const top = classifica[0];
  const coda = classifica[classifica.length - 1];
  if (top) {
    out.push({
      tipo: 'opportunita',
      titolo: `${top.nome} è la zona che si muove di più`,
      testo: `Crescita annua del ${String(top.crescitaAnnuaPct).replace('.', ',')}% su un prezzo medio di ${top.prezzoMq} €/mq. Per un proprietario significa: il momento di vendere è adesso, e il prezzo va costruito su comparabili recenti, non su quello che il vicino "ha chiesto".`,
      zone: [top.id],
    });
  }
  if (coda && coda.id !== top?.id) {
    out.push({
      tipo: 'rischio',
      titolo: `${coda.nome}: chi vende qui non può improvvisare`,
      testo: `Variazione annua ${String(coda.crescitaAnnuaPct).replace('.', ',')}%. In un mercato che scende, l'errore classico è partire alti "per provarci": ogni mese di attesa brucia valore. Qui il metodo conta più che altrove.`,
      zone: [coda.id],
    });
  }
  const provincia = zone.provincia;
  if (provincia?.massimoStorico) {
    out.push({
      tipo: 'contesto',
      titolo: 'I prezzi restano sotto il massimo del 2012',
      testo: `La provincia tocca ${provincia.prezzoMq} €/mq contro il massimo storico di ${provincia.massimoStorico.valore} €/mq (${provincia.massimoStorico.periodo}): ${String(provincia.massimoStorico.gapPct).replace('.', ',')}%. Chi ha comprato nel 2012 non ha ancora recuperato. È il dato che smonta la frase "aspetto, tanto i prezzi salgono".`,
      zone: [],
    });
  }
  const macro = zone.macro;
  if (macro?.omiQ2_2026) {
    const q1 = macro.omiQ1_2026;
    const q2 = macro.omiQ2_2026;
    out.push({
      tipo: 'macro',
      titolo: 'Il mercato nazionale ha smesso di correre',
      testo: `Q1 2026: ${q1.abitazioniCompravendute.toLocaleString('it-IT')} compravendite, +${String(q1.variazioneAnnuaPct).replace('.', ',')}% sull'anno. Q2 2026: ${q2.abitazioniCompravendute.toLocaleString('it-IT')}, +${String(q2.variazioneAnnuaPct).replace('.', ',')}%. Il tasso medio scende al ${String(q2.tassoMedioPct).replace('.', ',')}% per la prima volta dopo un anno. Tradotto per un venditore di Piacenza: la domanda c'è ma è più selettiva, e chi è priced giusto chiude.`,
      zone: [],
    });
  }
  out.push({
    tipo: 'locale',
    titolo: 'Piacenza resta il capoluogo più economico della regione',
    testo: `${provincia?.capoluoghiEmiliaRomagna2026?.map((c) => `${c.citta} ${c.prezzoMq} €/mq`).join(' · ')}. Per chi compra è un'occasione; per chi vende a Piacenza significa che il concorrente non è solo l'altra agenzia, è il confronto con città vicine percepite come "più vive".`,
    zone: ['piacenza'],
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  costruisciMercato({ log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
