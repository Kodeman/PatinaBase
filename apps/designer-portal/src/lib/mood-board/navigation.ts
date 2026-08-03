import type { BoardOwnerRef } from '@patina/types';

export type MoodBoardOpenSource =
  | 'drafting_strip'
  | 'desk_recents'
  | 'command_bar'
  | 'project_surface'
  | 'direct_url';

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
