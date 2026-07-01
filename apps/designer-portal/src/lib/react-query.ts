import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import {
  handleApiError,
  logError,
  showErrorToast,
  isAuthError,
  isNetworkError,
  handleAuthExpiry,
} from './error-handler';

/**
 * R83 — the error grammar. Mutations on (document) surfaces render failures as
 * a quiet inline band at the act site (terracotta, with the reason and a retry
 * act) and must NOT also raise the global red toast. A mutation opts out of
 * the toast by declaring `meta: { errorSurface: 'inline' }` — the global
 * MutationCache onError below respects it (errors are still logged, and an
 * expired session still routes to sign-in). Mutations without the meta keep
 * the old toast behavior — the legacy portal pages rely on it until dissolve.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** 'inline' = the caller renders the failure inline (R83); no global toast. */
      errorSurface?: 'inline';
      successMessage?: string;
      [key: string]: unknown;
    };
  }
}

// Create query cache with error handling
const queryCache = new QueryCache({
  onError: (error, query) => {
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
    // `handleAuthExpiry` is idempotent (de-duped + already-on-/auth guard), so
    // a burst of failing queries triggers exactly one navigation.
    if (isAuthError(appError)) {
      if (handleAuthExpiry(error)) {
        return;
      }
      // Auth-shaped but not a clear session-expiry (e.g. a 403 forbidden).
      // Leave it to the individual query's UI rather than bouncing the user.
      console.warn('Authentication error in query:', query.queryKey);
      return;
    }

    // Show error toast for other errors (but not network errors)
    if (!isNetworkError(appError)) {
      showErrorToast(appError);
    }
  },
});

// Create mutation cache with error handling
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    const appError = handleApiError(error);

    // R83 — mutations that render their own inline error band opt out of the
    // global toast (see the meta contract at the top of this file).
    const inlineErrorSurface = mutation.meta?.errorSurface === 'inline';

    // Log error for monitoring
    logError(appError, {
      mutationKey: mutation.options.mutationKey,
      meta: mutation.meta,
    });

    // Handle auth errors. An expired session routes to sign-in (so a failed
    // write doesn't leave the user staring at a generic toast on a dead
    // session); other auth-shaped errors surface a sign-in prompt.
    if (isAuthError(appError)) {
      if (handleAuthExpiry(error)) {
        return;
      }
      if (
        !inlineErrorSurface &&
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
    if (inlineErrorSurface) {
      return;
    }

    // Show error toast (mutations should always show errors to user)
    showErrorToast(appError);
  },
  onSuccess: (_data, _variables, _context, mutation) => {
    // You can add global success handling here if needed
    // For example, invalidating certain queries or showing success messages
    if (mutation.meta?.successMessage) {
      // showSuccessToast(mutation.meta.successMessage as string);
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
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
        // Only retry network errors once for mutations
        if (isNetworkError(error) && failureCount < 1) {
          return true;
        }
        return false;
      },
    },
  },
});

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
