import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generaPacchetto, adattaTesto, srt, copertinaSvg, costruisciBattute, scegliHashtag } from '../lib/../social.mjs';

const config = JSON.parse(await readFile(new URL('../config/social.json', import.meta.url), 'utf8'));

const argomento = {
  titolo: 'Gossolengo: 1953 €/mq e il mercato in forte ascesa',
  hook: 'A Gossolengo i prezzi sono saliti del 16% in un anno.',
  corpo:
    'Il prezzo richiesto medio è 1953 €/mq, con una variazione annua del +16%. È il comune in più forte crescita della provincia. ' +
    'La domanda arriva da famiglie in uscita da Piacenza che cercano soluzioni indipendenti. ' +
    'Un numero da solo non dice quanto vale la tua casa: contano la via, lo stato, il piano e l\'APE.',
  tema: 'mercato',
  zona: 'Gossolengo',
  dato: '1953 €/mq, +16% annuo',
  fonte: 'Idealista e Immobiliare.it',
};

test('ogni piattaforma riceve il formato con le dimensioni esatte', () => {
  const p = generaPacchetto(argomento, config);
  assert.equal(p.piattaforme.length, config.piattaforme.length);

  const specs = Object.fromEntries(config.piattaforme.map((x) => [x.id, x]));
  for (const voce of p.piattaforme) {
    const atteso = specs[voce.id];
    assert.equal(voce.specifiche.larghezza, atteso.larghezza, `${voce.id}: larghezza`);
    assert.equal(voce.specifiche.altezza, atteso.altezza, `${voce.id}: altezza`);
    assert.equal(voce.specifiche.rapporto, atteso.rapporto, `${voce.id}: rapporto`);
  }

  const reels = p.piattaforme.find((x) => x.id === 'instagram-reels');
  assert.deepEqual([reels.specifiche.larghezza, reels.specifiche.altezza], [1080, 1920]);
  const fb = p.piattaforme.find((x) => x.id === 'facebook-feed');
  assert.deepEqual([fb.specifiche.larghezza, fb.specifiche.altezza], [1080, 1350]);
  const li = p.piattaforme.find((x) => x.id === 'linkedin');
  assert.deepEqual([li.specifiche.larghezza, li.specifiche.altezza], [1200, 627]);
});

test('tutti i testi restano entro i limiti della piattaforma', () => {
  const p = generaPacchetto(argomento, config);
  const fuori = p.piattaforme.filter((x) => !x.entroLimite);
  assert.deepEqual(fuori.map((x) => `${x.id}:${x.caratteri}/${x.limiteCaratteri}`), [], 'testi fuori limite');
});

test('X e Threads rispettano i limiti corti anche con argomento lungo', () => {
  const lungo = { ...argomento, corpo: 'x'.repeat(3000), titolo: 'y'.repeat(300) };
  const p = generaPacchetto(lungo, config);
  const x = p.piattaforme.find((v) => v.id === 'x');
  assert.ok(x.caratteri <= 280, `X: ${x.caratteri} caratteri`);
  const t = p.piattaforme.find((v) => v.id === 'threads');
  assert.ok(t.caratteri <= 500, `Threads: ${t.caratteri} caratteri`);
  const b = p.piattaforme.find((v) => v.id === 'bluesky');
  assert.ok(b.caratteri <= 300, `Bluesky: ${b.caratteri} caratteri`);
});

test('adattaTesto taglia su parola e non supera il limite', () => {
  const t = 'una frase abbastanzalunga per essere tagliata qui';
  assert.ok(adattaTesto(t, 20).length <= 20);
  assert.ok(adattaTesto(t, 20).endsWith('…'));
  assert.equal(adattaTesto('corta', 20), 'corta');
});

test('le piattaforme video ricevono script e sottotitoli, quelle immagine no', () => {
  const p = generaPacchetto(argomento, config);
  for (const voce of p.piattaforme) {
    if (voce.canale === 'video') {
      assert.ok(voce.asset.scriptVideo?.length > 0, `${voce.id}: manca lo script`);
      assert.ok(voce.asset.sottotitoli.endsWith('.srt'));
    } else {
      assert.equal(voce.asset.scriptVideo, undefined, `${voce.id} non è video`);
    }
  }
});

test('SRT: numerazione progressiva e tempi crescenti', () => {
  const battute = costruisciBattute({ hook: 'Hook breve.', corpo: 'Frase uno. Frase due.', cta: 'Scrivimi.' });
  const testo = srt(battute);
  const blocchi = testo.trim().split('\n\n');
  assert.equal(blocchi.length, battute.length);
  blocchi.forEach((b, i) => {
    const righe = b.split('\n');
    assert.equal(righe[0], String(i + 1));
    assert.match(righe[1], /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
  });
  for (let i = 1; i < battute.length; i++) {
    assert.ok(battute[i].da >= battute[i - 1].a, 'i tempi devono essere monotoni');
  }
});

test('SRT: l\'ultima battuta non supera la durata target del Reel', () => {
  const battute = costruisciBattute({ hook: 'Hook.', corpo: 'A. B. C.', cta: 'CTA.' });
  const fine = battute[battute.length - 1].a;
  const reels = config.piattaforme.find((p) => p.id === 'instagram-reels');
  assert.ok(fine <= reels.durataMaxSec, `${fine}s supera il max di ${reels.durataMaxSec}s`);
});

test('copertinaSvg produce le dimensioni esatte in pixel', () => {
  for (const p of config.piattaforme) {
    const svg = copertinaSvg({ larghezza: p.larghezza, altezza: p.altezza, titolo: 'Titolo di prova' });
    assert.ok(svg.includes(`width="${p.larghezza}" height="${p.altezza}"`), `${p.id}: dimensioni`);
    assert.ok(svg.startsWith('<svg'), `${p.id}: non è SVG`);
    assert.ok(!svg.includes('undefined'), `${p.id}: contiene "undefined"`);
  }
});

test('il master 9:16 copre le piattaforme dichiarate come riusabili', () => {
  const p = generaPacchetto(argomento, config);
  const dichiarate = config.piattaforme.filter((x) => x.accettaMaster9x16).map((x) => x.id);
  assert.deepEqual([...p.master.riuso].sort(), [...dichiarate].sort());
  assert.ok(dichiarate.length >= 5, 'almeno 5 piattaforme devono riusare lo stesso girato');
  for (const id of p.master.riuso) {
    const voce = p.piattaforme.find((x) => x.id === id);
    assert.ok(voce, `${id} manca nel pacchetto`);
    // il riuso vale per il video: la copertina del post può avere un rapporto diverso
    if (voce.canale === 'video') assert.equal(voce.specifiche.rapporto, '9:16', `${id} non è 9:16`);
  }
});

test('hashtag pertinenti al tema e nel numero configurato', () => {
  const h = scegliHashtag('zona', 8);
  assert.equal(h.length, 8);
  assert.ok(h.some((x) => /valtrebbia|valnure|rivergaro|gossolengo/i.test(x)));
  assert.ok(h.every((x) => x.startsWith('#') && !/\s/.test(x)));
});

test('i pacchetti sono ordinati per priorità di pubblicazione', () => {
  const p = generaPacchetto(argomento, config);
  const priorita = p.piattaforme.map((x) => x.priorita);
  assert.deepEqual(priorita, [...priorita].sort((a, b) => a - b));
  assert.equal(p.piattaforme[0].id, 'instagram-reels');
});

test('adattaTesto chiude su una frase completa quando è possibile', () => {
  const t = 'Prima frase completa. Seconda frase pure. Terza che sfora il limite imposto.';
  const tagliato = adattaTesto(t, 50);
  assert.ok(tagliato.length <= 50);
  assert.ok(tagliato.endsWith('.'), `atteso finale di frase, ottenuto: "${tagliato}"`);
});

test('nessun testo finisce a metà parola', () => {
  const p = generaPacchetto({ ...argomento, corpo: 'parola '.repeat(400) }, config);
  for (const v of p.piattaforme) {
    assert.ok(v.entroLimite, `${v.id} fuori limite`);
    assert.ok(!/\s[a-zàèéìòù]{1,3}$/.test(v.testo), `${v.id} finisce a metà parola: "${v.testo.slice(-25)}"`);
  }
});
