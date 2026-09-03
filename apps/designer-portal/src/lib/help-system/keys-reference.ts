/**
 * "The keys" — the studio's whole shortcut system, in one place (onboarding
 * Wave 1, task L5; decision 8, proposal §7).
 *
 * ONE source, two doorways: the `?` sheet (KeysSheet) and the Help Center
 * article at `/help/article/the-keys` both render exactly this data, so the
 * two can never disagree.
 *
 * The "Rooms and books" rows are GENERATED from the Studio Surface Registry's
 * own `shortcut` field — never hand-typed — so re-chording a door in
 * registry.tsx re-prints this page rather than leaving it lying. Every other
 * section is copied once from the file that actually binds the key, named in
 * the comment above it; those bindings live inside component effects and have
 * no registry to read.
 *
 * Excluded on purpose: ⌘⇧F (Tester Notes) is internal and flag-gated, so it
 * has no place on a page a designer reads.
 */

import { ALL_STUDIO_SURFACES } from '../document/registry';

/** One taught key: what to press, what it does, and where it works. */
export interface KeysRow {
  /** Key caps, in press order. `⌘` is printed as-is; Ctrl is named in `where`. */
  keys: string[];
  label: string;
  /** The place the key applies — never a restatement of the label. */
  where: string;
}

export interface KeysSection {
  heading: string;
  rows: KeysRow[];
}

/** The Ideas & vocabulary shelf — "The words". The Help Center's topic route
 *  takes a full surface-key prefix, URL-encoded (help/page.tsx builds its
 *  shelf links the same way), so the short `/help/topic/concept` form would
 *  land on a shelf no topic claims. */
export const THE_WORDS_HREF = `/help/topic/${encodeURIComponent(
  'designer-portal/document/concept',
)}`;

/** The Help Center's home for this same reference. */
export const THE_KEYS_HREF = '/help/article/the-keys';

/**
 * The `?` sheet's help surface key. Deliberately an authoring-namespace key
 * (`guide/…`) rather than a DOCUMENT_SURFACE_KEYS constant: the `guide/`,
 * `concept/` and `how-to/` prefixes describe no single surface and are kept
 * out of the mirror on purpose (help-topics.ts). The panel's ancestor-prefix
 * match still resolves it.
 */
export const THE_KEYS_SURFACE_KEY = 'designer-portal/document/guide/the-keys';

/** The doorway chords, read straight off the registry (registry-shortcuts.tsx
 *  binds the very same field, so the page and the binding cannot drift). */
function doorwayRows(): KeysRow[] {
  return ALL_STUDIO_SURFACES.filter(
    (surface): surface is (typeof ALL_STUDIO_SURFACES)[number] & { shortcut: string[] } =>
      !!surface.shortcut && surface.shortcut.length === 2 && surface.shortcut[0] === 'g',
  ).map((surface) => ({
    keys: [surface.shortcut[0].toUpperCase(), surface.shortcut[1].toUpperCase()],
    label: surface.label,
    where: surface.weight === 'room' ? 'Anywhere — walks you in' : 'Anywhere — slides over your work',
  }));
}

export function buildKeysReference(): KeysSection[] {
  return [
    {
      heading: 'Anywhere',
      rows: [
        {
          keys: ['⌘', 'K'],
          label: 'Find anything',
          where: 'Ctrl K away from a Mac. Arrows move, Enter chooses.',
        },
        {
          keys: ['Esc'],
          label: 'Put it back',
          where: 'Closes the sheet, the palette, or the panel in front of you.',
        },
        {
          keys: ['?'],
          label: 'This page',
          where: 'Anywhere you are not typing, and nothing is open in front.',
        },
      ],
    },
    {
      heading: 'Rooms and books',
      rows: doorwayRows(),
    },
    {
      // Bound in six places, each an effect on its own composer; ⌘ or Ctrl,
      // both work. Sources: margin-rail.tsx, mobile/mobile-sheets.tsx,
      // coordination/open-item-sheet.tsx, mood-board/board-room-inspector.tsx,
      // mood-board/board-item-direction-panel.tsx, mood-board/board-room-shell.tsx.
      heading: 'While writing',
      rows: [
        { keys: ['⌘', 'Enter'], label: 'Save the note', where: 'The margin composer.' },
        { keys: ['⌘', 'Enter'], label: 'Save the note', where: 'The margin composer, on a phone.' },
        { keys: ['⌘', 'Enter'], label: 'Save the thread note', where: 'An open coordination item.' },
        { keys: ['⌘', 'Enter'], label: 'Save the item note', where: 'A board item, in the inspector.' },
        { keys: ['⌘', 'Enter'], label: 'Save the direction', where: 'A board item direction panel.' },
        { keys: ['⌘', 'Enter'], label: 'Save the board note', where: 'The board room note field.' },
      ],
    },
    {
      // Copied once from the binding site: board-room-controller.tsx,
      // handleKeyDown. ⌘ or Ctrl throughout; nothing fires while typing.
      heading: 'The Board Room',
      rows: [
        { keys: ['Esc'], label: 'Step back, then leave', where: 'Clears the menu, then the selection; leaving takes two presses.' },
        { keys: ['P'], label: 'Present the board', where: 'Edit mode. Esc returns you to editing.' },
        { keys: ['⌘', 'Z'], label: 'Undo', where: 'Editing. Add Shift to redo; Ctrl Y redoes too.' },
        { keys: ['⌘', 'D'], label: 'Duplicate', where: 'With something selected.' },
        { keys: ['⌘', 'C'], label: 'Copy', where: 'With something selected. ⌘X cuts, ⌘V pastes where you last pointed.' },
        { keys: ['⌘', 'L'], label: 'Lock or unlock', where: 'With something selected.' },
        { keys: ['⌘', ']'], label: 'Bring forward', where: 'Add Shift for the front. ⌘[ sends back.' },
        { keys: ['Delete'], label: 'Remove', where: 'With something selected. Backspace does the same.' },
        { keys: ['Shift', 'T'], label: 'Tidy the board', where: 'Editing. Lays the loose pieces back on a grid.' },
      ],
    },
    {
      // Bound at document level by the tour controller, and disabled while ⌘K
      // is open (packages/help-system TourController).
      heading: 'The walkthrough',
      rows: [
        { keys: ['Enter'], label: 'Next stop', where: 'While the walkthrough is running.' },
        { keys: ['Esc'], label: 'Skip for now', where: 'While the walkthrough is running.' },
      ],
    },
  ];
}
