import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AgreementDraw,
  AgreementDrawLienWaiver,
  AgreementJurisdictionNotice,
  LienWaiverType,
} from '@patina/types';
import { createBrowserClient } from '../client';
import { commercialKeys } from './use-commercial-documents';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// THE TURNKEY CLASS — "The Agreement, Composed" Wave 3 (P9 · P11 · P12 · P13)
//
// Three reads and two writes, all of them studio-side:
//
//   · `agreement_draw_invoices` — the draw ledger. MACHINE STATE, not
//     authored: the draws themselves live in the `draws` part payload, frozen
//     at send and inside W1's `parts` fold in the document fingerprint. These
//     rows are materialized by `send_commercial_document` from that frozen
//     payload and written thereafter only by `issue_agreement_draw_invoice`.
//     Nothing here writes one.
//
//   · `agreement_draw_lien_waivers` — the P12 exchange. The attachment part
//     carries the FORM; a row here records that a waiver was actually given.
//
//   · `agreement_jurisdiction_notices` — R11. Seeded WI/MN/IL/CA/NY/MA, all
//     `enabled = false`, and the SELECT policy admits only enabled rows, so
//     this read answers EMPTY until counsel clears one. That is the intended
//     answer, not a failure: the composer renders the disabled peers from its
//     own seeded list as "Held for counsel review", and there is no enable
//     control anywhere in the studio's face.
//
//   · `issue_agreement_draw_invoice` (I-3) — the one act that bills a draw.
//     Wave 3 writes ZERO Stripe code: the invoice's payment link is minted by
//     `invoice_link_mint_on_issue` (00574), and `payToken` is that link's
//     token. A caller builds `/pay/<payToken>` from it and calls nothing else.
// ═══════════════════════════════════════════════════════════════════════════

/** The snake_case row shape as `agreement_draw_invoices` stores it. */
export interface AgreementDrawRow {
  id: string;
  proposal_id: string;
  draw_key: string;
  sort_order: number;
  label: string;
  gross_cents: number;
  retainage_cents: number;
  net_cents: number;
  is_retainage_release: boolean;
  invoice_id: string | null;
  issued_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Embedded by the select below; PostgREST names an embed after the
   *  relation, and an absent array is an unbilled, unwaived draw. */
  invoices?: { id: string; status: string | null } | null;
  agreement_draw_lien_waivers?: AgreementDrawLienWaiverRow[] | null;
}

/** The snake_case row shape as `agreement_draw_lien_waivers` stores it. */
export interface AgreementDrawLienWaiverRow {
  id: string;
  draw_id: string;
  contact_id: string | null;
  contact_display_name: string | null;
  waiver_type: string;
  through_date: string | null;
  amount_cents: number | null;
  storage_path: string | null;
  received_at: string | null;
  recorded_by: string;
  created_at: string | null;
}

export const designBuildKeys = {
  all: ['agreement-draws'] as const,
  draws: (proposalId: string) => ['agreement-draws', proposalId] as const,
  notices: ['agreement-jurisdiction-notices'] as const,
};

export function mapAgreementDrawLienWaiver(
  row: AgreementDrawLienWaiverRow
): AgreementDrawLienWaiver {
  return {
    id: row.id,
    drawId: row.draw_id,
    contactId: row.contact_id ?? null,
    contactDisplayName: row.contact_display_name ?? null,
    waiverType: row.waiver_type as LienWaiverType,
    throughDate: row.through_date ?? null,
    amountCents: row.amount_cents ?? null,
    storagePath: row.storage_path ?? null,
    receivedAt: row.received_at ?? null,
  };
}

export function mapAgreementDraw(row: AgreementDrawRow): AgreementDraw {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    drawKey: row.draw_key,
    sortOrder: row.sort_order,
    label: row.label,
    grossCents: row.gross_cents,
    retainageCents: row.retainage_cents,
    netCents: row.net_cents,
    isRetainageRelease: row.is_retainage_release,
    invoiceId: row.invoice_id ?? null,
    invoiceStatus: row.invoices?.status ?? null,
    issuedAt: row.issued_at ?? null,
    lienWaivers: (row.agreement_draw_lien_waivers ?? []).map(
      mapAgreementDrawLienWaiver
    ),
  };
}

/**
 * The draw ledger for one design-build agreement, in schedule order, each row
 * carrying its invoice's status and every lien waiver recorded against it.
 *
 * Empty before send is the correct answer, not an error: the rows do not
 * exist until `send_commercial_document`'s design-build arm materializes them
 * from the frozen draws payload.
 */
export function useAgreementDraws(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: designBuildKeys.draws(proposalId as string),
    queryFn: async (): Promise<AgreementDraw[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_draw_invoices')
        .select('*, invoices(id, status), agreement_draw_lien_waivers(*)')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as AgreementDrawRow[]).map(mapAgreementDraw);
    },
    enabled: !!proposalId,
  });
}

/**
 * The jurisdiction notices a studio may actually attach.
 *
 * R11 — the SELECT policy admits `enabled` rows only, so until counsel clears
 * one this answers an empty array on a seeded database. A read that errors
 * answers empty too: an unreachable notice table must never leave the
 * composer thinking a disabled notice is attachable.
 */
export function useAgreementJurisdictionNotices() {
  return useQuery({
    queryKey: designBuildKeys.notices,
    queryFn: async (): Promise<AgreementJurisdictionNotice[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_jurisdiction_notices')
        .select('*')
        .order('state', { ascending: true });
      if (error) return [];
      return ((data ?? []) as AgreementJurisdictionNotice[]).filter(
        (notice) => notice.enabled === true
      );
    },
  });
}

/** I-3's frozen return shape. `payToken` is `invoice_links.token`; a caller
 *  builds `/pay/<payToken>` from it and calls nothing else. It is nullable —
 *  00574's own reasoning: a missing link is recoverable, an aborted issuance
 *  is not, so the RPC returns null rather than raising. */
export interface IssueAgreementDrawInvoiceResult {
  drawKey: string;
  label: string;
  amountCents: number;
  retainageCents: number;
  netCents: number;
  invoiceId: string;
  invoiceStatus: string;
  payToken: string | null;
}

/**
 * Bills one draw. The deposit issues at `client_signed` (the client's own
 * signature is the authority for their own deposit, R15/P13); every other
 * draw waits for `executed` and for every lower draw to be paid in full.
 *
 * Retainage is WITHHELD, not billed: the invoice carries `net_cents`, and the
 * withheld amounts come back on the final release draw.
 *
 * No Stripe call belongs here or anywhere else in this wave (D-W3-1).
 */
export function useIssueAgreementDrawInvoice(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['issue-agreement-draw-invoice', proposalId],
    mutationFn: async (
      drawKey: string
    ): Promise<IssueAgreementDrawInvoiceResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('issue_agreement_draw_invoice', {
        p_proposal_id: proposalId,
        p_draw_key: drawKey,
      });
      if (error) throw error;
      return data as IssueAgreementDrawInvoiceResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: designBuildKeys.draws(proposalId) });
      queryClient.invalidateQueries({ queryKey: commercialKeys.all });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export interface RecordAgreementDrawLienWaiverInput {
  drawId: string;
  /** The rolodex contact who gave the waiver, when there is one. */
  contactId: string | null;
  /** Snapshot — the record outlives the roster row it was taken from. */
  contactDisplayName: string;
  waiverType: LienWaiverType;
  throughDate: string | null;
  amountCents: number | null;
  storagePath: string | null;
  receivedAt: string | null;
  recordedBy: string;
}

/**
 * Records one lien-waiver exchange against a draw (P12).
 *
 * `contactDisplayName` is a snapshot on purpose: a waiver is evidence about a
 * past exchange, and it has to keep naming the trade that gave it after the
 * studio tidies its rolodex. `recordedBy` is required for the same reason the
 * attestation's `attested_by` is — a record with no author is not a record.
 */
export function useRecordAgreementDrawLienWaiver(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['record-agreement-draw-lien-waiver', proposalId],
    mutationFn: async (
      input: RecordAgreementDrawLienWaiverInput
    ): Promise<AgreementDrawLienWaiver> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('agreement_draw_lien_waivers')
        .insert({
          draw_id: input.drawId,
          contact_id: input.contactId,
          contact_display_name: input.contactDisplayName.trim(),
          waiver_type: input.waiverType,
          through_date: input.throughDate,
          amount_cents: input.amountCents,
          storage_path: input.storagePath,
          received_at: input.receivedAt,
          recorded_by: input.recordedBy,
        })
        .select()
        .single();
      if (error) throw error;
      return mapAgreementDrawLienWaiver(data as AgreementDrawLienWaiverRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: designBuildKeys.draws(proposalId) });
    },
  });
}
