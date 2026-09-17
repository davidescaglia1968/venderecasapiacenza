# venderecasapiacenza.it

Sito di Davide Scaglia — Immobiliare Scaglia, agente immobiliare a Piacenza dal 2007.
P.IVA 01493570335 · REA PC-168637

Il repository contiene due cose:

1. **Il sito** — statico, senza framework, senza dipendenze a runtime.
2. **La macchina di analisi** — `tools/`, in Node puro, che aggiorna i dati, genera i
   contenuti social e rigenera le pagine.

---

## Comandi

```bash
node --test "tools/test/*.test.mjs"   # 40 test
node tools/build.mjs                  # build completo: dati → contenuti → pagine → sitemap
node tools/build.mjs --offline        # senza richieste di rete
node tools/build.mjs --demo           # con il dataset dimostrativo dei test
```

Moduli singoli:

```bash
node tools/market.mjs        # data/mercato.json
node tools/annunci.mjs       # data/annunci.json + data/lead-acquisizione.json
node tools/notizie.mjs       # data/notizie.json
node tools/concorrenza.mjs   # data/concorrenza.json
node tools/social.mjs        # contenuti/<data>/ + data/contenuti.json
node tools/crm-bridge.mjs    # data/crm/ — file pronti per il CRM immocrm
node tools/pagine.mjs        # rigenera tutte le pagine HTML
node tools/sitemap.mjs       # sitemap.xml + verifica collegamenti interni
```

---

## Struttura

```
index.html              home
mercato/                pagina pubblica: mercato in numeri (alimentata da data/mercato.json)
quartieri/              una pagina per zona servita, con prezzi, frazioni, fonti e FAQ
guide/                  5 guide pratiche
blog/                   articoli e analisi
osservatorio-ai/        pagina pubblica: osservatorio AI per il settore
concorrenza/            STRUMENTO INTERNO — noindex, fuori dalla sitemap
contenuti/              STRUMENTO INTERNO — noindex, fuori dalla sitemap
assets/                 immagini

tools/
  config/               zone, sorgenti, concorrenti, social, ai, contenuti editoriali
  lib/                  net, robots, xml, csv, stat, annunci, adapters, pagine
  test/                 40 test + fixture
  build.mjs             orchestratore
data/                   output generato (JSON e CSV)
contenuti/<data>/       pacchetti social pronti: testo, copertine SVG, sottotitoli SRT
analisi/                AUDIT-2026-09-17.md — l'analisi del sito con i dati misurati
```

---

## La macchina di analisi

### Flusso

`build.mjs` esegue nove passi in ordine, perché le dipendenze contano:

```
annunci → notizie → mercato → concorrenza → contenuti → ponte CRM → pagine → sitemap → verifica
```

### Annunci: data di pubblicazione e immobili fermi

Il modulo centrale è `tools/lib/annunci.mjs`. Normalizza gli annunci da qualsiasi
sorgente, li deduplica per impronta (stesso immobile su portali diversi non viene contato
due volte) e li ordina **dal più vecchio al più recente**.

Le fasce di anzianità sono calibrate sui tempi reali di vendita:

| Fascia | Giorni | Segnale | Azione |
|---|---|---|---|
| Fresco | 0–30 | — | monitorare |
| In linea | 31–90 | nella norma | monitorare |
| Rallentato | 91–180 | attenzione | contatto di cortesia |
| Fermo | 181–365 | critico | lead caldo |
| Bloccato | 1–2 anni | critico | lead caldissimo |
| Storico | oltre 2 anni | emergenza | priorità assoluta |

Un annuncio fermo da due anni non è un concorrente: è un proprietario deluso.
`leadDaAnnunciFermi()` produce la lista operativa con l'angolo di attacco per ciascuno.

### Conformità a robots.txt

Nessun adattatore fa una richiesta senza il via libera di `tools/lib/robots.mjs`, che
implementa la valutazione di RFC 9309 (regola più lunga vince, `Allow` prevale a parità,
wildcard e ancora finale). Se un percorso è bloccato, la richiesta non parte.

Questo non è un dettaglio: Idealista vieta esplicitamente l'ordinamento degli annunci per
data di pubblicazione, e Immobiliare.it blocca le liste di ricerca. Il dato che serve
esiste, ma va preso dai canali legittimi — rilievo manuale e CRM.

### Sorgenti

`tools/config/sorgenti.json` è il registro: portali immobiliari, piattaforme generaliste,
aggregatori di dati ufficiali (OMI, ISTAT), testate locali e feed RSS. Ogni voce dichiara
lo stato di conformità e la strategia di raccolta.

---

## Contenuti social

`tools/social.mjs` trasforma un argomento in un pacchetto per **15 piattaforme**, ciascuna
nel formato esatto:

- testo entro i limiti di caratteri della piattaforma (verificato, non presunto)
- copertina SVG alle dimensioni esatte in pixel
- script video con tempi e sottotitoli SRT pronti da caricare
- hashtag pertinenti al tema

Un solo master verticale 1080×1920 copre Instagram Reels, Facebook Reels, TikTok,
YouTube Shorts e Threads: si gira una volta e si riusa.

Le specifiche sono in `tools/config/social.json`, con le fonti. I limiti di caratteri
cambiano spesso: sono centralizzati lì e vanno ricontrollati ogni trimestre.

Ordine di pubblicazione: prima Facebook e Google Business Profile, che sono i canali di
acquisizione dei venditori; poi Instagram e TikTok.

---

## Integrazione con il CRM

Il CRM è un repository separato: <https://davidescaglia1968.github.io/immocrm/>

`tools/crm-bridge.mjs` produce in `data/crm/` i file nel formato che il CRM già conosce:

| File | Contenuto | Dove va nel CRM |
|---|---|---|
| `zone.json` | le 6 zone operative | **Valutatore** → zone (sostituisce la sola `z1` attuale) |
| `lead.json` | lead da annunci fermi | **Acquisizione Lead** |
| `mercato.json` | dati OMI e di mercato | **Compravendite OMI** |
| `importabile.csv` | tabella per l'import di massa | **Importa Rubrica** |

Il CRM è un'app statica senza backend: i dati stanno in `localStorage` e su un Gist
privato cifrato in AES-GCM. L'integrazione è quindi a file, non via API. Le istruzioni
sono in `data/crm/README.md`.

---

## Automazione

`.github/workflows/intelligence.yml` esegue la macchina ogni notte alle 05:15 UTC:
test, build, commit dei risultati. Il sito resta statico e veloce, ma i dati si muovono.

`.github/workflows/pages.yml` pubblica su GitHub Pages. Se il sito è servito da
Cloudflare Pages resta inattivo senza effetti collaterali.

---

## Principi

- **Nessuna dipendenza a runtime.** Solo Node 20+ e libreria standard.
- **Ogni dato ha fonte e data.** Un numero senza fonte non è difendibile davanti a un
  cliente né citabile da un motore AI.
- **Nessuna richiesta a chi la vieta.** La conformità a robots.txt è verificata, non
  dichiarata.
- **HTML puro.** Le pagine sono server-rendered: leggibili da Google e dagli assistenti AI
  senza eseguire JavaScript.
- **Le pagine di lavoro non sono pagine di marketing.** `/concorrenza/` e `/contenuti/`
  sono `noindex` e fuori dalla sitemap.
