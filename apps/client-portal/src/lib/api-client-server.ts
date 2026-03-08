/**
 * Server-side API Client Helpers
 * Use these helpers in Server Components and API Routes to make authenticated requests
 *
 * SECURITY: This file uses Supabase server client to retrieve tokens
 * from HTTP-only cookies. Tokens are NEVER exposed to client-side JavaScript.
 */

import 'server-only';

import { createServerClient } from '@patina/supabase/server';
import { env } from './env';

/**
 * Securely retrieves access token from Supabase session (server-side only)
 * This reads from HTTP-only cookies via the Supabase server client
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  } catch (error) {
    console.error('[Server API Client] Failed to get access token:', error);
    return null;
  }
}

/**
 * Make an authenticated fetch request to a backend service
 */
export async function serverFetch<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const accessToken = await getAccessToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error details');
    throw new Error(
      `Request failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ==================== Projects API ====================

export const serverProjectsApi = {
  async getProjects(signal?: AbortSignal) {
    return serverFetch<any>(env.projectsApiUrl, '/projects', { signal });
  },

  async getClientView(projectId: string, signal?: AbortSignal) {
    return serverFetch<any>(env.projectsApiUrl, `/projects/${projectId}/client-view`, { signal });
  },

  async submitApproval(
    projectId: string,
    approvalId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    comment?: string,
    signal?: AbortSignal
  ) {
    return serverFetch<any>(
      env.projectsApiUrl,
      `/projects/${projectId}/approvals/${approvalId}`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, comment }),
        signal,
      }
    );
  },

  async logEngagement(
    projectId: string,
    data: { event: string; metadata?: Record<string, unknown> },
    signal?: AbortSignal
  ) {
    return serverFetch<any>(
      env.projectsApiUrl,
      `/projects/${projectId}/engagement`,
      {
        method: 'POST',
        body: JSON.stringify(data),
        signal,
      }
    );
  },
};

// ==================== Comms API ====================

export const serverCommsApi = {
  async getThreads(projectId: string, signal?: AbortSignal) {
    return serverFetch<any>(env.commsApiUrl, `/threads?projectId=${projectId}`, { signal });
  },

  async getThread(threadId: string, signal?: AbortSignal) {
    return serverFetch<any>(env.commsApiUrl, `/threads/${threadId}`, { signal });
  },

  async getMessages(threadId: string, signal?: AbortSignal) {
    return serverFetch<any>(env.commsApiUrl, `/threads/${threadId}/messages`, { signal });
  },

  async sendMessage(
    threadId: string,
    content: string,
    attachments?: string[],
    signal?: AbortSignal
  ) {
    return serverFetch<any>(
      env.commsApiUrl,
      `/threads/${threadId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content, attachments }),
        signal,
      }
    );
  },
};
