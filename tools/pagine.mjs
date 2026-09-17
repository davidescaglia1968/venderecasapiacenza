/**
 * pagine.mjs — genera tutte le pagine del sito a partire dai contenuti e dai dati.
 *
 * Genera:
 *   /guide/ + le guide
 *   /blog/  + gli articoli
 *   /quartieri/ + una pagina per ogni zona servita
 *   /mercato/       (pubblica, alimentata da data/mercato.json)
 *   /osservatorio-ai/ (pubblica)
 *   /concorrenza/   (interna, noindex)
 *   /contenuti/     (interna, noindex)
 *   pagine legali
 *
 * Le pagine interne di lavoro sono noindex e fuori dalla sitemap: sono strumenti
 * per l'agenzia, non pagine da indicizzare.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { layout, esc, euro, pct, classeVar } from './lib/pagine.mjs';

const SITE = 'https://venderecasapiacenza.it';

async function leggi(root, p, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(root, p), 'utf8'));
  } catch {
    return fallback;
  }
}

async function scrivi(root, percorso, html) {
  const full = path.join(root, percorso);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
  return percorso;
}

/* ------------------------------------------------------------------ */
/* Blocchi riutilizzabili                                               */
/* ------------------------------------------------------------------ */
function tabellaZone(zone) {
  return `<table>
<thead><tr><th>Zona</th><th class="num">€/mq</th><th class="num">Var. anno</th><th class="num">Var. trim.</th><th class="num">Affitto €/mq</th><th>Segnale</th></tr></thead>
<tbody>
${zone
  .map(
    (z) => `<tr><td><a href="/quartieri/${z.slug}.html">${esc(z.nome)}</a><br><small style="color:#7a7570">${esc(z.valle)}</small></td>
<td class="num">${z.prezzoMq.media.toLocaleString('it-IT')}</td>
<td class="num ${classeVar(z.variazioni.annualePct)}">${pct(z.variazioni.annualePct)}</td>
<td class="num ${classeVar(z.variazioni.trimestralePct)}">${pct(z.variazioni.trimestralePct)}</td>
<td class="num">${z.affittoMqMese ? z.affittoMqMese.toLocaleString('it-IT') : 'n/d'}</td>
<td>${esc(z.segnaleMercato || '—')}</td></tr>`
  )
  .join('\n')}
</tbody></table>`;
}

function renderSezione(s, ctx) {
  let h = `<h2>${esc(s.titolo)}</h2>`;
  for (const p of s.paragrafi || []) h += `<p>${esc(p)}</p>`;
  if (s.tabellaZone && ctx.zone) h += tabellaZone(ctx.zone);
  for (const l of s.liste || []) {
    h += `<h3>${esc(l.titolo)}</h3><ul class="check">${l.voci.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
  }
  if (s.nota) h += `<blockquote>${esc(s.nota)}</blockquote>`;
  return h;
}

function faqJsonLd(domande) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: domande.map((d) => ({
      '@type': 'Question',
      name: d.domanda,
      acceptedAnswer: { '@type': 'Answer', text: d.risposta },
    })),
  };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.nome,
      item: b.url,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Guide                                                                */
/* ------------------------------------------------------------------ */
async function generaGuide(root, { contenuti, log }) {
  const scritte = [];
  const guide = contenuti.guide || [];

  // indice
  const hero = `<span class="eyebrow">Guide pratiche</span>
<h1>Come si vende casa a <em>Piacenza</em></h1>
<p class="lead">Niente teoria: i passaggi concreti, i documenti, i costi, gli errori. Scritti da chi fa questo lavoro in questa provincia dal 2007.</p>`;
  const body = `<div class="grid c2">
${guide
  .map(
    (g) => `<article class="card">
<h3><a href="/guide/${g.slug}.html">${esc(g.titolo)}</a></h3>
<p>${esc(g.metaDescription)}</p>
<p class="fonte">⏱ ${g.tempoLettura} minuti di lettura · ${g.sommario.length} sezioni</p>
</article>`
  )
  .join('\n')}
</div>`;

  scritte.push(
    await scrivi(root, 'guide/index.html', layout({
      titolo: 'Guide per vendere casa a Piacenza | Davide Scaglia',
      descrizione: 'Guide pratiche per vendere casa a Piacenza: valutazione, documenti, prezzo, tempi di vendita, errori da evitare.',
      url: SITE + '/guide/',
      contenuti: { hero, body },
      breadcrumb: [
        { nome: 'Home', url: SITE + '/' },
        { nome: 'Guide', url: SITE + '/guide/' },
      ],
      jsonLd: [breadcrumbLd([
        { nome: 'Home', url: SITE + '/' },
        { nome: 'Guide', url: SITE + '/guide/' },
      ])],
    }))
  );

  for (const g of guide) {
    const url = `${SITE}/guide/${g.slug}.html`;
    const hero = `<span class="eyebrow">Guida · ${g.tempoLettura} minuti</span><h1>${esc(g.titolo)}</h1><p class="lead">${esc(g.metaDescription)}</p>`;
    const indice = `<div class="card"><h3>Indice della guida</h3><ul class="check">${g.sommario
      .map((s, i) => `<li>${esc(s)}</li>`)
      .join('')}</ul></div>`;
    const corpo = indice + g.sezioni.map((s) => renderSezione(s, {})).join('');
    const briciole = [
      { nome: 'Home', url: SITE + '/' },
      { nome: 'Guide', url: SITE + '/guide/' },
      { nome: g.titolo, url },
    ];

    scritte.push(
      await scrivi(root, `guide/${g.slug}.html`, layout({
        titolo: `${g.titolo} | Davide Scaglia`,
        descrizione: g.metaDescription,
        url,
        tipo: 'Article',
        contenuti: { hero, body: corpo },
        breadcrumb: briciole,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: g.titolo,
            description: g.metaDescription,
            url,
            inLanguage: 'it-IT',
            dateModified: contenuti._meta.aggiornato,
            author: { '@type': 'Person', name: 'Davide Scaglia', jobTitle: 'Agente Immobiliare' },
            publisher: { '@type': 'RealEstateAgent', name: 'Immobiliare Scaglia', url: SITE },
          },
          breadcrumbLd(briciole),
        ],
      }))
    );
  }
  log(`guide: ${scritte.length} pagine`);
  return scritte;
}

/* ------------------------------------------------------------------ */
/* Blog                                                                 */
/* ------------------------------------------------------------------ */
async function generaBlog(root, { contenuti, log }) {
  const scritte = [];
  const articoli = contenuti.articoli || [];

  const esistenti = [
    { file: 'blog/errore-1-prezzo-sbagliato-piacenza.html', titolo: 'Prezzo sbagliato: il primo errore che blocca la vendita di casa a Piacenza', data: '2026-06-16', descrizione: 'Il prezzo iniziale sbagliato è il primo errore che blocca la vendita di casa a Piacenza. Scopri come si forma il valore reale.' },
    { file: 'blog/7-errori-vendita-casa-piacenza.html', titolo: 'I 7 errori che compromettono la vendita della tua casa a Piacenza', data: '2026-06-13', descrizione: 'I 7 errori che rallentano la vendita di casa a Piacenza anche di anni. Guida pratica per venditori consapevoli.' },
  ];

  const tutti = [
    ...articoli.map((a) => ({
      titolo: a.titolo,
      descrizione: a.metaDescription,
      data: a.data,
      url: `/blog/${a.slug}.html`,
      pilastro: a.pilastro,
      tempoLettura: a.tempoLettura,
    })),
    ...esistenti.map((e) => ({ ...e, url: '/' + e.file, pilastro: 'errore', tempoLettura: 6 })),
  ].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const hero = `<span class="eyebrow">Blog & analisi</span>
<h1>Mercato, metodo e <em>storie vere</em></h1>
<p class="lead">Quello che succede davvero quando si vende una casa a Piacenza. Dati con la fonte, errori visti sul campo, situazioni complesse raccontate senza drammatizzare.</p>`;

  const body = `<div class="grid c2">
${tutti
  .map(
    (a) => `<article class="card">
<span class="badge">${esc(a.pilastro)}</span>
<h3><a href="${esc(a.url)}">${esc(a.titolo)}</a></h3>
<p>${esc(a.descrizione)}</p>
<p class="fonte">${esc(a.data)} · ⏱ ${a.tempoLettura} min</p>
</article>`
  )
  .join('\n')}
</div>`;

  const briciole = [
    { nome: 'Home', url: SITE + '/' },
    { nome: 'Blog', url: SITE + '/blog/' },
  ];
  scritte.push(
    await scrivi(root, 'blog/index.html', layout({
      titolo: 'Blog e analisi di mercato immobiliare a Piacenza | Davide Scaglia',
      descrizione: 'Analisi del mercato immobiliare di Piacenza, guide alla vendita, errori da evitare e casi reali. Aggiornato con dati OMI e portali.',
      url: SITE + '/blog/',
      tipo: 'CollectionPage',
      contenuti: { hero, body },
      breadcrumb: briciole,
      jsonLd: [breadcrumbLd(briciole)],
    }))
  );

  for (const a of articoli) {
    const url = `${SITE}/blog/${a.slug}.html`;
    const hero = `<span class="eyebrow">${esc(a.pilastro)} · ${esc(a.data)}</span><h1>${esc(a.titolo)}</h1><p class="lead">${esc(a.metaDescription)}</p>`;
    const corpo = a.sezioni.map((s) => renderSezione(s, {})).join('');
    const br = [
      { nome: 'Home', url: SITE + '/' },
      { nome: 'Blog', url: SITE + '/blog/' },
      { nome: a.titolo, url },
    ];
    scritte.push(
      await scrivi(root, `blog/${a.slug}.html`, layout({
        titolo: `${a.titolo} | Davide Scaglia`,
        descrizione: a.metaDescription,
        url,
        tipo: 'Article',
        dataPubblicazione: a.data,
        dataModifica: contenuti._meta.aggiornato,
        contenuti: { hero, body: corpo },
        breadcrumb: br,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: a.titolo,
            description: a.metaDescription,
            url,
            inLanguage: 'it-IT',
            datePublished: a.data,
            dateModified: contenuti._meta.aggiornato,
            author: { '@type': 'Person', name: 'Davide Scaglia', jobTitle: 'Agente Immobiliare' },
            publisher: { '@type': 'RealEstateAgent', name: 'Immobiliare Scaglia', url: SITE },
          },
          breadcrumbLd(br),
        ],
      }))
    );
  }
  log(`blog: ${scritte.length} pagine (${articoli.length} articoli + indice)`);
  return scritte;
}

/* ------------------------------------------------------------------ */
/* Zone: la pagina più importante per la SEO locale                      */
/* ------------------------------------------------------------------ */
async function generaZone(root, { zone, mercato, annunci, log }) {
  const scritte = [];
  const zoneList = mercato?.zone || zone.zone || [];

  const hero = `<span class="eyebrow">Zone servite</span>
<h1>Dove lavoro, <em>zona per zona</em></h1>
<p class="lead">Piacenza e cinque comuni della provincia. Per ognuno: i prezzi reali, le frazioni, cosa muove il mercato e cosa cambia per chi deve vendere.</p>`;

  const body = `<div class="grid c2">
${zoneList
  .map(
    (z) => `<article class="card">
<h3><a href="/quartieri/${z.slug}.html">${esc(z.nome)}</a></h3>
<p class="fonte">${esc(z.valle)}</p>
<p><span class="k-v" style="font-family:'Playfair Display',Georgia,serif;font-size:26px">${z.prezzoMq.media.toLocaleString('it-IT')} €/mq</span>
<span class="${classeVar(z.variazioni.annualePct)}" style="font-weight:700">${pct(z.variazioni.annualePct)} anno</span></p>
<p>${esc((z.driver || [])[0] || '')}</p>
</article>`
  )
  .join('\n')}
</div>
<h2>Il quadro completo</h2>
${tabellaZone(zoneList)}`;

  const br = [
    { nome: 'Home', url: SITE + '/' },
    { nome: 'Zone', url: SITE + '/quartieri/' },
  ];
  scritte.push(
    await scrivi(root, 'quartieri/index.html', layout({
      titolo: 'Zone servite: Piacenza, Gossolengo, Rivergaro, Vigolzone, Podenzano, Ponte dell\'Olio',
      descrizione: 'Le sei zone in cui opera Davide Scaglia, con prezzi al mq, variazioni e caratteristiche del mercato immobiliare di ciascuna.',
      url: SITE + '/quartieri/',
      tipo: 'CollectionPage',
      contenuti: { hero, body },
      breadcrumb: br,
      jsonLd: [breadcrumbLd(br)],
    }))
  );

  for (const z of zoneList) {
    const url = `${SITE}/quartieri/${z.slug}.html`;
    const v = z.variazioni?.annualePct ?? 0;
    const direzione = v >= 3 ? 'in crescita' : v <= -3 ? 'in correzione' : 'stabile';
    const oss = mercato?.perComune || [];
    const osservato = annunci?.perComune?.find((c) => (c.comune || '').toLowerCase() === z.nome.toLowerCase());

    const hero = `<span class="eyebrow">${esc(z.valle)}</span>
<h1>Vendere casa a <em>${esc(z.nome)}</em></h1>
<p class="lead">${z.prezzoMq.media.toLocaleString('it-IT')} €/mq di prezzo richiesto medio, ${pct(v)} su base annua. Mercato ${direzione}. ${esc(z.segnaleMercato || '')}</p>`;

    const kpi = `<div class="grid c3">
<div class="kpi"><div class="k-l">Prezzo richiesto medio</div><div class="k-v">${z.prezzoMq.media.toLocaleString('it-IT')} €</div><div class="k-s">al metro quadro · ${esc(z.prezzoMq.rilevato || '')}</div></div>
<div class="kpi"><div class="k-l">Variazione annua</div><div class="k-v ${classeVar(v)}">${pct(v)}</div><div class="k-s">${pct(z.variazioni.trimestralePct)} sul trimestre</div></div>
<div class="kpi"><div class="k-l">Affitto medio</div><div class="k-v">${z.affittoMqMese ? z.affittoMqMese.toLocaleString('it-IT') : 'n/d'} €</div><div class="k-s">al mq al mese</div></div>
<div class="kpi"><div class="k-l">Abitanti</div><div class="k-v">${(z.abitanti || 0).toLocaleString('it-IT')}</div><div class="k-s">${esc(z.tipo)}</div></div>
${osservato ? `<div class="kpi"><div class="k-l">Annunci monitorati</div><div class="k-v">${osservato.annunci}</div><div class="k-s">${osservato.giorniMediani ? 'tempo mediano ' + osservato.giorniMediani + ' gg' : ''}</div></div>` : ''}
${osservato?.oltreUnAnno ? `<div class="kpi"><div class="k-l">Fermi da oltre un anno</div><div class="k-v">${osservato.oltreUnAnno}</div><div class="k-s">segnale di stallo del mercato locale</div></div>` : ''}
</div>`;

    let corpo = kpi;
    corpo += `<h2>Come si muove il mercato di ${esc(z.nome)}</h2>`;
    corpo += `<ul class="check">${(z.driver || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;

    if (z.quartieriPrezzoMq?.length) {
      corpo += `<h3>Prezzi per quartiere</h3><table><thead><tr><th>Quartiere</th><th class="num">€/mq</th><th>Nota</th></tr></thead><tbody>
${z.quartieriPrezzoMq.map((q) => `<tr><td>${esc(q.zona)}</td><td class="num">${q.prezzoMq.toLocaleString('it-IT')}</td><td>${esc(q.nota || '')}</td></tr>`).join('')}
</tbody></table>`;
    }

    const listaZone = z.quartieri || z.frazioni || [];
    if (listaZone.length) {
      corpo += `<h3>${z.quartieri ? 'Quartieri' : 'Frazioni e località'}</h3><p>${listaZone.map(esc).join(' · ')}</p>`;
    }

    if (z.sede) corpo += `<blockquote>${esc(z.sede)}</blockquote>`;

    if (z.fonti?.length) {
      corpo += `<h3>Fonti e data di rilevazione</h3><table><thead><tr><th>Fonte</th><th class="num">Valore</th><th>Periodo</th></tr></thead><tbody>
${z.fonti.map((f) => `<tr><td><a href="${esc(f.url)}" rel="nofollow noopener" target="_blank">${esc(f.nome)}</a></td><td class="num">${f.valore ? f.valore.toLocaleString('it-IT') + ' €/mq' : '—'}</td><td>${esc(f.periodo)}</td></tr>`).join('')}
</tbody></table>
<p class="fonte">Sono prezzi richiesti medi rilevati dagli annunci, non prezzi di compravendita registrati. I valori differiscono fra le fonti perché ogni piattaforma campiona annunci diversi: la dispersione è essa stessa un'informazione.</p>`;
    }

    corpo += `<h2>Cosa cambia per chi vende a ${esc(z.nome)}</h2>`;
    corpo += `<p>${esc(testoZona(z))}</p>`;

    const faq = [
      {
        domanda: `Quanto vale una casa a ${z.nome} nel 2026?`,
        risposta: `Il prezzo richiesto medio a ${z.nome} è di ${z.prezzoMq.media.toLocaleString('it-IT')} €/mq con una variazione annua del ${String(v).replace('.', ',')}%. Il valore del singolo immobile dipende però da via, piano, stato, classe energetica e conformità catastale: la differenza fra un immobile e l'altro nella stessa zona può superare il 30%.`,
      },
      {
        domanda: `Quanto tempo serve per vendere casa a ${z.nome}?`,
        risposta: `Su un immobile correttamente prezzato, tre mesi sono un tempo ragionevole per Piacenza città. ${z.tipo === 'valle' || z.tipo === 'campagna' ? 'A ' + z.nome + ' la domanda è più sottile e i tempi si allungano: serve un prezzo che tenga conto della liquidità reale del mercato locale.' : 'Se dopo novanta giorni non sono arrivate proposte, il problema è quasi sempre il prezzo o la presentazione.'}`,
      },
      {
        domanda: `Il mercato di ${z.nome} sta salendo o scendendo?`,
        risposta: `Nell'ultimo anno il prezzo richiesto medio è variato del ${String(v).replace('.', ',')}%, e del ${String(z.variazioni.trimestralePct).replace('.', ',')}% sull'ultimo trimestre. ${z.segnaleMercato ? 'Il segnale del mercato è: ' + z.segnaleMercato + '.' : ''}`,
      },
    ];

    corpo += `<h2>Domande frequenti su ${esc(z.nome)}</h2>`;
    corpo += faq.map((f) => `<h3>${esc(f.domanda)}</h3><p>${esc(f.risposta)}</p>`).join('');

    const briciole = [
      { nome: 'Home', url: SITE + '/' },
      { nome: 'Zone', url: SITE + '/quartieri/' },
      { nome: z.nome, url },
    ];

    scritte.push(
      await scrivi(root, `quartieri/${z.slug}.html`, layout({
        titolo: `Vendere casa a ${z.nome}: prezzi e mercato ${new Date().getFullYear()} | Davide Scaglia`,
        descrizione: `Vuoi vendere casa a ${z.nome}? Prezzi al mq, andamento del mercato, quartieri e frazioni, tempi di vendita. Dati con fonte e data.`,
        url,
        tipo: 'Article',
        dataModifica: new Date().toISOString().slice(0, 10),
        contenuti: { hero, body: corpo },
        breadcrumb: briciole,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'RealEstateListing',
            name: `Mercato immobiliare ${z.nome}`,
            url,
            description: `Prezzi e andamento del mercato immobiliare a ${z.nome}`,
            address: { '@type': 'PostalAddress', addressLocality: z.nome, addressRegion: 'PC', addressCountry: 'IT' },
          },
          faqJsonLd(faq),
          breadcrumbLd(briciole),
        ],
      }))
    );
  }
  log(`zone: ${scritte.length} pagine`);
  return scritte;
}

function testoZona(z) {
  const v = z.variazioni?.annualePct ?? 0;
  if (v >= 10) {
    return `${z.nome} è oggi la zona più dinamica fra quelle che seguo: la domanda supera l'offerta e chi vende ha un margine reale. Il rischio, in un mercato che sale, è l'opposto di quello solito — partire troppo alti per «cogliere l'onda» e bruciare la finestra di novità dell'annuncio. Il prezzo va costruito sui comparabili recenti, e la presentazione va curata perché è ciò che distingue il tuo immobile dagli altri nella stessa via.`;
  }
  if (v <= -3) {
    return `A ${z.nome} il mercato sta correggendo: ogni mese di attesa brucia valore. Questo non significa svendere, significa non illudersi. La strategia corretta è partire con un prezzo allineato ai comparabili degli ultimi tre mesi, non a quelli di un anno fa, e preparare i documenti prima di pubblicare. In una zona che scende, un immobile fermo sei mesi perde due volte: sul mercato e sulla percezione degli acquirenti.`;
  }
  return `${z.nome} ha un mercato stabile: né la corsa all'acquisto né la corsa al ribasso. In questi contesti vince chi è preparato — prezzo difendibile, documenti pronti, presentazione curata — perché l'acquirente ha tempo di confrontare e sceglie l'immobile che gli dà più certezze. La differenza fra vendere in tre mesi e vendere in un anno sta quasi tutta nella preparazione, non nella fortuna.`;
}

/* ------------------------------------------------------------------ */
/* Pagine alimentate dai dati dell'intelligence                          */
/* ------------------------------------------------------------------ */
async function generaMercato(root, { mercato, annunci, log }) {
  if (!mercato) return [];
  const oggi = mercato.generatoIl.slice(0, 10);
  const hero = `<span class="eyebrow">Aggiornato al ${esc(oggi)}</span>
<h1>Il mercato immobiliare di <em>Piacenza</em> in numeri</h1>
<p class="lead">Prezzi, variazioni, volumi di compravendite e tassi dei mutui. Ogni dato ha la sua fonte e la sua data: un numero senza fonte non serve a decidere.</p>`;

  const macro = mercato.macro || {};
  const prov = mercato.provincia || {};
  let corpo = `<div class="grid c3">
<div class="kpi"><div class="k-l">Prezzo medio provincia</div><div class="k-v">${(prov.prezzoMq || 0).toLocaleString('it-IT')} €</div><div class="k-s">al mq · <span class="${classeVar(prov.variazioni?.annualePct)}">${pct(prov.variazioni?.annualePct)} anno</span></div></div>
${macro.omiQ2_2026 ? `<div class="kpi"><div class="k-l">Compravendite Q2 2026</div><div class="k-v">${macro.omiQ2_2026.abitazioniCompravendute.toLocaleString('it-IT')}</div><div class="k-s">${pct(macro.omiQ2_2026.variazioneAnnuaPct)} sull'anno</div></div>` : ''}
${macro.omiQ2_2026 ? `<div class="kpi"><div class="k-l">Tasso medio mutui</div><div class="k-v">${macro.omiQ2_2026.tassoMedioPct}%</div><div class="k-s">${esc(macro.omiQ2_2026.nota || '')}</div></div>` : ''}
${prov.massimoStorico ? `<div class="kpi"><div class="k-l">Massimo storico</div><div class="k-v">${prov.massimoStorico.valore.toLocaleString('it-IT')} €</div><div class="k-s">${esc(prov.massimoStorico.periodo)} · oggi ${pct(prov.massimoStorico.gapPct)}</div></div>` : ''}
${macro.rapportoImmobiliare2026 ? `<div class="kpi"><div class="k-l">IMI residenziale</div><div class="k-v">${macro.rapportoImmobiliare2026.imiResidenzialePct}%</div><div class="k-s">capoluoghi ${macro.rapportoImmobiliare2026.imiCapoluoghiPct}% · comuni minori ${macro.rapportoImmobiliare2026.imiComuniMinoriPct}%</div></div>` : ''}
${annunci?.totali?.annunci ? `<div class="kpi"><div class="k-l">Annunci monitorati</div><div class="k-v">${annunci.totali.annunci}</div><div class="k-s">tempo mediano ${annunci.anzianita.giorniMediani} giorni</div></div>` : ''}
</div>`;

  corpo += `<h2>Prezzi per zona</h2>${tabellaZone(mercato.zone)}`;

  if (mercato.classificaOpportunita?.length) {
    corpo += `<h2>Classifica delle zone per dinamica di mercato</h2>
<p>Indice sintetico e trasparente: variazione annua pesata sul prezzo relativo rispetto alla media provinciale. Un valore alto indica una zona dove il prezzo si muove più rapidamente rispetto al suo livello.</p>
<table><thead><tr><th>#</th><th>Zona</th><th class="num">€/mq</th><th class="num">Var. annua</th><th class="num">Indice</th><th>Segnale</th></tr></thead><tbody>
${mercato.classificaOpportunita
  .map(
    (c, i) => `<tr><td>${i + 1}</td><td><a href="/quartieri/${c.id}.html">${esc(c.nome)}</a></td><td class="num">${c.prezzoMq.toLocaleString('it-IT')}</td><td class="num ${classeVar(c.crescitaAnnuaPct)}">${pct(c.crescitaAnnuaPct)}</td><td class="num">${c.indiceOpportunita}</td><td>${esc(c.segnale)}</td></tr>`
  )
  .join('')}
</tbody></table>`;
  }

  if (mercato.osservazioni?.length) {
    corpo += `<h2>Cosa dicono questi numeri</h2>`;
    corpo += mercato.osservazioni
      .map((o) => `<div class="card"><h3>${esc(o.titolo)}</h3><p>${esc(o.testo)}</p></div>`)
      .join('');
  }

  if (prov.capoluoghiEmiliaRomagna2026?.length) {
    corpo += `<h2>Piacenza nel confronto regionale</h2><table><thead><tr><th>Capoluogo</th><th class="num">€/mq</th></tr></thead><tbody>
${prov.capoluoghiEmiliaRomagna2026.map((c) => `<tr><td>${esc(c.citta)}${c.citta === 'Piacenza' ? ' <span class="badge ok">zona servita</span>' : ''}</td><td class="num">${c.prezzoMq.toLocaleString('it-IT')}</td></tr>`).join('')}
</tbody></table><p class="fonte">Fonte: <a href="${esc(prov.fonte?.url || '#')}" rel="nofollow noopener" target="_blank">${esc(prov.fonte?.nome || '')}</a></p>`;
  }

  if (macro.omiQ1_2026 && macro.omiQ2_2026) {
    corpo += `<h2>I dati ufficiali OMI</h2><table><thead><tr><th>Indicatore</th><th class="num">Q1 2026</th><th class="num">Q2 2026</th></tr></thead><tbody>
<tr><td>Abitazioni compravendute (NTN)</td><td class="num">${macro.omiQ1_2026.abitazioniCompravendute.toLocaleString('it-IT')}</td><td class="num">${macro.omiQ2_2026.abitazioniCompravendute.toLocaleString('it-IT')}</td></tr>
<tr><td>Variazione tendenziale</td><td class="num ${classeVar(macro.omiQ1_2026.variazioneAnnuaPct)}">${pct(macro.omiQ1_2026.variazioneAnnuaPct)}</td><td class="num ${classeVar(macro.omiQ2_2026.variazioneAnnuaPct)}">${pct(macro.omiQ2_2026.variazioneAnnuaPct)}</td></tr>
<tr><td>Tasso medio prima rata</td><td class="num">${macro.omiQ1_2026.tassoMedioPrimaRataPct}%</td><td class="num">${macro.omiQ2_2026.tassoMedioPct}%</td></tr>
<tr><td>Quota acquisti con mutuo</td><td class="num">${macro.omiQ1_2026.quotaAcquistiConMutuoPct}%</td><td class="num">~${macro.omiQ2_2026.abitazioniConMutuo ? Math.round((macro.omiQ2_2026.abitazioniConMutuo / macro.omiQ2_2026.abitazioniCompravendute) * 100) : 'n/d'}%</td></tr>
</tbody></table>
<p class="fonte">Fonte: Osservatorio del Mercato Immobiliare, Agenzia delle Entrate. <a href="${esc(macro.omiQ2_2026.fonte?.url || '#')}" rel="nofollow noopener" target="_blank">${esc(macro.omiQ2_2026.fonte?.nome || '')}</a></p>`;
  }

  corpo += `<div class="card"><h3>Metodo e limiti</h3><p><strong>Cosa misurano questi dati.</strong> ${esc(mercato.metodo.cosaMisura)}</p>
<p><strong>Fonti.</strong> ${esc(mercato.metodo.fonti)}</p>
<p><strong>Avvertenza.</strong> ${esc(mercato.metodo.avvertenza)}</p></div>`;

  const faq = [
    {
      domanda: 'Quanto costano le case a Piacenza nel 2026?',
      risposta: `Il prezzo richiesto medio nel comune di Piacenza è di ${mercato.zone.find((z) => z.id === 'piacenza')?.prezzoMq.media.toLocaleString('it-IT') || 'n/d'} €/mq, mentre la media provinciale è di ${prov.prezzoMq?.toLocaleString('it-IT')} €/mq. Piacenza resta il capoluogo più economico dell'Emilia-Romagna. I valori sono prezzi richiesti rilevati dagli annunci, non prezzi di compravendita.`,
    },
    {
      domanda: 'Il mercato immobiliare di Piacenza sta salendo?',
      risposta: `Nell'ultimo anno i prezzi richiesti sono cresciuti del ${pct(prov.variazioni?.annualePct, 1, false)} a livello provinciale, ma le zone non si muovono insieme: Gossolengo registra una crescita a doppia cifra mentre Vigolzone è in correzione. I volumi nazionali sono invece sostanzialmente fermi (+0,1% nel secondo trimestre 2026).`,
    },
    {
      domanda: 'Quanto tempo serve per vendere casa a Piacenza?',
      risposta: `Su un immobile correttamente prezzato, tre mesi sono un tempo ragionevole per Piacenza città; nelle zone di valle e di campagna i tempi si allungano perché la domanda è più sottile. Se dopo novanta giorni non sono arrivate proposte, il problema è quasi sempre il prezzo o la presentazione.`,
    },
  ];
  corpo += `<h2>Domande frequenti</h2>` + faq.map((f) => `<h3>${esc(f.domanda)}</h3><p>${esc(f.risposta)}</p>`).join('');

  const br = [
    { nome: 'Home', url: SITE + '/' },
    { nome: 'Mercato', url: SITE + '/mercato/' },
  ];
  const file = await scrivi(root, 'mercato/index.html', layout({
    titolo: 'Mercato immobiliare Piacenza 2026: prezzi, dati e andamento | Davide Scaglia',
    descrizione: 'Prezzi al mq per zona, compravendite OMI, tassi mutuo e andamento del mercato immobiliare a Piacenza e provincia. Dati aggiornati con fonti dichiarate.',
    url: SITE + '/mercato/',
    tipo: 'Dataset',
    dataModifica: oggi,
    contenuti: { hero, body: corpo },
    breadcrumb: br,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Mercato immobiliare Piacenza e provincia',
        description: 'Prezzi richiesti, variazioni e indicatori OMI per le zone di Piacenza, Gossolengo, Rivergaro, Vigolzone, Podenzano e Ponte dell\'Olio',
        url: SITE + '/mercato/',
        dateModified: oggi,
        inLanguage: 'it-IT',
        creator: { '@type': 'RealEstateAgent', name: 'Immobiliare Scaglia', url: SITE },
        variableMeasured: ['Prezzo richiesto al mq', 'Variazione annua', 'Affitto al mq', 'NTN', 'Tasso medio mutui'],
        spatialCoverage: { '@type': 'AdministrativeArea', name: 'Provincia di Piacenza' },
      },
      faqJsonLd(faq),
      breadcrumbLd(br),
    ],
  }));
  log('mercato: 1 pagina');
  return [file];
}

async function generaOsservatorioAi(root, { ai, log }) {
  if (!ai) return [];
  const hero = `<span class="eyebrow">Osservatorio</span>
<h1>Come le persone <em>chiedono all'AI</em> di vendere casa</h1>
<p class="lead">Una parte crescente delle ricerche immobiliari parte da una domanda a un assistente AI invece che da un motore di ricerca. Qui i dati su chi domina, chi cresce, e cosa significa per un'agenzia locale.</p>`;

  let corpo = `<h2>Quote di mercato degli assistenti AI</h2>
<p>Le quote variano molto a seconda del metodo di misurazione: StatCounter conta i referral verso i siti web, Similarweb le visite, Sensor Tower le app. Le tre letture sono riportate insieme proprio perché divergono, e la divergenza è essa stessa un'informazione.</p>
<table><thead><tr><th>AI</th><th>Fornitore</th><th class="num">Referral web</th><th class="num">Visite</th><th class="num">App</th><th>Tendenza</th></tr></thead><tbody>
${ai.quoteMercato
  .map(
    (q) => `<tr><td>${esc(q.ai)}</td><td>${esc(q.vendor)}</td>
<td class="num">${q.statcounterReferralPct != null ? pct(q.statcounterReferralPct, 2, false) : '—'}</td>
<td class="num">${q.similarwebVisitePct != null ? pct(q.similarwebVisitePct, 2, false) : '—'}</td>
<td class="num">${q.sensorTowerAppPct != null ? pct(q.sensorTowerAppPct, 1, false) : '—'}</td>
<td>${esc(q.tendenza)}</td></tr>`
  )
  .join('')}
</tbody></table>
<p class="fonte">Periodo di riferimento: ${esc(ai.quoteMercato[0]?.periodo || '')}.</p>`;

  for (const q of ai.quoteMercato) {
    if (q.nota) corpo += `<p><strong>${esc(q.ai)}.</strong> ${esc(q.nota)}</p>`;
  }

  if (ai.segnaliEmergenti?.length) {
    corpo += `<h2>I segnali da tenere d'occhio</h2>`;
    corpo += ai.segnaliEmergenti
      .map(
        (s) => `<div class="card"><h3>${esc(s.segnale)}</h3><p>${esc(s.dato)}</p><p><strong>Cosa significa per noi:</strong> ${esc(s.implicazione)}</p>${s.fonte ? `<p class="fonte"><a href="${esc(s.fonte)}" rel="nofollow noopener" target="_blank">fonte</a></p>` : ''}</div>`
      )
      .join('');
  }

  if (ai.strumentiAiSettore?.length) {
    corpo += `<h2>Strumenti AI nel settore immobiliare</h2>
<table><thead><tr><th>Strumento</th><th>Categoria</th><th>Cosa fa</th><th>Rilevanza in Italia</th></tr></thead><tbody>
${ai.strumentiAiSettore
  .map(
    (s) => `<tr><td>${esc(s.nome)}</td><td>${esc(s.categoria)}</td><td>${esc(s.uso)}</td><td>${esc(s.rilevanzaItalia)}</td></tr>`
  )
  .join('')}
</tbody></table>`;
  }

  if (ai.checklistOttimizzazioneAi?.length) {
    corpo += `<h2>Come si ottimizza un sito per essere letto dalle AI</h2>
<table><thead><tr><th>Azione</th><th>Stato</th><th>Nota</th></tr></thead><tbody>
${ai.checklistOttimizzazioneAi
  .map(
    (c) => `<tr><td>${esc(c.azione)}</td><td><span class="badge ${c.stato === 'fatto' ? 'ok' : c.stato === 'da-fare' ? 'critico' : 'attenzione'}">${esc(c.stato)}</span></td><td>${esc(c.nota || '')}</td></tr>`
  )
  .join('')}
</tbody></table>
<p>È la disciplina che StatCounter chiama <em>Generative Engine Optimization</em>: non basta più essere trovati da Google, bisogna essere scelti come fonte da ChatGPT, Gemini, Perplexity e Claude. I requisiti sono gli stessi di sempre — dati datati, fonti esplicite, risposte dirette — ma ora sono misurabili.</p>`;
  }

  const br = [
    { nome: 'Home', url: SITE + '/' },
    { nome: 'Osservatorio AI', url: SITE + '/osservatorio-ai/' },
  ];
  const file = await scrivi(root, 'osservatorio-ai/index.html', layout({
    titolo: 'Osservatorio AI per il settore immobiliare 2026 | Davide Scaglia',
    descrizione: 'Quote di mercato degli assistenti AI, segnali emergenti, strumenti AI per agenzie immobiliari e come ottimizzare un sito per la Generative Engine Optimization.',
    url: SITE + '/osservatorio-ai/',
    dataModifica: ai._meta.aggiornato,
    contenuti: { hero, body: corpo },
    breadcrumb: br,
    jsonLd: [breadcrumbLd(br)],
  }));
  log('osservatorio-ai: 1 pagina');
  return [file];
}

/** Pagina interna: analisi concorrenza. noindex, fuori dalla sitemap. */
async function generaConcorrenza(root, { concorrenza, annunci, log }) {
  if (!concorrenza) return [];
  const t = concorrenza.totali;
  const hero = `<span class="eyebrow">Strumento interno · non indicizzato</span>
<h1>Analisi <em>concorrenza</em></h1>
<p class="lead">${t.agenzieMonitorate} agenzie monitorate, ${t.annunciDichiaratiTotali} annunci dichiarati, ${t.agenzieMonitorate ? concorrenza.presidioZone.length : 0} zone analizzate. Pagina di lavoro: esclusa dall'indicizzazione.</p>`;

  let corpo = `<div class="grid c3">
<div class="kpi"><div class="k-l">Agenzie in provincia</div><div class="k-v">${concorrenza.densitaMercato.agenzieProvincia}</div><div class="k-s">${concorrenza.densitaMercato.agenzieComunePiacenza} nel comune di Piacenza</div></div>
<div class="kpi"><div class="k-l">Agenzie monitorate</div><div class="k-v">${t.agenzieMonitorate}</div><div class="k-s">${t.concorrentiDigitali} concorrenti digitali</div></div>
<div class="kpi"><div class="k-l">Annunci dichiarati</div><div class="k-v">${t.annunciDichiaratiTotali}</div><div class="k-s">somma dei volumi pubblici</div></div>
<div class="kpi"><div class="k-l">Zone scoperte</div><div class="k-v">${t.zoneScoperte}</div><div class="k-s">con 2 o meno agenzie presenti</div></div>
<div class="kpi"><div class="k-l">Annunci osservati</div><div class="k-v">${t.annunciOsservati}</div><div class="k-s">dal nostro archivio</div></div>
</div>`;

  corpo += `<blockquote>${esc(concorrenza.posizionamento.dichiarazione)}</blockquote>`;

  corpo += `<h2>Presidio per zona</h2><table><thead><tr><th>Zona</th><th class="num">Agenzie</th><th class="num">Annunci</th><th>Saturazione</th><th>Lettura</th></tr></thead><tbody>
${concorrenza.presidioZone
  .map(
    (p) => `<tr><td><strong>${esc(p.zona)}</strong><br><small>${p.agenzie.map(esc).join(', ') || 'nessuna'}</small></td>
<td class="num">${p.agenziePresenti}</td><td class="num">${p.annunciDichiarati}</td>
<td><span class="badge ${p.saturazione === 'alta' ? 'critico' : p.saturazione === 'bassa' || p.saturazione === 'assente' ? 'ok' : 'attenzione'}">${esc(p.saturazione)}</span></td>
<td>${esc(p.spazio)}</td></tr>`
  )
  .join('')}
</tbody></table>`;

  corpo += `<h2>Indicatori per agenzia</h2><table><thead><tr><th>Agenzia</th><th class="num">Annunci</th><th class="num">Qualità pubbl.</th><th>Zone</th><th>Debolezze osservate</th></tr></thead><tbody>
${concorrenza.indicatori
  .map(
    (a) => `<tr><td><strong>${esc(a.nome)}</strong><br><small>${esc(a.tipo)} · minaccia ${esc(a.minaccia)}</small></td>
<td class="num">${a.annunciDichiarati ?? '—'}</td>
<td class="num">${a.qualitaPubblicazionePct != null ? a.qualitaPubblicazionePct + '%' : '—'}</td>
<td>${(a.zone || []).map(esc).join(', ')}</td>
<td>${a.debolezze.map(esc).join('<br>')}</td></tr>`
  )
  .join('')}
</tbody></table>`;

  corpo += `<h2>Leve di posizionamento</h2><ul class="check">
${concorrenza.posizionamento.leve.map((l) => `<li><strong>${esc(l.leva)}</strong><br><small>${esc(l.evidenza)}</small></li>`).join('')}
</ul>`;

  corpo += `<h2>Concorrenti digitali</h2><table><thead><tr><th>Chi</th><th>Tipo</th><th>Perché contano</th><th>Contromisura</th></tr></thead><tbody>
${concorrenza.concorrentiDigitali
  .map((d) => `<tr><td><strong>${esc(d.nome)}</strong></td><td>${esc(d.tipo)}</td><td>${esc(d.percheContano)}</td><td>${esc(d.contromisura)}</td></tr>`)
  .join('')}
</tbody></table>`;

  if (annunci?.classificaStallo?.length) {
    corpo += `<h2>Annunci fermi: dal più vecchio al più recente</h2>
<p>Questa è la lista operativa. Un annuncio fermo da mesi non è un concorrente: è un proprietario deluso, cioè il miglior lead di acquisizione che esista.</p>
<table><thead><tr><th>Comune</th><th>Zona</th><th>Tipo</th><th class="num">Prezzo</th><th class="num">Giorni</th><th>Fascia</th><th>Agenzia</th></tr></thead><tbody>
${annunci.classificaStallo
  .slice(0, 40)
  .map(
    (a) => `<tr><td>${esc(a.comune)}</td><td>${esc(a.zona)}</td><td>${esc(a.tipo)}</td>
<td class="num">${a.prezzo ? a.prezzo.toLocaleString('it-IT') : '—'}</td>
<td class="num"><strong>${a.giorniInPubblicazione}</strong></td>
<td><span class="badge ${['bloccato', 'storico'].includes(a.fasciaAnzianita) ? 'critico' : a.fasciaAnzianita === 'fermo' ? 'attenzione' : ''}">${esc(a.fasciaAnzianita)}</span></td>
<td>${esc(a.agenzia || 'privato')}</td></tr>`
  )
  .join('')}
</tbody></table>`;

    corpo += `<h2>Distribuzione per anzianità</h2><table><thead><tr><th>Fascia</th><th class="num">Annunci</th><th class="num">%</th><th class="num">Prezzo medio</th><th>Azione</th></tr></thead><tbody>
${annunci.perFascia
  .map(
    (f) => `<tr><td>${esc(f.etichetta)}</td><td class="num">${f.conteggio}</td><td class="num">${f.pct}%</td><td class="num">${f.prezzoMedio ? f.prezzoMedio.toLocaleString('it-IT') : '—'}</td><td><small>${esc(f.azione)}</small></td></tr>`
  )
  .join('')}
</tbody></table>`;
  }

  if (!annunci?.classificaStallo?.length) {
    corpo += `<h2>Archivio annunci</h2>
<div class="card"><h3>L'archivio è vuoto</h3>
<p>L'analisi degli annunci funziona, ma non ci sono ancora annunci caricati. Si popola in tre modi:</p>
<ul class="check">
<li><strong>Rilievo manuale</strong> — aggiungi righe a <code>data/seeds/annunci-manuali.csv</code> con le colonne <code>comune, zona, tipo, prezzo, mq, dataPubblicazione, agenzia, sorgente, url, ape</code>. È il canale che funziona sempre, anche per Facebook Marketplace.</li>
<li><strong>Import dal CRM</strong> — salva l'export di immocrm in <code>data/seeds/crm-immocrm.json</code>: il CRM è la fonte primaria perché contiene le date reali di primo incarico.</li>
<li><strong>Adattatori automatici</strong> — le sorgenti consentite dal robots.txt vengono interrogate a ogni build.</li>
</ul>
<p>Le pagine di mercato, concorrenza e osservatorio AI sono già complete: non dipendono dall'archivio annunci.</p>
<p class="fonte">Per vedere la macchina lavorare su dati di esempio senza toccare la produzione: <code>node tools/build.mjs --demo</code></p>
</div>`;
  }

  if (annunci?.conformitaRobots?.length) {
    const consentite = annunci.conformitaRobots.filter((r) => r.consentito).length;
    corpo += `<h2>Conformità delle sorgenti (${consentite}/${annunci.conformitaRobots.length} consentite)</h2>
<p>Il sistema non raccoglie dati da chi lo ha vietato. Ogni richiesta passa da una verifica di robots.txt: se il percorso è bloccato, la richiesta non parte e la sorgente viene marcata per il rilievo manuale.</p>
<table><thead><tr><th>Sorgente</th><th>Categoria</th><th>Esito</th><th>Regola</th></tr></thead><tbody>
${annunci.conformitaRobots
  .map(
    (r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.categoria)}</td>
<td><span class="badge ${r.consentito ? 'ok' : 'critico'}">${r.consentito ? 'consentito' : 'non consentito'}</span></td>
<td><small>${esc(r.motivo)}</small></td></tr>`
  )
  .join('')}
</tbody></table>`;
  }

  const file = await scrivi(root, 'concorrenza/index.html', layout({
    titolo: 'Analisi concorrenza Piacenza — strumento interno',
    descrizione: 'Analisi interna della concorrenza immobiliare su Piacenza e zone servite.',
    url: SITE + '/concorrenza/',
    contenuti: { hero, body: corpo },
    extraHead: '<meta name="robots" content="noindex, nofollow">',
  }));
  log('concorrenza: 1 pagina (noindex)');
  return [file];
}

/** Pagina interna: calendario contenuti. noindex. */
async function generaContenuti(root, { contenutiIdx, social, log }) {
  if (!contenutiIdx) return [];
  const hero = `<span class="eyebrow">Strumento interno · non indicizzato</span>
<h1>Fabbrica <em>contenuti</em></h1>
<p class="lead">${contenutiIdx.pacchetti.length} argomenti trasformati in pacchetti pronti per ${contenutiIdx.piattaformeConfigurate} piattaforme, ciascuno nel formato esatto. Pagina di lavoro.</p>`;

  let corpo = `<div class="grid c3">
<div class="kpi"><div class="k-l">Pacchetti generati</div><div class="k-v">${contenutiIdx.pacchetti.length}</div><div class="k-s">uno per argomento</div></div>
<div class="kpi"><div class="k-l">Piattaforme coperte</div><div class="k-v">${contenutiIdx.piattaformeConfigurate}</div><div class="k-s">testo, immagine e video</div></div>
<div class="kpi"><div class="k-l">Entro i limiti</div><div class="k-v">${contenutiIdx.pacchetti.every((p) => p.entroLimiti) ? '100%' : 'parziale'}</div><div class="k-s">caratteri per piattaforma</div></div>
</div>`;

  corpo += `<h2>Pilastri editoriali</h2><table><thead><tr><th>Pilastro</th><th class="num">Quota</th><th>Descrizione</th></tr></thead><tbody>
${social.pilastriContenuto
  .map((p) => `<tr><td><strong>${esc(p.nome)}</strong></td><td class="num">${p.quotaPct}%</td><td>${esc(p.descrizione)}</td></tr>`)
  .join('')}
</tbody></table>`;

  corpo += `<h2>Formati per piattaforma</h2><table><thead><tr><th>Piattaforma</th><th>Formato</th><th class="num">Dimensioni</th><th class="num">Durata</th><th class="num">Limite testo</th><th class="num">Priorità</th></tr></thead><tbody>
${social.piattaforme
  .map(
    (p) => `<tr><td><strong>${esc(p.piattaforma)}</strong></td><td>${esc(p.formato)}</td>
<td class="num">${p.larghezza}×${p.altezza}<br><small>${esc(p.rapporto)}</small></td>
<td class="num">${p.durataTargetSec ? p.durataTargetSec + 's' : '—'}</td>
<td class="num">${(p.limiteCaratteriPost ?? p.limiteCaratteriCaption ?? p.limiteCaratteriOttimale ?? '—')}</td>
<td class="num">${p.priorita}</td></tr>`
  )
  .join('')}
</tbody></table>`;

  corpo += `<h2>Pacchetti pronti</h2>`;
  for (const p of contenutiIdx.pacchetti) {
    corpo += `<div class="card"><h3>${esc(p.titolo)}</h3>
<p class="fonte">${esc(p.tema)} · ${esc(p.zona)} · ${p.piattaforme} piattaforme · ${p.entroLimiti ? '✓ entro i limiti' : '⚠ fuori limite: ' + p.fuoriLimite.join(', ')}</p>
<p>File in <code>contenuti/${esc(p.dataOdierna)}/</code></p></div>`;
  }

  corpo += `<h2>Come si usa</h2><ul class="check">
<li>Esegui <code>npm run social</code> per rigenerare i pacchetti dai dati aggiornati.</li>
<li>Ogni cartella in <code>contenuti/</code> contiene un file di testo per piattaforma, la copertina SVG alle dimensioni esatte e i sottotitoli SRT per i video.</li>
<li>Il <code>README.md</code> della cartella riporta tutto in un'unica pagina, pronto da copiare.</li>
<li>Il master video 9:16 si gira una volta sola e si pubblica su ${social.piattaforme.filter((p) => p.accettaMaster9x16).map((p) => p.piattaforma).join(', ')}.</li>
<li>Ordine di pubblicazione: prima Facebook e Google Business Profile, che sono i canali di acquisizione dei venditori; poi Instagram e TikTok.</li>
</ul>`;

  const file = await scrivi(root, 'contenuti/index.html', layout({
    titolo: 'Calendario contenuti — strumento interno',
    descrizione: 'Generatore di contenuti social per piattaforma.',
    url: SITE + '/contenuti/',
    contenuti: { hero, body: corpo },
    extraHead: '<meta name="robots" content="noindex, nofollow">',
  }));
  log('contenuti: 1 pagina (noindex)');
  return [file];
}

/* ------------------------------------------------------------------ */
/* Pagine legali                                                        */
/* ------------------------------------------------------------------ */
async function generaLegali(root, { log }) {
  const pagine = [
    {
      file: 'privacy-policy.html',
      titolo: 'Privacy policy',
      hero: '<span class="eyebrow">Legale</span><h1>Privacy <em>policy</em></h1><p class="lead">Come trattiamo i dati di chi ci contatta. In modo semplice, perché una privacy policy incomprensibile non tutela nessuno.</p>',
      sezioni: [
        {
          titolo: 'Titolare del trattamento',
          paragrafi: [
            'Titolare del trattamento è Davide Scaglia — Immobiliare Scaglia, Via Cavallotti 3, 29029 Rivergaro (PC). Contatto per qualsiasi questione relativa ai dati personali: info@venderecasapiacenza.it.',
          ],
        },
        {
          titolo: 'Quali dati raccogliamo',
          liste: [
            {
              titolo: 'Dati raccolti',
              voci: [
                'Dati che ci fornisci direttamente quando ci contatti: nome, telefono, email, e le informazioni sull\'immobile che decidi di condividere',
                'Dati di navigazione tecnici: indirizzo IP, tipo di browser, pagine visitate, raccolti in forma aggregata',
                'Nessun dato sensibile viene richiesto attraverso questo sito'
              ]
            }
          ]
        },
        {
          titolo: 'Perché li trattiamo',
          liste: [
            {
              titolo: 'Finalità',
              voci: [
                'Rispondere alle richieste di contatto e di valutazione — base giuridica: esecuzione di misure precontrattuali',
                'Adempiere agli obblighi di legge in materia di mediazione immobiliare e antiriciclaggio — base giuridica: obbligo di legge',
                'Inviare aggiornamenti sul mercato a chi li ha richiesti — base giuridica: consenso, revocabile in ogni momento'
              ]
            }
          ]
        },
        {
          titolo: 'Quanto li conserviamo',
          paragrafi: [
            'I dati di contatto sono conservati per il tempo necessario a gestire la richiesta e, in caso di incarico, per i dieci anni previsti dalla normativa antiriciclaggio. I dati di navigazione in forma aggregata non sono riconducibili alla persona e non hanno un termine di conservazione individuale.',
          ],
        },
        {
          titolo: 'I tuoi diritti',
          paragrafi: [
            'Puoi chiedere in qualsiasi momento l\'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e l\'opposizione al trattamento. Puoi inoltre revocare un consenso già dato, senza che questo pregiudichi la liceità del trattamento precedente. Per esercitare i diritti scrivi a info@venderecasapiacenza.it.',
            'Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).',
          ],
        },
        {
          titolo: 'A chi comunichiamo i dati',
          paragrafi: [
            'I dati non sono venduti né ceduti a fini commerciali. Possono essere comunicati a professionisti necessari alla gestione dell\'incarico — notaio, geometra, certificatore energetico — solo con il tuo consenso o per obbligo di legge, e agli enti pubblici quando richiesto dalla normativa.',
          ],
        },
        {
          titolo: 'Trasferimenti fuori dall\'Unione Europea',
          paragrafi: [
            'Alcuni servizi di statistica e di carattere potrebbero comportare trasferimenti di dati al di fuori dell\'Unione Europea. Tali trasferimenti avvengono nel rispetto delle garanzie previste dal Regolamento UE 2016/679, incluse le clausole contrattuali standard.',
          ],
        },
      ],
    },
    {
      file: 'cookie-policy.html',
      titolo: 'Cookie policy',
      hero: '<span class="eyebrow">Legale</span><h1>Cookie <em>policy</em></h1><p class="lead">Questo sito è statico e non installa cookie di profilazione. Ecco comunque l\'elenco completo di ciò che passa dal tuo browser.</p>',
      sezioni: [
        {
          titolo: 'Cookie tecnici',
          paragrafi: [
            'Il sito non utilizza cookie propri di profilazione né cookie di tracciamento pubblicitario. Non è quindi richiesto un banner di consenso preventivo per la navigazione.',
          ],
        },
        {
          titolo: 'Servizi di terze parti',
          liste: [
            {
              titolo: 'Cosa può essere caricato',
              voci: [
                'Caratteri tipografici: se il sito carica font da un servizio esterno, il fornitore riceve l\'indirizzo IP del visitatore',
                'Video incorporati: i video pubblicati nelle pagine sono collegamenti verso la piattaforma ospitante; nessun contenuto viene caricato finché non li apri',
                'Statistica di accesso: il provider che ospita il sito registra log di accesso standard (IP, data, pagina richiesta) per motivi di sicurezza e di funzionamento'
              ]
            }
          ]
        },
        {
          titolo: 'Come controllare i cookie',
          paragrafi: [
            'Puoi configurare il tuo browser per bloccare o cancellare i cookie. Le istruzioni sono disponibili nella documentazione di ciascun browser. Il blocco dei cookie non impedisce la navigazione di questo sito, che non dipende da essi per funzionare.',
          ],
        },
      ],
    },
    {
      file: 'termini-condizioni.html',
      titolo: 'Termini e condizioni',
      hero: '<span class="eyebrow">Legale</span><h1>Termini e <em>condizioni</em></h1><p class="lead">Le regole d\'uso di questo sito e i limiti di ciò che pubblichiamo.</p>',
      sezioni: [
        {
          titolo: 'Oggetto',
          paragrafi: [
            'Questo sito ha finalità informative: descrive i servizi di mediazione immobiliare offerti da Davide Scaglia — Immobiliare Scaglia a Piacenza e nei comuni di Gossolengo, Rivergaro, Vigolzone, Podenzano e Ponte dell\'Olio, e pubblica analisi del mercato immobiliare locale.',
          ],
        },
        {
          titolo: 'Limiti delle informazioni pubblicate',
          paragrafi: [
            'I dati di mercato pubblicati — prezzi al metro quadro, variazioni, volumi di compravendite, tassi dei mutui — sono elaborazioni di fonti pubbliche e di dati di portali immobiliari, con fonte e data indicate in ogni pagina. Sono prezzi richiesti rilevati dagli annunci, non prezzi di compravendita registrati, e non costituiscono una valutazione immobiliare.',
            'La valutazione di un singolo immobile richiede sopralluogo, verifica della documentazione catastale ed edilizia, attestato di prestazione energetica e analisi di comparabili reali. Nessuna informazione presente su questo sito sostituisce quella attività.',
            'Le analisi e le interpretazioni pubblicate riflettono la situazione alla data indicata e non costituiscono previsioni né consulenza in materia di investimenti.',
          ],
        },
        {
          titolo: 'Proprietà intellettuale',
          paragrafi: [
            'I testi, le elaborazioni grafiche e le analisi pubblicati su questo sito sono di Immobiliare Scaglia. È consentita la citazione con indicazione della fonte e collegamento alla pagina originale. Non è consentita la riproduzione integrale a fini commerciali senza autorizzazione scritta.',
          ],
        },
        {
          titolo: 'Contatti dal sito',
          paragrafi: [
            'La richiesta di contatto o di valutazione attraverso questo sito non costituisce conferimento di incarico. L\'incarico di mediazione si perfeziona esclusivamente con la sottoscrizione di un accordo scritto fra le parti.',
          ],
        },
        {
          titolo: 'Legge applicabile',
          paragrafi: [
            'Per ogni controversia relativa all\'uso di questo sito si applica la legge italiana. Foro competente è quello di Piacenza, salvo i casi in cui la legge preveda un foro inderogabile a tutela del consumatore.',
          ],
        },
      ],
    },
  ];

  const scritte = [];
  for (const p of pagine) {
    const url = `${SITE}/${p.file}`;
    const corpo = p.sezioni.map((s) => renderSezione(s, {})).join('');
    scritte.push(
      await scrivi(root, p.file, layout({
        titolo: `${p.titolo} | Immobiliare Scaglia Piacenza`,
        descrizione: `${p.titolo} di venderecasapiacenza.it — Immobiliare Scaglia, Davide Scaglia, Piacenza.`,
        url,
        contenuti: { hero: p.hero, body: corpo },
        extraHead: '<meta name="robots" content="noindex, follow">',
        breadcrumb: [
          { nome: 'Home', url: SITE + '/' },
          { nome: p.titolo, url },
        ],
      }))
    );
  }
  log(`legali: ${scritte.length} pagine`);
  return scritte;
}

/* ------------------------------------------------------------------ */
export async function generaPagine({ root = process.cwd(), log = () => {} } = {}) {
  const contenuti = await leggi(root, 'tools/config/contenuti.json');
  const zone = await leggi(root, 'tools/config/zone.json');
  const ai = await leggi(root, 'tools/config/ai-osservatorio.json');
  const social = await leggi(root, 'tools/config/social.json');
  const mercato = await leggi(root, 'data/mercato.json');
  const annunci = await leggi(root, 'data/annunci.json');
  const concorrenza = await leggi(root, 'data/concorrenza.json');
  const contenutiIdx = await leggi(root, 'data/contenuti.json');

  const scritte = [];
  scritte.push(...(await generaGuide(root, { contenuti, log })));
  scritte.push(...(await generaBlog(root, { contenuti, log })));
  scritte.push(...(await generaZone(root, { zone, mercato, annunci, log })));
  scritte.push(...(await generaMercato(root, { mercato, annunci, log })));
  scritte.push(...(await generaOsservatorioAi(root, { ai, log })));
  scritte.push(...(await generaConcorrenza(root, { concorrenza, annunci, log })));
  scritte.push(...(await generaContenuti(root, { contenutiIdx, social, log })));
  scritte.push(...(await generaLegali(root, { log })));

  log(`totale pagine generate: ${scritte.length}`);
  return scritte;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generaPagine({ log: console.log }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
