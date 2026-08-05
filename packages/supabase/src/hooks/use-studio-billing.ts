import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { DEFAULT_CARD_SURCHARGE_BPS } from '@patina/shared/invoice';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO BILLING SETTINGS (invoice payment-method surcharge config —
// migration 00428, table `studio_billing_settings`)
//
// One row per studio (organizations.id), opt-in via the designer portal's
// Billing section. The client-portal payment-method chooser reads these
// THROUGH the invoice, via useInvoicePaymentOptions (use-invoices.ts) — not
// directly — so an anonymous/RLS-restricted client never queries this table
// itself. These hooks are for the designer-portal settings surface.
// ═══════════════════════════════════════════════════════════════════════════

export interface StudioBillingSettings {
  studio_id: string;
  /** 0..300 (network cap 3%); DEFAULT_CARD_SURCHARGE_BPS when unconfigured. */
  card_surcharge_bps: number;
  check_remit_to: string | null;
  created_at: string;
  updated_at: string;
}

function defaultStudioBillingSettings(studioId: string): StudioBillingSettings {
  return {
    studio_id: studioId,
    card_surcharge_bps: DEFAULT_CARD_SURCHARGE_BPS,
    check_remit_to: null,
    created_at: '',
    updated_at: '',
  };
}

/**
 * A studio's card-surcharge bps + check remit-to instructions. No settings
 * row yet (the common case, before a designer has ever visited Billing)
 * reads as the platform defaults rather than null, so the settings form and
 * the pay-surface fallback never have to special-case "unconfigured".
 */
export function useStudioBillingSettings(studioId: string | null | undefined) {
  return useQuery({
    queryKey: ['studio-billing-settings', studioId],
    queryFn: async (): Promise<StudioBillingSettings> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_billing_settings')
        .select('*')
        .eq('studio_id', studioId)
        .maybeSingle();
      if (error) throw error;
      return (data as StudioBillingSettings | null) ?? defaultStudioBillingSettings(studioId as string);
    },
    enabled: !!studioId,
  });
}

/**
 * Upserts a studio's billing settings on the `studio_id` primary key (RLS:
 * org admin/owner only — see migration 00428). Invalidates its own cache key
 * plus `['invoice-payment-options']` — the client-portal chooser reads
 * through that key, keyed by invoiceId, and a bps/remit-to edit must be
 * visible the next time a client opens an invoice to pay.
 */
export function useUpdateStudioBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studioId,
      cardSurchargeBps,
      checkRemitTo,
    }: {
      studioId: string;
      cardSurchargeBps: number;
      checkRemitTo: string | null;
    }): Promise<StudioBillingSettings> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_billing_settings')
        .upsert(
          {
            studio_id: studioId,
            card_surcharge_bps: cardSurchargeBps,
            check_remit_to: checkRemitTo,
          },
          { onConflict: 'studio_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data as StudioBillingSettings;
    },
    onSuccess: (_data, { studioId }) => {
      queryClient.invalidateQueries({ queryKey: ['studio-billing-settings', studioId] });
      queryClient.invalidateQueries({ queryKey: ['invoice-payment-options'] });
    },
  });
}
