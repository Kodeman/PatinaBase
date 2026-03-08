/**
 * A/B Test Manager
 *
 * Splits an audience for campaign A/B testing and selects a winner
 * after a configurable evaluation period.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AbSplit {
  variantA: string[];
  variantB: string[];
}

export interface AbResult {
  winner: 'a' | 'b';
  openRateA: number;
  openRateB: number;
  sentA: number;
  sentB: number;
}

/**
 * Split an audience into two groups for A/B testing.
 *
 * @param userIds - Full audience list of user IDs
 * @param splitPct - Percentage allocated to variant A (0-100, default 50)
 * @returns Two arrays: variantA and variantB
 */
export function splitAudience(userIds: string[], splitPct: number = 50): AbSplit {
  const clampedPct = Math.max(0, Math.min(100, splitPct));
  // Shuffle using Fisher-Yates for unbiased distribution
  const shuffled = [...userIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const splitIndex = Math.round(shuffled.length * (clampedPct / 100));
  return {
    variantA: shuffled.slice(0, splitIndex),
    variantB: shuffled.slice(splitIndex),
  };
}

/**
 * Evaluate which A/B variant won based on open rates.
 * Called after the evaluation window (default 2 hours).
 *
 * @param supabase - Supabase client
 * @param campaignId - Campaign ID to evaluate
 * @returns The winning variant and stats
 */
export async function evaluateAbWinner(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<AbResult> {
  // Get campaign to find subjects
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('subject, ab_subject_b, ab_split_pct')
    .eq('id', campaignId)
    .single();

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  // Count opens for variant A (subject matches primary)
  const { count: sentA } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>campaign_id', campaignId)
    .eq('metadata->>ab_variant', 'a');

  const { count: openedA } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>campaign_id', campaignId)
    .eq('metadata->>ab_variant', 'a')
    .in('status', ['opened', 'clicked']);

  // Count opens for variant B
  const { count: sentB } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>campaign_id', campaignId)
    .eq('metadata->>ab_variant', 'b');

  const { count: openedB } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>campaign_id', campaignId)
    .eq('metadata->>ab_variant', 'b')
    .in('status', ['opened', 'clicked']);

  const totalA = sentA ?? 0;
  const totalB = sentB ?? 0;
  const openRateA = totalA > 0 ? ((openedA ?? 0) / totalA) * 100 : 0;
  const openRateB = totalB > 0 ? ((openedB ?? 0) / totalB) * 100 : 0;

  const winner: 'a' | 'b' = openRateA >= openRateB ? 'a' : 'b';

  // Update campaign with winner
  await supabase
    .from('campaigns')
    .update({
      ab_winner: winner,
      ab_decided_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  return {
    winner,
    openRateA,
    openRateB,
    sentA: totalA,
    sentB: totalB,
  };
}

/**
 * Schedule winner evaluation after a delay (default 2 hours).
 * In production, this would use pg_cron or a delayed Edge Function invocation.
 * Returns the evaluation timestamp.
 */
export function getEvaluationTime(delayHours: number = 2): Date {
  return new Date(Date.now() + delayHours * 3600000);
}
