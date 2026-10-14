// US-34 N10 — the loading register's mark on <html> (US-33 PQ2/PQ3, Q "Quiet paper" with arrival C).
// Set while `loading-register` is on (components/loading/register.tsx). arrival.css lifts the arr-pre
// veil under it, and the engine settles a gated arrival without its card: the skeleton IS the arrival.
export const LOADING_REGISTER_ATTR = 'data-loading-register'

export function loadingRegisterOn(doc: Document): boolean {
  return doc.documentElement.hasAttribute(LOADING_REGISTER_ATTR)
}
