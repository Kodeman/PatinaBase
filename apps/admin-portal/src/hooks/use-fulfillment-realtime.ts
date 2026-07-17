'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '@patina/supabase';
import { fulfillmentKeys } from './use-fulfillment-queue';

// Fulfillment Queue live-refresh (S1, spec §5.1) — subscribes to INSERTs on
// `fulfillment_events` (00351, in the supabase_realtime publication) and
// invalidates the queue's query key so it refetches. Every mutating RPC
// writes an event row (§11 "the Run Log") before returning, so this channel
// catches every state change that could move a row between bands, not just a
// hand-picked subset of tables.
//
// Debounced 400ms: a single operator action (e.g. fulfillment_confirm_split
// on a 5-vendor order) can write several event rows in quick succession
// (one po.created per vendor); debouncing collapses that burst into one
// refetch instead of one per row.
const DEBOUNCE_MS = 400;

export function useFulfillmentRealtime(enabled = true) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createBrowserClient();
    let channel: RealtimeChannel | undefined;
    let cancelled = false;

    channel = supabase
      .channel('fulfillment_queue_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fulfillment_events' },
        () => {
          if (cancelled) return;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
          }, DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
