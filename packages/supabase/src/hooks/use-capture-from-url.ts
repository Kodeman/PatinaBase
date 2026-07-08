'use client';

// Add-from-URL + refresh-from-source (Schedule & Boards Wave 3 · Track A · A3).
// A thin client over the `capture-from-url` edge function, which fetches a
// product page server-side behind SSRF hard-guards and extracts
// name/brand/price/images/description. capture mode → fields for a new personal
// draft (via captureProduct); refresh mode → fields to DIFF against an existing
// record (buildRefreshDiff) for per-field accept — never a silent overwrite.

import { useMutation } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { ExtractedProduct } from '@patina/utils';

const getSupabase = () => createBrowserClient();

export type CaptureFromUrlResult = ExtractedProduct;

export function useCaptureFromUrl() {
  return useMutation({
    mutationFn: async (input: {
      url: string;
      mode: 'capture' | 'refresh';
      productId?: string;
    }): Promise<ExtractedProduct> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke('capture-from-url', {
        body: { url: input.url, mode: input.mode, productId: input.productId },
      });
      if (error) {
        // functions.invoke wraps a non-2xx in a FunctionsHttpError whose .context
        // is the raw Response — surface the edge fn's { error } for an inline message.
        let message = error.message || 'That URL could not be read.';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const body = await (error as any).context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          /* keep the default message */
        }
        throw new Error(message);
      }
      return (data ?? {}) as ExtractedProduct;
    },
  });
}
