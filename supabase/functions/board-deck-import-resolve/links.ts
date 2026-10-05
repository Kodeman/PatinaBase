// board-deck-import-resolve · link helpers (PURE).
//
// normalizeProductUrl must stay byte-compatible with the SQL
// public._board_deck_import_normalize_url (00683): T0a compares the two.
// Shared vectors: supabase/tests/deck_import/lookup_indexes.test.sql
// (links_test.ts runs them here).

/** Licence, attribution, stock-photo and search hosts are never products. */
const DENY_HOSTS = [
  'creativecommons.org',
  'unsplash.com',
  'pexels.com',
  'pixabay.com',
  'shutterstock.com',
  'gettyimages.com',
  'istockphoto.com',
  'stock.adobe.com',
  'freepik.com',
  'google.com',
  'bing.com',
  'pinterest.com',
  'instagram.com',
  'facebook.com',
  'youtube.com',
  'patina.cloud',
];

const TRACKING_PARAM = /^(utm_.*|ref|ref_|gclid|fbclid)$/i;

/** https + lowercase host without www., no fragment, no tracking params, no
 *  trailing slash (root stays "/"). Null for anything that is not http(s). */
export function normalizeProductUrl(raw: string): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return null;
  // URL drops the scheme's default port; :443 is also dropped from http,
  // because the key is written as https (so the key is a fixed point).
  const port = url.port && url.port !== '443' ? `:${url.port}` : '';
  const path = url.pathname === '/' || url.pathname === ''
    ? '/'
    : url.pathname.replace(/\/+$/, '') || '/';
  const kept = url.search.replace(/^\?/, '').split('&')
    .filter((param) => param !== '' && !TRACKING_PARAM.test(param.split('=')[0]));
  return `https://${host}${port}${path}${kept.length ? `?${kept.join('&')}` : ''}`;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** True when a link must never be read: not http(s), or a denied host. */
export function isDeniedLink(raw: string): boolean {
  const normalized = normalizeProductUrl(raw);
  if (!normalized) return true;
  const host = hostOf(normalized);
  if (!host) return true;
  return DENY_HOSTS.some((denied) => host === denied || host.endsWith(`.${denied}`));
}

const SLUG_STOP = new Set(['p', 'dp', 'product', 'products', 'item', 'items', 'shop', 'pd']);

function isIdToken(token: string): boolean {
  return /^\d+$/.test(token) || (/\d/.test(token) && /^[a-z0-9]+$/i.test(token) && token.length >= 3);
}

/** "/products/harmony-sofa-h3434/" → "Harmony sofa". Null when the path
 *  carries no words (an id-only path). */
export function nameFromSlug(url: string): string | null {
  let segments: string[];
  try {
    segments = new URL(url).pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    const words = segments[i]
      .replace(/\.(html?|aspx?|php)$/i, '')
      .split(/[-_+\s]+/)
      .filter((w) => w && !isIdToken(w) && !SLUG_STOP.has(w.toLowerCase()));
    if (words.length === 0) continue;
    const phrase = words.join(' ').toLowerCase().slice(0, 120).trim();
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }
  return null;
}
