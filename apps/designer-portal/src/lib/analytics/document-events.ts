/**
 * The Document — flip & week-one telemetry (R21), F1 command bar + wayfinding
 * instrumentation. These events are the instrument for the dissolve criterion,
 * the week-one watch, and (F1) whether ⌘K and the doorway grammar are actually
 * how people move:
 *   · zoneFlight        — a visit to an old zone after the flip, carrying
 *                         from-route + the last document in hand. Replaces
 *                         the twice-missed Q14: the flight triggers name
 *                         themselves as data. Ranks the dissolve backlog.
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
    const rest = readRecentDocumentsInHand().filter((entry) => entry.id !== engagementId);
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

function lastDocumentInHand(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_DOC_KEY);
  } catch {
    return null;
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
  zeroResult: (props: { query_length: number }) => track('document_command_bar_zero_result', props),

  /** A row was chosen — document, ledger, action, person, or the Engine. */
  selected: (props: { kind: string; key: string; position: number; query_length: number }) =>
    track('document_command_bar_selected', props),
};

/** F1 — the doorway grammar: doors, Rooms, help, margin notes, and Contents
 *  acts, keyed the same way across the drawer, ⌘K, and the Contents index. */
const wayfinding = {
  /** A doorway was opened — drawer ledger, ⌘K row, Contents entry, or a
   *  keyboard shortcut. */
  doorOpened: (props: { key: string; weight: DoorWeight; source: WayfindingSource }) =>
    track('document_wayfinding_door_opened', props),

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
  marginNote: (props: { key: string; action: 'shown' | 'dismissed' | 'acted' }) =>
    track('document_margin_note', props),

  /** An act taken from the Desk's Contents index (R95 — labels + doorways
   *  only; this event is the metric, not a badge on the index itself). */
  contentsActed: (props: { key: string; kind: string }) => track('document_desk_contents_acted', props),

  /** R97 — the Desk Walkthrough started, and from where. The package's
   *  help.tour.started carries no source, so this parallel event holds the
   *  attribution ('first_signin' auto-modal, 'command_bar' replay, or the
   *  existing-designer 'margin_note' offer) for the activation funnel. */
  walkthroughStarted: (props: { source: 'first_signin' | 'command_bar' | 'margin_note' }) =>
    track('document_walkthrough_started', props),
};

export const documentEvents = {
  /** An old-zone route visited after the flip (R21 flight telemetry). */
  zoneFlight: (fromRoute: string) =>
    track('document_zone_flight', {
      from_route: fromRoute,
      last_document_in_hand: lastDocumentInHand(),
    }),

  /** The Desk's composition on render — week-one noise + need-kind mix. */
  deskRendered: (props: {
    folder_count: number;
    chip_count: number;
    need_kinds: Record<string, number>;
  }) => track('document_desk_rendered', props),

  /** Log-strip engagement (R20/D10): logged or discarded, adjusted, idle. */
  logStripActed: (props: { action: 'log' | 'discard'; adjusted: boolean; had_idle: boolean }) =>
    track('document_log_strip_acted', props),

  /** Designer Handoff (Wave 1B) — a pool request claimed from the Desk's
   *  Open requests strip. Unprefixed (not `document_*`) per the task-level
   *  naming call — a new `design_request_*` family, not a Document-internal
   *  telemetry event. */
  designRequestClaimed: (props: {
    lead_id: string;
    project_type: string | null;
    scan_count: number;
  }) => track('design_request_claimed', props),

  commandBar,
  wayfinding,
};
