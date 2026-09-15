'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { accessGrantKeys } from './use-access-grants';

// ═══════════════════════════════════════════════════════════════════════════
// PR-a / VISION V10 — THE FIRM'S PAPERWORK DOOR
//
// `paperwork_link_tokens` (00637) is keyed to (studio, firm), never to a seat
// on a job: a firm's paperwork contact holds ONE link however many of the
// studio's jobs they are on (R-AF). sha256 at rest; the raw address exists
// exactly once, in the answer to `mint_paperwork_link`, and Patina never holds
// a readable copy of it afterwards.
//
// R-AD IS THE CLOCK. The window is the firm's own engagement window at this
// studio; a firm with no open engagement may still be given a door, but the
// STUDIO NAMES THE DATE — thirty days or the firm's next window, said out loud
// on the act. There is no silent fallback clock, and the mint is refused
// outright rather than inventing one.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

/** A row of `public.paperwork_link_tokens` (00637). Never a token, never a
 *  hash: the SELECT below names its columns so neither can be read back. */
export interface PaperworkLinkToken {
  id: string;
  organization_id: string;
  company_id: string;
  status: 'active' | 'revoked' | string;
  expires_at: string;
  last_used_at: string | null;
  created_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** The columns a face may read. `token_hash` is deliberately absent. */
const TOKEN_COLUMNS =
  'id, organization_id, company_id, status, expires_at, last_used_at, ' +
  'created_by, revoked_at, revoked_by, revoke_reason, created_at, updated_at';

export const paperworkLinkKeys = {
  all: ['paperwork-links'] as const,
  forCompany: (companyId: string | null | undefined) =>
    ['paperwork-links', companyId ?? null] as const,
};

/**
 * 00637's named refusals, said in words.
 *
 * Every one is raised as a BARE TOKEN — `paperwork_link_window_required` has a
 * HINT and a SQLSTATE but no schema word in it — so nothing downstream matches
 * them and the token itself would reach the face.
 */
const PAPERWORK_LINK_REFUSAL_SENTENCES: Record<string, string> = {
  paperwork_link_window_required:
    'This firm has no open engagement here, so the door needs an end date. ' +
    'Choose thirty days, or name the day their next window closes.',
  paperwork_link_not_authorized:
    "This firm's book is not yours to write. Ask an owner or admin of the studio.",
  paperwork_token_company_required:
    'A paperwork link is a firm’s door, never a person’s.',
  paperwork_token_company_wrong_studio:
    "That firm's card belongs to another studio's book.",
  paperwork_token_company_not_found:
    'That firm has no card in this studio’s book.',
};

export function asPaperworkLinkError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [token, sentence] of Object.entries(
    PAPERWORK_LINK_REFUSAL_SENTENCES,
  )) {
    if (message.includes(token)) return sentence;
  }
  if (/row-level security|permission denied|42501/i.test(message)) {
    return PAPERWORK_LINK_REFUSAL_SENTENCES.paperwork_link_not_authorized;
  }
  return message || 'Could not open that door just now.';
}

/** Where the firm reads its paper. An eighth guest prefix beside `/field`. */
export function paperworkLinkUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL?.replace(/\/$/, '') ??
    'https://client.patina.cloud';
  return `${base}/paperwork/${token}`;
}

/** A day the studio may choose, thirty days out, as `YYYY-MM-DD`. R-AD's first
 *  named option — a value the studio picks, never a clock that runs by itself. */
export function thirtyDaysOut(now: Date = new Date()): string {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() + 30);
  return at.toISOString().slice(0, 10);
}

/**
 * The end of the firm's own work at this studio: the latest `on_site_to` or
 * `warranty_until` across its OPEN seats — the date `mint_paperwork_link`
 * itself derives when no date is named. Read on the face so the act can print
 * the date before it is taken rather than after.
 *
 * Returns null where nothing is open, which is exactly R-AD's case: the studio
 * has to choose.
 *
 * A DAY THAT HAS PASSED IS NOT A WINDOW. `mint_paperwork_link` keeps only days
 * whose end-of-day is still ahead (`v_window_end + interval '1 day' > now()`,
 * 00637:470-475) and otherwise raises `paperwork_link_window_required`. Without
 * the same test here, a firm holding an open seat whose `on_site_to` has passed
 * — the ordinary state of a crew nobody stamped off the job — made the band
 * print "The door can end with this firm's work here, 1 March 2026", pre-select
 * that radio, and then meet the RPC's "This firm has no open engagement here"
 * on its own default choice (W4 r2 MAJOR-2). Matching the RPC's predicate makes
 * such a firm read NO_ENGAGEMENT_SENTENCE and default to thirty days.
 */
export function firmEngagementWindowEnd(
  seats: ReadonlyArray<{
    company_id: string | null;
    off_job_at?: string | null;
    on_site_to: string | null;
    warranty_until: string | null;
  }>,
  companyId: string,
  now: Date = new Date(),
): string | null {
  const today = now.toISOString().slice(0, 10);
  let latest: string | null = null;
  for (const seat of seats) {
    if (seat.company_id !== companyId) continue;
    if (seat.off_job_at) continue;
    for (const day of [seat.on_site_to, seat.warranty_until]) {
      // `>= today`, not `> today`: the RPC's `day + 1 day > now()` keeps a
      // window ending TODAY, and the two must agree exactly.
      if (day && day >= today && (!latest || day > latest)) latest = day;
    }
  }
  return latest;
}

/** Every door ever opened onto this firm's paper, newest first. Revoked rows
 *  stay: the token table IS the audit trail of who had a live door and when
 *  (spec §7), so a closed door is a fact the card keeps. */
export function usePaperworkLinks(companyId: string | null | undefined) {
  return useQuery({
    queryKey: paperworkLinkKeys.forCompany(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<PaperworkLinkToken[]> => {
      if (!companyId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('paperwork_link_tokens')
        .select(TOKEN_COLUMNS)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaperworkLinkToken[];
    },
  });
}

export interface MintPaperworkLinkInput {
  companyId: string;
  /**
   * R-AD — the date the STUDIO named, as `YYYY-MM-DD` or a timestamp. Omitted,
   * the RPC takes the firm's engagement window; with no window and no named
   * date it REFUSES rather than falling back to a clock nobody chose.
   */
  expiresAt?: string | null;
}

export interface MintedPaperworkLink {
  id: string;
  /** The raw address, returned ONCE. Show it or copy it now. */
  token: string;
  expires_at: string;
}

/**
 * Open the firm's paperwork door and hand back its address once.
 *
 * R-AF: the RPC revokes the firm's prior live link on the way, so there is
 * never a second live address to the same paper.
 */
export function useMintPaperworkLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: MintPaperworkLinkInput,
    ): Promise<MintedPaperworkLink> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('mint_paperwork_link', {
        p_company_id: input.companyId,
        p_expires_at: input.expiresAt ?? null,
      });
      if (error) throw new Error(asPaperworkLinkError(error));
      // RETURNS TABLE (id, token, expires_at) → a one-row array.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('Could not open that door just now.');
      return row as MintedPaperworkLink;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: paperworkLinkKeys.forCompany(input.companyId),
      });
      // The door is `v_access_grants`' twelfth tier, so the firm's Access
      // grants list is reading a row this mint just replaced (R-AF).
      void queryClient.invalidateQueries({ queryKey: accessGrantKeys.all });
    },
  });
}

/**
 * Close the firm's paperwork door. The row is KEPT — spec §7's audit trail —
 * and the reason is optional and stored where `v_access_grants` reads it.
 *
 * The company card's Access grants list revokes through
 * `useRevokeAccessGrant`'s routing table, which reaches the same RPC; this
 * hook is the direct door for a surface holding the token row itself.
 */
export function useRevokePaperworkLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tokenId: string;
      companyId: string;
      reason?: string | null;
    }): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('revoke_paperwork_link', {
        p_token_id: input.tokenId,
        p_reason: input.reason?.trim() || null,
      });
      if (error) throw new Error(asPaperworkLinkError(error));
      return Boolean(data);
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: paperworkLinkKeys.forCompany(input.companyId),
      });
      void queryClient.invalidateQueries({ queryKey: accessGrantKeys.all });
    },
  });
}
