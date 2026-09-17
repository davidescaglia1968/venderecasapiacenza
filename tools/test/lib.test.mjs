import { test } from 'node:test';
import assert from 'node:assert/strict';
import { media, mediana, percentile, fasce, raggruppa, variazionePct, arrotonda, ordinaPerConteggio } from '../lib/stat.mjs';
import { parseCsv, toCsv } from '../lib/csv.mjs';
import { parseFeed, parseJsonLd, appiattisciLd } from '../lib/xml.mjs';

test('mediana è robusta agli outlier, la media no', () => {
  const prezzi = [100000, 110000, 120000, 130000, 5000000];
  assert.equal(mediana(prezzi), 120000);
  assert.ok(media(prezzi) > 1000000);
});

test('mediana con cardinalità pari e dispari', () => {
  assert.equal(mediana([1, 2, 3]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), 0);
});

test('percentile lineare', () => {
  const v = [10, 20, 30, 40, 50];
  assert.equal(percentile(v, 0), 10);
  assert.equal(percentile(v, 50), 30);
  assert.equal(percentile(v, 100), 50);
  assert.equal(percentile(v, 25), 20);
});

test('fasce conta e calcola le percentuali', () => {
  const f = fasce([5, 50, 100, 400, 900], [
    { etichetta: 'a', min: 0, max: 60 },
    { etichetta: 'b', min: 60, max: 200 },
    { etichetta: 'c', min: 200, max: null },
  ]);
  assert.deepEqual(f.map((x) => x.conteggio), [2, 1, 2]);
  assert.equal(f[0].pct, 40);
  assert.equal(f[2].pct, 40);
});

test('raggruppa e ordinaPerConteggio', () => {
  const items = [
    { comune: 'Piacenza' }, { comune: 'Piacenza' }, { comune: 'Gossolengo' },
  ];
  const g = raggruppa(items, 'comune');
  assert.equal(g['Piacenza'], 2);
  assert.equal(g['Gossolengo'], 1);
  assert.equal(ordinaPerConteggio(g)[0].chiave, 'Piacenza');
});

test('variazionePct e arrotonda', () => {
  assert.equal(arrotonda(variazionePct(1000, 1080), 1), 8);
  assert.equal(arrotonda(variazionePct(1000, 860), 1), -14);
  assert.equal(variazionePct(0, 100), 0);
  assert.equal(arrotonda(1.005, 2), 1.01);
});

test('parseCsv gestisce virgolette, virgole interne e BOM', () => {
  const csv = '\uFEFFcomune,zona,note\nPiacenza,"Centro, nord","ha detto ""sì"""\nGossolengo,Quarto,\n';
  const righe = parseCsv(csv);
  assert.equal(righe.length, 2);
  assert.equal(righe[0].zona, 'Centro, nord');
  assert.equal(righe[0].note, 'ha detto "sì"');
  assert.equal(righe[1].note, '');
});

test('toCsv quotatura round-trip', () => {
  const dati = [{ a: 'x,y', b: 'con "virgolette"' }, { a: 'semplice', b: '' }];
  const csv = toCsv(dati);
  const riletti = parseCsv(csv);
  assert.deepEqual(riletti, dati);
});

test('parseFeed legge RSS 2.0', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Mercato immobiliare Piacenza - PiacenzaSera</title><link>https://esempio.it/1</link>
<description><![CDATA[Prezzi in crescita nel 2026]]></description>
<pubDate>Tue, 16 Sep 2026 08:00:00 GMT</pubDate><source>PiacenzaSera</source></item>
</channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].titolo, 'Mercato immobiliare Piacenza - PiacenzaSera');
  assert.equal(items[0].link, 'https://esempio.it/1');
  assert.equal(items[0].sorgente, 'PiacenzaSera');
  assert.ok(items[0].data.startsWith('2026-09-16'));
});

test('parseFeed legge Atom', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title type="html">Annuncio</title><link href="https://esempio.it/2" rel="alternate"/>
<summary>Testo</summary><published>2026-09-10T10:00:00Z</published></entry></feed>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://esempio.it/2');
});

test('parseJsonLd estrae anche i blocchi dentro @graph e ignora il JSON invalido', () => {
  const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"RealEstateAgent","name":"X"},{"@type":"Offer","price":150000,"offers":{"price":150000}}]}</script>
<script type="application/ld+json">{non valido}</script>
</head></html>`;
  const blocchi = parseJsonLd(html);
  assert.equal(blocchi.length, 1, 'il blocco invalido non deve interrompere');
  const tipi = appiattisciLd(blocchi).map((n) => n['@type']);
  assert.ok(tipi.includes('Offer'));
  assert.ok(tipi.includes('RealEstateAgent'));
});
