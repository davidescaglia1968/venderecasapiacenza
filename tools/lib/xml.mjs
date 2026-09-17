/**
 * xml.mjs — parser RSS 2.0 / Atom senza dipendenze.
 * Serve per il monitoraggio notizie (Google News RSS e feed delle testate).
 */

function decodifica(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodifica(m[1]) : '';
}

function attr(block, name, attrib) {
  const m = block.match(new RegExp(`<${name}[^>]*${attrib}="([^"]*)"`, 'i'));
  return m ? decodifica(m[1]) : '';
}

/** Estrae gli item da un feed RSS 2.0 o Atom. */
export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocchi = isAtom
    ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);

  return blocchi.map((b) => {
    const link = isAtom
      ? attr(b, 'link', 'href') || tag(b, 'link')
      : tag(b, 'link') || attr(b, 'link', 'href');
    const data = isAtom
      ? tag(b, 'published') || tag(b, 'updated')
      : tag(b, 'pubDate') || tag(b, 'dc:date');
    return {
      titolo: isAtom ? tag(b, 'title') : tag(b, 'title'),
      link,
      descrizione: (isAtom ? tag(b, 'summary') : tag(b, 'description'))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 400),
      sorgente: isAtom ? '' : tag(b, 'source'),
      data: data ? new Date(data).toISOString() : null,
    };
  });
}

/** Estrae i blocchi JSON-LD da una pagina HTML (per leggere gli annunci strutturati). */
export function parseJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* JSON-LD non valido: si ignora, non si interrompe */
    }
  }
  return out;
}

/** Appiattisce i JSON-LD (possono essere array o @graph). */
export function appiattisciLd(node) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    if (n['@type']) out.push(n);
    if (n['@graph']) walk(n['@graph']);
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(node);
  return out;
}

export { decodifica, tag as xmlTag };
