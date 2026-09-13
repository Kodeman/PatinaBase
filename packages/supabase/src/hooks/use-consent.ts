'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { peopleKeys, peopleSeatKeys } from './use-people';

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT — one record per (organization, channel kind, channel value)
//
// R-AS / R-AY: `studio_channel_consent` is the ONLY thing any gate, RPC, view,
// trigger or edge path consults for consent. `project_parties.sms_consent_*`
// is frozen legacy — a BEFORE UPDATE trigger refuses a write to it — and the
// portal reads none of it.
//
// READS go through `channel_consent_status()` for the VERDICT (which folds
// `refusal_unanswered` into `opted_out`, so the room can never print "Texting"
// for a number every send is refused on) and through the table for the dates
// and the evidence. WRITES go through `record_channel_consent()` and its two
// siblings — the table itself carries a SELECT policy and nothing else.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** `studio_channel_consent.channel_kind` (00594). */
export type ConsentChannelKind = 'sms' | 'email';

/** `studio_channel_consent.status` (00594). */
export type ConsentStatus = 'not_asked' | 'pending' | 'granted' | 'opted_out';

/** `studio_channel_consent.source` / `.opt_out_source` (00594). */
export type ConsentSource = 'verbal' | 'written' | 'web_form' | 'inbound_sms' | 'other';

/** A `public.studio_channel_consent` row. */
export interface ChannelConsentRecord {
  organization_id: string;
  channel_kind: ConsentChannelKind;
  channel_value: string;
  status: ConsentStatus;
  consented_at: string | null;
  opt_out_at: string | null;
  /** A refusal the recipient has not answered. `channel_consent_status()`
   *  folds this into `opted_out`, so never re-derive a verdict from `status`
   *  alone — read `verdict` off `useChannelConsent`. */
  refusal_unanswered: boolean;
  source: ConsentSource | null;
  evidence: string | null;
  recorded_at: string | null;
  disclosure_version: string | null;
  recorded_by: string | null;
  opt_out_source: ConsentSource | null;
  opt_out_evidence: string | null;
  opt_out_recorded_at: string | null;
  opt_out_recorded_by: string | null;
  origin_project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelConsentResolution {
  /**
   * The one word every surface prints, from `channel_consent_status()`.
   * NULL means the studio holds NO record — a fact of its own, which must
   * render as nothing rather than as "Not asked" (R-BB).
   */
  verdict: ConsentStatus | null;
  /** The record behind the verdict: dates, source, evidence. NULL with the
   *  verdict, or when the caller is outside the owning studio. */
  record: ChannelConsentRecord | null;
}

export interface RecordChannelConsentInput {
  organizationId: string;
  channelKind: ConsentChannelKind;
  channelValue: string;
  /** `record_channel_consent` refuses `not_asked` as a target (R-AG). */
  status: Exclude<ConsentStatus, 'not_asked'>;
  source?: ConsentSource | null;
  evidence?: string | null;
  disclosureVersion?: string | null;
  originProjectId?: string | null;
}

export interface RecordChannelInviteInput {
  organizationId: string;
  channelKind: ConsentChannelKind;
  channelValue: string;
  source?: ConsentSource | null;
  evidence?: string | null;
  disclosureVersion?: string | null;
  originProjectId?: string | null;
}

export interface RecordChannelReconsentInput {
  organizationId: string;
  channelKind: ConsentChannelKind;
  channelValue: string;
  source: ConsentSource;
  evidence: string;
  disclosureVersion: string;
  originProjectId?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERRORS — the RPCs refuse in named ways; each is a fact a designer can act on
// ═══════════════════════════════════════════════════════════════════════════

/** What 00594's freeze raises when something still reaches for the frozen
 *  `project_parties.sms_consent_*` columns. Nothing in the portal writes them
 *  any more (R-AS); this stays so a stray path fails in words, not Postgres. */
export const CONSENT_LEGACY_FROZEN = 'consent_legacy_column_frozen';

export const CONSENT_FROZEN_SENTENCE =
  "Texting consent has moved to the studio's own record, and this screen hasn't caught up yet. Nothing was changed.";

/** Ordered so the most specific string wins; each entry is one named refusal
 *  the consent RPCs raise. */
const CONSENT_RPC_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  [
    'channel_opted_out',
    'This number already opted out of Patina texts. Only they can rejoin by replying START.',
  ],
  [
    'consent_awaiting_recipient',
    'This number has a standing refusal nobody has answered yet. Only they can rejoin by replying START.',
  ],
  ['invalid_channel_value', "That phone can't receive texts — fix the number first."],
  [
    'not_a_studio_member',
    'Only an active member of this studio can record texting consent.',
  ],
  [
    'consent_evidence_required',
    'Record how and where this person gave prior consent before sending a text.',
  ],
  [
    'no_opt_out_to_supersede',
    'There is no refusal on file for this number, so there is nothing to supersede.',
  ],
  [CONSENT_LEGACY_FROZEN, CONSENT_FROZEN_SENTENCE],
];

/**
 * Re-throws a consent RPC's named refusal as a written sentence. Anything else
 * passes through untouched — a sentence invented for an unknown error hides
 * the error.
 */
export function asWrittenConsentError(error: unknown): unknown {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return error;
  for (const [token, sentence] of CONSENT_RPC_SENTENCES) {
    if (message.includes(token)) return new Error(sentence);
  }
  return error;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const consentKeys = {
  all: ['channel-consent'] as const,
  record: (
    organizationId: string | null | undefined,
    channelKind: ConsentChannelKind | null | undefined,
    channelValue: string | null | undefined,
  ) =>
    [
      'channel-consent',
      organizationId ?? null,
      channelKind ?? null,
      channelValue ?? null,
    ] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The studio's consent for one channel value. Asks the VERDICT function and
 * the record together, so the word and the date behind it can never disagree.
 */
export function useChannelConsent(
  organizationId: string | null | undefined,
  channelKind: ConsentChannelKind | null | undefined,
  channelValue: string | null | undefined,
) {
  return useQuery({
    queryKey: consentKeys.record(organizationId, channelKind, channelValue),
    enabled: Boolean(organizationId && channelKind && channelValue),
    queryFn: async (): Promise<ChannelConsentResolution> => {
      if (!organizationId || !channelKind || !channelValue) {
        return { verdict: null, record: null };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: verdict, error: verdictError } = await supabase.rpc(
        'channel_consent_status',
        {
          p_organization_id: organizationId,
          p_channel_kind: channelKind,
          p_channel_value: channelValue,
        },
      );
      if (verdictError) throw verdictError;

      const { data: record, error: recordError } = await supabase
        .from('studio_channel_consent')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('channel_kind', channelKind)
        .eq('channel_value', channelValue)
        .maybeSingle();
      if (recordError) throw recordError;

      return {
        verdict: (verdict as ConsentStatus | null) ?? null,
        record: (record as ChannelConsentRecord | null) ?? null,
      };
    },
  });
}

/** Every key a consent write can move. The word prints on the Directory row,
 *  the seat line, the roster and the party sheet, so all four read models go. */
function invalidateConsentFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  input: { organizationId: string; channelKind: ConsentChannelKind; channelValue: string },
  projectId?: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: consentKeys.record(
      input.organizationId,
      input.channelKind,
      input.channelValue,
    ),
  });
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
  if (projectId) {
    void queryClient.invalidateQueries({ queryKey: ['project-roster', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-parties', projectId] });
  }
}

/**
 * Record consent, a refusal, or an invite against the studio's record.
 * `record_channel_consent` is SECURITY DEFINER, studio-member gated, refuses
 * `not_asked` as a target (R-AG), never nulls evidence (R-AN), and is the ONLY
 * door a consent fact may be written through.
 *
 * PR-m: `status: 'opted_out'` is the studio's own manual refusal — a verbal
 * STOP the studio heard — and requires a source and evidence like any other.
 */
export function useRecordChannelConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordChannelConsentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('record_channel_consent', {
        p_organization_id: input.organizationId,
        p_channel_kind: input.channelKind,
        p_channel_value: input.channelValue,
        p_status: input.status,
        p_source: input.source ?? null,
        p_evidence: input.evidence ?? null,
        p_disclosure_version: input.disclosureVersion ?? null,
        p_origin_project_id: input.originProjectId ?? null,
      });
      if (error) throw asWrittenConsentError(error);
      return data as unknown;
    },
    onSuccess: (_data, input) => {
      invalidateConsentFanout(queryClient, input, input.originProjectId);
    },
  });
}

/**
 * The ADD path's door. Records the first half of the double opt-in ONLY when
 * the studio holds nothing better on the books — a standing, sendable `granted`
 * is returned untouched rather than demoted to `pending`.
 */
export function useRecordChannelInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordChannelInviteInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('record_channel_invite', {
        p_organization_id: input.organizationId,
        p_channel_kind: input.channelKind,
        p_channel_value: input.channelValue,
        p_source: input.source ?? null,
        p_evidence: input.evidence ?? null,
        p_disclosure_version: input.disclosureVersion ?? null,
        p_origin_project_id: input.originProjectId ?? null,
      });
      if (error) throw asWrittenConsentError(error);
      return data as unknown;
    },
    onSuccess: (_data, input) => {
      invalidateConsentFanout(queryClient, input, input.originProjectId);
    },
  });
}

/**
 * The way back from a refusal the studio itself may record: a FRESH consent
 * with its own source and evidence, superseding a standing opt-out. The prior
 * refusal is kept as history, never erased (direction §5.2).
 */
export function useRecordChannelReconsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordChannelReconsentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('record_channel_reconsent', {
        p_organization_id: input.organizationId,
        p_channel_kind: input.channelKind,
        p_channel_value: input.channelValue,
        p_source: input.source,
        p_evidence: input.evidence,
        p_disclosure_version: input.disclosureVersion,
        p_origin_project_id: input.originProjectId ?? null,
      });
      if (error) throw asWrittenConsentError(error);
      return data as unknown;
    },
    onSuccess: (_data, input) => {
      invalidateConsentFanout(queryClient, input, input.originProjectId);
    },
  });
}

/**
 * The studio a project's consent record belongs to (`project_consent_org()`).
 * A project with no studio resolves to NULL and there is nowhere to record
 * consent — the caller says so in words rather than writing into no ledger.
 */
export function useProjectConsentOrg(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-consent-org', projectId ?? null],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<string | null> => {
      if (!projectId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('project_consent_org', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}
