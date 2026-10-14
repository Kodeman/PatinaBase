/**
 * US-34 N7 (PQ18): the Document's red-letter need, read for ONE engagement.
 *
 * The Document used to observe the whole Desk (useDeskEngagements: every
 * studio feed, re-read every 60 s) only to pick its own folder out of it, and
 * its arrival waited on that read. This hook asks desk_read (00791) for this
 * engagement alone — p_engagement_id narrows each feed to this job's project,
 * proposal or lead, while delivery_events stays studio-wide because an install
 * collision is cross-project — and composes the answer with the Desk's own
 * composeDeskRead, so selectOperationalNeedForDocument reads the same need it
 * read off the Desk (operational-need-parity.test.tsx holds the two together).
 *
 * One input is wider than one job by nature: the Pulse need prints the
 * studio's count for the week. A job with unsent Pulses therefore also reads
 * that week's document_state Pulse columns, and only those.
 *
 * Keyed under docKeys.engagement(id), so the Document's own invalidations
 * refresh it. There is no poll.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, docKeys } from '@patina/supabase';
import type { DocumentStateRow, PulseCountRow } from '@/lib/document/desk-derivation';
import { composeDeskRead, deskFeed, type NeedComposition } from './use-desk-engagements';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export const engagementNeedKey = (engagementId: string | null) =>
  [...docKeys.engagement(engagementId), 'need'] as const;

export async function readEngagementNeed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  engagementId: string,
): Promise<NeedComposition> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: read, error: readError } = await supabase.rpc('desk_read', {
    p_engagement_id: engagementId,
  });
  if (readError) throw readError;
  // As on the Desk: an unanswered engagements feed is no answer at all.
  const { data, error } = deskFeed(read, 'engagements');
  if (error) throw error;
  const rows = (data ?? []) as DocumentStateRow[];

  let pulseRows: PulseCountRow[] | undefined;
  const row = rows[0];
  if (row && row.unsent_pulse_count > 0 && row.pulse_week_of) {
    const { data: week, error: weekError } = await supabase
      .from('document_state')
      .select('is_archived, is_paused, pulse_week_of, unsent_pulse_count')
      .eq('pulse_week_of', row.pulse_week_of);
    if (weekError) throw weekError;
    pulseRows = (week ?? []) as PulseCountRow[];
  }

  const { folders, composed } = composeDeskRead(read, rows, today, new Date(), pulseRows);
  return { folders, composed };
}

/**
 * One engagement's need, for the Document. Same sentinels as the Desk's:
 * read it through selectOperationalNeed(s)ForDocument.
 */
export function useEngagementNeed(
  engagementId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery<NeedComposition, Error>({
    queryKey: engagementNeedKey(engagementId ?? null),
    enabled: (options.enabled ?? true) && Boolean(engagementId),
    queryFn: () => readEngagementNeed(getSupabase(), engagementId!),
  });
}
