import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizzaAnnuncio,
  analizzaAnnunci,
  deduplica,
  fasciaDi,
  etichettaFascia,
  impronta,
  normalizzaTipo,
  leadDaAnnunciFermi,
  toNumber,
  FASCE_ANZIANITA,
} from '../lib/annunci.mjs';

const OGGI = new Date('2026-09-17T00:00:00.000Z');

test('toNumber legge i prezzi nei formati italiani', () => {
  assert.equal(toNumber('1.250.000'), 1250000);
  assert.equal(toNumber('€ 189.000'), 189000);
  assert.equal(toNumber('1450,5'), 1450.5);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('n/d'), null);
});

test('normalizzaTipo raggruppa le varianti dei portali', () => {
  assert.equal(normalizzaTipo('Villa a schiera'), 'villa');
  assert.equal(normalizzaTipo('RUSTICO'), 'rustico');
  assert.equal(normalizzaTipo('Trilocale'), 'appartamento');
  assert.equal(normalizzaTipo('Casa indipendente'), 'casa indipendente');
  assert.equal(normalizzaTipo(''), 'non specificato');
});

test('giorni in pubblicazione calcolati dalla data al giorno corrente', () => {
  const a = normalizzaAnnuncio(
    { comune: 'Piacenza', prezzo: 189000, mq: 110, dataPubblicazione: '2021-03-14' },
    OGGI
  );
  // dal 2021-03-14 al 2026-09-17: 5 anni e 6 mesi
  assert.ok(a.giorniInPubblicazione > 2000, `atteso > 2000, ottenuto ${a.giorniInPubblicazione}`);
  assert.ok(a.giorniInPubblicazione < 2100);
  assert.equal(a.fasciaAnzianita, 'storico');
  assert.equal(a.prezzoMq, 1718);
});

test('le fasce coprono tutto lo spettro senza buchi', () => {
  for (const giorni of [0, 15, 30, 31, 90, 91, 180, 181, 365, 366, 730, 731, 3000]) {
    const f = fasciaDi(giorni);
    assert.ok(f, `nessuna fascia per ${giorni} giorni`);
    assert.notEqual(etichettaFascia(f), 'n/d');
  }
  assert.equal(fasciaDi(null), null);
});

test('le fasce sono contigue e ordinate', () => {
  for (let i = 1; i < FASCE_ANZIANITA.length; i++) {
    assert.equal(FASCE_ANZIANITA[i].min, FASCE_ANZIANITA[i - 1].max);
  }
  assert.equal(FASCE_ANZIANITA[FASCE_ANZIANITA.length - 1].max, null);
});

test('deduplica per impronta e conserva la data più vecchia', () => {
  const grezzo = { comune: 'Gossolengo', zona: 'Quarto', tipo: 'villa', prezzo: 420000, mq: 240 };
  const a = normalizzaAnnuncio({ ...grezzo, dataPubblicazione: '2024-01-01', sorgente: 'idealista' }, OGGI);
  const b = normalizzaAnnuncio({ ...grezzo, dataPubblicazione: '2022-04-05', sorgente: 'immobiliare' }, OGGI);
  assert.equal(a.impronta, b.impronta, 'stesso immobile deve avere la stessa impronta');
  const unici = deduplica([a, b]);
  assert.equal(unici.length, 1);
  assert.equal(unici[0].sorgente, 'immobiliare', 'deve vincere la data di pubblicazione più vecchia');
});

test('impronta distingue immobili diversi', () => {
  assert.notEqual(
    impronta({ comune: 'Piacenza', tipo: 'appartamento', prezzo: 100000, mq: 80 }),
    impronta({ comune: 'Piacenza', tipo: 'appartamento', prezzo: 100001, mq: 80 })
  );
});

test('analisi completa: la classifica di stallo va dal più vecchio al più recente', () => {
  const annunci = [
    { comune: 'Piacenza', tipo: 'appartamento', prezzo: 189000, mq: 110, dataPubblicazione: '2021-03-14' },
    { comune: 'Piacenza', tipo: 'appartamento', prezzo: 105000, mq: 60, dataPubblicazione: '2026-09-01' },
    { comune: 'Gossolengo', tipo: 'villa', prezzo: 420000, mq: 240, dataPubblicazione: '2022-04-05' },
    { comune: 'Vigolzone', tipo: 'appartamento', prezzo: 98000, mq: 90, dataPubblicazione: '2021-06-07' },
  ].map((a) => normalizzaAnnuncio(a, OGGI));

  const an = analizzaAnnunci(annunci, { oggi: OGGI });
  assert.equal(an.totali.annunci, 4);
  const giorni = an.classificaStallo.map((a) => a.giorniInPubblicazione);
  assert.deepEqual(giorni, [...giorni].sort((x, y) => y - x), 'ordinamento decrescente per anzianità');
  assert.equal(an.anzianita.oltreDueAnni, 3);
  assert.ok(an.anzianita.giorniMediani > 1000);
});

test('lead di acquisizione: solo annunci oltre la soglia, con angolo di attacco', () => {
  const annunci = [
    { comune: 'Piacenza', tipo: 'appartamento', prezzo: 189000, mq: 110, dataPubblicazione: '2021-03-14', ape: 'N/D' },
    { comune: 'Piacenza', tipo: 'appartamento', prezzo: 105000, mq: 60, dataPubblicazione: '2026-09-01' },
  ].map((a) => normalizzaAnnuncio(a, OGGI));
  const an = analizzaAnnunci(annunci, { oggi: OGGI });
  const lead = leadDaAnnunciFermi(an, { sogliaGiorni: 180 });
  assert.equal(lead.length, 1, 'solo l’annuncio vecchio è un lead');
  assert.ok(lead[0].anniFermi > 5);
  assert.ok(lead[0].angoloDiAttacco.length > 0);
  assert.ok(lead[0].angoloDiAttacco.some((m) => m.includes('APE')), 'segnala l’APE mancante');
});

test('sconto da listino calcolato dallo storico prezzi', () => {
  const a = normalizzaAnnuncio(
    { comune: 'Piacenza', prezzo: 150000, mq: 100, storicoPrezzi: [{ prezzo: 200000 }, { prezzo: 150000 }] },
    OGGI
  );
  assert.equal(a.scontoDaListinoPct, 25);
  assert.equal(a.tagliPrezzo, 1, 'due valori di storico = un taglio');
});
