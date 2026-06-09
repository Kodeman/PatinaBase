/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the invoicing tables (invoices,
// invoice_line_items, invoice_payments) added in migration 00178. The
// hook-level interfaces below mirror the table shape and are the canonical
// contract until `pnpm db:generate` is run. Follows use-procurement.ts house
// style.

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (mirror migration 00178)
// ═══════════════════════════════════════════════════════════════════════════

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';

export type InvoiceLineKind = 'milestone' | 'time' | 'adhoc';

export type InvoicePaymentMethod =
  | 'stripe'
  | 'check'
  | 'wire'
  | 'ach_manual'
  | 'cash'
  | 'other';

export type InvoicePaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  kind: InvoiceLineKind;
  milestone_id: string | null;
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
  created_at: string;
  updated_at: string;
  // Joined data
  project?: { id: string; name: string };
  client?: { id: string; full_name: string | null; email: string };
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

function buildLineRow(invoiceId: string, line: DraftLineInput, index: number) {
  return {
    invoice_id: invoiceId,
    kind: line.kind ?? (line.milestoneId ? 'milestone' : 'adhoc'),
    milestone_id: line.milestoneId ?? null,
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
          project:projects!invoices_project_id_fkey(id, name),
          client:profiles!invoices_client_id_fkey(id, full_name, email),
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
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a draft invoice header + its initial lines, then stamps draft
 * totals. The JS client cannot wrap these in one transaction, so a failed
 * line insert triggers a compensating header delete (lines CASCADE).
 */
export function useCreateDraftInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void invoice;
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
            kind: line.kind ?? (line.milestoneId ? 'milestone' : 'adhoc'),
            milestone_id: line.milestoneId ?? null,
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
    onSuccess: (_data, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void invoiceId;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

/**
 * Issues a draft invoice via the issue_invoice RPC (00178): assigns the
 * sequential number, recomputes totals, flips linked pending milestones to
 * outstanding. Pass projectId so milestone/financial caches refresh.
 */
export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
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
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
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
 * Voids an uncollected invoice via the void_invoice RPC: releases linked
 * milestones (back to pending) and any attached time entries.
 */
export function useVoidInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
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
