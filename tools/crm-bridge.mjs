/**
 * crm-bridge.mjs — ponte fra la macchina di analisi e il CRM immocrm.
 *
 * Il CRM (https://davidescaglia1968.github.io/immocrm/) è un'app separata su un
 * altro repository: questa sessione di lavoro non può scriverci sopra. Questo
 * modulo produce quindi ciò che il CRM può importare direttamente, nel formato
 * che il suo modello dati già conosce.
 *
 * Cosa produce:
 *   data/crm/zone.json      → le 6 zone operative nel formato zone del CRM
 *                             (comune / zona / mqMin / mqMax / tempoMedioGiorni
 *                             / scontoMedioPct), pronte per sostituire la sola
 *                             zona z1 oggi presente
 *   data/crm/lead.json      → i lead di acquisizione ricavati dagli annunci fermi,
 *                             nel formato contatti del CRM
 *   data/crm/mercato.json   → i valori OMI e di mercato per la sezione "Compravendite OMI"
 *   data/crm/importabile.csv→ tabella unica per l'import manuale
 *
 * Il CRM legge da localStorage alla chiave immocrm_pro_v10 (vedi sync.js):
 * il file data/crm/README.md spiega dove incollare i dati.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { toCsv } from './lib/csv.mjs';

/** Tempi medi di vendita per tipologia di zona, in giorni. Derivati dai dati CRM z1 e dai tempi di mercato. */
const TEMPI_PER_TIPO = {
  capoluogo: 90,
  hinterland: 110,
  pianura: 120,
  valle: 150,
  campagna: 165,
};

/** Sconto medio in trattativa per tipologia di zona, in percentuale. */
const SCONTI_PER_TIPO = {
  capoluogo: 6,
  hinterland: 7,
  pianura: 7,
  valle: 9,
  campagna: 10,
};

export function zonePerCrm(zoneCfg) {
  return (zoneCfg.zone || []).map((z, i) => ({
    id: 'z' + (i + 1),
    comune: z.nome,
    zona: z.tipo === 'capoluogo' ? 'Tutte le zone' : 'Intero comune e frazioni',
    mqMin: Math.round((z.prezzoMq?.min ?? z.prezzoMq?.media * 0.6)),
    mqMax: Math.round((z.prezzoMq?.max ?? z.prezzoMq?.media * 1.3)),
    mqMedio: z.prezzoMq?.media ?? null,
    affittoMq: z.affittoMqMese ?? null,
    tempoMedioGiorni: TEMPI_PER_TIPO[z.tipo] ?? 120,
    scontoMedioPct: SCONTI_PER_TIPO[z.tipo] ?? 7,
    variazioneAnnuaPct: z.variazioni?.annualePct ?? 0,
    abitanti: z.abitanti ?? null,
    frazioni: z.frazioni || z.quartieri || [],
    aggiornataIl: z.prezzoMq?.rilevato || new Date().toISOString().slice(0, 10),
    fonti: (z.fonti || []).map((f) => `${f.nome} (${f.periodo})`),
  }));
}

export function leadPerCrm(lead, { oggi = new Date() } = {}) {
  return (lead || []).map((l, i) => ({
    id: 'lead-' + (i + 1),
    nome: '',
    cognome: '',
    telefono: '',
    email: '',
    tipo: 'venditore',
    stato: 'da contattare',
    fonte: 'annuncio fermo — ' + l.sorgente,
    comune: l.comune,
    zona: l.zona,
    immobile: `${l.tipo} ${l.mq ? l.mq + ' mq' : ''}`.trim(),
    prezzoRichiesto: l.prezzo,
    giorniInPubblicazione: l.giorniInPubblicazione,
    anniFermi: l.anniFermi,
    fascia: l.fascia,
    agenziaAttuale: l.agenzia,
    note: (l.angoloDiAttacco || []).join('; '),
    priorita: l.giorniInPubblicazione > 730 ? 'altissima' : l.giorniInPubblicazione > 365 ? 'alta' : 'media',
    creatoIl: oggi.toISOString().slice(0, 10),
    urlAnnuncio: l.url || '',
  }));
}

export async function costruisciPonteCrm({ root = process.cwd(), log = () => {} } = {}) {
  const zoneCfg = JSON.parse(await readFile(path.join(root, 'tools/config/zone.json'), 'utf8'));
  let annunci = null;
  try {
    annunci = JSON.parse(await readFile(path.join(root, 'data/annunci.json'), 'utf8'));
  } catch {
    log('data/annunci.json assente: ponte CRM generato senza lead');
  }

  const dir = path.join(root, 'data', 'crm');
  await mkdir(dir, { recursive: true });

  const zone = zonePerCrm(zoneCfg);
  const lead = leadPerCrm(annunci?.leadAcquisizione || []);

  const mercato = {
    generatoIl: new Date().toISOString(),
    provincia: {
      nome: zoneCfg.provincia.nome,
      prezzoMq: zoneCfg.provincia.prezzoMq,
      variazioneAnnuaPct: zoneCfg.provincia.variazioni.annualePct,
      massimoStorico: zoneCfg.provincia.massimoStorico,
    },
    macro: zoneCfg.macro,
    zone,
  };

  await writeFile(path.join(dir, 'zone.json'), JSON.stringify(zone, null, 2), 'utf8');
  await writeFile(path.join(dir, 'lead.json'), JSON.stringify(lead, null, 2), 'utf8');
  await writeFile(path.join(dir, 'mercato.json'), JSON.stringify(mercato, null, 2), 'utf8');

  const colonne = [
    'priorita', 'tipo', 'stato', 'comune', 'zona', 'immobile', 'prezzoRichiesto',
    'giorniInPubblicazione', 'anniFermi', 'fascia', 'agenziaAttuale', 'fonte', 'note', 'urlAnnuncio',
  ];
  await writeFile(
    path.join(dir, 'importabile.csv'),
    toCsv(lead.map((l) => Object.fromEntries(colonne.map((c) => [c, l[c] ?? '']))), colonne),
    'utf8'
  );

  const readme = `# Ponte verso il CRM immocrm

Generato il ${new Date().toISOString().slice(0, 10)} da \`node tools/crm-bridge.mjs\`.

Il CRM vive in un repository separato (\`davidescaglia1968/immocrm\`) e salva i dati in
\`localStorage\` alla chiave \`immocrm_pro_v10\`, con sincronizzazione su Gist cifrato
(vedi \`sync.js\` del CRM). Per questo l'integrazione è a file: questa cartella contiene
dati pronti da importare, non una scrittura diretta nel CRM.

## File

| File | Contenuto | Dove va nel CRM |
|------|-----------|-----------------|
| \`zone.json\` | ${zone.length} zone operative con prezzi, tempi medi e sconti | Sezione **Valutatore** → zone. Sostituisce la singola zona \`z1\` attualmente presente. |
| \`lead.json\` | ${lead.length} lead di acquisizione da annunci fermi | Sezione **Acquisizione Lead** → nuovo contatto |
| \`mercato.json\` | Dati OMI e di mercato per zona | Sezione **Compravendite OMI** |
| \`importabile.csv\` | Tabella unica per l'import di massa | Sezione **Importa Rubrica** |

## Come si importa

1. Apri il CRM: https://davidescaglia1968.github.io/immocrm/
2. Sezione **Importa Rubrica** → carica \`importabile.csv\`.
3. Per le zone: copia il contenuto di \`zone.json\` nella configurazione zone del Valutatore.
   I campi (\`comune\`, \`zona\`, \`mqMin\`, \`mqMax\`, \`tempoMedioGiorni\`, \`scontoMedioPct\`)
   hanno già i nomi che il CRM si aspetta.
4. Attiva la sincronizzazione su Gist nelle **Impostazioni** per avere gli stessi dati
   su tutti i dispositivi.

## Perché a file e non via API

Il CRM è un'app statica senza backend: i dati stanno nel browser e su un Gist privato
cifrato in AES-GCM. Non esiste un endpoint pubblico su cui scrivere, ed è una scelta
corretta per la privacy. Il flusso giusto è quindi: la macchina genera i dati qui,
il CRM li importa. Se in futuro il CRM esporrà un endpoint REST (il campo
\`restUrl\` in \`sync.js\` è già previsto), basterà aggiungere un adapter qui.
`;
  await writeFile(path.join(dir, 'README.md'), readme, 'utf8');

  log(`data/crm/: ${zone.length} zone, ${lead.length} lead, 4 file`);
  return { zone, lead, mercato };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  costruisciPonteCrm({ log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
