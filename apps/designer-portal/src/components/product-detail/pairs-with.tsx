'use client';

import { useState } from 'react';
import {
  PairsWith as SharedPairsWith,
  useProductEdit,
  type PairsWithSearchResult,
} from '@patina/catalog-ui';
import {
  useProductRelations,
  useAddProductRelation,
  useRemoveProductRelation,
} from '@/hooks/use-product-relations';
import { useProductSearch } from '@/hooks/use-products';

/**
 * Designer-portal wrapper for the shared PairsWith zone.
 * Fetches relations + search results via designer hooks and feeds them to the shared UI.
 */
export function PairsWith() {
  const { draft } = useProductEdit();
  const { data: relations = [], isLoading } = useProductRelations(draft.id);
  const addRelation = useAddProductRelation();
  const removeRelation = useRemoveProductRelation();
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: searchResults } = useProductSearch(searchQuery, { limit: 5 }) as {
    data: PairsWithSearchResult[] | undefined;
  };

  return (
    <SharedPairsWith
      relations={relations}
      isLoading={isLoading}
      searchResults={searchResults || []}
      onSearch={setSearchQuery}
      onAddRelation={async (relatedProductId) => {
        await addRelation.mutateAsync({
          productId: draft.id,
          relatedProductId,
          relationType: 'pairs_with',
        });
      }}
      onRemoveRelation={async (relation) => {
        await removeRelation.mutateAsync({ relationId: relation.id, productId: draft.id });
      }}
    />
  );
}
