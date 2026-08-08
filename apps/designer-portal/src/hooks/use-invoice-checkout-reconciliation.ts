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

export function useReconcileInvoiceCheckout() {
  return useMutation({
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
      if (error) throw error;
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
