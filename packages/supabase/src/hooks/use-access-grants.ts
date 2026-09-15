'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { partySmsKeys } from './use-party-sms';

// ═══════════════════════════════════════════════════════════════════════════
// E9 — EVERY DOOR PATINA OPENS, IN ONE SHAPE
//
// `public.v_access_grants` (00627, twelfth branch 00637) is a security_invoker
// UNION over the twelve token tables, normalised to twelve columns. It carries
// NO bearer credential:
// four of the twelve sources are closed to `authenticated` at the GRANT level
// and reach the view through their own narrow SECURITY DEFINER readers, which
// return the twelve columns and never a token or a hash.
//
// The view is READ ONLY. Revoking stays in each table's own RPC, and this
// module is the routing table from a grant row back to the RPC that closes it
// (direction §5.3: "Writes stay in each table's own RPC").
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** The twelve tiers `v_access_grants` unions. The twelfth is 00637's
 *  firm-scoped paperwork door (PR-a / VISION V10). */
export type AccessGrantTier =
  | 'studio_member'
  | 'client_account'
  | 'field_link'
  | 'doc_share'
  | 'rfq_link'
  | 'agreement_link'
  | 'plan_link'
  | 'site_request'
  | 'invoice_pay'
  | 'evidence_upload'
  | 'project_review'
  | 'paperwork_link';

export const ALL_ACCESS_GRANT_TIERS: readonly AccessGrantTier[] = [
  'studio_member',
  'client_account',
  'field_link',
  'doc_share',
  'rfq_link',
  'agreement_link',
  'plan_link',
  'site_request',
  'invoice_pay',
  'evidence_upload',
  'project_review',
  'paperwork_link',
] as const;

/** The words the studio reads. "Field link", not `field_link`. */
export const ACCESS_GRANT_TIER_LABELS: Record<AccessGrantTier, string> = {
  studio_member: 'Studio member',
  client_account: 'Client account',
  field_link: 'Field link',
  doc_share: 'Document share',
  rfq_link: 'Bid link',
  agreement_link: 'Agreement link',
  plan_link: 'Plan link',
  site_request: 'Site request',
  invoice_pay: 'Invoice pay link',
  evidence_upload: 'Evidence upload',
  project_review: 'Review access',
  paperwork_link: 'Paperwork link',
};

/** What each tier opens, in words — direction §5.1's "what it opens" column. */
export const ACCESS_GRANT_TIER_OPENS: Record<AccessGrantTier, string> = {
  studio_member: 'the whole studio book',
  client_account: 'their own project pages',
  field_link: 'the Call Sheet and the site access card',
  doc_share: 'one proposal',
  rfq_link: 'one bid request',
  agreement_link: 'one trade agreement',
  plan_link: 'one plan transmittal',
  site_request: 'one site request',
  invoice_pay: 'one invoice, to pay it',
  evidence_upload: 'one exception, to upload evidence',
  project_review: 'one review edition',
  paperwork_link: "one firm's paperwork, to send it in",
};

/** A row of `public.v_access_grants` (00627). */
export interface AccessGrant {
  /** `<tier>:<natural key>`. TEXT, because the twelve sources' keys are not
   *  all uuids. Never a token and never a hash of one. */
  grant_id: string;
  tier: AccessGrantTier | string;
  subject_type: 'profile' | 'engagement' | 'contact' | 'link' | 'exception' | string;
  subject_id: string | null;
  scope_type: string | null;
  scope_id: string | null;
  granted_by: string | null;
  granted_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface AccessGrantFilters {
  /** The seat, card or profile the door was opened FOR. */
  subjectId?: string | null;
  /**
   * EVERY subject one identity answers to (CR-2). `subject_id` is an
   * ENGAGEMENT id on a `field_link` and a PROFILE id on a `client_account` or
   * `studio_member` — never a rolodex card id — so a person card asking for
   * their card id matched nothing at all. A card resolves to its seats and its
   * login, and the region asks for all of them at once.
   */
  subjectIds?: readonly string[] | null;
  /** The project, proposal, edition … the door opens ONTO. */
  scopeId?: string | null;
  tier?: AccessGrantTier | null;
  /** false (default) keeps revoked rows out of the list. */
  includeRevoked?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE REVOKE ROUTING TABLE
// ═══════════════════════════════════════════════════════════════════════════

export interface AccessGrantRevokeRoute {
  /** The RPC that closes this tier's door. */
  rpc: string;
  /** The RPC argument the grant's natural key goes into. */
  idArg: string;
  /** The RPC argument a reason goes into, when it takes one. */
  reasonArg?: string;
  /** True when the RPC REQUIRES a reason (it raises without one). */
  reasonRequired?: boolean;
  /**
   * True when the RPC closes the door for EVERY subject on the scope, not just
   * this row's. `revoke_project_review_access` revokes the whole edition, so a
   * per-row Revoke there closes every reviewer — the surface must say so in
   * its consequence sentence before the act.
   */
  revokesWholeScope?: boolean;
  /**
   * Which segment of `grant_id` (split on ':') carries the RPC's argument.
   * `project_review`'s id is `project_review:<edition>:<actor>` and the RPC
   * takes the EDITION, so this is 1 there as everywhere else — but stated, not
   * assumed.
   */
  keySegment: number;
}

/**
 * Tier → the RPC that closes it. Seven of the twelve tiers have no revoke RPC
 * at all (`null`): a studio membership and a client account are ended in their
 * own rooms, and the bid / agreement / invoice / evidence tokens carry no
 * shipped revoke door. `site_request` HAS one — `site_request_revoke_access(p_request_id)`
 * — but it takes the REQUEST id, which `v_access_grants` does not carry (the
 * row's natural key is the ACCESS id), so it cannot be routed from a grant row.
 *
 * A `null` is a fact for the surface to print, never a reason to invent a write.
 */
export const ACCESS_GRANT_REVOKE_ROUTES: Record<
  AccessGrantTier,
  AccessGrantRevokeRoute | null
> = {
  field_link: { rpc: 'revoke_field_link', idArg: 'p_token_id', keySegment: 1 },
  doc_share: { rpc: 'revoke_document_share', idArg: 'p_share_id', keySegment: 1 },
  plan_link: {
    rpc: 'revoke_plan_transmittal_link',
    idArg: 'p_transmittal_id',
    keySegment: 1,
  },
  project_review: {
    rpc: 'revoke_project_review_access',
    idArg: 'p_edition_id',
    reasonArg: 'p_reason',
    reasonRequired: true,
    revokesWholeScope: true,
    keySegment: 1,
  },
  studio_member: null,
  client_account: null,
  rfq_link: null,
  agreement_link: null,
  site_request: null,
  invoice_pay: null,
  evidence_upload: null,
  // 00637's own revoke. The row is kept (spec §7 audit) and the reason is
  // optional, so the card's two-step confirm reads the same as every other.
  paperwork_link: {
    rpc: 'revoke_paperwork_link',
    idArg: 'p_token_id',
    reasonArg: 'p_reason',
    keySegment: 1,
  },
};

/** The sentence a surface prints where a tier has no door to close here. */
export const ACCESS_GRANT_NOT_REVOKABLE_SENTENCE =
  'This door is closed somewhere else in Patina, not from here.';

export function accessGrantRevokeRoute(
  tier: string | null | undefined,
): AccessGrantRevokeRoute | null {
  if (!tier) return null;
  return ACCESS_GRANT_REVOKE_ROUTES[tier as AccessGrantTier] ?? null;
}

export function isAccessGrantRevokable(tier: string | null | undefined): boolean {
  return accessGrantRevokeRoute(tier) !== null;
}

/** `<tier>:<key>` → the key the route's RPC wants. */
export function accessGrantNaturalKey(
  grantId: string,
  route: AccessGrantRevokeRoute,
): string | null {
  const parts = grantId.split(':');
  return parts[route.keySegment] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const accessGrantKeys = {
  all: ['access-grants'] as const,
  list: (filters?: AccessGrantFilters) => ['access-grants', filters ?? {}] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/** Every door open onto a subject or a scope. Read only. */
export function useAccessGrants(filters?: AccessGrantFilters) {
  const subjectIds = (filters?.subjectIds ?? []).filter(Boolean);
  const enabled = Boolean(
    filters?.subjectId || subjectIds.length > 0 || filters?.scopeId || filters?.tier,
  );
  return useQuery({
    queryKey: accessGrantKeys.list(filters),
    enabled,
    queryFn: async (): Promise<AccessGrant[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase.from('v_access_grants').select('*');
      if (filters?.subjectId) query = query.eq('subject_id', filters.subjectId);
      if (subjectIds.length > 0) query = query.in('subject_id', subjectIds);
      if (filters?.scopeId) query = query.eq('scope_id', filters.scopeId);
      if (filters?.tier) query = query.eq('tier', filters.tier);
      if (!filters?.includeRevoked) query = query.is('revoked_at', null);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as AccessGrant[];
      // Newest door first — the studio reads the most recent grant as the live
      // one. Nulls last rather than first: an undated row is not the newest.
      return rows.sort((a, b) => {
        if (!a.granted_at) return 1;
        if (!b.granted_at) return -1;
        return b.granted_at.localeCompare(a.granted_at);
      });
    },
  });
}

export interface RevokeAccessGrantInput {
  grantId: string;
  tier: AccessGrantTier | string;
  /** Optional on every route but `project_review`, which raises without it. */
  reason?: string | null;
}

/**
 * Close one door, through the tier's OWN revoke RPC. Nothing here writes a
 * token table directly — `v_access_grants` is a read model and the twelve
 * sources each keep their own gate.
 */
export function useRevokeAccessGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RevokeAccessGrantInput) => {
      const route = accessGrantRevokeRoute(input.tier);
      if (!route) throw new Error(ACCESS_GRANT_NOT_REVOKABLE_SENTENCE);

      const key = accessGrantNaturalKey(input.grantId, route);
      if (!key) {
        throw new Error(
          "This door's record can't be read back, so it can't be closed from here.",
        );
      }

      const reason = input.reason?.trim() || null;
      if (route.reasonRequired && !reason) {
        throw new Error('Say why the door closes. This one keeps the reason on record.');
      }

      const args: Record<string, unknown> = { [route.idArg]: key };
      if (route.reasonArg) args[route.reasonArg] = reason;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(route.rpc, args);
      if (error) throw error;
      return data as unknown;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accessGrantKeys.all });
      // CR-12: `people_directory.reach_state` is "account, else a LIVE
      // unexpired field link on one of this identity's seats, else on paper".
      // Closing a door therefore changes the reach word on the Directory row,
      // the seat line and every roster row. `useCreateFieldLink` already
      // invalidates all three when a door OPENS; the revoke must mirror it, or
      // the word goes on claiming a door that is shut.
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
      void queryClient.invalidateQueries({ queryKey: ['people-directory-seats'] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster'] });
      // CR11-8: the person card's Revoke and the party sheet's Revoke close the
      // same token. `useRevokeFieldLink` tells the sheet's own field-link list;
      // this route must too, or the sheet keeps listing a door that is shut.
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.all });
      // W4 r1 MAJOR-3: the twelfth tier's subject IS the company card, and the
      // company card mounts the grants list and the paperwork mint act
      // together. `useMintPaperworkLink` invalidates both directions; the
      // revoke told only its own list, so PaperworkLinkAct went on printing
      // "<firm> already holds a live paperwork link" about a door just shut.
      // The literal key, not `paperworkLinkKeys` — use-paperwork-links.ts
      // imports `accessGrantKeys` from here, and importing back is a cycle.
      void queryClient.invalidateQueries({ queryKey: ['paperwork-links'] });
    },
  });
}
