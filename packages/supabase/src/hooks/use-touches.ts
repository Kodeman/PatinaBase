'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// E13 · TOUCHES — what the rails actually did, said in words
//
// `public.studio_touches` (00635) is ONE ROW PER CONTACT a rail made, in either
// direction, carrying the decision class it filed and whether the sender had
// the standing to file it. CRM-22 ("a go-ahead from a phone with no money
// authority reads the same as a signature") and CRM-23 ("nothing records who
// was told when a fact changed") are the two harms.
//
// READ-ONLY FROM A PORTAL. The table has a SELECT policy and no other; every
// write is a SECURITY DEFINER RPC. Two of them exist — `record_touch`, which is
// service_role and belongs to the send rails, and `record_notice`, which is the
// studio's own and is the ONE write this module exposes.
//
// PD-8: a touch is DERIVED ONTO a card and never read to decide anything. No
// gate, no chip and no count in this build consults it.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** 00635's four subjects. `project` is a job-level notice (`record_notice`). */
export type TouchSubjectType = 'person' | 'company' | 'engagement' | 'project';

/** How the contact was made. NULL where the record does not say — a notice
 *  carries no channel argument and 00635 will not guess one. */
export type TouchChannelKind =
  | 'sms'
  | 'email'
  | 'call'
  | 'in_person'
  | 'app'
  | 'field_link'
  | 'paper'
  | 'other';

export type TouchDecisionClass =
  | 'none'
  | 'logistics'
  | 'selection'
  | 'money'
  | 'schedule'
  | 'site_access';

export type TouchAuthorityCheck =
  | 'n/a'
  | 'passed'
  | 'failed_no_authority'
  | 'failed_unknown_sender';

/** A row of `public.studio_touches` (00635). */
export interface StudioTouch {
  id: string;
  organization_id: string;
  subject_type: TouchSubjectType | string;
  subject_id: string;
  channel_kind: TouchChannelKind | string | null;
  direction: 'in' | 'out' | string;
  occurred_at: string;
  actor_ref: string | null;
  decision_class: TouchDecisionClass | string;
  authority_check: TouchAuthorityCheck | string;
  notice_of: string | null;
  notified_refs: string[];
  message_ref: string | null;
  created_at: string;
}

export interface TouchFilters {
  /** Every subject one face answers for: a card id, its seat ids, its job. */
  subjectIds?: readonly string[] | null;
  subjectType?: TouchSubjectType | null;
  direction?: 'in' | 'out' | null;
  /** true drops `decision_class = 'none'` — the touches that filed nothing. */
  decisionsOnly?: boolean;
  /** Newest first; the face reads one or a handful. Default 20. */
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WORDS
//
// The studio reads sentences, never column tokens. These live beside the type
// for the same reason `ACCESS_GRANT_TIER_LABELS` does: one vocabulary, read by
// the person card, the company card and the roster row, so three surfaces
// cannot drift into three wordings for one row.
// ═══════════════════════════════════════════════════════════════════════════

/** "Last touch 12 Sep 2026, by text." — the clause after the date. */
export const TOUCH_CHANNEL_PHRASES: Record<TouchChannelKind, string> = {
  sms: 'by text',
  email: 'by email',
  call: 'by phone',
  in_person: 'in person',
  app: 'in the app',
  field_link: 'on the field link',
  paper: 'on paper',
  other: 'another way',
};

/** The decision a touch filed, as a noun phrase. `none` files nothing and
 *  prints nothing — an ordinary message is not a decision (PD-8). */
export const TOUCH_DECISION_CLASS_LABELS: Record<
  Exclude<TouchDecisionClass, 'none'>,
  string
> = {
  logistics: 'A logistics answer',
  selection: 'A selection',
  money: 'A money decision',
  schedule: 'A schedule answer',
  site_access: 'A site-access answer',
};

/**
 * CRM-22's own sentence, verbatim where the model writes it: "an unmatched
 * approval reads 'received, not authority'".
 *
 * `n/a` is not in this map on purpose — a touch that filed no decision was
 * never checked, and printing "not checked" would invent a verdict.
 */
export const TOUCH_AUTHORITY_SENTENCES: Record<
  Exclude<TouchAuthorityCheck, 'n/a'>,
  string
> = {
  passed: 'The seat had the authority for it.',
  failed_no_authority: 'Received, not authority.',
  failed_unknown_sender:
    'Received from a number this job does not name. Received, not authority.',
};

/**
 * The room's own months. NOT `toLocaleDateString`: the runtime's ICU spells
 * September "Sept", and every other date in this room — the seat line, the
 * roster row, the compliance table — is `Sep`. One date, one spelling.
 */
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `12 Sep 2026` from an ISO timestamp or a `YYYY-MM-DD` day. */
export function touchDay(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return '';
  const [, year, month, day] = match;
  const name = MONTHS_SHORT[Number(month) - 1];
  if (!name) return '';
  return `${Number(day)} ${name} ${year}`;
}

function touchDate(occurredAt: string | null | undefined): string {
  return touchDay(occurredAt);
}

/** The sentence a card's History region prints where the record has one. */
export const NO_TOUCH_SENTENCE = 'No contact on the record yet.';

/**
 * ONE TOUCH, IN PLAIN TEXT — "Last touch 12 Sep 2026, by text. A money
 * decision. Received, not authority."
 *
 * Every clause is dropped where the record does not hold it, so the sentence
 * never asserts a channel the rail did not name or a verdict nobody reached.
 * Never a state word and never a colour: an authority check is a FACT about a
 * message, and direction §3.8 keeps facts as plain uncoloured text.
 */
export function touchSentence(
  touch: Pick<
    StudioTouch,
    'occurred_at' | 'channel_kind' | 'decision_class' | 'authority_check'
  > | null
  | undefined,
): string {
  if (!touch) return NO_TOUCH_SENTENCE;
  const date = touchDate(touch.occurred_at);
  const channel =
    TOUCH_CHANNEL_PHRASES[touch.channel_kind as TouchChannelKind] ?? null;
  const head = date
    ? channel
      ? `Last touch ${date}, ${channel}.`
      : `Last touch ${date}.`
    : channel
      ? `Last touch ${channel}.`
      : '';
  const parts: string[] = [];
  if (head) parts.push(head);
  const decision =
    TOUCH_DECISION_CLASS_LABELS[
      touch.decision_class as Exclude<TouchDecisionClass, 'none'>
    ] ?? null;
  if (decision) parts.push(`${decision}.`);
  const verdict =
    TOUCH_AUTHORITY_SENTENCES[
      touch.authority_check as Exclude<TouchAuthorityCheck, 'n/a'>
    ] ?? null;
  if (verdict) parts.push(verdict);
  return parts.length ? parts.join(' ') : NO_TOUCH_SENTENCE;
}

/**
 * The roster row's own half of CRM-22: the LAST INBOUND DECISION and how it
 * was checked. Only a message that came IN and filed a class can answer "did
 * the person who said yes have the authority to" — an outbound letter files
 * nothing and an ordinary inbound message decided nothing.
 */
export function lastInboundDecision(
  touches: readonly StudioTouch[] | null | undefined,
): StudioTouch | null {
  const rows = (touches ?? []).filter(
    (t) => t.direction === 'in' && t.decision_class !== 'none',
  );
  if (rows.length === 0) return null;
  return rows.reduce((newest, row) =>
    row.occurred_at > newest.occurred_at ? row : newest,
  );
}

/** "A money decision came in 12 Sep 2026, by text. Received, not authority." */
export function inboundDecisionSentence(
  touch: StudioTouch | null | undefined,
): string | null {
  if (!touch) return null;
  const decision =
    TOUCH_DECISION_CLASS_LABELS[
      touch.decision_class as Exclude<TouchDecisionClass, 'none'>
    ] ?? null;
  if (!decision) return null;
  const date = touchDate(touch.occurred_at);
  const channel =
    TOUCH_CHANNEL_PHRASES[touch.channel_kind as TouchChannelKind] ?? null;
  const head = [
    `${decision} came in`,
    date ? ` ${date}` : '',
    channel ? `, ${channel}` : '',
    '.',
  ].join('');
  const verdict =
    TOUCH_AUTHORITY_SENTENCES[
      touch.authority_check as Exclude<TouchAuthorityCheck, 'n/a'>
    ] ?? null;
  return verdict ? `${head} ${verdict}` : head;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const touchKeys = {
  all: ['studio-touches'] as const,
  list: (filters?: TouchFilters) =>
    [
      'studio-touches',
      {
        subjectIds: [...(filters?.subjectIds ?? [])].filter(Boolean).sort(),
        subjectType: filters?.subjectType ?? null,
        direction: filters?.direction ?? null,
        decisionsOnly: filters?.decisionsOnly ?? false,
        limit: filters?.limit ?? 20,
      },
    ] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The touches filed against a set of subjects, newest first.
 *
 * Disabled with no subject: a face asks about ONE identity, one firm or one
 * job, and an unscoped read of a studio's whole contact history is a report,
 * not a card.
 */
export function useTouches(filters?: TouchFilters) {
  const subjectIds = [...new Set((filters?.subjectIds ?? []).filter(Boolean))];
  const limit = filters?.limit ?? 20;
  return useQuery({
    queryKey: touchKeys.list(filters),
    enabled: subjectIds.length > 0,
    queryFn: async (): Promise<StudioTouch[]> => {
      if (subjectIds.length === 0) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('studio_touches')
        .select('*')
        .in('subject_id', subjectIds);
      if (filters?.subjectType) query = query.eq('subject_type', filters.subjectType);
      if (filters?.direction) query = query.eq('direction', filters.direction);
      // `decision_class = 'none'` is the default on every row a plain message
      // writes, so this is the whole "did it decide anything" predicate.
      if (filters?.decisionsOnly) query = query.neq('decision_class', 'none');
      const { data, error } = await query
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as StudioTouch[];
    },
  });
}

/** The newest touch on a set of subjects, or null. One read, one sentence. */
export function useLastTouch(
  subjectIds: readonly string[],
  subjectType?: TouchSubjectType | null,
) {
  const query = useTouches({ subjectIds, subjectType, limit: 1 });
  return { ...query, data: (query.data ?? [])[0] ?? null };
}

export interface RecordNoticeInput {
  projectId: string;
  /** The fact that changed, in the studio's own words (CRM-23). */
  what: string;
  /** Seat ids on this job and/or person-card ids in this studio. Anything that
   *  does not resolve is DROPPED by the RPC, so what is stored and what is
   *  read back can never disagree about who the studio said it told. */
  told?: readonly string[];
}

export interface RecordedNotice {
  id: string;
  what: string;
  recorded_at: string;
  recorded_by: string | null;
  told_names: string[];
}

/** 00635's two named refusals, said in words. Both are raised as bare tokens
 *  with no SQLSTATE, so nothing downstream would translate them. */
const NOTICE_REFUSAL_SENTENCES: Record<string, string> = {
  notice_what_required:
    'Say what changed. A notice with no fact in it records nothing.',
  notice_project_required:
    'A notice is about a job, and this one names none.',
  notice_not_authorized:
    "This job's notices are not yours to write. Ask an owner or admin of the studio.",
};

export function asNoticeError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [token, sentence] of Object.entries(NOTICE_REFUSAL_SENTENCES)) {
    if (message.includes(token)) return sentence;
  }
  return message || 'Could not write the notice.';
}

/**
 * CRM-23 — RECORD THAT A FACT ABOUT THIS JOB CHANGED, AND WHO WAS TOLD.
 *
 * The studio's one write into `studio_touches`. `record_notice` resolves the
 * job's studio itself (R-BD's `project_tenant_org`), so a caller cannot file a
 * notice into a studio it does not belong to, and it returns the row the face
 * prints — including the names it actually stored.
 *
 * Patina Field calls the same RPC with the same three arguments
 * (`w5-build-report.md` §3); the desk and the phone write one record.
 */
export function useRecordNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordNoticeInput): Promise<RecordedNotice> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('record_notice', {
        p_project_id: input.projectId,
        p_what: input.what,
        p_told: [...(input.told ?? [])],
      });
      if (error) throw error;
      // RETURNS TABLE (…) → a one-row array.
      const row = Array.isArray(data) ? data[0] : data;
      return row as RecordedNotice;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: touchKeys.all });
    },
  });
}
