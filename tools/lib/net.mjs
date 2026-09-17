/**
 * net.mjs — strato di rete minimale, senza dipendenze.
 *
 * Regole:
 *  - nessun fetch diretto: passare sempre da robots.mjs (canFetch)
 *  - retry con backoff, timeout, cache su disco, user-agent dichiarata
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const USER_AGENT =
  'ImmobiliareScagliaBot/1.0 (+https://venderecasapiacenza.it/bot.html) — analisi di mercato locale';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'http');

function cacheKey(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

export async function cacheGet(url, maxAgeMs = 6 * 3600 * 1000) {
  try {
    const file = path.join(CACHE_DIR, cacheKey(url) + '.json');
    const raw = await readFile(file, 'utf8');
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function cachePut(url, status, body, headers = {}) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, cacheKey(url) + '.json');
    await writeFile(
      file,
      JSON.stringify({ url, status, body, headers, ts: Date.now() }),
      'utf8'
    );
  } catch {
    /* la cache è un'ottimizzazione: se fallisce non bloccare */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetchHttp — GET con retry, timeout e cache.
 * @param {string} url
 * @param {object} [opt] { useCache, maxAgeMs, timeoutMs, tentativi, headers }
 * @returns {Promise<{url:string,status:number,body:string,headers:object,daCache:boolean}>}
 */
export async function fetchHttp(url, opt = {}) {
  const {
    useCache = true,
    maxAgeMs = 6 * 3600 * 1000,
    timeoutMs = 20000,
    tentativi = 3,
    headers = {},
  } = opt;

  if (useCache) {
    const cached = await cacheGet(url, maxAgeMs);
    if (cached) return { ...cached, daCache: true };
  }

  let lastErr;
  for (let i = 0; i < tentativi; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'it-IT,it;q=0.9,en;q=0.6',
          ...headers,
        },
      });
      clearTimeout(timer);
      const body = await res.text();
      const h = {};
      res.headers.forEach((v, k) => (h[k] = v));
      const entry = { url, status: res.status, body, headers: h };
      if (res.status < 400) await cachePut(url, res.status, body, h);
      return { ...entry, daCache: false };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (i < tentativi - 1) await sleep(600 * 2 ** i);
    }
  }
  throw new Error(`fetch fallito dopo ${tentativi} tentativi: ${url} — ${lastErr?.message}`);
}

/** Ritorna true se la risposta è utilizzabile. */
export function ok(res) {
  return res && res.status >= 200 && res.status < 300;
}
