const isDevelopment =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENV === 'development';

const resolveBaseUrl = (envKey: string, serviceName: string, defaultPort: number): string => {
  const envValue = process.env[`NEXT_PUBLIC_${envKey}`];

  if (envValue) {
    return envValue.replace(/\/$/, '');
  }

  if (isDevelopment) {
    return `http://localhost:${defaultPort}/v1`;
  }

  return `https://api.patina.cloud/${serviceName}/v1`;
};

const createUrl = (base: string, path: string) => {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalisedPath}`;
};

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetry = (status: number, attempt: number, options: Required<RetryOptions>): boolean => {
  return attempt < options.maxRetries && options.retryableStatuses.includes(status);
};

const jsonRequest = async <T>(
  base: string,
  path: string,
  init?: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<T> => {
  const options = { ...defaultRetryOptions, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const response = await fetch(createUrl(base, path), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
        credentials: 'include',
        signal: init?.signal,
      });

      // If response is successful, return data
      if (response.ok) {
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      }

      // Check if we should retry
      if (shouldRetry(response.status, attempt, options)) {
        const delay = options.retryDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(
          `Request failed with status ${response.status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // If not retryable, throw error
      const errorText = await response.text().catch(() => 'No error details available');
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}${errorText ? ` – ${errorText}` : ''}`
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log detailed error information for debugging
      if (error instanceof TypeError && error.message.includes('ECONNREFUSED')) {
        console.error('[api-client] Connection refused - Service may be unreachable:', {
          base,
          path,
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
          error: error.message,
          env: {
            NODE_ENV: process.env.NODE_ENV,
            NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
          },
        });
      }

      // If it's a network error and we haven't exhausted retries, try again
      if (
        (error instanceof TypeError || (error as any).name === 'FetchError') &&
        attempt < options.maxRetries
      ) {
        const delay = options.retryDelay * Math.pow(2, attempt);
        console.warn(
          `Network error occurred. Retrying in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // If we've exhausted retries or it's not a network error, throw
      throw lastError;
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('Request failed after all retry attempts');
};

const projectsBaseUrl = resolveBaseUrl('PROJECTS_API_URL', 'projects', 3016);
const commsBaseUrl = resolveBaseUrl('COMMS_API_URL', 'comms', 3017);

export const projectsApi = {
  async getProjects(signal?: AbortSignal) {
    return jsonRequest(projectsBaseUrl, '/projects', { signal }, { maxRetries: 2 });
  },
  async getClientView(projectId: string, signal?: AbortSignal) {
    return jsonRequest(
      projectsBaseUrl,
      `/projects/${projectId}/client-view`,
      { signal },
      { maxRetries: 2 }
    );
  },
  async submitApproval(
    projectId: string,
    approvalId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    comment?: string,
    signal?: AbortSignal
  ) {
    return jsonRequest(
      projectsBaseUrl,
      `/projects/${projectId}/approvals/${approvalId}`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, comment }),
        signal,
      },
      { maxRetries: 1 } // Only retry once for mutations
    );
  },
  async logEngagement(
    projectId: string,
    data: { event: string; metadata?: Record<string, unknown> },
    signal?: AbortSignal
  ) {
    return jsonRequest(
      projectsBaseUrl,
      `/projects/${projectId}/engagement`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        signal,
      },
      { maxRetries: 0 } // Don't retry analytics calls
    );
  },
};

export const commsApi = {
  async getThreads(params?: { projectId?: string; status?: string }, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    if (params?.projectId) searchParams.set('projectId', params.projectId);
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return jsonRequest(
      commsBaseUrl,
      `/v1/threads${query ? `?${query}` : ''}`,
      { signal },
      { maxRetries: 2 }
    );
  },

  async getThread(id: string, signal?: AbortSignal) {
    return jsonRequest(commsBaseUrl, `/v1/threads/${id}`, { signal }, { maxRetries: 2 });
  },

  async createMessage(
    threadId: string,
    data: { bodyText?: string; bodyMd?: string },
    signal?: AbortSignal
  ) {
    return jsonRequest(
      commsBaseUrl,
      `/v1/threads/${threadId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        signal,
      },
      { maxRetries: 1 }
    );
  },

  async markRead(threadId: string, lastReadMessageId: string, signal?: AbortSignal) {
    return jsonRequest(
      commsBaseUrl,
      `/v1/threads/${threadId}/read`,
      {
        method: 'POST',
        body: JSON.stringify({ lastReadMessageId }),
        signal,
      },
      { maxRetries: 1 }
    );
  },
};

type ClientFactory<T> = () => T;

const memo = <T>(factory: ClientFactory<T>) => {
  let value: T | undefined;
  return () => {
    if (!value) {
      value = factory();
    }
    return value;
  };
};

export const getProjectsClient = memo(() => projectsApi);
export const getCommsClient = memo(() => commsApi);

// Export error handling utilities
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};
