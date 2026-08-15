/**
 * The shelves — the reference material a project accumulates that is not the
 * work itself. The paper holds what the studio is composing; the shelves hold
 * the artifacts it composes from.
 *
 * Four open as a leaf beside the spine. The call sheet is a DOORWAY, not a
 * leaf: the roster already has a sheet of its own, and printing a second,
 * thinner copy of it in a leaf would be two answers to one question.
 */

export type ShelfKey =
  | 'planroom'
  | 'specbook'
  | 'moodboards'
  | 'callsheet'
  | 'knowledge';

export type ShelfLeafKey = Exclude<ShelfKey, 'callsheet'>;

export interface ShelfDefinition {
  key: ShelfKey;
  title: string;
  eyebrow: string;
  kind: 'leaf' | 'doorway';
}

export const SHELVES: readonly ShelfDefinition[] = [
  {
    key: 'planroom',
    title: 'Plan room',
    eyebrow: 'Plan room · Drawing set',
    kind: 'leaf',
  },
  {
    key: 'specbook',
    title: 'Spec book',
    eyebrow: 'Spec book · By room',
    kind: 'leaf',
  },
  {
    key: 'moodboards',
    title: 'Mood boards',
    eyebrow: 'Mood boards · Shared & draft',
    kind: 'leaf',
  },
  {
    key: 'callsheet',
    title: 'Call sheet',
    eyebrow: 'Call sheet · The roster',
    kind: 'doorway',
  },
  {
    key: 'knowledge',
    title: 'Knowledge',
    eyebrow: 'Studio library · Cross-project',
    kind: 'leaf',
  },
];

export function shelfDefinition(key: ShelfKey): ShelfDefinition {
  const found = SHELVES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown shelf: ${key}`);
  return found;
}

export function isShelfLeafKey(key: ShelfKey): key is ShelfLeafKey {
  return key !== 'callsheet';
}

/**
 * A leaf asking to be put away, because what it is pointing at lives on the
 * paper behind it. The panel listens; the caller does not need to hold the
 * shelf state to send a reader back to the page.
 */
export const CLOSE_SHELF_EVENT = 'document:close-shelf';

export function requestShelfClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOSE_SHELF_EVENT));
}

/** The Add-to-project sheet's "Start a board" fires this at the mood-board
 *  shelf. The shelf may be closed — the page catches it, opens the shelf, and
 *  re-fires once the room inside is listening. */
export const NEW_BOARD_EVENT = 'document:new-project-board';
