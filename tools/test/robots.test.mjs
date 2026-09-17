import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, pathMatch, canFetch } from '../lib/robots.mjs';

const IDEALISTA = `
User-agent: *
Disallow: /*?ordine=pubblicazione-asc
Disallow: /*?ordine=pubblicazione-desc
Disallow: /search-list
Disallow: /utente/
Allow: /vendita-case/
Disallow: /
`;

const IMMOBILIARE = `
User-Agent: *
Disallow: /search-list
Disallow: /ricerca-mappa/
Disallow: /dettaglio.php
Allow: /news/wp-admin/admin-ajax.php
`;

test('pathMatch gestisce prefissi, wildcard e ancora finale', () => {
  assert.ok(pathMatch('/utente/', '/utente/123'));
  assert.ok(!pathMatch('/utente/', '/utenti/123'));
  assert.ok(pathMatch('/*?ordine=pubblicazione-asc', '/vendita-case/piacenza?ordine=pubblicazione-asc'));
  assert.ok(!pathMatch('/*?ordine=pubblicazione-asc', '/vendita-case/piacenza?ordine=area-asc'));
  assert.ok(pathMatch('/vendita-case/*', '/vendita-case/piacenza/'));
  assert.ok(pathMatch('/a$', '/a'));
  assert.ok(!pathMatch('/a$', '/ab'));
});

test('parseRobots riconosce il gruppo per user-agent specifico', () => {
  const regole = parseRobots('User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /privato/', 'Googlebot');
  assert.equal(regole.length, 1);
  assert.equal(regole[0].tipo, 'allow');
});

test('parseRobots usa il gruppo * quando il bot non è nominato', () => {
  const regole = parseRobots('User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /privato/', 'ImmobiliareScagliaBot');
  assert.equal(regole.some((r) => r.path === '/privato/'), true);
});

test('regola più lunga vince; a parità vince Allow', () => {
  const regole = parseRobots('User-agent: *\nDisallow: /blog/\nAllow: /blog/pubblico/', 'bot');
  const valuta = (p) => {
    let v = null;
    for (const r of regole) {
      if (!pathMatch(r.path, p)) continue;
      if (!v || r.path.length > v.path.length) v = r;
      else if (r.path.length === v.path.length && r.tipo === 'allow') v = r;
    }
    return v?.tipo;
  };
  assert.equal(valuta('/blog/segreto'), 'disallow');
  assert.equal(valuta('/blog/pubblico/'), 'allow');
});

test('il divieto di Idealista sull\'ordinamento per data viene rispettato', async () => {
  // Verifica la logica di valutazione sulla regola reale del sito
  const regole = parseRobots(IDEALISTA, 'ImmobiliareScagliaBot');
  const valuta = (urlPath) => {
    let v = null;
    for (const r of regole) {
      if (!pathMatch(r.path, urlPath)) continue;
      if (!v || r.path.length > v.path.length) v = r;
      else if (r.path.length === v.path.length && r.tipo === 'allow') v = r;
    }
    return v?.tipo;
  };
  assert.equal(valuta('/vendita-case/piacenza/?ordine=pubblicazione-desc'), 'disallow');
  assert.equal(valuta('/utente/profilo'), 'disallow');
});

test('canFetch restituisce un verdetto strutturato anche offline', async () => {
  const r = await canFetch('https://example.invalid/robots-test');
  assert.equal(typeof r.consentito, 'boolean');
  assert.ok(r.motivo.length > 0);
});
