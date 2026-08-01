/**
 * Family / household labels from a client name.
 *
 * A client display name is authored copy, not a surname-shaped data field.
 * Trying to split or pluralize it produced nonsense such as "the Audits" and
 * "the Reyeseses". Preserve deliberate display copy and only fall back when
 * the entire value is blank or a known placeholder.
 */

const GENERIC = new Set(['client', 'new', 'untitled', 'proposal']);

/** Trim/collapse whitespace while preserving the complete authored name. */
export function householdName(clientName: string): string {
  return (clientName ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Address the household with its authored display name. Falls back to a
 * neutral phrase only for generic/blank whole values.
 */
export function familyLabel(clientName: string): string {
  const displayName = householdName(clientName);
  if (!displayName || GENERIC.has(displayName.toLowerCase())) return 'the client';
  return displayName;
}
