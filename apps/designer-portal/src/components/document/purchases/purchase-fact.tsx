'use client';

import { useOrganizationMembers, useStudioPaymentMethods, type StudioPurchaseRow } from '@patina/supabase';
import { purchaseSentence } from './purchase-record';

/**
 * C-25: the line unfold's one sentence for a line bought on a card or on the
 * spot, "Bought on Amex · Leah · 3 Oct · returnable until 2 Nov". It reads
 * the method's label and the buying member's first name.
 */
export function PurchaseFact({ purchase, className }: { purchase: StudioPurchaseRow; className?: string }) {
  const { data: methods } = useStudioPaymentMethods(purchase.organization_id ?? undefined);
  const { data: members } = useOrganizationMembers(
    purchase.paid_by_member_id && purchase.organization_id ? purchase.organization_id : '',
  );
  const method = purchase.payment_method_id ? methods?.find((m) => m.id === purchase.payment_method_id) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payer = ((members ?? []) as any[]).find((m) => m.id === purchase.paid_by_member_id);
  const profile = payer?.profiles;
  const payerName: string | null =
    (profile?.display_name || profile?.full_name || '').split(' ')[0] || null;
  return (
    <p data-testid="line-purchase-fact" className={className}>
      {purchaseSentence(purchase, method?.label ?? null, payerName)}
    </p>
  );
}
