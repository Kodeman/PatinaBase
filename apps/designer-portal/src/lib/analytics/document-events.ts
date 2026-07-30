/**
 * The Document — flip & week-one telemetry (R21), F1 command bar + wayfinding
 * instrumentation. These events are the instrument for the dissolve criterion,
 * the week-one watch, and (F1) whether ⌘K and the doorway grammar are actually
 * how people move:
 *   · deskRendered      — the Desk's composition on load (folder/chip counts
 *                         + need-line kinds), so the week-one watch can read
 *                         sent-unacknowledged frequency and overall noise.
 *   · logStripActed     — strip engagement (log vs discard, adjusted, idle).
 *   · commandBar.*      — ⌘K open/query/zero-result/selection (F1).
 *   · wayfinding.*      — doorways, Rooms, help, margin notes, and Contents
 *                         acts, so the doorway grammar's actual usage is
 *                         legible against the invariants it stands on
 *                         (D8 drawer, D14 sheet-vs-room, R95 Contents, R94
 *                         notes recede).
 *
 * No-ops when PostHog is not initialized (the track() guard).
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

const LAST_DOC_KEY = 'patina:last-document-in-hand';
const RECENT_DOCS_KEY = 'patina:recent-documents-in-hand';
const RECENT_DOCS_MAX = 5;

// R106 (the Arrival Arc) — the nudge/fresh-times chip states should fire once
// per ceremony per session, not once per render (a Desk re-sort or the 60s
// refetch would otherwise re-fire on every tick). Module-level Sets, the same
// "seen" shape as the rest of this file's session-scoped dedup.
const nudgeFiredSeen = new Set<string>();
const freshTimesRequestedSeen = new Set<string>();

/** One entry in the recent-documents-in-hand MRU (command bar). */
export interface RecentDocumentInHand {
  id: string;
  title: string;
  subtitle?: string;
}

/** Stash the held document so a later zone flight can name where they left,
 *  and — when a title is supplied — fold it into the recent-documents MRU
 *  the command bar reads (most-recent first, deduped by id, capped at 5). */
export function rememberDocumentInHand(
  engagementId: string | null,
  doc?: { title?: string | null; subtitle?: string | null },
) {
  if (typeof window === 'undefined') return;
  try {
    if (engagementId) window.localStorage.setItem(LAST_DOC_KEY, engagementId);
  } catch {
    /* private mode / storage disabled — telemetry is best-effort */
  }
  if (!engagementId || !doc?.title) return;
  try {
    const rest = readRecentDocumentsInHand().filter(
      (entry) => entry.id !== engagementId,
    );
    const entry: RecentDocumentInHand = { id: engagementId, title: doc.title };
    if (doc.subtitle) entry.subtitle = doc.subtitle;
    const next = [entry, ...rest].slice(0, RECENT_DOCS_MAX);
    window.localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(next));
  } catch {
    /* private mode / storage disabled — telemetry is best-effort */
  }
}

/** Read the recent-documents-in-hand MRU, most-recent first. SSR-safe. */
export function readRecentDocumentsInHand(): RecentDocumentInHand[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_DOCS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentDocumentInHand[]) : [];
  } catch {
    return [];
  }
}

/** Doorway/Room weight (D14): most books are sheets (pull, glance, put back);
 *  the Library and People are rooms (walk in). */
type DoorWeight = 'room' | 'sheet';

/** Where a doorway act originated. */
type WayfindingSource = 'drawer' | 'palette' | 'contents' | 'shortcut';

/** F1 — ⌘K command bar: opened, queried (debounced by the caller), zero
 *  result, and the row kind/position of what got picked. */
const commandBar = {
  /** The bar opened, via the hotkey or a click affordance ("Find anything"). */
  opened: (props: { source: 'hotkey' | 'affordance' }) =>
    track('document_command_bar_opened', props),

  /** A query was typed (caller debounces — this is not fired per keystroke). */
  queried: (props: { query_length: number; result_count: number }) =>
    track('document_command_bar_queried', props),

  /** A query matched nothing. */
  zeroResult: (props: { query_length: number }) =>
    track('document_command_bar_zero_result', props),

  /** A row was chosen — document, ledger, action, person, or the Engine. */
  selected: (props: {
    kind: string;
    key: string;
    position: number;
    query_length: number;
  }) => track('document_command_bar_selected', props),
};

/** F1 — the doorway grammar: doors, Rooms, help, margin notes, and Contents
 *  acts, keyed the same way across the drawer, ⌘K, and the Contents index. */
const wayfinding = {
  /** A doorway was opened — drawer ledger, ⌘K row, Contents entry, or a
   *  keyboard shortcut. */
  doorOpened: (props: {
    key: string;
    weight: DoorWeight;
    source: WayfindingSource;
  }) => track('document_wayfinding_door_opened', props),

  /** A Room (D14 room-weight door) was actually entered. */
  roomEntered: (props: { key: string; source: WayfindingSource }) =>
    track('document_wayfinding_room_entered', props),

  /** Help was opened for a surface, and from where — 'palette' (⌘K's Help…
   *  row) plus the help-desk Wave 1 `?` doorways. Mirrors HelpOpenSource in
   *  lib/help-system/open-help.ts (kept inline so analytics stays import-free
   *  of feature modules). */
  helpOpened: (props: {
    surface_key: string;
    source: 'palette' | 'sheet-head' | 'front-matter' | 'court-bar';
  }) => track('document_help_opened', props),

  /** A margin note's lifecycle (R94 — notes recede permanently on use). */
  marginNote: (props: {
    key: string;
    action: 'shown' | 'dismissed' | 'acted';
  }) => track('document_margin_note', props),

  /** An act taken from the Desk's Contents index (R95 — labels + doorways
   *  only; this event is the metric, not a badge on the index itself). */
  contentsActed: (props: { key: string; kind: string }) =>
    track('document_desk_contents_acted', props),

  /** R97 — the Desk Walkthrough started, and from where. The package's
   *  help.tour.started carries no source, so this parallel event holds the
   *  attribution ('first_signin' auto-modal, 'command_bar' replay, or the
   *  existing-designer 'margin_note' offer) for the activation funnel. */
  walkthroughStarted: (props: {
    source: 'first_signin' | 'command_bar' | 'margin_note';
  }) => track('document_walkthrough_started', props),
};

export const documentEvents = {
  actionShown: (props: {
    surface_key: string;
    region_key: string;
    action_key: string;
    variant: 'primary' | 'secondary' | 'tertiary' | 'danger';
    presentation: 'inline' | 'mobile_dock';
  }) => track('document_action_shown', props),

  actionSelected: (props: {
    surface_key: string;
    region_key: string;
    action_key: string;
    variant: 'primary' | 'secondary' | 'tertiary' | 'danger';
    presentation: 'inline' | 'mobile_dock';
  }) => track('document_action_selected', props),

  /** The Desk's composition on render — week-one noise + need-kind mix. */
  deskRendered: (props: {
    folder_count: number;
    chip_count: number;
    need_kinds: Record<string, number>;
  }) => track('document_desk_rendered', props),

  /** Arrival Arc Phase 0 (DECISIONS.md I64) — a document_state read came back
   *  with 0 rows right after a cached read that had folders/chips in it. The
   *  session-valid flag distinguishes a genuinely-just-went-quiet desk from
   *  the case useDeskEngagements already caught and threw on (no session) —
   *  this event only fires on the survives-the-guard path, so `session_valid`
   *  here is always true; it's carried anyway so this event's shape doesn't
   *  quietly change meaning if the guard's ordering ever moves. Unprefixed
   *  (not `document_*`) to match `design_request_claimed`'s precedent for a
   *  cross-cutting reliability signal, not a Document-internal UI event. */
  deskZeroRowRead: (props: {
    previous_folder_count: number;
    previous_chip_count: number;
    session_valid: boolean;
  }) => track('desk_zero_row_read', props),

  /** Log-strip engagement (R20/D10): logged or discarded, adjusted, idle. */
  logStripActed: (props: {
    action: 'log' | 'discard';
    adjusted: boolean;
    had_idle: boolean;
  }) => track('document_log_strip_acted', props),

  /** Designer Handoff (Wave 1B) — a pool request claimed from the Desk's
   *  Open requests strip. Unprefixed (not `document_*`) per the task-level
   *  naming call — a new `design_request_*` family, not a Document-internal
   *  telemetry event. */
  designRequestClaimed: (props: {
    lead_id: string;
    project_type: string | null;
    scan_count: number;
  }) => track('design_request_claimed', props),

  /** Arrival Arc (R106) — the Match Ceremony surface rendered for a lead.
   *  Unprefixed `ceremony_*` family, sibling to `design_request_*`. */
  ceremonyOpened: (props: {
    lead_id: string;
    has_scan: boolean;
    has_draft: boolean;
  }) => track('ceremony_opened', props),

  /** R106 §3 — the ceremony parked mid-write: the explicit "Put down for
   *  now", or route-leave with a dirty (autosaved) draft still open. */
  ceremonyPutDown: (props: {
    lead_id: string;
    via: 'put_down' | 'route_leave';
    intro_length: number;
    slot_count: number;
  }) => track('ceremony_put_down', props),

  /** R106 §7 — the threshold act completed. `time_to_complete_seconds` runs
   *  from the ceremony row's created_at (the accept) to the send;
   *  `slots_offered_count` is the offered-times block's final count. */
  ceremonyCompleted: (props: {
    lead_id: string;
    ceremony_id: string;
    designer_client_id: string;
    slots_offered_count: number;
    time_to_complete_seconds: number | null;
    has_credential_line: boolean;
    has_portfolio_url: boolean;
  }) => track('ceremony_completed', props),

  /** R106 §4 (the Arrival Arc) — the quiet-48h nudge chip actually rendered.
   *  Fires once per ceremony per session (first render only). Unprefixed
   *  (not `document_*`), matching the `design_request_claimed` precedent for
   *  a cross-cutting arc signal rather than a Document-internal UI event. */
  nudgeFired: (props: { ceremony_id: string; lead_id: string | null }) => {
    if (nudgeFiredSeen.has(props.ceremony_id)) return;
    nudgeFiredSeen.add(props.ceremony_id);
    track('nudge_fired', props);
  },

  /** R106 §4 — the stale-offered-slots chip actually rendered ("offered times
   *  went by · offer fresh ones"). Same once-per-ceremony-per-session dedup. */
  freshTimesRequested: (props: {
    ceremony_id: string;
    lead_id: string | null;
  }) => {
    if (freshTimesRequestedSeen.has(props.ceremony_id)) return;
    freshTimesRequestedSeen.add(props.ceremony_id);
    track('fresh_times_requested', props);
  },

  commandBar,
  wayfinding,
};
