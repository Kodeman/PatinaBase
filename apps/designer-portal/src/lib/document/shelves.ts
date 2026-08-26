/**
 * The shelves — the reference material a project accumulates that is not the
 * work itself. The paper holds what the studio is composing; the shelves hold
 * the artifacts it composes from.
 *
 * They are the ticket's rows now, not the spine's block, so their contents are
 * reachable at EVERY width: from 1440px a shelf opens the leaf beside the
 * spine; below that it resolves to the page it already has
 * (`shelfRouteFor`). The call sheet is a DOORWAY, not a leaf: the roster
 * already has a sheet of its own, and printing a second, thinner copy of it in
 * a leaf would be two answers to one question.
 */

export type ShelfKey =
  | 'planroom'
  | 'specbook'
  | 'moodboards'
  | 'callsheet'
  | 'clientcopy';

export type ShelfLeafKey = Exclude<ShelfKey, 'callsheet'>;

/** What a shelf belongs to. Four are the project's; the client's copy is the
 *  proposal's, and a document that has one never has the other. */
export type ShelfSubject = 'project' | 'proposal';

export interface ShelfDefinition {
  key: ShelfKey;
  title: string;
  eyebrow: string;
  kind: 'leaf' | 'doorway';
  subject: ShelfSubject;
  /** The page this shelf has of its own, under `/doc/{projectId}`. A shelf
   *  with no segment has no page, so it stays the ≥1440 leaf it already is:
   *  the call sheet is an overlay, and the client's copy is reached below 1440
   *  by the Preview act that has always carried it (Q7/A4). */
  routeSegment: string | null;
}

const ALL_SHELVES: readonly ShelfDefinition[] = [
  {
    key: 'planroom',
    title: 'Plan room',
    eyebrow: 'Plan room · Drawing set',
    kind: 'leaf',
    subject: 'project',
    routeSegment: 'plans',
  },
  {
    key: 'specbook',
    title: 'Spec book',
    eyebrow: 'Spec book · By room',
    kind: 'leaf',
    subject: 'project',
    routeSegment: 'spec-book',
  },
  {
    key: 'moodboards',
    // F62 — one name for one thing. The row, the leaf, the page and ⌘K all
    // read `Boards`; the key stays `moodboards` because it is an address.
    title: 'Boards',
    eyebrow: 'Boards · Shared & draft',
    kind: 'leaf',
    subject: 'project',
    routeSegment: 'boards',
  },
  {
    key: 'callsheet',
    title: 'Call sheet',
    eyebrow: 'Call sheet · The roster',
    kind: 'doorway',
    subject: 'project',
    routeSegment: null,
  },
  {
    key: 'clientcopy',
    title: 'The client’s copy',
    eyebrow: 'The client’s copy · Live',
    kind: 'leaf',
    subject: 'proposal',
    routeSegment: null,
  },
];

/**
 * The shelves this document actually has. The call sheet row is a doorway to
 * the roster sheet, and that sheet is flag-gated (`call-sheet`) — so with the
 * flag off the row is not rendered at all, exactly as every sibling doorway
 * behaves (⌘K, the letterhead instrument, the kickoff band). A disabled stub
 * would still name a surface this studio does not have.
 *
 * The client's copy is the Drafting Room's ≥1440 live rail, re-homed as a leaf
 * (Start to Signature W4a, amendment A3). It is the ONE shelf that belongs to a
 * proposal rather than a project, and it stands only where its subject does —
 * on the Finalize table, behind the `worktable` flag. Everywhere else the copy
 * is reached by the Preview act that has always carried it, so nothing is lost
 * below 1440 where no shelf exists at all (Q7/A4).
 */
export function shelvesFor({
  subject = 'project',
  callSheetEnabled,
  clientCopyEnabled = false,
}: {
  /** What this document IS. A proposal has no plan room, no spec book, no
   *  boards and no roster — offering them would name four surfaces it does
   *  not have, which is the same lie the call-sheet stub would tell. */
  subject?: ShelfSubject;
  callSheetEnabled: boolean;
  clientCopyEnabled?: boolean;
}): readonly ShelfDefinition[] {
  return ALL_SHELVES.filter(
    (s) =>
      s.subject === subject &&
      (s.key !== 'callsheet' || callSheetEnabled) &&
      (s.key !== 'clientcopy' || clientCopyEnabled),
  );
}

/**
 * Where a shelf goes when there is no room beside the spine for a leaf. Below
 * 1440px the row is a door to the shelf's own page, which returns to the
 * document by its full name (SP-14); above it the leaf still opens in place.
 * `null` means this shelf has no page — it stays a leaf, or an overlay.
 */
export function shelfRouteFor(
  key: ShelfKey,
  projectId: string,
): string | null {
  const segment = shelfDefinition(key).routeSegment;
  return segment ? `/doc/${projectId}/${segment}` : null;
}

export function shelfDefinition(key: ShelfKey): ShelfDefinition {
  const found = ALL_SHELVES.find((s) => s.key === key);
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
