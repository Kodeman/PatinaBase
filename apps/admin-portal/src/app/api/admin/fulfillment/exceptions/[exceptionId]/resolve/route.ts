import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import type { LedgerLinePreview } from '@patina/fulfillment';

// S7 resolve (spec §5.5) — the dual-mode RPC. preview:true returns the would-be
// ledger consequence with NO write; preview:false posts it and closes (or routes
// substitution to Leah). The SAME derivation feeds both, so the mono block the
// operator saw is byte-identical to what posts. Client-fixable RAISEs (missing
// cause_code, already resolved) map to 400.

function mapLines(raw: unknown): LedgerLinePreview[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: Record<string, unknown>) => ({
    accountCode: String(l.account_code ?? ''),
    accountName: (l.account_name as string) ?? null,
    debitCents: Number(l.debit_cents ?? 0),
    creditCents: Number(l.credit_cents ?? 0),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;
  const actor = auth.user.email ?? auth.user.id;
  const { exceptionId } = await params;

  let body: { path?: string; params?: Record<string, unknown>; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!body.path) return badRequest('A resolution path is required');

  try {
    const { data, error } = await db.rpc('fulfillment_resolve_exception', {
      p_exception_id: exceptionId,
      p_path: body.path,
      p_params: (body.params ?? {}) as never,
      p_preview: body.preview ?? false,
      p_actor: actor,
    });
    if (error) {
      const msg = error.message ?? '';
      if (/cause_code is required|already resolved|unknown resolution path/i.test(msg)) {
        return badRequest(msg);
      }
      throw error;
    }
    const out = (data ?? {}) as Record<string, unknown>;
    // normalize the snake_case RPC jsonb → camelCase the client expects
    const normalized: Record<string, unknown> = {
      ...out,
      lines: mapLines(out.lines),
      financial: Boolean(out.financial),
      requiresLeah: Boolean(out.requires_leah),
      amountCents: out.amount_cents ?? null,
      lineAction: out.line_action ?? null,
      routedToLeah: Boolean(out.routed_to_leah),
      reviewId: out.review_id ?? null,
      financialOutcomeEntryId: out.financial_outcome_entry_id ?? null,
    };
    return NextResponse.json({ data: normalized });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to resolve exception');
  }
}
