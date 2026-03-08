import { useMutation, useQueryClient } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDING GENERATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface EmbeddingResult {
  success: boolean;
  productId: string;
  embeddingDimensions: number;
  textLength: number;
}

interface OllamaHealth {
  status: 'healthy' | 'unavailable' | 'model_missing';
  model?: string;
  error?: string;
}

/**
 * Generate embedding for a single product
 */
export function useGenerateProductEmbedding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string): Promise<EmbeddingResult> => {
      const response = await fetch(`/api/products/${productId}/embed`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate embedding');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['similar-products', data.productId] });
      queryClient.invalidateQueries({ queryKey: ['product-embedding-status', data.productId] });
      queryClient.invalidateQueries({ queryKey: ['products-needing-embeddings'] });
      queryClient.invalidateQueries({ queryKey: ['embedding-stats'] });
    },
  });
}

/**
 * Batch generate embeddings for multiple products
 */
export function useBatchGenerateEmbeddings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productIds: string[]): Promise<{
      successful: string[];
      failed: { productId: string; error: string }[];
    }> => {
      const successful: string[] = [];
      const failed: { productId: string; error: string }[] = [];

      // Process sequentially to avoid overwhelming Ollama
      for (const productId of productIds) {
        try {
          const response = await fetch(`/api/products/${productId}/embed`, {
            method: 'POST',
          });

          if (response.ok) {
            successful.push(productId);
          } else {
            const error = await response.json();
            failed.push({ productId, error: error.error || 'Unknown error' });
          }
        } catch (error) {
          failed.push({
            productId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { successful, failed };
    },
    onSuccess: () => {
      // Invalidate all embedding-related queries
      queryClient.invalidateQueries({ queryKey: ['similar-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-embedding-status'] });
      queryClient.invalidateQueries({ queryKey: ['products-needing-embeddings'] });
      queryClient.invalidateQueries({ queryKey: ['embedding-stats'] });
    },
  });
}

/**
 * Check Ollama health status
 */
export function useCheckOllamaHealth() {
  return useMutation({
    mutationFn: async (): Promise<OllamaHealth> => {
      const response = await fetch('/api/embeddings', {
        method: 'GET',
      });

      return response.json();
    },
  });
}

/**
 * Generate raw embedding for text (useful for search)
 */
export function useGenerateTextEmbedding() {
  return useMutation({
    mutationFn: async (text: string): Promise<number[]> => {
      const response = await fetch('/api/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate embedding');
      }

      const data = await response.json();
      return data.embedding;
    },
  });
}
