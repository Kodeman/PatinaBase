import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

export interface ProductRelation {
  id: string;
  productId: string;
  relatedProductId: string;
  relationType: 'pairs_with' | 'alternative' | 'never_with';
  notes?: string;
  relatedProduct?: {
    id: string;
    name: string;
    brand?: string;
    price?: number;
    images?: string[];
    coverImage?: string;
  };
}

const relationKeys = {
  all: ['product-relations'] as const,
  byProduct: (id: string) => ['product-relations', id] as const,
};

export function useProductRelations(productId: string) {
  const supabase = createBrowserClient();

  return useQuery({
    queryKey: relationKeys.byProduct(productId),
    queryFn: async (): Promise<ProductRelation[]> => {
      // Query relations where this product is either product_a or product_b
      const { data: relationsA, error: errA } = await supabase
        .from('product_relations')
        .select(`
          id,
          product_b_id,
          relation_type,
          notes,
          products!product_relations_product_b_id_fkey (
            id, name, brand, price_retail, images
          )
        `)
        .eq('product_a_id', productId);

      const { data: relationsB, error: errB } = await supabase
        .from('product_relations')
        .select(`
          id,
          product_a_id,
          relation_type,
          notes,
          products!product_relations_product_a_id_fkey (
            id, name, brand, price_retail, images
          )
        `)
        .eq('product_b_id', productId);

      if (errA) throw errA;
      if (errB) throw errB;

      const results: ProductRelation[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (relationsA || []).forEach((r: any) => {
        const p = r.products;
        results.push({
          id: r.id,
          productId,
          relatedProductId: r.product_b_id,
          relationType: r.relation_type,
          notes: r.notes,
          relatedProduct: p
            ? {
                id: p.id,
                name: p.name,
                brand: p.brand,
                price: p.price_retail ? p.price_retail / 100 : undefined,
                images: p.images,
              }
            : undefined,
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (relationsB || []).forEach((r: any) => {
        const p = r.products;
        results.push({
          id: r.id,
          productId,
          relatedProductId: r.product_a_id,
          relationType: r.relation_type,
          notes: r.notes,
          relatedProduct: p
            ? {
                id: p.id,
                name: p.name,
                brand: p.brand,
                price: p.price_retail ? p.price_retail / 100 : undefined,
                images: p.images,
              }
            : undefined,
        });
      });

      return results;
    },
    enabled: !!productId,
  });
}

export function useAddProductRelation() {
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  return useMutation({
    mutationFn: async ({
      productId,
      relatedProductId,
      relationType,
      notes,
    }: {
      productId: string;
      relatedProductId: string;
      relationType: 'pairs_with' | 'alternative' | 'never_with';
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('product_relations').insert({
        product_a_id: productId,
        product_b_id: relatedProductId,
        relation_type: relationType,
        notes,
        assigned_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: relationKeys.byProduct(vars.productId) });
    },
  });
}

export function useRemoveProductRelation() {
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  return useMutation({
    mutationFn: async ({ relationId, productId }: { relationId: string; productId: string }) => {
      const { error } = await supabase.from('product_relations').delete().eq('id', relationId);
      if (error) throw error;
      return productId;
    },
    onSuccess: (productId) => {
      queryClient.invalidateQueries({ queryKey: relationKeys.byProduct(productId) });
    },
  });
}
