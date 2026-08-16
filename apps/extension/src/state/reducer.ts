/**
 * Pure reducer for the capture panel state machine.
 *
 * One serializable transition table mapping 1:1 to the spec's edges. No I/O —
 * side effects (extraction, dedup query, the save handlers) live in effects.ts
 * and dispatch these actions.
 */
import { draftFromExtraction, emptyDraft } from './draft';
import { INITIAL_NAV } from './screens';
import type {
  CaptureState,
  CaptureAction,
  Prefs,
  DraftSlice,
  DraftField,
  DraftFieldKey,
} from './types';

export const DEFAULT_PREFS: Prefs = {
  defaultDestination: { type: 'personal' },
  autoDetect: true,
  tradeLayer: true,
  dupeWarnings: true,
  captureConfirmation: true,
  ocrEnabled: true,
  snapshotFallbackEnabled: true,
};

export function initialCaptureState(prefs: Prefs = DEFAULT_PREFS): CaptureState {
  return {
    nav: { ...INITIAL_NAV },
    session: { status: 'checking', user: null, workspaceId: null },
    draft: null,
    routing: {
      destination: prefs.defaultDestination,
      shelf: null,
      commitTarget: 'library',
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      specBookPlacement: null,
      specBookPlacementValid: false,
      decision: {
        designerClientId: null,
        clientProfileId: null,
        projectId: null,
        roomId: null,
        title: '',
      },
    },
    dedup: { match: null, confidence: 0, mergePicks: {} },
    queue: { items: [], online: true, lastSyncAt: null },
    prefs,
    io: {
      isExtracting: false,
      isSaving: false,
      error: null,
      lastSavedProductId: null,
      pendingPlacementProductId: null,
      lastPlacementOutcome: null,
    },
  };
}

function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

function setMissing(draft: DraftSlice, keys: DraftFieldKey[]): DraftSlice {
  // Treat fields uniformly for the status patch, then cast back — the per-field
  // value generic makes direct indexed assignment fight the union otherwise.
  const fields = { ...draft.fields } as Record<DraftFieldKey, DraftField<unknown>>;
  for (const key of keys) {
    fields[key] = { ...fields[key], status: 'missing' };
  }
  return { ...draft, fields: fields as unknown as DraftSlice['fields'] };
}

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    // ── nav ──────────────────────────────────────────────────────────────
    case 'NAV':
      return { ...state, nav: { ...state.nav, screen: action.screen } };

    case 'OPEN_OVERLAY':
      return {
        ...state,
        nav: {
          ...state.nav,
          overlay: action.overlay,
          returnTo: state.nav.screen,
        },
      };

    case 'CLOSE_OVERLAY':
      return {
        ...state,
        nav: {
          ...state.nav,
          overlay: null,
          returnTo: null,
          screen: state.nav.returnTo ?? state.nav.screen,
        },
      };

    // ── session ──────────────────────────────────────────────────────────
    case 'SESSION_RESOLVED': {
      if (!action.user) {
        return {
          ...state,
          session: { ...state.session, status: 'signed-out', user: null },
          nav: { ...state.nav, screen: 'signedOut', overlay: null },
        };
      }
      const arming = state.nav.screen === 'boot' || state.nav.screen === 'signedOut';
      return {
        ...state,
        session: {
          ...state.session,
          status: 'signed-in',
          user: action.user,
          workspaceId:
            state.session.user?.id === action.user.id
              ? state.session.workspaceId
              : null,
        },
        nav: {
          ...state.nav,
          screen: arming ? 'C1' : state.nav.screen,
          entry: action.entry ?? state.nav.entry,
        },
      };
    }

    case 'SIGNED_OUT':
      return {
        ...state,
        session: {
          ...state.session,
          status: 'signed-out',
          user: null,
          workspaceId: null,
        },
        draft: null,
        nav: { ...state.nav, screen: 'signedOut', overlay: null },
        io: { ...state.io, error: null, isSaving: false },
      };

    case 'WORKSPACE_SET':
      return {
        ...state,
        session: { ...state.session, workspaceId: action.workspaceId },
      };

    // ── extraction lifecycle ─────────────────────────────────────────────
    case 'EXTRACTION_START':
      return {
        ...state,
        draft: null,
        nav: { ...state.nav, screen: 'C1', overlay: null, entry: action.entry },
        io: { ...state.io, isExtracting: true, error: null },
      };

    case 'EXTRACTION_SUCCESS':
      return {
        ...state,
        draft: draftFromExtraction(action.data),
        nav: { ...state.nav, screen: 'C2' },
        io: { ...state.io, isExtracting: false },
      };

    case 'EXTRACTION_PARTIAL':
      return {
        ...state,
        draft: setMissing(draftFromExtraction(action.data), action.missing),
        nav: { ...state.nav, screen: 'C2' },
        io: { ...state.io, isExtracting: false },
      };

    case 'EXTRACTION_BLOCKED':
      return {
        ...state,
        draft: state.draft ? { ...state.draft, snapshotUrl: action.snapshotUrl } : state.draft,
        nav: { ...state.nav, screen: 'R2' },
        io: { ...state.io, isExtracting: false },
      };

    case 'EXTRACTION_UNKNOWN':
      return {
        ...state,
        nav: { ...state.nav, screen: 'R4' },
        io: { ...state.io, isExtracting: false },
      };

    case 'EXTRACTION_ERROR':
      return {
        ...state,
        nav: { ...state.nav, screen: 'R5' },
        io: { ...state.io, isExtracting: false, error: action.error },
      };

    case 'MANUAL_START':
      return {
        ...state,
        draft: emptyDraft(action.url),
        nav: { ...state.nav, screen: 'C2', overlay: null },
        io: { ...state.io, isExtracting: false, error: null },
      };

    case 'SNAPSHOT_CAPTURED':
    case 'IMAGE_CAPTURED':
      return {
        ...state,
        draft: {
          ...emptyDraft(action.sourceUrl),
          captureKind: action.type === 'SNAPSHOT_CAPTURED' ? 'snapshot' : 'image',
          snapshotUrl: action.type === 'SNAPSHOT_CAPTURED' ? action.imageUrl : null,
          images: {
            all: [
              {
                url: action.imageUrl,
                score: 100,
                width: 0,
                height: 0,
                alt: '',
              },
            ],
            selected: [0],
            variant: null,
          },
        },
        nav: { ...state.nav, screen: 'C2', overlay: null },
        io: { ...state.io, isExtracting: false, error: null },
      };

    case 'VENDOR_EXTRACTED':
      return {
        ...state,
        nav: { ...state.nav, screen: 'vendor' },
        io: { ...state.io, isExtracting: false },
      };

    // ── draft editing ────────────────────────────────────────────────────
    case 'FIELD_EDIT': {
      if (!state.draft) return state;
      const prev = state.draft.fields[action.field];
      const next = {
        ...prev,
        value: action.value as typeof prev.value,
        status: 'edited' as const,
        source: 'user' as const,
      };
      return {
        ...state,
        draft: {
          ...state.draft,
          fields: { ...state.draft.fields, [action.field]: next },
        },
      };
    }

    case 'FIELD_REVERT': {
      if (!state.draft) return state;
      const prev = state.draft.fields[action.field];
      const original = prev.original as typeof prev.value;
      const next = {
        ...prev,
        value: original,
        status: (isPresent(original) ? 'extracted' : 'missing') as 'extracted' | 'missing',
        source: 'extracted' as const,
      };
      return {
        ...state,
        draft: {
          ...state.draft,
          fields: { ...state.draft.fields, [action.field]: next },
        },
      };
    }

    case 'CUSTOM_FIELD_ADD': {
      if (!state.draft) return state;
      const key = `custom-${state.draft.custom.length + 1}`;
      return {
        ...state,
        draft: {
          ...state.draft,
          custom: [...state.draft.custom, { key, label: action.label, value: '' }],
        },
      };
    }

    case 'CUSTOM_FIELD_SET': {
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          custom: state.draft.custom.map((c) =>
            c.key === action.key ? { ...c, value: action.value } : c
          ),
        },
      };
    }

    case 'IMAGES_SET':
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          images: {
            ...state.draft.images,
            selected: action.selected,
            variant: action.variant,
          },
        },
      };

    case 'VENDOR_SET':
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.role]: {
            vendor: action.vendor,
            confidence: action.confidence,
            status: action.vendor ? 'verified' : 'missing',
          },
        },
      };

    case 'STYLE_TOGGLE': {
      if (!state.draft) return state;
      const has = state.draft.styleIds.includes(action.styleId);
      return {
        ...state,
        draft: {
          ...state.draft,
          styleIds: has
            ? state.draft.styleIds.filter((id) => id !== action.styleId)
            : [...state.draft.styleIds, action.styleId],
        },
      };
    }

    case 'NOTE_SET':
      if (!state.draft) return state;
      return { ...state, draft: { ...state.draft, note: action.note } };

    // ── routing ──────────────────────────────────────────────────────────
    case 'DESTINATION_SET':
      return {
        ...state,
        routing: { ...state.routing, destination: action.value },
      };

    case 'SHELF_SET':
      return { ...state, routing: { ...state.routing, shelf: action.shelf } };

    case 'COMMIT_TARGET_SET':
      return {
        ...state,
        routing: { ...state.routing, commitTarget: action.target },
      };

    case 'INBOX_TARGET_SET':
      return {
        ...state,
        routing: {
          ...state.routing,
          proposalId: action.proposalId,
          scopeRoomId: action.scopeRoomId,
          ffeCategorySlug: action.ffeCategorySlug,
        },
      };

    case 'SPEC_BOOK_PLACEMENT_SET':
      return {
        ...state,
        routing: {
          ...state.routing,
          specBookPlacement: action.route,
          specBookPlacementValid: action.valid ?? true,
          ...(action.route && action.route.kind !== 'library'
            ? {
                destination: {
                  type: 'project-room' as const,
                  projectId: action.route.projectId,
                  roomId: action.route.roomId,
                },
              }
            : {}),
        },
      };

    case 'DECISION_TARGET_SET':
      return {
        ...state,
        routing: {
          ...state.routing,
          decision: { ...state.routing.decision, ...action.patch },
        },
      };

    // ── dedup ────────────────────────────────────────────────────────────
    case 'DUPLICATE_MATCHED':
      // Exact-URL match: surface inline (banner + Update) without interrupting.
      return {
        ...state,
        dedup: {
          match: action.match,
          confidence: action.confidence,
          mergePicks: {},
        },
      };

    case 'DUPLICATE_FOUND':
      return {
        ...state,
        dedup: {
          match: action.match,
          confidence: action.confidence,
          mergePicks: {},
        },
        nav: { ...state.nav, screen: 'D1' },
      };

    case 'DUPLICATE_CLEARED':
      return {
        ...state,
        dedup: { match: null, confidence: 0, mergePicks: {} },
      };

    case 'MERGE_FIELD_PICK':
      return {
        ...state,
        dedup: {
          ...state.dedup,
          mergePicks: {
            ...state.dedup.mergePicks,
            [action.field]: action.pick,
          },
        },
      };

    // ── save lifecycle ───────────────────────────────────────────────────
    case 'SAVE_START':
      return {
        ...state,
        routing: { ...state.routing, commitTarget: action.target },
        io: { ...state.io, isSaving: true, error: null },
      };

    case 'SAVE_SUCCESS':
      return {
        ...state,
        nav: {
          ...state.nav,
          screen: action.landed === 'library' ? 'S4' : 'S5',
        },
        io: {
          ...state.io,
          isSaving: false,
          lastSavedProductId: action.productId,
          pendingPlacementProductId: null,
          lastPlacementOutcome: action.placementOutcome ?? null,
        },
      };

    case 'SAVE_ERROR':
      return {
        ...state,
        io: {
          ...state.io,
          isSaving: false,
          error: action.error,
          pendingPlacementProductId:
            action.preservedProductId ?? state.io.pendingPlacementProductId,
        },
      };

    case 'CAPTURE_NEXT':
      return {
        ...state,
        draft: null,
        routing: {
          ...state.routing,
          specBookPlacement: null,
          specBookPlacementValid: false,
        },
        dedup: { match: null, confidence: 0, mergePicks: {} },
        nav: { ...state.nav, screen: 'C1', overlay: null },
        io: {
          isExtracting: false,
          isSaving: false,
          error: null,
          lastSavedProductId: null,
          pendingPlacementProductId: null,
          lastPlacementOutcome: null,
        },
      };

    // ── connectivity / prefs ─────────────────────────────────────────────
    case 'CONNECTIVITY':
      return { ...state, queue: { ...state.queue, online: action.online } };

    case 'QUEUE_STATUS':
      return {
        ...state,
        queue: {
          ...state.queue,
          items: action.items,
          lastSyncAt: action.lastSyncAt,
        },
      };

    case 'PREFS_LOADED':
      return { ...state, prefs: action.prefs };

    case 'PREF_SET':
      return {
        ...state,
        prefs: { ...state.prefs, [action.key]: action.value },
      };

    default:
      return state;
  }
}
