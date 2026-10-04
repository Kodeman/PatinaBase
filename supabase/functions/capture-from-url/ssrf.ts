// Re-export shim: the SSRF-guarded fetch moved to _shared/product-page/
// (SQ-358) so board-deck-import-resolve can share it. Behaviour is unchanged.
export * from '../_shared/product-page/ssrf.ts';
