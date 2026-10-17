import {
  QueryClient,
  QueryCache,
  MutationCache,
  onlineManager,
  type MutationFunctionContext,
  type MutationOptions,
} from '@tanstack/react-query';
import {
  handleApiError,
  logError,
  showErrorToast,
  isAuthError,
  isNetworkError,
  handleAuthExpiry,
  toLiveSessionError,
} from './error-handler';
import { getCurrentTeachingSurface, record as recordTeachingBoundary } from './teaching/boundaries';
import type { TeachingBoundaryKey, TeachingNoteState } from './teaching/types';

/**
 * R83 — the error grammar. Mutations on (document) surfaces render failures as
 * a quiet inline band at the act site (terracotta, with the reason and a retry
 * act) and must NOT also raise the global red toast. Since US-34 N12b that
 * holds for every mutation that fails while a (document) surface is mounted
 * (see `enterInlineErrorSurface`). Elsewhere, `meta: { errorSurface:
 * 'inline' }` opts out when the caller renders its own alert; supporting
 * background mutations use `'silent'`. The MutationCache logs both without
 * toasting, while mutations without metadata keep the legacy toast behavior.
 */
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** 'silent' = supporting/background context; log, but do not toast. */
      errorSurface?: 'silent';
      [key: string]: unknown;
    };
    mutationMeta: {
      /** 'silent' = supporting/background mutation; log, but do not toast. */
      /** 'inline' = the caller renders the failure inline (R83); no global toast. */
      errorSurface?: 'silent' | 'inline';
      /** An external send or a money write (SQ-965 inventory): refused before
       *  any call while offline, never queued for reconnect (PQ15). */
      act?: 'send' | 'money';
      successMessage?: string;
      /** Return teaching: a named completion act (see `onTeachingBoundary`). */
      teachingBoundary?: true;
      boundaryKey?: TeachingBoundaryKey;
      [key: string]: unknown;
    };
  }
}

/**
 * US-34 F1 — a write of a signed-in subject who has since left, refused
 * before its mutationFn ran: nothing was sent. The subject boundary already
 * dropped everything it belonged to, so it surfaces nowhere.
 */
export class SubjectChangedError extends Error {
  constructor() {
    super('The signed-in user changed before this was saved.');
    this.name = 'SubjectChangedError';
  }
}

/** Clients whose signed-in subject has left (see `retireQueryClient`). */
const retiredClients = new WeakSet<QueryClient>();

/**
 * US-34 F1 — called by the subject boundary when this client's subject
 * leaves. From then on the client starts no mutation attempt (a first one, a
 * late one or a retry) and its global handlers surface nothing on screen.
 * A mutationFn already running at that moment still completes: that window
 * is accepted.
 */
export function retireQueryClient(client: QueryClient): void {
  retiredClients.add(client);
}

// Create query cache with error handling
const createQueryCache = (isRetired: () => boolean) => new QueryCache({
  onError: (error, query) => {
    // A retired client's late error belongs to the subject who left.
    if (isRetired()) return;

    const appError = handleApiError(error);

    // Log error for monitoring
    logError(appError, {
      queryKey: query.queryKey,
      meta: query.meta,
    });

    // Don't show toast for background refetches
    if (query.state.fetchStatus === 'fetching' && query.state.data !== undefined) {
      return;
    }

    // Handle auth errors. An *expired session* must route to sign-in —
    // otherwise queries like useDecisionMetrics silently return undefined and
    // the dashboard renders a misleading "0 open / 100%" healthy state.
    // `handleAuthExpiry` returns true for any expiry-*shaped* error and takes
    // ownership of the surface; it does not navigate on the spot — it probes
    // the live session first and only redirects once the session is confirmed
    // dead (a server-side JWT misconfig 401s with a perfectly good session).
    // The probe is de-duped, and the redirect itself is loop-bounded via a
    // sessionStorage stamp, so a burst of failing queries costs one probe and
    // at most one navigation.
    //
    // Whenever the user is staying on this page, `restoreErrorSurface` hands
    // this query its default surface back — auth errors are excluded from
    // retry, so without it a 401 would leave the user with nothing. The copy
    // depends on the verdict: only a confirmed-dead session may be told its
    // session expired (see `toLiveSessionError`).
    if (isAuthError(appError)) {
      if (
        handleAuthExpiry(error, {
          restoreErrorSurface: (outcome) => {
            // The probe can answer after the subject has left.
            if (isRetired()) return;
            if (query.meta?.errorSurface === 'silent') return;
            if (isNetworkError(appError)) return;
            showErrorToast(
              outcome === 'dead' ? appError : toLiveSessionError(appError)
            );
          },
        })
      ) {
        return;
      }
      // Auth-shaped but not a clear session-expiry (e.g. a 403 forbidden).
      // Leave it to the individual query's UI rather than bouncing the user.
      console.warn('Authentication error in query:', query.queryKey);
      return;
    }

    // Supporting context queries can opt out of the global destructive toast.
    // They remain logged above, and auth/session errors still take precedence.
    if (query.meta?.errorSurface === 'silent') {
      return;
    }

    // Show error toast for other errors (but not network errors)
    if (!isNetworkError(appError)) {
      showErrorToast(appError);
    }
  },
});

/** US-34 N12a (PQ15) — true only because the call never started. */
export const OFFLINE_NOT_SENT = 'You’re offline. Nothing was sent.';

/** A send or money act refused before its mutationFn ran, because the
 *  browser was offline. A definite refusal: nothing went. */
export class OfflineRefusal extends Error {
  constructor() {
    super(OFFLINE_NOT_SENT);
    this.name = 'OfflineRefusal';
  }
}

/**
 * The fresh read a send or money act makes before it commits, held to the act's
 * offline rule: offline at the press refuses with no read made, and losing the
 * connection while the read is out refuses then — an offline read pauses until
 * reconnect, and the act it guards must not resume into a send minutes later.
 */
export function readWhileOnline<T>(read: () => Promise<T>): Promise<T> {
  if (!onlineManager.isOnline()) return Promise.reject(new OfflineRefusal());
  return new Promise<T>((resolve, reject) => {
    const unsubscribe = onlineManager.subscribe((online) => {
      if (online) return;
      unsubscribe();
      reject(new OfflineRefusal());
    });
    read().then(
      (value) => {
        unsubscribe();
        resolve(value);
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });
}

/**
 * US-34 N12b (PQ11) — the (document) route group answers every failed
 * mutation inline, so no mutation fired there raises the global red toast.
 *
 * Gated by route group, not by meta: most (document) acts call shared
 * @patina/supabase hooks that also run on toast surfaces, so a hook cannot
 * know where it is used. The (document) layout mounts `InlineErrorSurface`
 * (components/feedback), which holds this count above zero while the group
 * is on screen. Elsewhere the count is zero and untagged mutations keep the
 * toast. `meta.errorSurface` still works on its own anywhere.
 */
let inlineErrorSurfaces = 0;

/** Enter the inline error surface; the returned function leaves it. */
export function enterInlineErrorSurface(): () => void {
  inlineErrorSurfaces += 1;
  let left = false;
  return () => {
    if (left) return;
    left = true;
    inlineErrorSurfaces -= 1;
  };
}

export const isInlineErrorSurface = (): boolean => inlineErrorSurfaces > 0;

// Create mutation cache with error handling
const createMutationCache = (isRetired: () => boolean) => new MutationCache({
  // PQ15 / O3 — under the default networkMode 'online' an offline mutation
  // pauses and runs by itself on reconnect. Ticks and edits may wait like
  // that; a send or a money write must not fire minutes later. This runs
  // before the mutation's own onMutate and its mutationFn, so a throw here
  // fails the act with no call made.
  onMutate: (_variables, mutation) => {
    if (isRetired()) throw new SubjectChangedError();
    if (mutation.meta?.act && !onlineManager.isOnline()) throw new OfflineRefusal();
  },
  onError: (error, _variables, _context, mutation) => {
    // A retired client's late error belongs to the subject who left.
    if (isRetired()) return;

    const appError = handleApiError(error);

    // R83 — mutations that render their own inline error band opt out of the
    // global toast (see the meta contract at the top of this file), and so
    // does every mutation that fails while a (document) surface is mounted.
    const inlineErrorSurface =
      mutation.meta?.errorSurface === 'inline' || isInlineErrorSurface();
    const silentErrorSurface = mutation.meta?.errorSurface === 'silent';

    // Log error for monitoring
    logError(appError, {
      mutationKey: mutation.options.mutationKey,
      meta: mutation.meta,
    });

    // Handle auth errors. An expired session routes to sign-in (so a failed
    // write doesn't leave the user staring at a generic toast on a dead
    // session); other auth-shaped errors surface a sign-in prompt. As in the
    // query cache above, `handleAuthExpiry` claims the surface for any
    // expiry-shaped error but navigates only after the session is confirmed
    // dead, and the redirect is loop-bounded via sessionStorage. Whenever the
    // user stays on this page, `restoreErrorSurface` restores this cache's own
    // surface — a mutation that silently does nothing is the worst outcome of
    // all. That includes the confirmed-dead-but-redirect-declined case, which
    // is exactly how `/auth/accept-invite`'s Accept button used to fail in
    // total silence.
    if (isAuthError(appError)) {
      if (
        handleAuthExpiry(error, {
          restoreErrorSurface: (outcome) => {
            // The probe can answer after the subject has left.
            if (isRetired()) return;
            if (inlineErrorSurface || silentErrorSurface) return;
            showErrorToast(
              outcome === 'dead' ? appError : toLiveSessionError(appError)
            );
          },
        })
      ) {
        return;
      }
      if (
        !inlineErrorSurface &&
        !silentErrorSurface &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/auth')
      ) {
        console.warn('Authentication error in mutation:', mutation.options.mutationKey);
        showErrorToast({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Please sign in to continue',
        });
      }
      return;
    }

    // Inline-surface mutations render the failure at the act site — no toast.
    if (inlineErrorSurface || silentErrorSurface) {
      return;
    }

    // Show error toast (mutations should always show errors to user)
    showErrorToast(appError);
  },
  onSuccess: (_data, _variables, _context, mutation, { client }) => {
    if (isRetired()) return;
    // You can add global success handling here if needed
    // For example, invalidating certain queries or showing success messages
    if (mutation.meta?.successMessage) {
      // showSuccessToast(mutation.meta.successMessage as string);
    }
    // Return teaching counts only tagged completion acts; autosaves and
    // untagged mutations do nothing here.
    if (mutation.meta?.teachingBoundary === true && mutation.meta.boundaryKey) {
      onTeachingBoundary(mutation.meta.boundaryKey, client);
    }
  },
});

/**
 * Records the boundary in memory (anchors read it), then, only while the
 * `teaching-notes` flag is on, refreshes `teaching_signals()` and patches
 * `visit.lastActiveAt` when the cached state row says the visit is current
 * (R-RT8). With no cached row, or one that says a new visit starts, nothing is
 * written, so a boundary on a yielded Desk load cannot keep yesterday's visit
 * alive. The flag accessor and teaching data layer are imported lazily so the
 * many modules that import `queryKeys` from this file do not pull PostHog,
 * Sanity and the teaching backend into their graph.
 * Teaching is background context: a failure here is logged, never surfaced.
 * `client` is the one whose mutation crossed the boundary; a late boundary
 * from a previous subject's retired client never gets here (US-34 F1).
 */
function onTeachingBoundary(boundaryKey: TeachingBoundaryKey, client: QueryClient): void {
  const at = Date.now();
  recordTeachingBoundary({ boundaryKey, at, surfaceKey: getCurrentTeachingSurface() });
  void import('@/hooks/use-feature-flags')
    .then(async (flags) => {
      if (!flags.isTeachingNotesEnabled()) return;
      const [teaching, helpSystem, supabase, select] = await Promise.all([
        import('@/hooks/use-teaching-data'),
        import('@patina/help-system'),
        import('@patina/supabase'),
        import('./teaching/select'),
      ]);
      void teaching.invalidateTeachingSignals(client);
      const cached = client.getQueryData<TeachingNoteState>(teaching.TEACHING_NOTE_STATE_KEY);
      if (!cached || select.isNewVisit(cached, at)) return;
      const backend = helpSystem.createSupabaseTeachingNoteBackend(supabase.createBrowserClient());
      const state = await backend.patch(['visit', 'lastActiveAt'], new Date(at).toISOString());
      client.setQueryData(teaching.TEACHING_NOTE_STATE_KEY, state);
    })
    .catch((error: unknown) => {
      console.warn('[teaching] boundary follow-up failed', error);
    });
}

/**
 * query-core starts an attempt that was already past the cache's onMutate,
 * or asleep before a retry, without asking the cache again (mutation.ts
 * execute, retryer.ts run), so a retired client fences each mutationFn it
 * defaults.
 */
class SubjectQueryClient extends QueryClient {
  override defaultMutationOptions<T extends MutationOptions<any, any, any, any>>(options?: T): T {
    const defaulted = super.defaultMutationOptions(options);
    const { mutationFn } = defaulted;
    // Already defaulted (and fenced) once, or nothing to fence.
    if (defaulted === options || !mutationFn) return defaulted;
    return {
      ...defaulted,
      mutationFn: (variables: unknown, context: MutationFunctionContext) =>
        retiredClients.has(this)
          ? Promise.reject(new SubjectChangedError())
          : mutationFn(variables, context),
    };
  }
}

const createQueryClient = () => {
  const isRetired = () => retiredClients.has(client);
  const client: QueryClient = new SubjectQueryClient({
    queryCache: createQueryCache(isRetired),
    mutationCache: createMutationCache(isRetired),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes (replaces cacheTime)
        retry: (failureCount, error) => {
          // Don't retry on auth errors
          if (isAuthError(error)) {
            return false;
          }

          // Retry network errors up to 3 times
          if (isNetworkError(error)) {
            return failureCount < 3;
          }

          // Don't retry other errors
          return false;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: (failureCount, error) => {
          if (isRetired()) return false;
          // Only retry network errors once for mutations
          if (isNetworkError(error) && failureCount < 1) {
            return true;
          }
          return false;
        },
      },
    },
  });
  return client;
};

/**
 * The QueryClient of the signed-in subject on screen. US-34 F1 gives every
 * new subject a fresh one (`nextSubjectQueryClient`, called by
 * use-session-subject-boundary), so this binding is reassigned: read it when
 * you use it, never copy it into a module-level constant.
 */
export let queryClient = createQueryClient();

/** A fresh client for the next signed-in subject; `queryClient` now names it. */
export function nextSubjectQueryClient(): QueryClient {
  queryClient = createQueryClient();
  return queryClient;
}

// Query key factory for consistent cache management
export const queryKeys = {
  // Products & Catalog
  products: {
    all: ['products'] as const,
    detail: (id: string) => [...queryKeys.products.all, id] as const,
    search: (params: any) => [...queryKeys.products.all, 'search', params] as const,
  },

  // Collections
  collections: {
    all: ['collections'] as const,
    list: (params?: any) => [...queryKeys.collections.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.collections.all, id] as const,
    products: (id: string) => [...queryKeys.collections.all, id, 'products'] as const,
  },

  // Categories
  categories: {
    all: ['categories'] as const,
    list: (params?: any) => [...queryKeys.categories.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.categories.all, id] as const,
    tree: () => [...queryKeys.categories.all, 'tree'] as const,
  },

  // Search
  search: {
    all: ['search'] as const,
    query: (params: any) => [...queryKeys.search.all, 'query', params] as const,
    autocomplete: (q: string) => [...queryKeys.search.all, 'autocomplete', q] as const,
    similar: (productId: string) => [...queryKeys.search.all, 'similar', productId] as const,
  },

  // Style Profiles
  styleProfiles: {
    all: ['styleProfiles'] as const,
    detail: (id: string) => [...queryKeys.styleProfiles.all, id] as const,
    versions: (id: string) => [...queryKeys.styleProfiles.all, id, 'versions'] as const,
  },

  // Proposals
  proposals: {
    all: ['proposals'] as const,
    list: (params: any) => [...queryKeys.proposals.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.proposals.all, id] as const,
  },

  // Mood-board media assets. Board data itself keeps the package-owned
  // ['board', id] keys; this namespace is for derived media capabilities.
  moodBoardAssets: {
    all: ['mood-board-assets'] as const,
    board: (boardId: string | null) =>
      [...queryKeys.moodBoardAssets.all, boardId] as const,
    backgroundRemovalCapability: (boardId: string | null) =>
      [...queryKeys.moodBoardAssets.board(boardId), 'background-removal-capability'] as const,
  },

  // Clients
  clients: {
    all: ['clients'] as const,
    list: (params: any) => [...queryKeys.clients.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.clients.all, id] as const,
  },

  // Projects
  projects: {
    all: ['projects'] as const,
    list: (filters?: any) => [...queryKeys.projects.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.projects.all, id] as const,
    tasks: (projectId: string) => [...queryKeys.projects.all, projectId, 'tasks'] as const,
    rfis: (projectId: string) => [...queryKeys.projects.all, projectId, 'rfis'] as const,
    changeOrders: (projectId: string) => [...queryKeys.projects.all, projectId, 'change-orders'] as const,
    timeline: (projectId: string) => [...queryKeys.projects.all, projectId, 'timeline'] as const,
    documents: (projectId: string) => [...queryKeys.projects.all, projectId, 'documents'] as const,
    milestones: (projectId: string) => [...queryKeys.projects.all, projectId, 'milestones'] as const,
    activity: (projectId: string) => [...queryKeys.projects.all, projectId, 'activity'] as const,
    progress: (projectId: string) => [...queryKeys.projects.all, projectId, 'progress'] as const,
    rooms: (projectId: string) => [...queryKeys.projects.all, projectId, 'rooms'] as const,
    // FF&E items deliberately live in the @patina/supabase package namespace
    // (['project-ffe-items', id]) — NOT nested under ['projects'] — so the
    // package-side invalidations (use-project-v2 useUpdateFFEItemStatus,
    // use-procurement invalidateFfeCaches, use-decisions apply/feed-through)
    // hit the portal board's read key directly (W1-T7 consolidation).
    ffeItems: (projectId: string) => ['project-ffe-items', projectId] as const,
    financials: (projectId: string) => [...queryKeys.projects.all, projectId, 'financials'] as const,
    timeTracking: (projectId: string) => [...queryKeys.projects.all, projectId, 'time-tracking'] as const,
    timeEntries: (projectId: string, filters?: any) =>
      filters
        ? ([...queryKeys.projects.all, projectId, 'time-entries', filters] as const)
        : ([...queryKeys.projects.all, projectId, 'time-entries'] as const),
    unbilledTime: (projectId: string) => [...queryKeys.projects.all, projectId, 'unbilled-time'] as const,
    keyMetrics: (projectId: string) => [...queryKeys.projects.all, projectId, 'key-metrics'] as const,
  },

  // Time tracking (cross-project surfaces — running timer, my-week, etc.
  // Timer hooks land in a later wave; the key group exists so all time
  // surfaces share one namespace from day one.)
  time: {
    all: ['time'] as const,
    runningTimer: (userId?: string) => [...queryKeys.time.all, 'running-timer', userId] as const,
    studioReport: (period: string) => [...queryKeys.time.all, 'studio-report', period] as const,
  },

  // Threads & Messages
  threads: {
    all: ['threads'] as const,
    list: (params?: any) => [...queryKeys.threads.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.threads.all, id] as const,
    messages: (threadId: string) => [...queryKeys.threads.all, threadId, 'messages'] as const,
  },

  // Orders & Carts
  orders: {
    all: ['orders'] as const,
    list: (filters?: any) => [...queryKeys.orders.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.orders.all, id] as const,
    byNumber: (orderNumber: string) => [...queryKeys.orders.all, 'number', orderNumber] as const,
    fulfillments: (orderId: string) => [...queryKeys.orders.all, orderId, 'fulfillments'] as const,
  },

  carts: {
    all: ['carts'] as const,
    detail: (id: string) => [...queryKeys.carts.all, id] as const,
    active: (userId: string) => [...queryKeys.carts.all, 'active', userId] as const,
  },
} as const;
