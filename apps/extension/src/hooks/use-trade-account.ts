import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export { calculateTradePrice, formatPrice } from '../lib/trade-pricing';

export interface TradeAccountInfo {
  accountStatus: 'none' | 'pending' | 'active';
  currentTierName: string | null;
  discountPercent: number | null;
  discountDisplay: string | null;
  accountNumber: string | null;
  accountSince: string | null;
  applicationUrl: string | null;
  contactEmail: string | null;
}

/**
 * Fetches the designer's trade account for a given vendor.
 * Queries designer_vendor_accounts joined with vendor_trade_programs
 * to get the current discount tier.
 */
export function useTradeAccount(
  userId: string | null,
  vendorId: string | null
): {
  tradeAccount: TradeAccountInfo | null;
  isLoading: boolean;
} {
  const [tradeAccount, setTradeAccount] = useState<TradeAccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTradeAccount = useCallback(async () => {
    if (!userId || !vendorId) {
      setTradeAccount(null);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Check for designer's trade account with this vendor
      const { data: account } = await supabase
        .from('designer_vendor_accounts')
        .select(`
          id,
          account_status,
          current_tier_id,
          account_number,
          account_since,
          vendor_trade_programs!designer_vendor_accounts_current_tier_id_fkey (
            tier_name,
            discount_percent,
            discount_display
          )
        `)
        .eq('designer_id', userId)
        .eq('vendor_id', vendorId)
        .single();

      if (!account) {
        // No account — check if vendor has a trade program at all
        const { data: programs } = await supabase
          .from('vendor_trade_programs')
          .select('application_url, contact_email')
          .eq('vendor_id', vendorId)
          .order('tier_order', { ascending: true })
          .limit(1);

        if (programs && programs.length > 0) {
          // Vendor has a trade program but designer has no account
          setTradeAccount({
            accountStatus: 'none',
            currentTierName: null,
            discountPercent: null,
            discountDisplay: null,
            accountNumber: null,
            accountSince: null,
            applicationUrl: programs[0].application_url,
            contactEmail: programs[0].contact_email,
          });
        } else {
          // Vendor has no trade program
          setTradeAccount(null);
        }
        return;
      }

      // Extract the joined trade program data
      const tierData = account.vendor_trade_programs as unknown as {
        tier_name: string;
        discount_percent: number;
        discount_display: string;
      } | null;

      setTradeAccount({
        accountStatus: account.account_status,
        currentTierName: tierData?.tier_name || null,
        discountPercent: tierData?.discount_percent || null,
        discountDisplay: tierData?.discount_display || null,
        accountNumber: account.account_number,
        accountSince: account.account_since,
        applicationUrl: null,
        contactEmail: null,
      });
    } catch {
      // Trade account fetch is non-critical — show retail only
      setTradeAccount(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, vendorId]);

  useEffect(() => {
    fetchTradeAccount();
  }, [fetchTradeAccount]);

  return { tradeAccount, isLoading };
}

