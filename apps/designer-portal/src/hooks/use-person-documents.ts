/**
 * Person → documents (Arrival Arc Phase 1, package acceptance: "documents
 * appear under Projects" / "a joined query from person → documents returns
 * her doc" — DECISIONS.md I63/T2). Portal-local like use-document-state.ts
 * and use-desk-engagements.ts: `document_state` isn't in the generated
 * database.types.ts, so the client is cast like the other document_state
 * consumers.
 *
 * Two populations, by how the person can be identified:
 *
 *  · Login client/lead (`profileId` set) — one query on
 *    `client_profile_id = profileId`. Every shape (A/B/C/D) already carries
 *    that column, so this alone returns her full document set.
 *
 *  · No-login household (`profileId` null) — `document_state` carries no
 *    direct household key today, so this resolves through the
 *    `designer_clients` relationship in two independent legs, each
 *    degrading to `[]` on its own rather than failing the whole read (the
 *    `useDeskEngagements` precedent: "the Desk never dies on a side feed"):
 *      - Shape D — the relationship's own row: `engagement_kind =
 *        'relationship' AND engagement_id = designerClientId`. Live against
 *        today's schema (v10 / 00236).
 *      - Shape B — via the migration lane's additive `proposals
 *        .designer_client_id` column (v11, landing in parallel — I63/T2):
 *        resolve this household's proposal ids, then `document_state` rows
 *        for those `proposal_id`s. Until v11 ships, `designer_client_id`
 *        doesn't exist yet and Postgres answers 42703 (undefined_column) —
 *        caught here and treated as "no proposal-shaped document yet" so a
 *        no-login profile never AppErrors while the two lanes are mid-flight.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

/** Postgres "undefined_column" — the fingerprint for a not-yet-migrated
 *  schema (pre-v11 `proposals.designer_client_id`). */
const UNDEFINED_COLUMN = '42703';

async function fetchByProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  profileId: string,
): Promise<DocumentStateRow[]> {
  const { data, error } = await supabase
    .from('document_state')
    .select('*')
    .eq('client_profile_id', profileId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentStateRow[];
}

async function fetchRelationshipLeg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  designerClientId: string,
): Promise<DocumentStateRow[]> {
  const { data, error } = await supabase
    .from('document_state')
    .select('*')
    .eq('engagement_kind', 'relationship')
    .eq('engagement_id', designerClientId);
  if (error) throw error;
  return (data ?? []) as DocumentStateRow[];
}

async function fetchProposalLeg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  designerClientId: string,
): Promise<DocumentStateRow[]> {
  const { data: props, error: propsError } = await supabase
    .from('proposals')
    .select('id')
    .eq('designer_client_id', designerClientId);
  if (propsError) {
    // Pre-v11 schema: the column doesn't exist yet — quiet degrade, not an
    // AppError. Any OTHER error is real and should surface.
    if (propsError.code === UNDEFINED_COLUMN) return [];
    throw propsError;
  }
  const proposalIds = (props ?? []).map((p: { id: string }) => p.id);
  if (proposalIds.length === 0) return [];

  const { data, error } = await supabase
    .from('document_state')
    .select('*')
    .in('proposal_id', proposalIds);
  if (error) throw error;
  return (data ?? []) as DocumentStateRow[];
}

/** De-dupe by engagement_id and re-sort — the two no-login legs are
 *  independent fetches, so this keeps the merged result as tidy as the
 *  single-query login-client path. */
function mergeRows(rows: DocumentStateRow[][]): DocumentStateRow[] {
  const seen = new Set<string>();
  const merged: DocumentStateRow[] = [];
  for (const row of rows.flat()) {
    if (seen.has(row.engagement_id)) continue;
    seen.add(row.engagement_id);
    merged.push(row);
  }
  return merged.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/**
 * The person's document_state rows — for the person profile's Projects/
 * documents section. `designerClientId` is `designer_clients.id` (what
 * `useClient`/`useClientProjects` call `clientId`); `profileId` is the
 * person's linked auth profile, or `null` for a no-login household.
 */
export function usePersonDocuments(
  designerClientId: string,
  profileId: string | null | undefined,
) {
  return useQuery<DocumentStateRow[]>({
    queryKey: ['document-state', 'person', designerClientId, profileId ?? null],
    enabled: !!designerClientId,
    queryFn: async () => {
      const supabase = getSupabase();

      if (profileId) {
        return fetchByProfile(supabase, profileId);
      }

      const [relationshipRows, proposalRows] = await Promise.all([
        fetchRelationshipLeg(supabase, designerClientId),
        fetchProposalLeg(supabase, designerClientId),
      ]);
      return mergeRows([relationshipRows, proposalRows]);
    },
  });
}
