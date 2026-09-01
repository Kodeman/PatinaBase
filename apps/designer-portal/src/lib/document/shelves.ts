/**
 * The shelves — the reference material a project accumulates that is not the
 * work itself. The paper holds what the studio is composing; the shelves hold
 * the artifacts it composes from.
 *
 * They are the ticket's rows now, not the spine's block — the project's four on
 * every document, and the proposal's one as the ticket's ninth row — so their
 * contents are reachable at EVERY width: from 1440px a shelf opens the leaf
 * beside the spine; below that it resolves to the page it already has
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

/** The id the open leaf answers to. It lived on the spine's shelves block
 *  until that block was deleted; the leaf outlived it, so the id lives with
 *  the registry that names the leaf rather than with any one caller. */
export const SHELF_LEAF_ID = 'doc-shelf-leaf';

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
    // The ticket's ninth row, not a shelf row — kept in the registry because
    // the leaf it opens is still resolved by key (`ShelfPanel`).
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
 * The client's copy is NOT among them any more. It is the ticket's ninth row
 * on a proposal document (B2), so it is offered by the ticket's derivation and
 * by nothing here; its definition stays only because the leaf it opens still
 * needs a title and an eyebrow. A proposal document therefore has no shelves
 * at all, which is why this returns an empty list for that subject.
 */
export function shelvesFor({
  subject = 'project',
  callSheetEnabled,
}: {
  /** What this document IS. A proposal has no plan room, no spec book, no
   *  boards and no roster — offering them would name four surfaces it does
   *  not have, which is the same lie the call-sheet stub would tell. */
  subject?: ShelfSubject;
  callSheetEnabled: boolean;
}): readonly ShelfDefinition[] {
  return ALL_SHELVES.filter(
    (s) =>
      s.subject === subject &&
      s.key !== 'clientcopy' &&
      (s.key !== 'callsheet' || callSheetEnabled),
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

/** D4' — ⌘K's "Start a board…" command routes to a project's Boards page
 *  (`boardsRoutePath`) before it can fire {@link NEW_BOARD_EVENT} into it —
 *  the event fires before that page's own listener exists on a fresh
 *  navigation, so this flag carries the intent across, mirroring
 *  `command-bar.tsx`'s `callSheetPending`.
 *
 *  Scoped to a project id rather than a bare boolean: an abandoned navigation
 *  (a superseded push, a fast back, an aborted RSC nav) would otherwise leave
 *  a boolean stuck true with no project attached, and the NEXT unrelated
 *  visit to ANY project's Boards page would silently auto-open the builder.
 *  The Boards page only honors this when its own project id matches, and
 *  clears it unconditionally once it knows its project id — a mismatch is
 *  cleared just as eagerly as a match, so the flag cannot leak past the next
 *  Boards page mounted, whichever project that page belongs to. */
export const startBoardPending: { projectId: string | null } = { projectId: null };
