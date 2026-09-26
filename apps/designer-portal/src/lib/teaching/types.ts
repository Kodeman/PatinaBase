/**
 * Return teaching (Workshop Notes) types for the portal's pure core.
 * See artifacts/return-teaching-2026-09-25/design/system-architecture.md §1–§5.
 */

// ─── Wire types ───────────────────────────────────────────────────────────────
// TODO(US-13): replace with @patina/help-system export. SQ-279 adds these to
// packages/help-system in the same wave; until it lands they are structural
// copies. Two known differences to settle at the swap: the package's
// `TeachingRelease` is the Sanity `teachingRelease` doc (it carries `headline`
// and a mutable `featureKeys`), while the bundled manifest below needs
// `readonly featureKeys` and an optional `flag` to satisfy `as const`.

export type TeachingKind =
  | 'release'
  | 'unused_benefit'
  | 'faster_way'
  | 'owner_capability'
  | 'client_promise';

export type TeachingAudience = 'owner' | 'hand' | 'all';

export type TeachingTrigger = 'return' | 'anchor' | 'act' | 'pull_only';

export type TeachingFeatureKey =
  | 'galley'
  | 'ledger'
  | 'hours'
  | 'people'
  | 'field_capture'
  | 'client_page'
  | 'purchase_orders'
  | 'seats';

export type TeachingBoundaryKey =
  | 'invoice_sent'
  | 'time_logged'
  | 'part_saved'
  | 'invite_sent'
  | 'client_page_sent';

export type TeachingSizeClass = 'minor' | 'useful' | 'workflow_changing';

export type TeachingBindingSource = 'projectName' | 'personName' | 'invoiceNumber' | 'invoiceId';

/** A Sanity `teachingNote` document (§1.1). */
export interface TeachingNote {
  /** Versioned key, e.g. `galley-po@1`. */
  noteKey: string;
  kind: TeachingKind;
  audience: TeachingAudience;
  trigger: TeachingTrigger;
  /** Slash form, e.g. `designer-portal/document/accounts`. */
  surfaceKey: string;
  anchor?: string;
  /** Required when kind = `release`; matches a manifest entry. */
  releaseId?: string;
  /** PostHog flag; loading or off makes the note ineligible. */
  flag?: string;
  featureKey?: TeachingFeatureKey;
  /** Required for `anchor` and `faster_way` notes. */
  boundary?: TeachingBoundaryKey;
  /** One sentence, ≤140 chars; may carry `{token}` bindings. */
  body: string;
  act?: { label: string; hrefTemplate: string };
  /** token → source. */
  bindings?: Record<string, TeachingBindingSource>;
  /** Key in `teaching_signals().lastAt` that decides `already_knew`. */
  successSignal?: string;
  successEvent?: string;
  /** 1–5, tie-break only. */
  priority: number;
  publishedAt?: string;
  expiresAt?: string;
  recedeOn: string[];
  maxDisplays: number;
  prerequisite?: string;
  supersedes?: string;
  learnMore?: { slug?: string; _ref?: string };
  provenance: 'agent' | 'leah';
}

/** One entry of the bundled release manifest (§1.2). */
export interface TeachingRelease {
  /** `YYYY-MM-DD-slug`. */
  id: string;
  /** `YYYY-MM-DD`. */
  shippedOn: string;
  sizeClass: TeachingSizeClass;
  featureKeys: readonly TeachingFeatureKey[];
  flag?: string;
}

export type TeachingNoteOutcome = 'acted' | 'dismissed' | 'retired_max' | 'superseded';

export interface TeachingNoteSeen {
  n?: number;
  first?: string;
  last?: string;
  /** `null` (or absent) while the note is still live. */
  out?: TeachingNoteOutcome | null;
}

/** `teaching_note_state.state`, schema v1 (§1.3). Instants are ISO strings. */
export interface TeachingNoteState {
  v: 1;
  cursor?: { lastSeenReleaseId?: string | null };
  visit?: {
    startedAt?: string;
    prevStartedAt?: string;
    lastActiveAt?: string;
    unsolicitedShown?: string | null;
  };
  recentUnsolicited?: string[];
  ignoredStreak?: number;
  quiet?: { off?: boolean; until?: string | null };
  seen?: Record<string, TeachingNoteSeen>;
}

// ─── Selector inputs ──────────────────────────────────────────────────────────

export type TeachingSlot = 'desk' | 'anchor' | 'act';

/** `teaching_signals()` (00673). Instants are ISO strings or null. */
export interface TeachingSignals {
  role: 'owner' | 'hand';
  used: Record<TeachingFeatureKey, boolean>;
  /** Boundary keys and successSignal keys → latest instant. */
  lastAt: Record<string, string | null>;
  createdAt: string;
}

/** Mirrors `FeatureFlagState` in hooks/use-feature-flag.ts. */
export type TeachingFlags = Record<string, { value: boolean; isLoading: boolean }>;

export interface BoundaryLog {
  /**
   * True when `boundary` fired on `surface` this session. With `since`
   * (epoch ms), only a boundary at or after that instant counts; the selector
   * passes the surface's mount time so nothing fires on mount.
   */
  firedOn(surface: string, boundary: string, since?: number): boolean;
}

export interface TeachingBindingsData {
  projectName?: string;
  personName?: string;
  invoiceNumber?: string;
  invoiceId?: string;
}

export interface SelectInputs {
  notes: readonly TeachingNote[];
  /** Bundled manifest ∩ published `teachingRelease`. */
  releases: readonly TeachingRelease[];
  /**
   * The whole bundled manifest, for cursor order and ship dates. A cursor on a
   * release whose copy is unpublished is still a known position. Defaults to
   * `TEACHING_RELEASES`.
   */
  manifest?: readonly TeachingRelease[];
  state: TeachingNoteState;
  signals: TeachingSignals;
  flags: TeachingFlags;
  /** Epoch ms. */
  now: number;
  atRest: Record<TeachingSlot, boolean>;
  boundaries: BoundaryLog;
  pinnedProjectIds: string[];
  bindings: TeachingBindingsData;
  /** Epoch ms the hosting surface mounted. */
  surfaceMountedAt: number;
}

// ─── Hook contract (§5, verbatim) ─────────────────────────────────────────────

export interface TeachingNoteView {
  noteKey: string; kind: TeachingKind;
  body: string;                                   // bindings already resolved
  label: string;                                  // release notes: "<NAME> · 11 SEP" (the RELEASE date);
                                                  // others: "<NAME>", no date (finding 27); NAME per R-RT1
  act: { label: string; href: string } | null;    // from act.label + act.hrefTemplate + bindings (finding 18)
  recedeOn: string[]; learnMoreHref?: string;
}
export interface TeachingNoteBinding {        // spread onto the existing <MarginNote>
  noteKey: string; seen: false; actionEvents: string[]; label: string;
  onSeen: (how: 'dismissed' | 'acted' | 'closed') => void;
}
