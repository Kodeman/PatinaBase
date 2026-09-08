import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  LienWaiverPolicy,
  TradeAgreement,
  TradeAgreementSchedule,
  TradeAgreementState,
} from '@patina/types';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TRADE AGREEMENTS — "The Agreement, Composed" Wave 3, P14 / R16
// (tables `studio_trade_agreements`, `..._signatures`, `..._tokens`)
//
// The subcontract: studio ↔ sub, never the homeowner's paper. R7 — the word
// a person reads is always **Trade Agreement**; "subcontract" is fine in code
// and in docs and appears in no string here.
//
// R16 — the sub signs by TOKEN LINK with no login, on this object's own
// signature table. `commercial_document_signatures` keeps its two-party
// constraint untouched, which is the whole reason the sub's signature lives
// somewhere else.
//
// The sub never touches these hooks. Their entire access is the client
// portal's `/trade/<token>` server action calling two service-role RPCs; the
// token table has RLS on with zero policies and no `authenticated` grant at
// all (the `invoice_links` posture, 00574).
//
// SEND goes through the edge function, not through `send_trade_agreement`
// directly: the RPC stamps the state and freezes the content, and minting the
// token is `service_role`'s alone (00424 splits it exactly this way, so a raw
// token can never be minted by a browser). `trade-agreement-send` does both
// and emails the link.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What `list_trade_agreements` actually returns — one jsonb array of these,
 * built key by key at 00579's `jsonb_build_object`. The keys below are a
 * literal copy of that list, in its order, and the shape is **camelCase**:
 * the RPC projects a DTO, not a table row, so nothing here is snake_case and
 * nothing here is a column name.
 *
 * Three columns the table carries are deliberately absent from the
 * projection: `project_id` (the caller named it), `studio_id`, and
 * `created_at` (the list is ordered by it, not dated by it). And
 * `flow_down_clause_key`, which stays NULL this wave (R16) and is projected
 * nowhere, so nothing downstream can claim to know it.
 */
export interface TradeAgreementListItem {
  id: string;
  title: string;
  trade: string | null;
  contactId: string | null;
  contactDisplayName: string;
  contactCompanyName: string | null;
  contactEmail: string | null;
  scope: string;
  priceCents: number;
  currency: string;
  schedule: Partial<TradeAgreementSchedule> | null;
  retainageBps: number;
  payWhenPaidDays: number | null;
  insuranceCertificateRequired: boolean;
  lienWaiverPolicy: string;
  sovLineIds: string[] | null;
  sourceProposalId: string | null;
  state: string;
  sentAt: string | null;
  signedAt: string | null;
  voidedAt: string | null;
  hasLiveLink: boolean;
  /** The sub's receipt, from the agreement's own signature table. */
  signature: { signedName: string; signedAt: string } | null;
}

export const tradeAgreementKeys = {
  all: ['trade-agreements'] as const,
  list: (projectId: string) => ['trade-agreements', projectId] as const,
};

export function mapTradeAgreement(
  item: TradeAgreementListItem,
  projectId: string,
): TradeAgreement {
  return {
    id: item.id,
    projectId,
    sourceProposalId: item.sourceProposalId ?? null,
    contactId: item.contactId ?? null,
    contactDisplayName: item.contactDisplayName,
    contactCompanyName: item.contactCompanyName ?? null,
    contactEmail: item.contactEmail ?? null,
    trade: item.trade ?? null,
    title: item.title,
    scope: item.scope,
    priceCents: item.priceCents,
    currency: item.currency,
    schedule: {
      startOn: item.schedule?.startOn ?? null,
      durationDays: item.schedule?.durationDays ?? null,
      sequencing: item.schedule?.sequencing ?? null,
    },
    retainageBps: item.retainageBps,
    payWhenPaidDays: item.payWhenPaidDays ?? null,
    insuranceCertificateRequired: item.insuranceCertificateRequired,
    lienWaiverPolicy: item.lienWaiverPolicy as LienWaiverPolicy,
    sovLineIds: item.sovLineIds ?? [],
    state: item.state as TradeAgreementState,
    sentAt: item.sentAt ?? null,
    signedAt: item.signedAt ?? null,
    voidedAt: item.voidedAt ?? null,
    hasLiveLink: item.hasLiveLink === true,
    subSignature: item.signature ?? null,
  };
}

/** Every Trade Agreement on a project, studio-side. The sub sees none of
 *  this — not this list, not another sub's row, not a count. */
export function useTradeAgreements(projectId: string | null | undefined) {
  return useQuery({
    queryKey: tradeAgreementKeys.list(projectId as string),
    queryFn: async (): Promise<TradeAgreement[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('list_trade_agreements', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return ((data ?? []) as TradeAgreementListItem[]).map((item) =>
        mapTradeAgreement(item, projectId as string)
      );
    },
    enabled: !!projectId,
  });
}

/**
 * Research 02 §7's eight essentials, all present and none optional. The
 * flow-down key is the exception that proves it: the field EXISTS and stays
 * NULL this wave because counsel has not cleared the wording (R16), and the
 * composer offers no control for it.
 */
export interface CreateTradeAgreementInput {
  projectId: string;
  contactId: string;
  sourceProposalId: string | null;
  title: string;
  trade: string | null;
  scope: string;
  priceCents: number;
  schedule: TradeAgreementSchedule;
  retainageBps: number;
  payWhenPaidDays: number | null;
  insuranceCertificateRequired: boolean;
  lienWaiverPolicy: LienWaiverPolicy;
  sovLineIds: string[];
}

export function useCreateTradeAgreement(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['create-trade-agreement', projectId],
    mutationFn: async (input: CreateTradeAgreementInput): Promise<string> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_trade_agreement', {
        p_project_id: input.projectId,
        p_contact_id: input.contactId,
        p_payload: {
          sourceProposalId: input.sourceProposalId,
          title: input.title.trim(),
          trade: input.trade?.trim() || null,
          scope: input.scope.trim(),
          priceCents: input.priceCents,
          schedule: input.schedule,
          retainageBps: input.retainageBps,
          payWhenPaidDays: input.payWhenPaidDays,
          insuranceCertificateRequired: input.insuranceCertificateRequired,
          lienWaiverPolicy: input.lienWaiverPolicy,
          sovLineIds: input.sovLineIds,
        },
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeAgreementKeys.list(projectId) });
    },
  });
}

export interface SendTradeAgreementResult {
  recipient: string | null;
  emailSent: boolean;
}

/**
 * Reads a `trade-agreement-send` failure into a sentence a designer can act
 * on. `functions.invoke` wraps a non-2xx in a FunctionsHttpError whose body
 * has to be read off `.context`; a resolved body can also carry its own
 * `error`. The raw SDK string ("Edge Function returned a non-2xx status
 * code") reads like an internal fault and never reaches the studio — the same
 * idiom `useSendTradeRfq` uses for the same reason.
 */
async function tradeAgreementSendFailureMessage(
  error: unknown,
  fallback: unknown
): Promise<string> {
  let code: string | null = null;
  let detail: string | null = null;

  const context = (error as { context?: { json?: () => Promise<any> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      code = typeof body?.error === 'string' ? body.error : null;
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch {
      // No JSON body on the error response — fall through.
    }
  }
  if (!code && fallback && typeof fallback === 'object') {
    const body = fallback as { error?: string; detail?: string };
    code = typeof body.error === 'string' ? body.error : code;
    detail = typeof body.detail === 'string' ? body.detail : detail;
  }

  if (code === 'no_recipient') {
    return (
      detail ??
      'No email on file for this trade — add one to their contact and try again.'
    );
  }
  // W3R2-09 — `detail` is the PROVIDER's sentence, and the walk watched it
  // print `RESEND_API_KEY environment variable is required` into the studio's
  // composer. A studio can do nothing with an environment-variable name, and
  // the paper is recorded either way: the row reaches `sent` before the letter
  // is attempted, so what is untrue is only the delivery. Say that, and leave
  // the provider's words in the function's log where they are useful.
  if (code === 'send_failed') {
    return 'The agreement is recorded. The message could not be sent. Try again.';
  }
  return 'The Trade Agreement could not be sent. Check the trade’s email and try again.';
}

/**
 * Sends the agreement to the sub: `trade-agreement-send` stamps `sent`,
 * freezes the content, mints exactly one live token and emails the link.
 *
 * The browser never mints. `mint_trade_agreement_token` is `service_role`
 * only and returns the raw token once, to the function, and never again —
 * only `sha256(token)` is stored (00424:149-153's standard).
 */
export function useSendTradeAgreement(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['send-trade-agreement', projectId],
    mutationFn: async (agreementId: string): Promise<SendTradeAgreementResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.functions.invoke('trade-agreement-send', {
        body: { agreementId, mode: 'send' },
      });
      if (error || data?.error) {
        throw new Error(await tradeAgreementSendFailureMessage(error, data));
      }
      return {
        recipient: typeof data?.recipient === 'string' ? data.recipient : null,
        emailSent: data?.emailSent === true,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeAgreementKeys.list(projectId) });
    },
  });
}

/** Withdraws an agreement and revokes its live tokens. A SIGNED agreement is
 *  refused by the RPC — it is superseded by a new one, never voided. */
export function useVoidTradeAgreement(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['void-trade-agreement', projectId],
    mutationFn: async (input: { agreementId: string; reason: string }): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('void_trade_agreement', {
        p_agreement_id: input.agreementId,
        p_reason: input.reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeAgreementKeys.list(projectId) });
    },
  });
}
