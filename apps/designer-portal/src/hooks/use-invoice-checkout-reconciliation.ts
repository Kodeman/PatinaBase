import { useMutation } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

type ReconciliationStatus =
  | 'confirmed'
  | 'processing'
  | 'requires_refund'
  | 'refunded'
  | 'failed';

interface ReconciliationResult {
  status: ReconciliationStatus;
}

/**
 * Error unwrap mirrors useSendInvoice (R83): a FunctionsHttpError's JSON body
 * carries the stable `detail`/`error` code, preferred over the generic
 * transport message ("Edge Function returned a non-2xx status code").
 */
export function useReconcileInvoiceCheckout(options?: { errorSurface?: 'inline' }) {
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      invoiceId,
      sessionId,
    }: {
      invoiceId: string;
      sessionId: string;
    }): Promise<ReconciliationResult> => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { invoiceId, reconcile_session_id: sessionId },
      });
      if (error) {
        let detail: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          detail = body?.detail ?? body?.error;
        } catch {
          /* fall through to the generic message */
        }
        throw new Error(detail ?? error.message ?? 'Checkout reconciliation failed.');
      }
      if (data?.error) {
        throw new Error(
          typeof data.detail === 'string' ? data.detail : 'Checkout reconciliation failed.',
        );
      }
      if (
        data?.status !== 'confirmed' &&
        data?.status !== 'processing' &&
        data?.status !== 'requires_refund' &&
        data?.status !== 'refunded' &&
        data?.status !== 'failed'
      ) {
        throw new Error('Checkout reconciliation returned an invalid status.');
      }
      return { status: data.status };
    },
  });
}
