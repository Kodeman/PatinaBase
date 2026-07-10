/**
 * Help topics (help-desk Wave 0) — the browse shelves of the desk-native Help
 * Center. Each topic groups Sanity-authored articles by surface-key PREFIX,
 * so authoring new copy under an existing prefix lands on the right shelf
 * with no code change.
 *
 * Like document-surface-keys.ts, this is plain data with no dependency on the
 * @patina/help-system barrel (jest/ESM rationale documented there). The
 * `guide/`, `concept/`, and `how-to/` prefixes are authoring namespaces for
 * CMS-only articles — they have no live component surface, so they are
 * deliberately NOT in DOCUMENT_SURFACE_KEYS; the panel's ancestor-prefix
 * match never resolves to them.
 */

export interface HelpTopic {
  /** Shelf heading shown in the Help Center. */
  label: string;
  /** One-line description under the heading — desk voice, no jargon. */
  description: string;
  /** Surface-key prefixes whose articles file under this shelf. */
  prefixes: string[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    label: 'Getting started',
    description:
      'Your first hour with the Desk: what it is, and how a project moves from a lead to a signed proposal.',
    prefixes: ['designer-portal/document/guide'],
  },
  {
    label: 'The Desk & the Studio',
    description: 'The one screen you start from, and the index of every room, ledger, and way in.',
    prefixes: [
      'designer-portal/document/desk',
      'designer-portal/document/contents',
      'designer-portal/document/command-bar',
    ],
  },
  {
    label: 'Your documents',
    description:
      "A project is one document, brief through care — sections, stamps, the margin, and the client's copy.",
    prefixes: [
      'designer-portal/document/doc',
      'designer-portal/document/margin',
      'designer-portal/document/coordination',
    ],
  },
  {
    label: 'Rooms',
    description: 'The places you walk into: the Library, the People room, the Drafting Room, Composing.',
    prefixes: [
      'designer-portal/document/library',
      'designer-portal/document/people',
      'designer-portal/document/drafting',
      'designer-portal/document/compose',
    ],
  },
  {
    label: 'Ledgers & money',
    description: 'The books that slide over your work: Orders, Accounts, Hours, and The Post.',
    prefixes: [
      'designer-portal/document/orders',
      'designer-portal/document/accounts',
      'designer-portal/document/hours',
      'designer-portal/document/the-post',
    ],
  },
  {
    label: 'Ideas & vocabulary',
    description: 'The words Patina uses on purpose — stamps, courts, the margin, the Engine — and why.',
    prefixes: ['designer-portal/document/concept'],
  },
  {
    label: 'How do I…',
    description: 'Short answers to the everyday moves: send a proposal, chase an invoice, log a delivery.',
    prefixes: ['designer-portal/document/how-to'],
  },
  {
    label: 'For your clients',
    description: 'What your client sees in their portal, and how to help them read and respond.',
    prefixes: ['client-portal'],
  },
];

/**
 * The Help Center's front-page picks — authored articles pinned above the
 * shelves. Every key here resolves to a topic (pinned by the unit test).
 */
export const FEATURED_SURFACE_KEYS: string[] = [
  'designer-portal/document/guide/what-is-the-desk',
  'designer-portal/document/guide/sending-and-signing',
  'designer-portal/document/guide/invoices-and-getting-paid',
  'designer-portal/document/concept/the-margin',
  'designer-portal/document/concept/sharing-and-the-client-mirror',
];

/** True when `key` is `prefix` itself or a descendant (`prefix/…`) — a plain
 *  startsWith would let `…/doc` swallow `…/doctrine`. */
function underPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

/** Title-case a kebab/slash key remnant: 'orders/week' → 'Orders Week'. */
function humanize(remnant: string): string {
  const words = remnant.split(/[/-]/).filter(Boolean);
  if (words.length === 0) return 'Help';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * The shelf label for a surface key (or prefix). Longest matching topic
 * prefix wins; a key no topic claims is humanized — portal segment stripped,
 * segments split on `/` and `-`, title-cased — so a raw key NEVER surfaces
 * in the UI as-is.
 */
export function topicLabelFor(prefix: string): string {
  let best: { label: string; length: number } | null = null;
  for (const topic of HELP_TOPICS) {
    for (const p of topic.prefixes) {
      if (underPrefix(prefix, p) && (!best || p.length > best.length)) {
        best = { label: topic.label, length: p.length };
      }
    }
  }
  if (best) return best.label;

  // No shelf claims it — humanize. Drop the portal segment ('designer-portal/…',
  // 'client-portal/…'); if nothing is left, humanize the whole key.
  const rest = prefix.split('/').slice(1).join('/');
  return humanize(rest || prefix);
}
