'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { smsReviewKeys } from './use-sms-review';

// ═══════════════════════════════════════════════════════════════════════════
// PARTY SMS + FIELD LINK — the party-profile sheet's data layer (Wave 5)
//
// One field party's SMS thread (sms_messages, 00282, team-scoped SELECT), the
// "Send text" composer (invokes the sms-dispatch edge fn with {partyId, body} —
// the edge fn authorizes the caller against the party's project and gates on
// consent), and the no-auth field link (create_field_link / revoke_field_link,
// 00283 — the raw token is returned once at mint). Field-media MMS/photos
// resolve to short-lived signed URLs from the private field-media bucket.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

const SIGNED_URL_TTL_SECONDS = 3600;

export interface PartySmsMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  media: Array<{ path?: string; content_type?: string; twilio_url?: string }>;
  template_key: string | null;
  twilio_status: string | null;
  error_code?: string | null;
  needs_review: boolean;
  created_at: string;
}

export const partySmsKeys = {
  /** Every field-link list, for a revoke that does not know the seat. */
  all: ['field-links'] as const,
  thread: (partyId: string | null | undefined) => ['party-sms', partyId ?? 'none'] as const,
  links: (partyId: string | null | undefined) => ['field-links', partyId ?? 'none'] as const,
};

/**
 * A field party's SMS thread, oldest-first (chat order). RLS scopes the read to
 * the team; a 30s poll keeps an open sheet current without realtime plumbing.
 */
export function usePartySmsThread(partyId: string | null | undefined) {
  return useQuery({
    queryKey: partySmsKeys.thread(partyId),
    enabled: !!partyId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PartySmsMessage[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('sms_messages')
        .select(
          'id, conversation_id, direction, body, media, template_key, twilio_status, error_code, needs_review, created_at',
        )
        .eq('party_id', partyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PartySmsMessage[]).map((m) => ({
        ...m,
        media: Array.isArray(m.media) ? m.media : [],
      }));
    },
  });
}

/**
 * Send a text to a field party ("Send text" composer). Invokes the sms-dispatch
 * edge fn with {partyId, body}; the fn resolves the phone + consent server-side
 * and logs the outbound message. Callers gate the composer on consent='granted'.
 */
export interface PartySmsResult {
  id?: string;
  status: 'sent' | 'queued' | 'deferred' | 'failed';
  reason?: string;
  dueAt?: string;
  provider_code?: string;
}

/** Never turn an unrecognized transport response into a sent receipt. */
function dispatchResult(value: unknown): PartySmsResult {
  const row = value as Record<string, unknown> | null;
  if (!row || !['sent', 'queued', 'deferred', 'failed'].includes(String(row.status))) {
    throw new Error("Couldn't confirm the send. Your draft is still here.");
  }
  return {
    status: row.status as PartySmsResult['status'],
    id: typeof row.id === 'string' ? row.id : typeof row.messageId === 'string' ? row.messageId : undefined,
    reason: typeof row.reason === 'string' ? row.reason : undefined,
    dueAt: typeof row.dueAt === 'string' ? row.dueAt : undefined,
    provider_code: row.provider_code == null ? undefined : String(row.provider_code),
  };
}

export function smsResultWords(result: PartySmsResult): string {
  if (result.status === 'sent') return 'Sent';
  if (result.status === 'queued') return 'Queued to send';
  if (result.status === 'deferred') return result.dueAt
    ? 'Will send at ' + new Date(result.dueAt).toLocaleString()
    : 'Waiting to send';
  if (result.provider_code === '30007') return 'Carrier blocked this text.';
  if (result.provider_code === '21610') return "They've opted out.";
  if (result.reason === 'opted_out') return "They've opted out.";
  if (result.reason === 'sid_unrecorded') return "The carrier may have it, but we couldn't save its receipt. Check the thread before sending again.";
  if (result.reason === 'defer_failed') return "Couldn't save this text for later. Try again.";
  if (result.reason === 'no_phone_number') return 'Add their phone number first.';
  if (result.reason === 'not_consented') return "They haven't said yes yet.";
  if (result.reason === 'suppressed') return "They've asked us to stop.";
  if (result.reason === 'prompt_code_unavailable') return "Couldn't get them a reply code, try again.";
  return "The carrier didn't accept it.";
}

export function useSendPartySms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyId, body }: { partyId: string; body: string }) => {
      const supabase = getSupabase();
      try {
        const { data, error } = await supabase.functions.invoke('sms-dispatch', {
          body: { partyId, body },
        });
        if (error) throw error;
        return dispatchResult(data);
      } catch (error) {
        // FunctionsHttpError carries the non-2xx response in context, whether
        // invoke returns it as error or a wrapper throws it.
        const response = (error as { context?: { json?: () => Promise<unknown> } })?.context;
        if (typeof response?.json === 'function') {
          try { return dispatchResult(await response.json()); } catch { /* unknown response */ }
        }
        throw new Error("Couldn't confirm the send. Your draft is still here.");
      }
    },
    onSuccess: (_data, { partyId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.thread(partyId) });
    },
  });
}

export interface FieldLinkToken {
  id: string;
  party_id: string;
  project_id: string;
  status: 'active' | 'revoked';
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

/** The active field-link token for a party (metadata only — never the raw
 *  token, which exists once at mint). Drives the sheet's "link is live" state. */
export function useActiveFieldLink(partyId: string | null | undefined) {
  return useQuery({
    queryKey: partySmsKeys.links(partyId),
    enabled: !!partyId,
    queryFn: async (): Promise<FieldLinkToken | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_link_tokens')
        .select('id, party_id, project_id, status, expires_at, last_used_at, created_at')
        .eq('party_id', partyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FieldLinkToken | null) ?? null;
    },
  });
}

export interface CreateFieldLinkInput {
  partyId: string;
  /** Explicit regeneration closes the old URLs; routine minting does not. */
  revokePrior?: boolean;
  /**
   * PR-l — the studio's CHOICE of end date, when it has one to make. The RPC
   * outranks it with the seat's own window where the seat HAS one (the later
   * of `on_site_to` and `warranty_until`, through the end of that day); a
   * windowless seat takes this date; a windowless seat with no date falls back
   * to the old 90 days, which PR-d retires as a DEFAULT, not as a value — a
   * seat with no window still needs an end.
   */
  expiresAt?: string | null;
  /** Invalidates this project's roster reads when the mint changes a seat's
   *  reach word from "On paper" to "Field link". */
  projectId?: string | null;
}

/**
 * Mint (or explicitly regenerate) a field link for a seat. With revokePrior,
 * create_field_link revokes prior active tokens and returns the RAW token exactly once — the caller
 * shows/copies it now; only sha256(token) is stored. Same RPC serves "Copy
 * field link" and "Regenerate".
 *
 * PR-d (00627): THE GRANT ENDS WITH THE JOB. The two-argument signature reads
 * the expiry off the seat's window, so the mint act's consequence sentence
 * ("until the job's window closes, 13 August 2027") states a fact rather than a
 * flat 90-day clock unrelated to the work. 00284's authorization guard and its
 * supersede are carried verbatim by that signature, so nothing about who may
 * mint has moved.
 */
export function useCreateFieldLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyId, expiresAt, revokePrior = false }: CreateFieldLinkInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_field_link', {
        p_party_id: partyId,
        p_expires_at: expiresAt ?? null,
        p_revoke_prior: revokePrior,
      });
      if (error) throw error;
      // RETURNS TABLE (id, token) → a one-row array.
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; token: string };
    },
    onSuccess: (_data, { partyId, projectId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.links(partyId) });
      void queryClient.invalidateQueries({ queryKey: ['access-grants'] });
      // A live field link is exactly what `reach_state` reads as "Field link"
      // on both directory views.
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
      void queryClient.invalidateQueries({ queryKey: ['people-directory-seats'] });
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ['project-roster', projectId] });
      }
    },
  });
}

/**
 * Revoke a field link (kills it immediately).
 *
 * CR-5 — THE REACH WORD MUST SHUT WITH THE DOOR. This used to invalidate the
 * link list alone, so revoking from the seat sheet left the Directory row, the
 * seat line and every roster row still printing reach `Field link` for a door
 * that was already shut — CR-12's defect in a second door. The mint three
 * functions above already fans out to all four; so does this.
 */
export function useRevokeFieldLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tokenId,
    }: {
      tokenId: string;
      partyId: string;
      projectId?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('revoke_field_link', { p_token_id: tokenId });
      if (error) throw error;
      return true;
    },
    onSuccess: (_data, { partyId, projectId }) => {
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.links(partyId) });
      void queryClient.invalidateQueries({ queryKey: ['access-grants'] });
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
      void queryClient.invalidateQueries({ queryKey: ['people-directory-seats'] });
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ['project-roster', projectId] });
      }
    },
  });
}

/** Resolve a field-media object path to a short-lived signed URL (private
 *  bucket). Used to render inbound MMS thumbnails in the party thread. */
export function useFieldMediaUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['field-media-url', path],
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!path) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('field-media')
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

/** Build the guest field-link URL from a raw token (Track B contract:
 *  {CLIENT_PORTAL_URL}/field/{token}). */
export function fieldLinkUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL?.replace(/\/$/, '') ?? 'https://client.patina.cloud';
  return `${base}/field/${token}`;
}


export function smsThreadActionError(error: unknown): string {
  return (error as { code?: string })?.code === '42501'
    ? 'Someone else has this one'
    : "Couldn't save the change. Try again.";
}

// ═══════════════════════════════════════════════════════════════════════════
// THE OPT-IN CHALLENGE, AND THE ONE WAY TO ASK AGAIN (Phase 1, P1-01)
//
// A consent challenge is an `sms_prompts` row kind='optin' (00639) — the
// question we asked one handset and the `Ref NN` that answers it. The record
// (`studio_channel_consent`) is still the only grant; nothing here writes a
// seat column, and `resend_party_invite` (00644) is the ONLY way to ask again.
// ═══════════════════════════════════════════════════════════════════════════

/** The disclosure the field-SMS opt-in is read against. Stored verbatim on the
 *  consent record and on the challenge, so what we asked is auditable. */
export const FIELD_SMS_DISCLOSURE_VERSION = 'field-sms-v1';

/** How the studio heard the yes. 00644's own vocabulary, kept verbatim in the
 *  evidence; the consent record's `source` column takes the nearest value its
 *  own check allows. */
export type PartyInviteSource = 'verbal' | 'form' | 'kickoff';

export interface PartyInviteEvidence {
  source: PartyInviteSource;
  /** Defaults to FIELD_SMS_DISCLOSURE_VERSION. */
  disclosureVersion?: string;
  /** What happened, in the studio's own words. Required — nothing sends
   *  without it. */
  note: string;
}

/** One opt-in challenge row, as the room reads it. */
export interface PartyOptinChallenge {
  id: string;
  version: number;
  short_code: string;
  created_at: string;
  expires_at: string;
  answered_at: string | null;
  /** Set once, by resend_party_invite: this question has been asked again. */
  resent_at: string | null;
  /** Withdrawn before it was answered — today only by a corrected phone. */
  voided_at: string | null;
}

/** 00644's floor, and the wait the room calls "no reply" — the same numbers the
 *  RPC enforces, so the disabled reason and the refusal cannot disagree. */
export const RESEND_FLOOR_HOURS = 24;
export const INVITE_NO_REPLY_HOURS = 48;

const HOUR_MS = 3_600_000;

/** The latest opt-in challenge for a party (any state). RLS scopes the read to
 *  the project's team; the chip and the "Send again" reason both read it. */
export function usePartyOptinChallenge(partyId: string | null | undefined) {
  return useQuery({
    queryKey: ['party-optin-challenge', partyId ?? 'none'],
    enabled: !!partyId,
    queryFn: async (): Promise<PartyOptinChallenge | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('sms_prompts')
        .select('id, version, short_code, created_at, expires_at, answered_at, resent_at, voided_at')
        .eq('party_id', partyId)
        .eq('kind', 'optin')
        .order('version', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PartyOptinChallenge | null) ?? null;
    },
  });
}

/** Has this handset asked us to stop? Phone-global and independent of any
 *  studio's record, which is why it is its own question (00639). */
export function usePartyPhoneSuppressed(phone: string | null | undefined) {
  return useQuery({
    queryKey: ['sms-phone-suppressed', phone ?? 'none'],
    enabled: !!phone,
    queryFn: async (): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('sms_phone_suppressed', {
        p_recipient: phone,
      });
      if (error) throw error;
      return data === true;
    },
  });
}

/**
 * The word beside a field party's name. Six states, and each is a different
 * fact: nobody asked, we asked, we asked and nobody answered, they said yes,
 * they said no, and the carrier or a STOP has closed the handset entirely.
 * Suppression outranks every record, exactly as the send gate orders it.
 */
export type PartySmsChipState =
  | 'not_asked'
  | 'invited'
  | 'invited_no_reply'
  | 'texting'
  | 'opted_out'
  | 'blocked';

export const PARTY_SMS_CHIP_WORDS: Record<PartySmsChipState, string> = {
  not_asked: 'Not asked',
  invited: 'Invited',
  invited_no_reply: 'Invited · no reply',
  texting: 'Texting',
  opted_out: 'Opted out',
  blocked: 'Blocked',
};

export function partySmsChipState(input: {
  /** The verdict off the consent record — never re-derived here. */
  consent: string | null | undefined;
  suppressed?: boolean;
  challenge?: PartyOptinChallenge | null;
  now?: Date;
}): PartySmsChipState {
  if (input.suppressed) return 'blocked';
  if (input.consent === 'granted') return 'texting';
  if (input.consent === 'opted_out') return 'opted_out';
  if (input.consent !== 'pending') return 'not_asked';
  const challenge = input.challenge;
  if (!challenge || challenge.voided_at) return 'invited';
  const asked = new Date(challenge.resent_at ?? challenge.created_at).getTime();
  const now = (input.now ?? new Date()).getTime();
  return now - asked >= INVITE_NO_REPLY_HOURS * HOUR_MS ? 'invited_no_reply' : 'invited';
}

/**
 * Why "Send again" is not available yet, in words — or null when it is. Read off
 * the same challenge row 00644 reads, so the disabled reason and the RPC's own
 * refusal say the same thing.
 */
export function resendUnavailableReason(input: {
  consent: string | null | undefined;
  phone?: string | null;
  suppressed?: boolean;
  challenge?: PartyOptinChallenge | null;
  now?: Date;
}): string | null {
  if (!input.phone) return 'Add their phone number first.';
  if (input.suppressed) return "They've asked us to stop. Only they can undo that.";
  if (input.consent === 'granted') return 'They already said yes.';
  if (input.consent === 'opted_out') return "They've opted out. Only they can rejoin.";
  if (input.consent !== 'pending') return 'Invite them first.';
  const challenge = input.challenge;
  if (!challenge) return 'Invite them first.';
  if (challenge.answered_at) return 'They already answered.';
  if (challenge.voided_at) return 'The number changed, so invite them again.';
  const now = (input.now ?? new Date()).getTime();
  if (new Date(challenge.expires_at).getTime() <= now) {
    return 'That ask has run out, so invite them again.';
  }
  if (challenge.resent_at) return 'Already asked again once.';
  const askedAgainAt = new Date(challenge.created_at).getTime() + RESEND_FLOOR_HOURS * HOUR_MS;
  if (askedAgainAt > now) {
    return `Asked less than a day ago — you can ask again after ${new Date(
      askedAgainAt,
    ).toLocaleString()}.`;
  }
  return null;
}

/** 00644's named refusals, as sentences. An unknown error passes through
 *  untouched — a sentence invented for it would hide it. */
const RESEND_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ['resend_not_authorized', 'Only this studio can send its own crew an invite again.'],
  [
    'resend_evidence_required',
    'Write down how they said yes before asking again. Nothing is sent without it.',
  ],
  ['resend_no_phone_number', 'Add their phone number first.'],
  ['resend_refused_suppressed', "They've asked us to stop. Only they can undo that."],
  ['resend_already_granted', 'They already said yes, so there is nothing to ask again.'],
  ['resend_refused_opted_out', "They've opted out. Only they can rejoin, by replying START."],
  ['resend_no_invite_on_file', 'Nobody has asked them yet — invite them first.'],
  ['resend_no_open_challenge', 'There is no question waiting on an answer.'],
  [
    'resend_challenge_phone_changed',
    'The number changed after they were asked. Write down how they said yes on the new number and invite them again.',
  ],
  ['resend_challenge_expired', 'That ask has run out, so invite them again.'],
  ['resend_floor_not_elapsed', 'They were asked less than a day ago. Give them a day.'],
  ['resend_already_sent', 'They have already been asked again once.'],
];

export function resendRefusalWords(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return 'Could not ask again just now. Try again.';
  for (const [token, sentence] of RESEND_SENTENCES) {
    if (message.includes(token)) return sentence;
  }
  return message;
}

export interface ResendPartyInviteInput {
  partyId: string;
  projectId?: string | null;
  evidence: PartyInviteEvidence;
}

export interface ResendPartyInviteResult {
  status: string;
  challenge_id?: string;
  version?: number;
  next_allowed_at?: string;
  dispatched?: boolean;
}

/**
 * Ask an open opt-in challenge again — the ONE owner of a resend (contract
 * US-2 P2). Everything that bounds it lives in `resend_party_invite` (00644):
 * studio membership, the suppression and record gates, the 24h floor, and a
 * single allowance per challenge version claimed under an advisory lock. So two
 * clicks a millisecond apart produce one text and one refusal, whatever this
 * hook's caller does about disabling its own button.
 */
export function useResendPartyInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResendPartyInviteInput): Promise<ResendPartyInviteResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('resend_party_invite', {
        p_party_id: input.partyId,
        p_evidence: {
          source: input.evidence.source,
          disclosure_version: input.evidence.disclosureVersion ?? FIELD_SMS_DISCLOSURE_VERSION,
          note: input.evidence.note,
        },
      });
      if (error) throw error;
      return (data ?? { status: 'queued' }) as ResendPartyInviteResult;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['party-optin-challenge', input.partyId] });
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.thread(input.partyId) });
      void queryClient.invalidateQueries({ queryKey: ['channel-consent'] });
      if (input.projectId) {
        void queryClient.invalidateQueries({ queryKey: ['project-parties', input.projectId] });
      }
    },
  });
}

/**
 * Queue the FIRST invite for a party whose consent record has just landed on an
 * evidenced `pending`.
 *
 * WHY THIS EXISTS. 00284 fired the invite off a PARTY ROW moving to `pending`;
 * 00594 froze those columns, so since then the double opt-in has had no sender
 * at all (00594's own note on record_channel_reconsent says so) — the record
 * went pending and the crew heard nothing. The invite goes out from the act that
 * recorded the consent instead, declaring automation_phase 1 so the server phase
 * gate (FIELD_LINE_PHASE, _shared/sms.ts:198) is what decides whether it leaves.
 *
 * It never decides WHETHER there is consent to act on: the caller queues this
 * only after the consent doors accepted the evidence, and sendPartySms re-asks
 * every gate on its own side.
 */
export async function queuePartyInvite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: { partyId: string; projectId?: string | null },
): Promise<void> {
  try {
    await supabase.functions.invoke('sms-dispatch', {
      body: {
        partyId: input.partyId,
        projectId: input.projectId ?? undefined,
        templateKey: 'sms_optin_invite',
        type: 'field_optin_invite',
        automationPhase: 1,
      },
    });
  } catch {
    // The consent record is written and is the fact that matters; a transport
    // failure here is not a reason to tell the designer their record was lost.
    // "Send again" is the way to try the text itself, and it is rate-limited.
  }
}

/** The same queue as a mutation, for a surface that owns the act directly. */
export function useQueuePartyInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partyId: string; projectId?: string | null }) => {
      await queuePartyInvite(getSupabase(), input);
      return true;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['party-optin-challenge', input.partyId] });
      void queryClient.invalidateQueries({ queryKey: partySmsKeys.thread(input.partyId) });
    },
  });
}

function useSmsThreadAction(action: 'sms_take_thread' | 'sms_hand_back_thread' | 'sms_extend_pause') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      // RPC signatures are supplied by the ownership authority migration.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc(action, {
        p_message_id: messageId,
        ...(action === 'sms_extend_pause' ? { p_hours: 4 } : {}),
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: smsReviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['party-sms'] });
    },
  });
}
export function useTakeSmsThread() { return useSmsThreadAction('sms_take_thread'); }
export function useHandBackSmsThread() { return useSmsThreadAction('sms_hand_back_thread'); }
export function useExtendSmsPause() { return useSmsThreadAction('sms_extend_pause'); }
