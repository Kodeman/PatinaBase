import type { BoardOwnerRef } from '@patina/types';
import { boardsRoutePath } from '@/lib/document/registry';

export type MoodBoardOpenSource =
  | 'drafting_strip'
  | 'desk_recents'
  | 'command_bar'
  | 'project_surface'
  | 'direct_url';

export interface RecentBoardCommandInput {
  id: string;
  name: string;
  ownerName: string;
  roomName: string | null;
}

const SAFE_RETURN_PATH = /^\/(?:desk(?:\/|$)|drafting\/[^/?#]+(?:\/|$)|doc\/[^/?#]+(?:\/|$))/;

/** Strict allow-list for the room's `from` parameter; never an open redirect. */
export function safeMoodBoardReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\')) return null;
    const url = new URL(value, 'https://patina.invalid');
    if (url.origin !== 'https://patina.invalid') return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return SAFE_RETURN_PATH.test(url.pathname) ? path : null;
  } catch {
    return null;
  }
}

export function boardRoomHref(input: {
  boardId: string;
  from?: string | null;
  source: Exclude<MoodBoardOpenSource, 'direct_url'>;
}): string {
  const query = new URLSearchParams({ source: input.source });
  const from = safeMoodBoardReturnPath(input.from);
  if (from) query.set('from', from);
  return `/board/${encodeURIComponent(input.boardId)}?${query.toString()}`;
}

export function recentBoardCommandDescriptor(
  board: RecentBoardCommandInput,
  from?: string | null,
) {
  return {
    key: `board:${board.id}`,
    label: `Board: ${board.name}`,
    sub: `${board.roomName ?? board.ownerName} · mood board`,
    match:
      `board moodboard mood board ${board.name} ${board.ownerName} ${board.roomName ?? ''}`
        .toLowerCase(),
    href: boardRoomHref({
      boardId: board.id,
      from,
      source: 'command_bar',
    }),
  };
}

export interface StartBoardCommandInput {
  projectId: string;
  projectName: string;
}

/**
 * D4' — ⌘K's creation front door, beside {@link recentBoardCommandDescriptor}
 * (same descriptor shape: key/label/sub/match/href, no component or event
 * concerns baked in). It always routes to the project's own Boards page
 * (`boardsRoutePath` — the address every width resolves to, and where the
 * "Start a board" act is now a persistent, unfolded control), never a board
 * room directly, since starting one has no id yet.
 */
export function startBoardCommandDescriptor(input: StartBoardCommandInput) {
  return {
    key: `start-board:${input.projectId}`,
    label: 'Start a board…',
    sub: `${input.projectName} · new mood board`,
    match:
      `start a board new board create board begin a board moodboard mood board ${input.projectName}`.toLowerCase(),
    href: boardsRoutePath(input.projectId),
  };
}

export function resolveMoodBoardReturnTarget(input: {
  explicitFrom?: string | null;
  referrer?: string | null;
  currentOrigin?: string | null;
  owner?: BoardOwnerRef | null;
}): string {
  const explicit = safeMoodBoardReturnPath(input.explicitFrom);
  if (explicit) return explicit;

  if (input.referrer && input.currentOrigin) {
    try {
      const referrer = new URL(input.referrer);
      if (referrer.origin === input.currentOrigin) {
        const safeReferrer = safeMoodBoardReturnPath(
          `${referrer.pathname}${referrer.search}${referrer.hash}`,
        );
        if (safeReferrer) return safeReferrer;
      }
    } catch {
      // An invalid referrer is equivalent to no referrer.
    }
  }

  if (input.owner?.kind === 'proposal') {
    return `/drafting/${encodeURIComponent(input.owner.id)}`;
  }
  if (input.owner?.kind === 'project') {
    return `/doc/${encodeURIComponent(input.owner.id)}`;
  }
  return '/desk';
}

export function moodBoardOpenSource(value: string | null | undefined): MoodBoardOpenSource {
  switch (value) {
    case 'drafting_strip':
    case 'desk_recents':
    case 'command_bar':
    case 'project_surface':
      return value;
    default:
      return 'direct_url';
  }
}

export interface MaterializedTemplateFlag {
  /** True exactly once per real materialize-then-redirect — the room's DV3 "Promote all" banner. */
  present: boolean;
  /**
   * The href to `router.replace` into history right after reading `present`
   * — the param is ALWAYS stripped when found (any value), so a refresh or
   * a bookmark of the resulting url never re-triggers the one-shot banner.
   * `null` when there was nothing to strip.
   */
  strippedHref: string | null;
}

/**
 * DV3 — reads the `materialized=template` query param BoardsBuilder appends
 * to its post-materialize redirect for a project owner. Pure so the
 * one-shot "read once, strip once" contract is unit-testable without
 * mounting the full board room: a second call against the already-stripped
 * search must report `present: false`.
 */
export function consumeMaterializedTemplateFlag(input: {
  pathname: string;
  search: string;
}): MaterializedTemplateFlag {
  const params = new URLSearchParams(input.search);
  if (!params.has('materialized')) {
    return { present: false, strippedHref: null };
  }
  const present = params.get('materialized') === 'template';
  params.delete('materialized');
  const query = params.toString();
  return {
    present,
    strippedHref: `${input.pathname}${query ? `?${query}` : ''}`,
  };
}
