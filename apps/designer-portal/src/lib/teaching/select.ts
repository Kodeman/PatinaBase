/**
 * Return teaching selector (system-architecture §2).
 *
 * Pure: no React, no IO, and it writes nothing. The hooks write state when a
 * note is shown, closed, dismissed or acted on, using the helpers below.
 */
import {
  TEACHING_RELEASES,
  initialCursorFor,
  releaseSinceCursor,
  shippedOn,
} from '@/content/teaching-releases';
import {
  CHANGES_HREF,
  DAY_MS,
  DEFAULT_MAX_DISPLAYS,
  IGNORE_STREAK_QUIET,
  QUIET_DAYS,
  SINCE_LINE_GAP_MS,
  TEACHING_LABEL_WORD,
  TEACHING_SYSTEM_FLAG,
  UNSOLICITED_PER_7D,
  VISIT_GAP_MS,
} from './constants';
import type {
  SelectInputs,
  TeachingBindingsData,
  TeachingFeatureKey,
  TeachingFlags,
  TeachingNote,
  TeachingNoteSeen,
  TeachingNoteState,
  TeachingRelease,
  TeachingSlot,
  TeachingTrigger,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

/** Epoch ms of an ISO instant or date. NaN when absent, so every comparison with it is false. */
const at = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

const SLOT_TRIGGER: Record<TeachingSlot, TeachingTrigger> = {
  desk: 'return',
  anchor: 'anchor',
  act: 'act',
};

/** Fail closed: a loading flag counts as off. */
function flagOn(flags: TeachingFlags, name: string): boolean {
  const flag = flags[name];
  return flag?.value === true && !flag.isLoading;
}

const manifestOf = (x: SelectInputs): readonly TeachingRelease[] => x.manifest ?? TEACHING_RELEASES;

const isTerminal = (seen: TeachingNoteSeen | undefined): boolean => !!seen?.out;

/**
 * Terminal, or at `maxDisplays` closes (bounds a lost `out` write), or an act
 * sentence already shown once.
 */
function spent(n: TeachingNote, seen: TeachingNoteSeen | undefined): boolean {
  if (isTerminal(seen)) return true;
  if ((seen?.n ?? 0) >= (n.maxDisplays ?? DEFAULT_MAX_DISPLAYS)) return true;
  return n.trigger === 'act' && !!seen && (!!seen.first || !!seen.last || (seen.n ?? 0) > 0);
}

/** The person's cursor; before it is initialised, the first-load value §1.3 writes. */
function cursorOf(x: SelectInputs): string | null {
  const id = x.state.cursor?.lastSeenReleaseId;
  return id !== undefined ? id : initialCursorFor(x.signals.createdAt, manifestOf(x));
}

/** The note's own feature plus its release's features. */
function featuresOf(n: TeachingNote, manifest: readonly TeachingRelease[]): TeachingFeatureKey[] {
  const release = n.kind === 'release' ? manifest.find((r) => r.id === n.releaseId) : undefined;
  return [...(n.featureKey ? [n.featureKey] : []), ...(release?.featureKeys ?? [])];
}

/**
 * already_knew: the note's successSignal fired AFTER the release shipped
 * (release notes) or AFTER the note was published (all others). Derived on
 * every evaluation, never written.
 */
export function alreadyKnew(n: TeachingNote, x: SelectInputs): boolean {
  if (!n.successSignal) return false;
  const since = n.kind === 'release' ? at(shippedOn(n.releaseId, manifestOf(x))) : at(n.publishedAt);
  return at(x.signals.lastAt[n.successSignal]) > since;
}

/**
 * faster_way: she has used the feature, and its named boundary fired: on this
 * surface since it mounted (anchor slot), or during her last visit (Desk).
 */
export function fasterWayReady(
  n: TeachingNote,
  slot: TeachingSlot,
  surface: string,
  x: SelectInputs
): boolean {
  if (!n.featureKey || !x.signals.used[n.featureKey] || !n.boundary) return false;
  return slot === 'anchor'
    ? x.boundaries.firedOn(surface, n.boundary, x.surfaceMountedAt)
    : at(x.signals.lastAt[n.boundary]) > at(x.state.visit?.prevStartedAt);
}

/**
 * Lifecycle stages (§3 table, framing §2) the signals can see:
 * - first hour: no teaching note at all;
 * - first week: no faster way (no habit yet) and nothing about invoicing, Hours or seats;
 * - a never-used benefit only once the account is 60 days old;
 * - an owner capability only once she has invited a hand.
 */
function lifecycleAllows(n: TeachingNote, x: SelectInputs): boolean {
  const age = x.now - at(x.signals.createdAt);
  if (!(age >= HOUR_MS)) return false;
  if (age < 7 * DAY_MS) {
    if (n.kind === 'faster_way') return false;
    if (featuresOf(n, manifestOf(x)).some((k) => k === 'ledger' || k === 'hours' || k === 'seats')) {
      return false;
    }
  }
  if (n.kind === 'unused_benefit' && age < 60 * DAY_MS) return false;
  if (n.kind === 'owner_capability' && !x.signals.used.seats) return false;
  return true;
}

/**
 * In place is preferred: a Desk note defers when an anchor note teaches the
 * same release (or, for other kinds, the same kind and feature), can reach
 * her, and sits on a feature she has used.
 */
function hasAnchorTwin(n: TeachingNote, x: SelectInputs): boolean {
  const manifest = manifestOf(x);
  return x.notes.some(
    (m) =>
      m !== n &&
      m.trigger === 'anchor' &&
      m.kind === n.kind &&
      (n.kind === 'release'
        ? m.releaseId === n.releaseId
        : m.featureKey !== undefined && m.featureKey === n.featureKey) &&
      (m.audience === 'all' || m.audience === x.signals.role) &&
      (!m.flag || flagOn(x.flags, m.flag)) &&
      featuresOf(m, manifest).some((k) => x.signals.used[k])
  );
}

const TOKEN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills `{token}` bindings in the body and act. Values in the href are
 * URI-encoded. Null when any declared or used binding cannot resolve: a note
 * never prints a hole.
 */
export function resolveBindings(
  note: TeachingNote,
  data: TeachingBindingsData
): { body: string; act: { label: string; href: string } | null } | null {
  const valueFor = (token: string): string | null => {
    const source = note.bindings?.[token];
    const value = source ? data[source] : undefined;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  };
  if (Object.keys(note.bindings ?? {}).some((token) => valueFor(token) === null)) return null;

  let hole = false;
  const fill = (text: string, encode: boolean): string =>
    text.replace(TOKEN, (_match, token: string) => {
      const value = valueFor(token);
      if (value === null) {
        hole = true;
        return '';
      }
      return encode ? encodeURIComponent(value) : value;
    });

  const body = fill(note.body, false);
  const act = note.act
    ? { label: fill(note.act.label, false), href: fill(note.act.hrefTemplate, true) }
    : null;
  return hole ? null : { body, act };
}

/**
 * Ranking: notes bound to a pinned project first → never seen → oldest
 * last-seen → priority desc → manifest order → created (input) order.
 * "Bound to a pinned project" means the note binds `projectName` while she
 * has pinned jobs; the hook resolves that binding from a pinned project.
 */
export function byRank(x: SelectInputs): (a: TeachingNote, b: TeachingNote) => number {
  const seen = x.state.seen ?? {};
  const manifest = manifestOf(x);
  const pinnedBound = (n: TeachingNote): number =>
    x.pinnedProjectIds.length > 0 && Object.values(n.bindings ?? {}).includes('projectName') ? 1 : 0;
  const lastSeen = (n: TeachingNote): string | undefined =>
    seen[n.noteKey]?.last ?? seen[n.noteKey]?.first;
  const releaseOrder = (n: TeachingNote): number => {
    const i = n.kind === 'release' ? manifest.findIndex((r) => r.id === n.releaseId) : -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return (a, b) =>
    pinnedBound(b) - pinnedBound(a) ||
    Number(lastSeen(a) !== undefined) - Number(lastSeen(b) !== undefined) ||
    at(lastSeen(a)) - at(lastSeen(b)) ||
    b.priority - a.priority ||
    releaseOrder(a) - releaseOrder(b) ||
    x.notes.indexOf(a) - x.notes.indexOf(b);
}

/** §2: at most one note for the slot, or null. Rules run in the design's order. */
export function selectTeachingNote(
  slot: TeachingSlot,
  surface: string,
  x: SelectInputs
): TeachingNote | null {
  const t = x.state;
  if (!flagOn(x.flags, TEACHING_SYSTEM_FLAG)) return null; // system gate, fail closed
  if (t.quiet?.off || x.now < at(t.quiet?.until)) return null; // silences every slot, act included
  if (!x.atRest[slot]) return null; // per-surface at rest
  const exempt = slot === 'act'; // consequence sentence, workflow_changing releases only
  if (!exempt) {
    if (t.visit?.unsolicitedShown) return null; // one unsolicited note per visit, across all slots
    const recent = (t.recentUnsolicited ?? []).filter((ts) => x.now - at(ts) < 7 * DAY_MS);
    if (recent.length >= UNSOLICITED_PER_7D) return null; // 2 per rolling 7 days
  }

  const manifest = manifestOf(x);
  const cursor = cursorOf(x);
  const seen = t.seen ?? {};
  const candidates = x.notes.filter((n) => {
    const release = n.kind === 'release' ? x.releases.find((r) => r.id === n.releaseId) : undefined;
    return (
      n.trigger === SLOT_TRIGGER[slot] &&
      (slot === 'desk' || n.surfaceKey === surface) &&
      (n.audience === 'all' || n.audience === x.signals.role) &&
      (!n.flag || flagOn(x.flags, n.flag)) &&
      (!n.expiresAt || x.now < at(n.expiresAt)) &&
      !spent(n, seen[n.noteKey]) &&
      (!n.prerequisite || isTerminal(seen[n.prerequisite])) &&
      (n.kind !== 'release' || releaseSinceCursor(n.releaseId, cursor, manifest)) && // unknown cursor → head
      (n.kind !== 'release' || (release !== undefined && release.sizeClass !== 'minor')) && // published, never minor
      (!exempt || release?.sizeClass === 'workflow_changing') &&
      !alreadyKnew(n, x) &&
      (n.kind !== 'unused_benefit' ||
        (slot === 'anchor' && !!n.featureKey && !x.signals.used[n.featureKey])) &&
      (n.kind !== 'faster_way' || fasterWayReady(n, slot, surface, x)) &&
      (n.trigger !== 'anchor' ||
        (!!n.boundary && x.boundaries.firedOn(surface, n.boundary, x.surfaceMountedAt))) &&
      resolveBindings(n, x.bindings) !== null &&
      lifecycleAllows(n, x)
    );
  });
  const live = slot === 'desk' ? candidates.filter((n) => !hasAnchorTwin(n, x)) : candidates;
  return [...live].sort(byRank(x))[0] ?? null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Release notes: `WORKSHOP NOTE · 11 SEP` from the RELEASE date. Others: the word alone. */
export function labelFor(note: TeachingNote, manifest: readonly TeachingRelease[]): string {
  const date = note.kind === 'release' ? shippedOn(note.releaseId, manifest) : undefined;
  const parts = date ? /^\d{4}-(\d{2})-(\d{2})$/.exec(date) : null;
  const month = parts ? MONTHS[Number(parts[1]) - 1] : undefined;
  return parts && month ? `${TEACHING_LABEL_WORD} · ${Number(parts[2])} ${month}` : TEACHING_LABEL_WORD;
}

/**
 * A show that ended without × or the act: n + 1 and ignoredStreak + 1; at
 * `maxDisplays` the note retires; at the streak limit teaching goes quiet for
 * QUIET_DAYS and the streak resets. A terminal outcome is never changed.
 */
export function nextStateAfterClose(
  state: TeachingNoteState,
  noteKey: string,
  now: number,
  maxDisplays: number = DEFAULT_MAX_DISPLAYS
): TeachingNoteState {
  const prev = state.seen?.[noteKey] ?? {};
  const n = (prev.n ?? 0) + 1;
  const entry: TeachingNoteSeen = !prev.out && n >= maxDisplays ? { ...prev, n, out: 'retired_max' } : { ...prev, n };
  const streak = (state.ignoredStreak ?? 0) + 1;
  const quietNow = streak >= IGNORE_STREAK_QUIET;
  return {
    ...state,
    seen: { ...state.seen, [noteKey]: entry },
    ignoredStreak: quietNow ? 0 : streak,
    ...(quietNow
      ? { quiet: { ...state.quiet, until: new Date(now + QUIET_DAYS * DAY_MS).toISOString() } }
      : {}),
  };
}

/** A visit starts at the first Desk load after VISIT_GAP_MS with no Desk load and no tagged boundary. */
export function isNewVisit(state: TeachingNoteState, now: number): boolean {
  return !(now - at(state.visit?.lastActiveAt) < VISIT_GAP_MS);
}

const SIZE_RANK: Record<TeachingRelease['sizeClass'], number> = {
  minor: 0,
  useful: 1,
  workflow_changing: 2,
};

/**
 * The collapsed since-you-were-here line: only when the previous visit
 * started SINCE_LINE_GAP_MS or more ago; at most three non-minor releases
 * shipped since then, workflow-changing first, then newest.
 * `pinnedProjectIds` is the R-RT3 relevance input; a manifest release names
 * no project, so it cannot reorder releases from these inputs.
 */
export function sinceLineFor(
  state: TeachingNoteState,
  releases: readonly TeachingRelease[],
  pinnedProjectIds: string[],
  now: number
): { items: TeachingRelease[]; changesHref: typeof CHANGES_HREF } | null {
  const prev = at(state.visit?.prevStartedAt);
  if (!(now - prev >= SINCE_LINE_GAP_MS)) return null;
  const items = releases
    .filter((r) => r.sizeClass !== 'minor' && at(r.shippedOn) > prev)
    .sort(
      (a, b) =>
        SIZE_RANK[b.sizeClass] - SIZE_RANK[a.sizeClass] || releases.indexOf(b) - releases.indexOf(a)
    )
    .slice(0, 3);
  return items.length > 0 ? { items, changesHref: CHANGES_HREF } : null;
}
