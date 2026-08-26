/**
 * The Studio Surface Registry — R93/R95's single definition of every room,
 * ledger, and verb a designer can reach from inside a document. One entry,
 * one icon, per surface; the Studio Drawer (D8), the ⌘K command bar, and the
 * Desk's Contents page (R95) all read this list rather than keeping their
 * own — so a surface renamed or re-iconed here changes everywhere at once,
 * and the three surfaces can never quietly drift out of sync with each other.
 *
 * This file is DATA ONLY: no component imports, no event handlers, no
 * `window` access, no React. Aliases are deliberately generous — they're the
 * information scent for a designer arriving from Programa/Houzz vocabulary
 * (schedules, moodboards, POs, time, billing) who doesn't yet know Patina's
 * names for things.
 *
 * Canon: R93 (one registry, no parallel lists), R94 (notes recede — nothing
 * here is a tour or a badge count), R95 (Contents is labels + doorways only —
 * consumers must not derive counts/tiles/metrics from this data), R96 (a
 * sheet stays one page). D1/D4/D8 govern how consumers may render these
 * entries, not this file.
 */

import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Users,
  Scan,
  PenTool,
  Package,
  Receipt,
  Clock,
  Bell,
  ClipboardList,
  UserPlus,
  FolderPlus,
  PenLine,
  FileText,
  Hammer,
  Ruler,
} from 'lucide-react';

export type StudioSurfaceKind = 'room' | 'ledger' | 'verb';

export interface StudioSurface {
  key: string;
  kind: StudioSurfaceKind;
  label: string;
  subLabel?: string;
  /** Generous match terms folded into {@link matchSurfaces} — Programa/Houzz
   *  synonyms included on purpose so an arriving designer's vocabulary still
   *  resolves. */
  aliases: string[];
  icon: LucideIcon;
  /** D14 — 'room' surfaces are walked into (they put the held document down);
   *  'sheet' surfaces slide over whatever is in hand without disturbing it. */
  weight?: 'room' | 'sheet';
  /** Chord for a future "g then <key>" wayfinding shortcut, e.g. `['g','l']`. */
  shortcut?: string[];
  /** 'global' — reachable from anywhere; 'document' — only reachable with a
   *  document in hand (the Drafting Room needs a proposal to walk into). */
  scope: 'global' | 'document';
  /** Help doorway (help-desk Wave 0) — the help surface key this entry scopes
   *  the panel to, plus a one-line blurb consumers may show beside the label.
   *  Plain data only (this file's canon holds): keys mirror
   *  `SurfaceKeys.DesignerPortal.Document.*` in packages/help-system and are
   *  pinned by lib/help-system/surface-key-parity.test.ts. */
  help?: { surfaceKey: string; blurb: string };
}

/**
 * The three Rooms (D14/R39/R50/R107) — places you walk into — plus the
 * Drafting Room, which is room-weight but document-scoped: it only exists
 * once a proposal is in hand, so it never appears as a standalone doorway
 * from the Desk the way Library, People, and The Rooms do.
 *
 * Ground truth: these exact icons (BookOpen, Users, Scan) are what the
 * Studio Drawer already imports from lucide-react — do not substitute.
 */
export const STUDIO_ROOMS: StudioSurface[] = [
  {
    key: 'library',
    kind: 'room',
    label: 'Library',
    aliases: ['library', 'catalog', 'pieces', 'products', 'shelves'],
    icon: BookOpen,
    weight: 'room',
    shortcut: ['g', 'l'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/library',
      blurb: 'Three shelves and a librarian — every ask teaches your eye.',
    },
  },
  {
    key: 'people',
    kind: 'room',
    label: 'People',
    aliases: ['people', 'clients', 'contacts', 'vendors', 'makers', 'crm', 'directory'],
    icon: Users,
    weight: 'room',
    shortcut: ['g', 'p'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/people',
      blurb: 'Everyone the studio works with — clients, makers, trades, the field.',
    },
  },
  {
    key: 'rooms',
    kind: 'room',
    label: 'The Rooms',
    aliases: ['rooms', 'scans', 'room view'],
    icon: Scan,
    weight: 'room',
    shortcut: ['g', 'r'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/rooms',
      blurb: 'Every scanned room, redrawn in the studio\'s hand.',
    },
  },
  {
    key: 'drafting-room',
    kind: 'room',
    label: 'Drafting Room',
    subLabel: 'proposal in hand',
    aliases: ['drafting', 'proposal editor', 'boards', 'moodboards'],
    icon: PenTool,
    weight: 'room',
    scope: 'document',
    help: {
      surfaceKey: 'designer-portal/document/drafting',
      blurb: 'The proposal in hand — facets fill in any order.',
    },
  },
];

/**
 * The Ledgers (D14) — sheet-weight books that slide over whatever
 * document is in hand and slide back off without disturbing it. Four are
 * global (reachable from anywhere, via the Studio Drawer's own hard-coded
 * key list); the Call Sheet is the one document-scoped exception — a sheet
 * in weight, but it only has a project to describe once one is in hand, so
 * `scope: 'document'` keeps it out of every doorway that lists "reachable
 * from anywhere" (Desk Contents' Ledgers column, ⌘K's unfiltered "Rooms &
 * ledgers" group) exactly the way the Drafting Room (scope: 'document',
 * room-weight) is already kept out of the equivalent global-rooms lists.
 * Consumers must filter `scope === 'global'` before treating this array as
 * "every ledger" — see desk-contents.tsx and command-bar.tsx.
 *
 * Ground truth: Package, Receipt, Clock, Bell are the exact icons the Studio
 * Drawer already imports — do not substitute.
 */
export const STUDIO_LEDGERS: StudioSurface[] = [
  {
    key: 'orders',
    kind: 'ledger',
    label: 'Orders',
    aliases: [
      'orders',
      'procurement',
      'purchase orders',
      'po',
      'pos',
      'receiving',
      'shipping',
      'schedules',
    ],
    icon: Package,
    weight: 'sheet',
    shortcut: ['g', 'o'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/orders',
      blurb: 'Every purchase order, from drawn to delivered.',
    },
  },
  {
    key: 'accounts',
    kind: 'ledger',
    label: 'Accounts',
    aliases: [
      'accounts',
      'invoices',
      'invoicing',
      'billing',
      'bill',
      'money',
      'receivables',
      'earnings',
      'payments',
    ],
    icon: Receipt,
    weight: 'sheet',
    shortcut: ['g', 'a'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/accounts',
      blurb: 'Invoices drawn and paid, receivables, the studio\'s earnings.',
    },
  },
  {
    key: 'hours',
    kind: 'ledger',
    label: 'Hours',
    aliases: ['hours', 'time', 'time tracking', 'timesheet'],
    icon: Clock,
    weight: 'sheet',
    shortcut: ['g', 'h'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/hours',
      blurb: 'Time the studio logged — timer-caught and hand-entered.',
    },
  },
  {
    key: 'the-post',
    kind: 'ledger',
    label: 'The Post',
    aliases: ['post', 'inbox', 'notifications', 'messages', 'mail', 'letters'],
    icon: Bell,
    weight: 'sheet',
    shortcut: ['g', 't'],
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/the-post',
      blurb: 'Letters and the record — what arrived, what needs review.',
    },
  },
  {
    key: 'call-sheet',
    kind: 'ledger',
    label: 'Call sheet',
    subLabel: 'who is on the job',
    aliases: ['call sheet', 'roster', 'crew', 'team', 'parties', 'who'],
    icon: ClipboardList,
    weight: 'sheet',
    scope: 'document',
    help: {
      // Its own key — NOT `coordination` (that's court-bar.tsx's ball-in-court
      // help panel; reusing it would leak this blurb onto that panel too).
      surfaceKey: 'designer-portal/document/call-sheet',
      blurb: 'Everyone on the job, and how to reach them.',
    },
  },
];

/**
 * The Verbs — the front doors that start something new, rather than opening
 * something that already exists. Labels/subLabels match the wording already
 * live in the ⌘K action rows; this registry is the canonical source going
 * forward.
 */
export const STUDIO_VERBS: StudioSurface[] = [
  {
    key: 'capture-lead',
    kind: 'verb',
    label: 'Capture a lead',
    subLabel: 'begin a Brief',
    aliases: ['new lead', 'new client', 'capture', 'prospect', 'intake', 'brief'],
    icon: UserPlus,
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/desk',
      blurb: 'A name and a note — the Desk takes it from there.',
    },
  },
  {
    key: 'open-project',
    kind: 'verb',
    label: 'Open a project',
    subLabel: 'no proposal needed',
    aliases: ['new project', 'start project', 'create project', 'manual project'],
    icon: FolderPlus,
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/desk',
      blurb: 'Begin a project directly, no proposal needed.',
    },
  },
  {
    key: 'draft-proposal',
    kind: 'verb',
    label: 'Draft a design agreement',
    subLabel: 'for an existing household',
    aliases: [
      'proposal',
      'quote',
      'estimate',
      'new proposal',
      'propose',
      'agreement',
      'design agreement',
      'services agreement',
    ],
    icon: PenLine,
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/desk',
      blurb: 'Open the Drafting Room for an existing household — the services agreement, not a proposal.',
    },
  },
  {
    key: 'draw-invoice',
    kind: 'verb',
    label: 'Draw an invoice',
    subLabel: 'milestones · time · FF&E · ad-hoc',
    aliases: ['invoice', 'invoicing', 'bill', 'billing', 'new invoice'],
    icon: FileText,
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/desk',
      blurb: 'Milestones, time, pieces, or ad hoc — on one paper.',
    },
  },
  {
    key: 'add-maker',
    kind: 'verb',
    label: 'Add a maker',
    subLabel: 'a vendor on your roster',
    aliases: ['vendor', 'maker', 'supplier', 'trade', 'new vendor'],
    icon: Hammer,
    scope: 'global',
    help: {
      surfaceKey: 'designer-portal/document/desk',
      blurb: 'A maker on your roster — for quotes, POs, and the field.',
    },
  },
];

/** Every surface, in the order they're presented across consumers (rooms,
 *  then ledgers, then verbs). Consumers that need "all of it" — ⌘K's default
 *  list, the Desk Contents page — read this rather than concatenating the
 *  three arrays themselves. */
export const ALL_STUDIO_SURFACES: StudioSurface[] = [
  ...STUDIO_ROOMS,
  ...STUDIO_LEDGERS,
  ...STUDIO_VERBS,
];

/**
 * SP-16/F50 — the plan room. It is a route, not a drawer sheet
 * (command-bar.tsx builds its own "This surface" row for it, pre-addressed
 * with the in-hand engagement's id), so it deliberately stays out of
 * `ALL_STUDIO_SURFACES`: that list's every entry is required to carry a help
 * doorway (surface-key-parity.test.ts) and feeds the Desk Contents / Studio
 * Drawer doorway lists this surface has no place in. `matchSurfaces()` below
 * still folds it into the typed-query table so a typed `plan`/`floor plan`
 * resolves the same surface the empty-query branch already offers — closing
 * the registry gap without opening a second door.
 */
const PLAN_ROOM_SURFACE: StudioSurface = {
  key: 'plan-room',
  kind: 'room',
  label: 'The plan room',
  subLabel: 'this project · the current set',
  aliases: ['plan', 'plan room', 'floor plan', 'plans', 'drawings'],
  icon: Ruler,
  weight: 'room',
  scope: 'document',
};

/**
 * Case-insensitive prefix/substring match over a surface's label and
 * aliases. Empty/whitespace-only queries match nothing (callers show the
 * unfiltered list themselves rather than treating "everything" as a match).
 */
export function matchSurfaces(query: string): StudioSurface[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [...ALL_STUDIO_SURFACES, PLAN_ROOM_SURFACE].filter((surface) => {
    if (surface.label.toLowerCase().includes(q)) return true;
    return surface.aliases.some((alias) => alias.toLowerCase().includes(q));
  });
}
