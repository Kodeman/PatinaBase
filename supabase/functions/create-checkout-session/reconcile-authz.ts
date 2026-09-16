// create-checkout-session/reconcile-authz.ts — who may reconcile a stored
// invoice Checkout attempt.
//
// Split out of index.ts so the decision is provable without booting Deno.serve.
// Types are structural rather than supabase-js's, so a test can import this
// module without reaching esm.sh — same rule as direct-order.ts.

/** The one call this module makes against PostgREST. */
export interface ReconcileAuthzRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type ReconcileAuthzDecision =
  | { ok: true }
  | { ok: false; status: 404; body: { error: 'invoice_not_found' } }
  | { ok: false; status: 500; body: { error: 'lookup_failed'; detail: string } };

const NOT_FOUND: ReconcileAuthzDecision = {
  ok: false,
  status: 404,
  body: { error: 'invoice_not_found' },
};

/**
 * Authorize the caller for a reconcile of `invoiceId`'s stored Checkout attempt.
 *
 * Unauthorized collapses to 404, never 403 — this endpoint must not confirm that
 * a foreign invoice id exists.
 *
 * `callerClient` MUST carry the caller's JWT: `is_studio_comember` is SECURITY
 * DEFINER over `auth.uid()`, so a plain service-role client resolves it to NULL
 * and every co-member would be refused.
 */
export async function authorizeInvoiceReconcile(
  callerClient: ReconcileAuthzRpcClient,
  callerId: string,
  payerId: string | null,
  designerId: string,
): Promise<ReconcileAuthzDecision> {
  if (callerId === payerId || callerId === designerId) {
    return { ok: true };
  }

  // Studio co-members can already READ this invoice under RLS
  // (invoices_studio_select = is_studio_comember(designer_id), 00582), so the
  // folio's auto-reconcile fires for them too. Authorize with the same
  // predicate RLS uses rather than a second, drifting definition.
  const { data, error } = await callerClient.rpc('is_studio_comember', {
    p_owner: designerId,
  });

  if (error) {
    return { ok: false, status: 500, body: { error: 'lookup_failed', detail: error.message } };
  }

  return data === true ? { ok: true } : NOT_FOUND;
}
