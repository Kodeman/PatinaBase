import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { handleApiError, logError, showErrorToast, isAuthError, isNetworkError } from './error-handler';

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

    // Handle auth errors - but DON'T redirect automatically
    // Let the API interceptor handle redirects to avoid loops
    // Only show error if we're not already on an auth page
    if (isAuthError(appError)) {
      if (typeof window !== 'undefined') {
        const isAuthPage = window.location.pathname.startsWith('/auth');
        // Don't redirect or show error if already on auth page
        if (!isAuthPage) {
          // Let individual queries handle auth errors in their UI
          console.warn('Authentication error in query:', query.queryKey);
        }
      }
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

    // Log error for monitoring
    logError(appError, {
      mutationKey: mutation.options.mutationKey,
      meta: mutation.meta,
    });

    // Handle auth errors - but DON'T redirect automatically
    // Let the API interceptor handle redirects to avoid loops
    if (isAuthError(appError)) {
      if (typeof window !== 'undefined') {
        const isAuthPage = window.location.pathname.startsWith('/auth');
        if (!isAuthPage) {
          console.warn('Authentication error in mutation:', mutation.options.mutationKey);
          // Show a user-friendly error for mutations
          showErrorToast({
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Please sign in to continue',
          });
        }
      }
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
      suspense: false, // Explicitly disable suspense - we handle loading states manually
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
    ffeItems: (projectId: string) => [...queryKeys.projects.all, projectId, 'ffe-items'] as const,
    financials: (projectId: string) => [...queryKeys.projects.all, projectId, 'financials'] as const,
    timeTracking: (projectId: string) => [...queryKeys.projects.all, projectId, 'time-tracking'] as const,
    keyMetrics: (projectId: string) => [...queryKeys.projects.all, projectId, 'key-metrics'] as const,
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
