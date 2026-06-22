/**
 * Family / household labels from a client name.
 *
 * Client names sometimes arrive as "Family — Project" (seed/title bleed —
 * document_state.client_name is the linked profile's full_name, which can equal
 * the project title). The old proposal-instruments helper naively pluralized the
 * LAST word, turning "Reyes — Garden Flat" into "the Flats". These take the
 * household part before a separator, then pluralize the surname properly.
 */

const GENERIC = new Set(['client', 'new', 'untitled', 'proposal']);

/** The household part of a client name — the bit before a "— Project" suffix. */
export function householdName(clientName: string): string {
  const head = (clientName ?? '').split(/\s+[—–]\s+| - |·|\|/)[0].trim();
  return head || (clientName ?? '').trim();
}

/**
 * "the Reyeses" for addressing the client family. Pluralizes the surname with
 * the -es rule for s/x/z/ch/sh endings ("Reyes" → "the Reyeses", not
 * "the Reyess"). Falls back to "the client" for generic/blank names.
 */
export function familyLabel(clientName: string): string {
  const parts = householdName(clientName).split(/\s+/);
  const surname = parts[parts.length - 1] ?? '';
  if (!surname || GENERIC.has(surname.toLowerCase())) return 'the client';
  const plural = /([sxz]|[cs]h)$/i.test(surname) ? `${surname}es` : `${surname}s`;
  return `the ${plural}`;
}
