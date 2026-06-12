/**
 * Sidemark generator (W3-T3b).
 *
 * A sidemark is the short shipment marking vendors print on cartons so
 * receiving warehouses can route them — conventionally
 * `STUDIO-CLIENT-ROOM` (e.g. "MWS-WALKER-LR"). The generator produces a
 * sensible default from whatever context the Order Assistant has; the
 * designer can always edit the prefilled value before submit.
 *
 * Shape: `{STUDIO≤3}-{CLIENT-or-PROJECT≤8}-{ROOM≤3}`, uppercase,
 * non-alphanumerics stripped, empty segments omitted entirely (no dangling
 * separators). Pure + dependency-free so it unit-tests in isolation.
 */

export interface SidemarkParts {
  /** Studio / business name (e.g. "Middle West Studio" → "MWS"). */
  studioName?: string | null;
  /** Client surname/name — preferred middle segment when known. */
  clientName?: string | null;
  /** Project name — middle-segment fallback when no client name is in scope. */
  projectName?: string | null;
  /** Room name (e.g. "Living Room" → "LR"); omit when items span rooms. */
  roomName?: string | null;
}

/** Alphanumeric word runs of `input` ("Middle West Studio" → [Middle, West, Studio]). */
function words(input: string): string[] {
  return input.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/**
 * Short code for multi-word names: initials when there are 2+ words
 * ("Living Room" → "LR"), otherwise the first `max` characters of the
 * single word ("Foyer" → "FOY"). Always uppercase.
 */
function initialsOrPrefix(input: string | null | undefined, max: number): string {
  if (!input) return '';
  const ws = words(input);
  if (ws.length === 0) return '';
  if (ws.length >= 2) {
    return ws
      .slice(0, max)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return ws[0].slice(0, max).toUpperCase();
}

/** Compacted name: strip non-alphanumerics, uppercase, truncate to `max`. */
function compactName(input: string | null | undefined, max: number): string {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]+/g, '').slice(0, max).toUpperCase();
}

/**
 * Generate the default sidemark. Segments with no usable input are omitted;
 * an all-empty input yields '' (the field simply starts blank).
 */
export function generateSidemark(parts: SidemarkParts): string {
  const studio = initialsOrPrefix(parts.studioName, 3);
  // Client name wins; project name is the fallback middle segment (also
  // when the client name compacts to nothing, e.g. symbols-only input).
  const middle =
    compactName(parts.clientName, 8) || compactName(parts.projectName, 8);
  const room = initialsOrPrefix(parts.roomName, 3);
  return [studio, middle, room].filter(Boolean).join('-');
}
