import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/**
 * Check if a product already exists with the given source URL.
 * Used by the Chrome extension and portals to detect duplicates before capture.
 */
export function useProductBySourceUrl(sourceUrl: string | null) {
  return useQuery({
    queryKey: ['product-by-source-url', sourceUrl],
    queryFn: async () => {
      if (!sourceUrl) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('products')
        .select('id, name, source_url, images, price_retail, vendor_id, captured_at')
        .eq('source_url', sourceUrl)
        .maybeSingle();

      if (error) throw error;
      return data as {
        id: string;
        name: string;
        source_url: string;
        images: string[];
        price_retail: number | null;
        vendor_id: string | null;
        captured_at: string;
      } | null;
    },
    enabled: !!sourceUrl,
    staleTime: 30_000, // Cache for 30s to avoid hammering during rapid navigation
  });
}
