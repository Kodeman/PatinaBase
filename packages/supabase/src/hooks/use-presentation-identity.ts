import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION IDENTITY (US-37 #6, contract D8)
// ═══════════════════════════════════════════════════════════════════════════
//
// Who presents an approval to the client: the firm's mark and name, its
// website, and the lead designer's name, email and phone, with the firm's
// email and phone answering when the lead's are blank. One curated reader,
// `get_client_presentation_identity(p_project_id | p_proposal_id)` (00812),
// returns only those six keys and omits each one that has no value — so an
// absent field is `undefined` here, never an empty string.
//
// Keyed under `['studio-identity', …]` so `useUpdateOrganization`'s existing
// `['studio-identity']` invalidation refreshes it with every other branded
// surface.

const getSupabase = () => createBrowserClient();

export interface PresentationIdentity {
  firmName?: string;
  logoUrl?: string;
  website?: string;
  designerName?: string;
  email?: string;
  phone?: string;
}

export interface UsePresentationIdentityParams {
  /** Pass exactly one of projectId / proposalId. */
  projectId?: string | null;
  /** A paper with no project (an origin agreement) resolves through itself. */
  proposalId?: string | null;
}

const KEYS = ['firmName', 'logoUrl', 'website', 'designerName', 'email', 'phone'] as const;

/** Keeps only the six allowlisted keys, and only as non-blank strings. */
export function toPresentationIdentity(value: unknown): PresentationIdentity {
  const out: PresentationIdentity = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const source = value as Record<string, unknown>;
  for (const key of KEYS) {
    const field = source[key];
    if (typeof field === 'string' && field.trim()) out[key] = field.trim();
  }
  return out;
}

export function usePresentationIdentity(params: UsePresentationIdentityParams) {
  const projectId = params.projectId ?? null;
  // A project wins: the reader takes exactly one id.
  const proposalId = projectId ? null : (params.proposalId ?? null);

  return useQuery({
    queryKey: ['studio-identity', 'presentation', { projectId, proposalId }],
    enabled: !!(projectId || proposalId),
    queryFn: async (): Promise<PresentationIdentity> => {
      const supabase = getSupabase();
      const args = projectId ? { p_project_id: projectId } : { p_proposal_id: proposalId as string };
      const { data, error } = await supabase.rpc('get_client_presentation_identity', args);
      if (error) throw error;
      return toPresentationIdentity(data);
    },
  });
}
