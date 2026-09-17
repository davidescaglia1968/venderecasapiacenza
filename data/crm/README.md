# Ponte verso il CRM immocrm

Generato il 2026-09-17 da `node tools/crm-bridge.mjs`.

Il CRM vive in un repository separato (`davidescaglia1968/immocrm`) e salva i dati in
`localStorage` alla chiave `immocrm_pro_v10`, con sincronizzazione su Gist cifrato
(vedi `sync.js` del CRM). Per questo l'integrazione è a file: questa cartella contiene
dati pronti da importare, non una scrittura diretta nel CRM.

## File

| File | Contenuto | Dove va nel CRM |
|------|-----------|-----------------|
| `zone.json` | 6 zone operative con prezzi, tempi medi e sconti | Sezione **Valutatore** → zone. Sostituisce la singola zona `z1` attualmente presente. |
| `lead.json` | 0 lead di acquisizione da annunci fermi | Sezione **Acquisizione Lead** → nuovo contatto |
| `mercato.json` | Dati OMI e di mercato per zona | Sezione **Compravendite OMI** |
| `importabile.csv` | Tabella unica per l'import di massa | Sezione **Importa Rubrica** |

## Come si importa

1. Apri il CRM: https://davidescaglia1968.github.io/immocrm/
2. Sezione **Importa Rubrica** → carica `importabile.csv`.
3. Per le zone: copia il contenuto di `zone.json` nella configurazione zone del Valutatore.
   I campi (`comune`, `zona`, `mqMin`, `mqMax`, `tempoMedioGiorni`, `scontoMedioPct`)
   hanno già i nomi che il CRM si aspetta.
4. Attiva la sincronizzazione su Gist nelle **Impostazioni** per avere gli stessi dati
   su tutti i dispositivi.

## Perché a file e non via API

Il CRM è un'app statica senza backend: i dati stanno nel browser e su un Gist privato
cifrato in AES-GCM. Non esiste un endpoint pubblico su cui scrivere, ed è una scelta
corretta per la privacy. Il flusso giusto è quindi: la macchina genera i dati qui,
il CRM li importa. Se in futuro il CRM esporrà un endpoint REST (il campo
`restUrl` in `sync.js` è già previsto), basterà aggiungere un adapter qui.
