export interface InviteDesignerRequest {
  email: string;
  displayName?: string;
  personalObservation: string;
  role?: string;
}

export interface InviteDesignerResponse {
  userId: string;
  email: string;
}

/** Helper to make JSON API calls to Next.js API routes (mirrors services/users.ts). */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const designersService = {
  /**
   * Branded designer invite (designer-onboarding program). Routes through
   * api/admin/designers/invite, which invokes the designer-invite edge
   * function with the caller's own session — never the service-role client.
   */
  async invite(data: InviteDesignerRequest): Promise<InviteDesignerResponse> {
    const json = await apiFetch<{ data: InviteDesignerResponse }>('/api/admin/designers/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  },
};
