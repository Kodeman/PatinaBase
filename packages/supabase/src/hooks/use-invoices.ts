/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the invoicing tables (invoices,
// invoice_line_items, invoice_payments) added in migration 00178. The
// hook-level interfaces below mirror the table shape and are the canonical
// contract until `pnpm db:generate` is run. Follows use-procurement.ts house
// style.

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { OnlinePaymentMethod } from '@patina/shared/invoice';

export type { OnlinePaymentMethod };

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (mirror migration 00178)
// ═══════════════════════════════════════════════════════════════════════════

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';

export type InvoiceLineKind = 'milestone' | 'time' | 'adhoc' | 'ffe';

export type InvoicePaymentMethod =
  | 'stripe'
  | 'check'
  | 'wire'
  | 'ach_manual'
  | 'cash'
  | 'other';

export type InvoicePaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'requires_refund';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  kind: InvoiceLineKind;
  milestone_id: string | null;
  ffe_item_id: string | null;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  checkout_attempt_id: string | null;
  amount_cents: number;
  method: InvoicePaymentMethod;
  status: InvoicePaymentStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_event_id: string | null;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  /** Fee charged on top of amount_cents (migration 00428). Optional: absent
   *  on rows read before the column existed / before types are regenerated. */
  surcharge_cents?: number;
  /** Settle-stamped Stripe payment method type (migration 00428); NULL for a
   *  legacy stripe payment or a non-stripe method. Optional for the same
   *  pre-regen reason as surcharge_cents. */
  stripe_payment_method_type?: 'card' | 'us_bank_account' | null;
}

export interface InvoiceCheckoutReceipt {
  url: string;
  amount_cents: number;
  currency: string;
  checkout_attempt_id: string;
  payment_id: string;
  session_id: string;
  reused: boolean;
  /** Fee cents on this attempt (migration 00428); 0/absent on a legacy or
   *  no-surcharge attempt. */
  surcharge_cents?: number;
  /** The method this session was restricted to (migration 00428); NULL on a
   *  legacy attempt that offers both card and ACH. */
  payment_method?: 'card' | 'us_bank_account' | null;
}

export interface InvoiceCheckoutEvidence {
  amountCents?: number;
  currency?: string;
  checkoutAttemptId?: string;
  paymentId?: string;
  sessionId?: string;
}

/**
 * A typed failure from the invoice Checkout boundary. Keeping the server's
 * stable code and exact attempt identifiers lets clients distinguish an
 * in-flight payment from a generic outage without guessing from message copy.
 */
export class InvoiceCheckoutError extends Error implements InvoiceCheckoutEvidence {
  readonly code: string;
  readonly amountCents?: number;
  readonly currency?: string;
  readonly checkoutAttemptId?: string;
  readonly paymentId?: string;
  readonly sessionId?: string;

  constructor(
    code: string,
    message: string,
    evidence: InvoiceCheckoutEvidence = {},
  ) {
    super(message);
    this.name = 'InvoiceCheckoutError';
    this.code = code;
    this.amountCents = evidence.amountCents;
    this.currency = evidence.currency;
    this.checkoutAttemptId = evidence.checkoutAttemptId;
    this.paymentId = evidence.paymentId;
    this.sessionId = evidence.sessionId;
  }
}

function checkoutEvidence(value: unknown): InvoiceCheckoutEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  return {
    amountCents: Number.isInteger(row.amount_cents) ? (row.amount_cents as number) : undefined,
    currency: typeof row.currency === 'string' ? row.currency : undefined,
    checkoutAttemptId:
      typeof row.checkout_attempt_id === 'string' ? row.checkout_attempt_id : undefined,
    paymentId: typeof row.payment_id === 'string' ? row.payment_id : undefined,
    sessionId: typeof row.session_id === 'string' ? row.session_id : undefined,
  };
}

function parseInvoiceCheckoutReceipt(value: unknown): InvoiceCheckoutReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvoiceCheckoutError(
      'checkout_malformed_response',
      'Checkout returned an invalid response. No redirect was started.',
    );
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.url !== 'string' ||
    !Number.isInteger(row.amount_cents) ||
    typeof row.currency !== 'string' ||
    typeof row.checkout_attempt_id !== 'string' ||
    typeof row.payment_id !== 'string' ||
    typeof row.session_id !== 'string' ||
    typeof row.reused !== 'boolean'
  ) {
    throw new InvoiceCheckoutError(
      'checkout_malformed_response',
      'Checkout returned an incomplete response. No redirect was started.',
      checkoutEvidence(row),
    );
  }
  // Lenient additions (migration 00428, payment-method chooser) — validate
  // ONLY when the key is present, so a legacy/no-method response (both keys
  // absent) keeps parsing exactly as it did before this wave.
  if (row.surcharge_cents !== undefined && !Number.isInteger(row.surcharge_cents)) {
    throw new InvoiceCheckoutError(
      'checkout_malformed_response',
      'Checkout returned a malformed surcharge. No redirect was started.',
      checkoutEvidence(row),
    );
  }
  if (
    row.payment_method !== undefined &&
    row.payment_method !== null &&
    row.payment_method !== 'card' &&
    row.payment_method !== 'us_bank_account'
  ) {
    throw new InvoiceCheckoutError(
      'checkout_malformed_response',
      'Checkout returned an unrecognized payment method. No redirect was started.',
      checkoutEvidence(row),
    );
  }
  return row as unknown as InvoiceCheckoutReceipt;
}

export interface Invoice {
  id: string;
  project_id: string;
  designer_id: string;
  client_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  payment_terms_days: number;
  currency: string;
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  memo: string | null;
  internal_notes: string | null;
  stripe_checkout_session_id: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  ar_flagged_at: string | null;
  /** When the designer last MANUALLY chased this receivable (00209, R36). Distinct
   *  from the automated cadence's last_reminder_at — a manual chase never perturbs
   *  it. The Desk gates the overdue-invoice need on this. */
  ar_last_chased_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  project?: {
    id: string;
    name: string;
    studio_id?: string | null;
    client_id?: string | null;
    client?: { id: string; full_name: string | null; email: string } | null;
  };
  client?: { id: string; full_name: string | null; email: string };
  designer?: { id: string; full_name: string | null; business_name: string | null };
  line_items?: InvoiceLineItem[];
  payments?: InvoicePayment[];
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  projectId?: string;
}

export interface DraftLineInput {
  kind?: InvoiceLineKind;
  milestoneId?: string;
  /** Bills a specific project_ffe_items row (kind 'ffe', migration 00187). */
  ffeItemId?: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateDraftInvoiceInput {
  projectId: string;
  clientId?: string | null;
  taxRate?: number;
  paymentTermsDays?: number;
  memo?: string;
  internalNotes?: string;
  lines: DraftLineInput[];
}

export interface UpdateDraftInvoiceInput {
  invoiceId: string;
  patch: Partial<
    Pick<
      Invoice,
      | 'client_id'
      | 'tax_rate'
      | 'payment_terms_days'
      | 'memo'
      | 'internal_notes'
      | 'due_date'
    >
  >;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function lineAmountCents(quantity: number, unitAmountCents: number): number {
  return Math.round((quantity || 0) * (unitAmountCents || 0));
}

/**
 * Kind inference: an explicit `kind` always wins; otherwise a linked
 * milestone makes a 'milestone' line, a linked FF&E item makes an 'ffe'
 * line (00187), and everything else is 'adhoc'. Exported for tests and for
 * composers that want to preview the row before insert.
 */
export function buildLineRow(invoiceId: string, line: DraftLineInput, index: number) {
  return {
    invoice_id: invoiceId,
    kind: line.kind ?? (line.milestoneId ? 'milestone' : line.ffeItemId ? 'ffe' : 'adhoc'),
    milestone_id: line.milestoneId ?? null,
    ffe_item_id: line.ffeItemId ?? null,
    description: line.description,
    quantity: line.quantity,
    unit_amount_cents: line.unitAmountCents,
    amount_cents: lineAmountCents(line.quantity, line.unitAmountCents),
    metadata: line.metadata ?? {},
    sort_order: line.sortOrder ?? index,
  };
}

/**
 * Recomputes a draft invoice's subtotal/tax/total from its current lines so
 * the list page shows real numbers before issue. The issue_invoice RPC is the
 * authority at issue time; this is display-state maintenance only.
 */
async function recomputeDraftTotals(supabase: any, invoiceId: string): Promise<void> {
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, tax_rate, status')
    .eq('id', invoiceId)
    .single();
  if (invErr) throw invErr;
  if (invoice.status !== 'draft') return;

  const { data: lines, error: linesErr } = await supabase
    .from('invoice_line_items')
    .select('amount_cents')
    .eq('invoice_id', invoiceId);
  if (linesErr) throw linesErr;

  const subtotal = (lines ?? []).reduce(
    (sum: number, l: { amount_cents: number }) => sum + (l.amount_cents || 0),
    0
  );
  const tax = Math.round(subtotal * (invoice.tax_rate || 0));

  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: subtotal + tax,
    })
    .eq('id', invoiceId);
  if (updErr) throw updErr;
}

/**
 * Shared invalidation for mutations that change invoice money/status. Touches
 * the invoices namespace plus the project-scoped milestone/financial caches in
 * BOTH namespaces (designer-portal queryKeys.projects.* = ['projects', id, …];
 * @patina/supabase use-project-v2 = ['project-payment-milestones', id] /
 * ['project-financials', id]) and the earnings caches.
 */
function invalidateInvoiceEffects(queryClient: QueryClient, projectId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-payment-milestones', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-financials', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
    // FF&E billing coverage (00187): create/issue/pay/void all move items
    // between uninvoiced/invoiced/paid, so the soft-gate read-model refetches.
    queryClient.invalidateQueries({ queryKey: ['ffe-invoice-coverage', projectId] });
  } else {
    // No projectId in hand (e.g. record-payment callers that only know the
    // invoice id) — drop the whole coverage namespace rather than miss it.
    queryClient.invalidateQueries({ queryKey: ['ffe-invoice-coverage'] });
  }
  queryClient.invalidateQueries({ queryKey: ['earnings'] });
  queryClient.invalidateQueries({ queryKey: ['earnings-stats'] });
  queryClient.invalidateQueries({ queryKey: ['monthly-earnings'] });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches invoices for the authenticated designer (RLS-scoped). Joins project
 * and client names for the list page. Optional status/project filters.
 */
export function useInvoices(filters?: InvoiceFilters) {
  return useQuery({
    queryKey: ['invoices', 'list', filters ?? {}],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('invoices')
        .select(
          `
          *,
          project:projects!invoices_project_id_fkey(id, name),
          client:profiles!invoices_client_id_fkey(id, full_name, email),
          payments:invoice_payments(*)
        `
        )
        .order('created_at', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.projectId) query = query.eq('project_id', filters.projectId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

/**
 * Fetches one invoice with embedded line items + payments (detail/print).
 */
export function useInvoice(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          *,
          project:projects!invoices_project_id_fkey(
            id, name, studio_id, client_id,
            client:profiles!projects_client_id_fkey(id, full_name, email)
          ),
          client:profiles!invoices_client_id_fkey(id, full_name, email),
          designer:profiles!invoices_designer_id_fkey(id, full_name, business_name),
          line_items:invoice_line_items(*),
          payments:invoice_payments(*)
        `
        )
        .eq('id', invoiceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const invoice = data as Invoice;
      invoice.line_items = [...(invoice.line_items ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      invoice.payments = [...(invoice.payments ?? [])].sort((a, b) =>
        (a.received_at ?? a.created_at) < (b.received_at ?? b.created_at) ? -1 : 1
      );
      return invoice;
    },
    enabled: !!invoiceId,
  });
}

/**
 * All invoices for a project, with line items (the financials panel needs the
 * milestone_id linkage to tell billed milestones from unbilled ones).
 */
export function useProjectInvoices(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['invoices', 'project', projectId],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('invoices')
        .select('*, line_items:invoice_line_items(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FF&E INVOICE COVERAGE (migration 00187 — the procurement soft-gate bridge)
// ═══════════════════════════════════════════════════════════════════════════

export type FfeCoverageState = 'uninvoiced' | 'invoiced' | 'paid';

export interface FfeItemCoverage {
  /** 'uninvoiced' | 'invoiced' (draft/sent/partially_paid) | 'paid'. */
  coverage: FfeCoverageState;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus | null;
  billedCents: number | null;
}

/**
 * Keyed object: project_ffe_items.id → its billing coverage. A plain object
 * (not a Map) so React Query structural sharing / devtools serialization work
 * and the Order Assistant can do `coverage[item.id]` per row in O(1). The RPC
 * returns one row per item in the project, so a MISSING key means the item is
 * not visible to the caller (not in the project, or RLS-hidden) — treat it as
 * 'uninvoiced' for display but don't gate on it.
 */
export type FfeInvoiceCoverageMap = Record<string, FfeItemCoverage>;

interface FfeCoverageRow {
  ffe_item_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  billed_cents: number | null;
  coverage: string;
}

/**
 * Per-item invoice coverage for a project's FF&E schedule via the
 * get_ffe_invoice_coverage RPC (00187, SECURITY INVOKER — RLS scopes the
 * rows, non-owners get an empty map). Powers the Order Assistant's soft
 * client-payment gate: "has the client been invoiced / paid for the items
 * going on this PO?".
 *
 * Invalidated (key ['ffe-invoice-coverage', projectId]) by every invoice
 * mutation that moves money or lines (create/issue/pay/void/line edits) and
 * by useCreatePurchaseOrder (ordering changes what the gate shows next).
 */
export function useFfeInvoiceCoverage(projectId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['ffe-invoice-coverage', projectId],
    queryFn: async (): Promise<FfeInvoiceCoverageMap> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('get_ffe_invoice_coverage', {
        p_project_id: projectId,
      });
      if (error) throw error;
      const map: FfeInvoiceCoverageMap = {};
      for (const row of (data ?? []) as FfeCoverageRow[]) {
        map[row.ffe_item_id] = {
          coverage: row.coverage as FfeCoverageState,
          invoiceId: row.invoice_id,
          invoiceNumber: row.invoice_number,
          invoiceStatus: (row.invoice_status as InvoiceStatus | null) ?? null,
          billedCents: row.billed_cents,
        };
      }
      return map;
    },
    enabled: (opts?.enabled ?? true) && !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A/R AGING (client-side bucketing of useInvoices data)
// ═══════════════════════════════════════════════════════════════════════════

export type ArBucketKey = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_90_plus';

export const AR_BUCKET_LABELS: Record<ArBucketKey, string> = {
  current: 'Current',
  days_1_30: '1–30 days',
  days_31_60: '31–60 days',
  days_61_90: '61–90 days',
  days_90_plus: '90+ days',
};

export interface ArAgingBucket {
  key: ArBucketKey;
  label: string;
  invoices: Invoice[];
  balanceCents: number;
}

export interface ArAging {
  /** Open receivables (sent / partially_paid with a due date), due-date ascending. */
  openInvoices: Invoice[];
  /** Open invoices that exhausted the automated reminder cadence (ar_flagged_at set). */
  flagged: Invoice[];
  /** Aging buckets over openInvoices, keyed off days past due_date. */
  buckets: ArAgingBucket[];
  totalBalanceCents: number;
}

/** Remaining balance on an invoice header row. */
function arBalanceCents(invoice: Invoice): number {
  return Math.max((invoice.total_cents || 0) - (invoice.amount_paid_cents || 0), 0);
}

/** Whole days past due (UTC-pinned bare DATE math). <= 0 means not yet due. */
export function invoiceDaysOverdue(invoice: Pick<Invoice, 'due_date'>): number {
  if (!invoice.due_date) return 0;
  const due = Date.parse(`${invoice.due_date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(due)) return 0;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - due) / 86_400_000);
}

function arBucketKey(daysOverdue: number): ArBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days_1_30';
  if (daysOverdue <= 60) return 'days_31_60';
  if (daysOverdue <= 90) return 'days_61_90';
  return 'days_90_plus';
}

export function computeArAging(invoices: Invoice[]): ArAging {
  const openInvoices = invoices
    .filter(
      (inv) =>
        (inv.status === 'sent' || inv.status === 'partially_paid') && inv.due_date != null
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0));

  const buckets: ArAgingBucket[] = (
    ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_90_plus'] as ArBucketKey[]
  ).map((key) => ({ key, label: AR_BUCKET_LABELS[key], invoices: [], balanceCents: 0 }));
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b])) as Record<
    ArBucketKey,
    ArAgingBucket
  >;

  let totalBalanceCents = 0;
  for (const inv of openInvoices) {
    const bucket = byKey[arBucketKey(invoiceDaysOverdue(inv))];
    bucket.invoices.push(inv);
    bucket.balanceCents += arBalanceCents(inv);
    totalBalanceCents += arBalanceCents(inv);
  }

  return {
    openInvoices,
    flagged: openInvoices.filter((inv) => inv.ar_flagged_at != null),
    buckets,
    totalBalanceCents,
  };
}

/**
 * A/R aging view for the designer billing surface: open invoices bucketed
 * (current / 1-30 / 31-60 / 61-90 / 90+) by days past due_date, plus the
 * "needs follow-up" set (ar_flagged_at stamped by the invoice-reminders
 * cadence). Pure client-side derivation over useInvoices — designer invoice
 * volumes are small.
 */
export function useArAging() {
  const query = useInvoices();
  const aging = useMemo(() => computeArAging(query.data ?? []), [query.data]);
  return { ...query, aging };
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a draft invoice header + its initial lines, then stamps draft
 * totals. The JS client cannot wrap these in one transaction, so a failed
 * line insert triggers a compensating header delete (lines CASCADE).
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice (R83). The Document's
 * invoice composer renders failures inline; legacy callers keep the toast.
 */
export function useCreateDraftInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (input: CreateDraftInvoiceInput): Promise<Invoice> => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          project_id: input.projectId,
          designer_id: user.id,
          client_id: input.clientId ?? null,
          status: 'draft',
          tax_rate: input.taxRate ?? 0,
          payment_terms_days: input.paymentTermsDays ?? 15,
          memo: input.memo ?? null,
          internal_notes: input.internalNotes ?? null,
        })
        .select()
        .single();
      if (invErr) {
        throw new Error(`Failed to create draft invoice: ${invErr.message ?? String(invErr)}`);
      }

      const invoiceId = (invoice as { id: string }).id;

      if (input.lines.length > 0) {
        const rows = input.lines.map((line, i) => buildLineRow(invoiceId, line, i));
        const { error: linesErr } = await supabase.from('invoice_line_items').insert(rows);
        if (linesErr) {
          // Compensating delete — CASCADE removes any inserted lines.
          await supabase.from('invoices').delete().eq('id', invoiceId);
          throw new Error(
            `Failed to add invoice lines: ${linesErr.message ?? String(linesErr)}`
          );
        }
        await recomputeDraftTotals(supabase, invoiceId);
      }

      return invoice as Invoice;
    },
    onSuccess: (invoice) => {
      invalidateInvoiceEffects(queryClient, invoice.project_id);
    },
  });
}

/**
 * Updates header fields on a draft (RLS restricts to status='draft').
 * Re-stamps draft totals when tax_rate changes.
 */
export function useUpdateDraftInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, patch }: UpdateDraftInvoiceInput): Promise<Invoice> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('invoices')
        .update(patch)
        .eq('id', invoiceId)
        .select()
        .single();
      if (error) throw error;
      if (patch.tax_rate !== undefined) {
        await recomputeDraftTotals(supabase, invoiceId);
      }
      return data as Invoice;
    },
    onSuccess: (invoice) => {
      invalidateInvoiceEffects(queryClient, invoice.project_id);
    },
  });
}

/**
 * Inserts/updates line items on a draft invoice (rows with an `id` update,
 * rows without insert), then re-stamps draft totals.
 */
export function useUpsertLineItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      lines,
    }: {
      invoiceId: string;
      lines: Array<DraftLineInput & { id?: string }>;
      projectId?: string;
    }): Promise<void> => {
      const supabase = getSupabase() as any;

      const inserts = lines
        .filter((l) => !l.id)
        .map((l, i) => buildLineRow(invoiceId, l, l.sortOrder ?? i));
      const updates = lines.filter((l): l is DraftLineInput & { id: string } => !!l.id);

      if (inserts.length > 0) {
        const { error } = await supabase.from('invoice_line_items').insert(inserts);
        if (error) throw error;
      }
      for (const line of updates) {
        const { error } = await supabase
          .from('invoice_line_items')
          .update({
            kind: line.kind ?? (line.milestoneId ? 'milestone' : line.ffeItemId ? 'ffe' : 'adhoc'),
            milestone_id: line.milestoneId ?? null,
            ffe_item_id: line.ffeItemId ?? null,
            description: line.description,
            quantity: line.quantity,
            unit_amount_cents: line.unitAmountCents,
            amount_cents: lineAmountCents(line.quantity, line.unitAmountCents),
            sort_order: line.sortOrder ?? 0,
            ...(line.metadata !== undefined ? { metadata: line.metadata } : {}),
          })
          .eq('id', line.id)
          .eq('invoice_id', invoiceId);
        if (error) throw error;
      }

      await recomputeDraftTotals(supabase, invoiceId);
    },
    onSuccess: (_data, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Deletes a line item from a draft invoice, then re-stamps draft totals.
 */
export function useDeleteLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      lineItemId,
    }: {
      invoiceId: string;
      lineItemId: string;
      projectId?: string;
    }): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('invoice_line_items')
        .delete()
        .eq('id', lineItemId)
        .eq('invoice_id', invoiceId);
      if (error) throw error;
      await recomputeDraftTotals(supabase, invoiceId);
    },
    onSuccess: (_data, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Deletes a draft invoice outright (lines CASCADE). RLS scopes the delete to
 * the designer's own invoices; the status guard here keeps issued history
 * safe client-side (issued invoices are voided, never deleted). Used by the
 * composer as a compensating delete when claiming time entries fails after
 * the draft was created.
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice (R83).
 */
export function useDeleteDraftInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
    }: {
      invoiceId: string;
      projectId?: string;
    }): Promise<void> => {
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('status', 'draft');
      if (error) throw error;
    },
    onSuccess: (_data, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Issues a draft invoice via the issue_invoice RPC (00178): assigns the
 * sequential number, recomputes totals, flips linked pending milestones to
 * outstanding. Pass projectId so milestone/financial caches refresh.
 */
export function useIssueInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
      dueDate,
    }: {
      invoiceId: string;
      projectId?: string;
      dueDate?: string;
    }): Promise<Invoice> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('issue_invoice', {
        p_invoice_id: invoiceId,
        p_due_date: dueDate ?? null,
      });
      if (error) throw error;
      return data as Invoice;
    },
    onSuccess: (invoice, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId ?? invoice?.project_id);
    },
  });
}

/**
 * Records a manual (non-Stripe) payment via the record_invoice_payment RPC.
 * The DB trigger applies rollup/status/earnings/milestone effects atomically.
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice (R83). The Invoice folio
 * (R74) records payments inline; legacy portal callers keep the toast.
 */
export function useRecordPayment(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
      amountCents,
      method,
      reference,
      receivedAt,
      note,
    }: {
      invoiceId: string;
      projectId?: string;
      amountCents: number;
      method: Exclude<InvoicePaymentMethod, 'stripe'>;
      reference?: string;
      receivedAt?: string;
      note?: string;
    }): Promise<InvoicePayment> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoiceId,
        p_amount_cents: amountCents,
        p_method: method,
        p_reference: reference ?? null,
        p_received_at: receivedAt ?? new Date().toISOString(),
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as InvoicePayment;
    },
    onSuccess: (_payment, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Sends (or resends) the invoice email to the client via the invoice-send
 * edge function (designer JWT goes along automatically; the function verifies
 * ownership + issued status, emails the client through the compliance
 * chokepoint, and stamps sent_at if missing). Optional personal message.
 *
 * Pass type: 'reminder' for a designer-initiated manual nudge (A/R page):
 * renders the overdue-notice template instead of invoice_sent and leaves the
 * automated cadence counters (reminder_count / last_reminder_at) untouched.
 *
 * Document-surface callers that render failures inline (R83 — the error
 * grammar) pass `{ errorSurface: 'inline' }` so the designer portal's global
 * mutation onError raises no toast. Legacy portal callers omit it and keep
 * the toast until dissolve.
 */
export function useSendInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
      message,
      type,
    }: {
      invoiceId: string;
      projectId?: string;
      message?: string;
      type?: 'sent' | 'reminder';
    }): Promise<{
      ok: boolean;
      invoiceId: string;
      recipient: string;
      emailSent: boolean;
      suppressed: boolean;
    }> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.functions.invoke('invoice-send', {
        body: { invoiceId, message: message?.trim() || undefined, type },
      });
      if (error) {
        // FunctionsHttpError carries the response; surface the JSON error code
        // (e.g. no_recipient, invoice_not_issued) instead of a generic message.
        let detail: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          detail = body?.detail ?? body?.error;
        } catch {
          /* fall through to the generic message */
        }
        throw new Error(detail ?? error.message ?? 'Failed to send invoice');
      }
      if (data?.error) throw new Error(data.detail ?? data.error);
      return data;
    },
    onSuccess: (_data, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Marks an overdue receivable as manually chased (00209, R36 — the Accounts
 * book Receivables page). Stamps `ar_last_chased_at = now()` via the
 * chase_invoice RPC (SECURITY DEFINER + ownership guard, since sent invoices
 * are otherwise update-locked). This is the bookkeeping half of the dunning
 * act — the email goes through useSendInvoice({ type:'reminder' }); chasing
 * leaves the timestamp the Desk reads so the overdue-invoice need clears.
 * Returns the new timestamp (null when the invoice isn't the caller's).
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice (R83).
 */
export function useChaseInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
    }: {
      invoiceId: string;
      projectId?: string;
    }): Promise<string | null> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('chase_invoice', { p_invoice_id: invoiceId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: (_data, { projectId }) => {
      // NOTE: this invalidates the ['invoices'] namespace (the Accounts book's
      // Ledger/Receivables read here). It does NOT touch the Desk, which reads
      // invoices under its OWN key (['document-state','desk'], see
      // use-desk-engagements.ts). Callers that need the Desk's overdue-invoice
      // need to clear immediately must ALSO invalidate ['document-state'] — the
      // Receivables page's doChase does exactly that.
      invalidateInvoiceEffects(queryClient, projectId);
    },
  });
}

/**
 * Starts a Stripe Checkout session for an issued invoice's remaining balance
 * via the create-checkout-session edge function (caller JWT goes along
 * automatically; the function verifies the caller is the invoice's client,
 * claims one exact attempt/payment pair, and reuses its stable Stripe session.
 * The typed receipt and typed failures preserve that exact attempt identity.
 *
 * `paymentMethod` ('card' | 'us_bank_account') restricts the session to one
 * method with the surcharge broken out as its own line item (migration
 * 00428). Leaving it undefined OMITS `payment_method` from the body entirely
 * — not a null — which is exactly what iOS (InvoicesAPIClient.swift) has
 * always sent, and claims the legacy both-methods session (invariant #3).
 */
export function useStartCheckout() {
  return useMutation({
    mutationFn: async ({
      invoiceId,
      paymentMethod,
    }: {
      invoiceId: string;
      paymentMethod?: OnlinePaymentMethod;
    }): Promise<InvoiceCheckoutReceipt> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: paymentMethod ? { invoiceId, payment_method: paymentMethod } : { invoiceId },
      });
      if (error) {
        // FunctionsHttpError carries the response. Preserve the stable code and
        // exact attempt evidence rather than flattening everything into copy.
        let body: Record<string, unknown> | undefined;
        try {
          const parsed = await (error as { context?: Response }).context?.json();
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
          }
        } catch {
          /* fall through to the generic typed failure */
        }
        const code = typeof body?.error === 'string' ? body.error : 'checkout_request_failed';
        const detail =
          typeof body?.detail === 'string'
            ? body.detail
            : error.message || 'Failed to start checkout';
        throw new InvoiceCheckoutError(code, detail, checkoutEvidence(body));
      }
      if (data?.error) {
        throw new InvoiceCheckoutError(
          String(data.error),
          typeof data.detail === 'string' ? data.detail : String(data.error),
          checkoutEvidence(data),
        );
      }
      return parseInvoiceCheckoutReceipt(data);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT-METHOD CHOOSER (migration 00428 — ACH / Card / Check)
// ═══════════════════════════════════════════════════════════════════════════

export interface InvoicePaymentOptions {
  card_surcharge_bps: number;
  check_remit_to: string | null;
}

const DEFAULT_INVOICE_PAYMENT_OPTIONS: InvoicePaymentOptions = {
  card_surcharge_bps: 300,
  check_remit_to: null,
};

/**
 * Per-studio payment surcharge config for the client-portal payment-method
 * chooser, via the get_invoice_payment_options RPC (migration 00428,
 * SECURITY DEFINER — the invoice's client or a studio co-member only; a
 * draft invoice or a stranger raises `invoice_not_found` server-side). ANY
 * failure — RPC error, no settings row, a malformed/empty response — falls
 * back to the platform defaults (300 bps, no remit-to) rather than throwing:
 * a config read must never block the pay path.
 */
export function useInvoicePaymentOptions(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ['invoice-payment-options', invoiceId],
    queryFn: async (): Promise<InvoicePaymentOptions> => {
      const supabase = getSupabase() as any;
      try {
        const { data, error } = await supabase.rpc('get_invoice_payment_options', {
          p_invoice_id: invoiceId,
        });
        if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
          return DEFAULT_INVOICE_PAYMENT_OPTIONS;
        }
        const row = data as Record<string, unknown>;
        return {
          card_surcharge_bps: Number.isInteger(row.card_surcharge_bps)
            ? (row.card_surcharge_bps as number)
            : DEFAULT_INVOICE_PAYMENT_OPTIONS.card_surcharge_bps,
          check_remit_to: typeof row.check_remit_to === 'string' ? row.check_remit_to : null,
        };
      } catch {
        return DEFAULT_INVOICE_PAYMENT_OPTIONS;
      }
    },
    enabled: !!invoiceId,
  });
}

export interface NotifyCheckIntentResult {
  ok: boolean;
  /** True when a prior notification within the idempotency window absorbed
   *  this call — no second designer notification/email was sent. */
  alreadyNotified: boolean;
}

/**
 * Tells the designer the client intends to mail a check, via the
 * invoice-check-intent edge function (caller JWT goes along automatically;
 * the function verifies the caller is the invoice's client). Pure
 * notification — no ledger row; the designer still records the actual
 * receipt via useRecordPayment once the check arrives. Idempotent
 * server-side (a 24h window collapses a double-click to one notification),
 * so this never needs client-side de-dup beyond the normal pending guard.
 *
 * Error unwrap mirrors useSendInvoice (R83): a FunctionsHttpError's JSON body
 * carries the stable `detail`/`error` code, preferred over the generic
 * transport message.
 */
export function useNotifyCheckIntent() {
  return useMutation({
    mutationFn: async ({
      invoiceId,
    }: {
      invoiceId: string;
    }): Promise<NotifyCheckIntentResult> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.functions.invoke('invoice-check-intent', {
        body: { invoiceId },
      });
      if (error) {
        let detail: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          detail = body?.detail ?? body?.error;
        } catch {
          /* fall through to the generic message */
        }
        throw new Error(detail ?? error.message ?? 'Failed to notify the designer');
      }
      if (data?.error) throw new Error(data.detail ?? data.error);
      return {
        ok: !!data?.ok,
        // The edge function answers camelCase (`alreadyNotified`); the snake
        // form is a tolerated fallback only, so an older/replayed body shape
        // can never silently read as "not yet notified" and re-notify.
        alreadyNotified: !!(data?.alreadyNotified ?? data?.already_notified),
      };
    },
  });
}

/**
 * Voids an uncollected invoice via the void_invoice RPC: releases linked
 * milestones (back to pending) and any attached time entries.
 *
 * `{ errorSurface: 'inline' }` — see useSendInvoice (R83).
 */
export function useVoidInvoice(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
      reason,
    }: {
      invoiceId: string;
      projectId?: string;
      reason: string;
    }): Promise<Invoice> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('void_invoice', {
        p_invoice_id: invoiceId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as Invoice;
    },
    onSuccess: (invoice, { projectId }) => {
      invalidateInvoiceEffects(queryClient, projectId ?? invoice?.project_id);
    },
  });
}
