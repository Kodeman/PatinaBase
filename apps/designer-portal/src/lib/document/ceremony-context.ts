/**
 * The Match Ceremony's assembled context line (R106 §2) and the send-gate
 * predicate — pure functions, no React, no data access, so the drifted-budget
 * (I62) and roomless (00314) cases unit-test in isolation.
 *
 * The context line sits above the composer: a one-line orientation of what the
 * request payload carries ("Elena scanned the living room · leans warm-minimal
 * · $15–50k"), assembled from the lead, its primary scan, and the style tags.
 * The words below it are the designer's own — this line orients, never templates.
 */

/** The subset of the lead row the context line reads. */
export interface CeremonyContextLead {
  firstName: string | null;
  /** leads.room_type, else leads.project_type — the room/project descriptor. */
  roomType: string | null;
  /** leads.budget_range — a canonical slug OR drifted free text (I62). */
  budgetRange: string | null;
}

/** The subset of the primary scan the context line reads (null = roomless). */
export interface CeremonyContextScan {
  roomType: string | null;
}

const WHO_FALLBACK = 'Your client';

/** Prettify a snake_case room/project type: "living_room" → "living room". */
function prettyRoom(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  return s.replace(/_/g, ' ').toLowerCase();
}

/**
 * The lead's budget for display. The canonical slugs (use-discovery.ts's
 * budgetRangeToCents) map to friendly bands; drifted free-text values (I62 —
 * 4 of 6 prod rows read "$25k–$40k" and the like) pass through verbatim;
 * empty/unknown yields null so the segment is dropped, never rendered blank.
 */
export function formatBudgetBand(range: string | null | undefined): string | null {
  const s = range?.trim();
  if (!s) return null;
  switch (s) {
    case 'under_5k':
      return 'under $5k';
    case '5k_15k':
      return '$5–15k';
    case '15k_50k':
      return '$15–50k';
    case '50k_100k':
      return '$50–100k';
    case 'over_100k':
      return '$100k+';
    default:
      return s; // free text ("$25k–$40k") — honor it as written
  }
}

/**
 * Assemble the ceremony context line from the request payload. Segments join
 * with " · "; any absent segment is dropped.
 *   - arrival: scanned vs. asked, with the room when known. Gender-neutral
 *     "the {room}" — the prototype's "her" only held because Elena is named;
 *     a real client's pronoun is unknown, so we don't assume one.
 *   - style: "leans {tag}" or "leans {a + b}" (first two tags); dropped when
 *     no tags survived.
 *   - budget: the friendly band; dropped when unknown.
 */
export function assembleContextLine(
  lead: CeremonyContextLead,
  scan: CeremonyContextScan | null,
  tags: string[],
): string {
  const who = lead.firstName?.trim() || WHO_FALLBACK;
  const room = prettyRoom(scan?.roomType) ?? prettyRoom(lead.roomType);

  const segments: string[] = [];

  // arrival
  if (scan) {
    segments.push(room ? `${who} scanned the ${room}` : `${who} shared a scan`);
  } else {
    segments.push(room ? `${who} asked about the ${room}` : `${who} asked for help`);
  }

  // style
  const cleanTags = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (cleanTags.length > 0) {
    segments.push(`leans ${cleanTags.slice(0, 2).join(' + ')}`);
  }

  // budget
  const band = formatBudgetBand(lead.budgetRange);
  if (band) segments.push(band);

  return segments.join(' · ');
}

/**
 * The send-gate (prototype scene 03): the threshold act stays asleep until the
 * designer has written something AND offered at least two times. Nothing sends
 * itself.
 */
export function isCeremonySendable(intro: string, slotCount: number): boolean {
  return intro.trim().length > 0 && slotCount >= 2;
}
