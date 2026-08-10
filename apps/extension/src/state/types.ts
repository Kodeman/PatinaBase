/**
 * Capture panel state shape + action union.
 *
 * Replaces the ~52 useState vars in the legacy sidepanel.tsx with one
 * serializable store driven by a pure reducer (src/state/reducer.ts). The lib/*
 * extraction, payload, validation and trade modules stay UI-agnostic; adapters
 * in src/state/draft.ts bridge this draft into those builders.
 */
import type { User } from '@supabase/supabase-js';
import type {
  ExtractedProductData,
  ExtractedVendorData,
  VendorSummaryForCapture,
  VendorMatchConfidence,
  UUID,
} from '@patina/shared';
import type { NavState } from './screens';
import type { PlacementOutcome, SpecBookPlacementRoute } from '../lib/spec-book-placement';

// ─── Routing destination (mirrors @patina/catalog-ui DestinationPicker) ──────

export type Destination =
  | { type: 'personal' }
  | { type: 'project-room'; projectId: string; roomId: string | null };

/** Where a finished capture commits. */
export type CommitTarget = 'library' | 'inbox' | 'decision';

// ─── Per-field status (drives Region A verified/edited/missing badges) ───────

export type FieldStatus = 'verified' | 'extracted' | 'edited' | 'missing';

export interface DraftField<T> {
  value: T;
  status: FieldStatus;
  source: 'extracted' | 'user' | 'merged';
  /** Original extracted value — enables "revert to source" (C4). */
  original?: T;
}

export type DraftFieldKey =
  | 'name'
  | 'price'
  | 'description'
  | 'materials'
  | 'colors'
  | 'finish'
  | 'dimensions';

/** Editable dimension values (strings for free editing in the UI). */
export interface EditableDimensions {
  width: string;
  height: string;
  depth: string;
  seatHeight: string;
  seatDepth: string;
  seatWidth: string;
  armHeight: string;
  backHeight: string;
  legHeight: string;
  clearance: string;
  unit: 'in' | 'cm';
}

export interface DraftImage {
  url: string;
  score: number;
  width: number;
  height: number;
  alt: string;
}

export interface DraftVendorSlot {
  vendor: VendorSummaryForCapture | null;
  confidence: VendorMatchConfidence;
  status: FieldStatus;
}

export type CaptureKind = 'product' | 'vendor' | 'image' | 'selection' | 'snapshot' | 'unknown';

export interface DraftSlice {
  captureKind: CaptureKind;
  sourceUrl: string;
  /** R2 snapshot public URL, once uploaded. */
  snapshotUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  fields: {
    name: DraftField<string>;
    price: DraftField<string>;
    description: DraftField<string>;
    materials: DraftField<string[]>;
    colors: DraftField<string[]>;
    finish: DraftField<string>;
    dimensions: DraftField<EditableDimensions>;
  };
  /** R3 user-added custom fields. */
  custom: Array<{ key: string; label: string; value: string }>;
  images: { all: DraftImage[]; selected: number[]; variant: string | null };
  manufacturer: DraftVendorSlot;
  retailer: DraftVendorSlot;
  styleIds: UUID[];
  note: string;
  /** Original extraction kept for payload builders + provenance. */
  raw: ExtractedProductData;
}

// ─── Slices ──────────────────────────────────────────────────────────────────

export interface SessionSlice {
  status: 'checking' | 'signed-out' | 'signed-in';
  user: User | null;
  /** Single workspace for now (A2 switcher deferred). */
  workspaceId: string | null;
}

export interface RoutingSlice {
  destination: Destination;
  /** New "loose grouping" introduced by S1. */
  shelf: string | null;
  commitTarget: CommitTarget;
  // Wave 2 inbox targeting (carried from the legacy panel).
  proposalId: UUID | null;
  scopeRoomId: UUID | null;
  ffeCategorySlug: string | null;
  specBookPlacement: SpecBookPlacementRoute | null;
  specBookPlacementValid: boolean;
  // Decision targeting (carried from the legacy panel).
  decision: {
    designerClientId: UUID | null;
    clientProfileId: UUID | null;
    projectId: UUID | null;
    roomId: UUID | null;
    title: string;
  };
}

export interface ExistingProductMatch {
  id: UUID;
  name: string;
  imageUrl: string | null;
  priceRetail: number | null;
  capturedAt: string | null;
}

export interface DedupSlice {
  match: ExistingProductMatch | null;
  confidence: number;
  mergePicks: Partial<Record<DraftFieldKey, 'existing' | 'new'>>;
}

export interface QueuedCaptureSummary {
  id: string;
  name: string;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
}

export interface QueueSlice {
  items: QueuedCaptureSummary[];
  online: boolean;
  lastSyncAt: string | null;
}

export interface Prefs {
  defaultDestination: Destination;
  autoDetect: boolean;
  tradeLayer: boolean;
  dupeWarnings: boolean;
  captureConfirmation: boolean;
  ocrEnabled: boolean;
  snapshotFallbackEnabled: boolean;
}

export interface IoSlice {
  isExtracting: boolean;
  isSaving: boolean;
  error: string | null;
  lastSavedProductId: UUID | null;
  /** Durable Product retained when only the project-placement RPC failed. */
  pendingPlacementProductId: UUID | null;
  lastPlacementOutcome: PlacementOutcome | null;
}

export interface CaptureState {
  nav: NavState;
  session: SessionSlice;
  draft: DraftSlice | null;
  routing: RoutingSlice;
  dedup: DedupSlice;
  queue: QueueSlice;
  prefs: Prefs;
  io: IoSlice;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

import type { BaseScreen, OverlayId, EntryPoint } from './screens';

export type CaptureAction =
  // nav
  | { type: 'NAV'; screen: BaseScreen }
  | { type: 'OPEN_OVERLAY'; overlay: OverlayId }
  | { type: 'CLOSE_OVERLAY' }
  // session
  | { type: 'SESSION_RESOLVED'; user: User | null; entry?: EntryPoint }
  | { type: 'SIGNED_OUT' }
  // extraction lifecycle
  | { type: 'EXTRACTION_START'; url: string; entry: EntryPoint }
  | { type: 'EXTRACTION_SUCCESS'; data: ExtractedProductData }
  | {
      type: 'EXTRACTION_PARTIAL';
      data: ExtractedProductData;
      missing: DraftFieldKey[];
    }
  | { type: 'EXTRACTION_BLOCKED'; snapshotUrl: string | null }
  | { type: 'EXTRACTION_UNKNOWN' }
  | { type: 'EXTRACTION_ERROR'; error: string }
  | { type: 'MANUAL_START'; url: string }
  | { type: 'SNAPSHOT_CAPTURED'; sourceUrl: string; imageUrl: string }
  | { type: 'IMAGE_CAPTURED'; sourceUrl: string; imageUrl: string }
  | { type: 'VENDOR_EXTRACTED'; data: ExtractedVendorData }
  // draft editing
  | { type: 'FIELD_EDIT'; field: DraftFieldKey; value: DraftFieldValue }
  | { type: 'FIELD_REVERT'; field: DraftFieldKey }
  | { type: 'CUSTOM_FIELD_ADD'; label: string }
  | { type: 'CUSTOM_FIELD_SET'; key: string; value: string }
  | { type: 'IMAGES_SET'; selected: number[]; variant: string | null }
  | {
      type: 'VENDOR_SET';
      role: 'manufacturer' | 'retailer';
      vendor: VendorSummaryForCapture | null;
      confidence: VendorMatchConfidence;
    }
  | { type: 'STYLE_TOGGLE'; styleId: UUID }
  | { type: 'NOTE_SET'; note: string }
  // routing
  | { type: 'DESTINATION_SET'; value: Destination }
  | { type: 'SHELF_SET'; shelf: string | null }
  | { type: 'COMMIT_TARGET_SET'; target: CommitTarget }
  | {
      type: 'INBOX_TARGET_SET';
      proposalId: UUID | null;
      scopeRoomId: UUID | null;
      ffeCategorySlug: string | null;
    }
  | {
      type: 'SPEC_BOOK_PLACEMENT_SET';
      route: SpecBookPlacementRoute | null;
      valid?: boolean;
    }
  | { type: 'DECISION_TARGET_SET'; patch: Partial<RoutingSlice['decision']> }
  // dedup
  | {
      type: 'DUPLICATE_MATCHED';
      match: ExistingProductMatch;
      confidence: number;
    }
  | { type: 'DUPLICATE_FOUND'; match: ExistingProductMatch; confidence: number }
  | { type: 'DUPLICATE_CLEARED' }
  | { type: 'MERGE_FIELD_PICK'; field: DraftFieldKey; pick: 'existing' | 'new' }
  // save lifecycle
  | { type: 'SAVE_START'; target: CommitTarget }
  | { type: 'SAVE_SUCCESS'; productId: UUID; landed: 'library' | 'inbox'; placementOutcome?: PlacementOutcome | null }
  | { type: 'SAVE_ERROR'; error: string; preservedProductId?: UUID }
  | { type: 'CAPTURE_NEXT' }
  // offline / prefs
  | { type: 'CONNECTIVITY'; online: boolean }
  | {
      type: 'QUEUE_STATUS';
      items: QueuedCaptureSummary[];
      lastSyncAt: string | null;
    }
  | { type: 'PREFS_LOADED'; prefs: Prefs }
  | { type: 'PREF_SET'; key: keyof Prefs; value: Prefs[keyof Prefs] };

/** Value carried by FIELD_EDIT — string fields, list fields, or dimensions. */
export type DraftFieldValue = string | string[] | EditableDimensions;
