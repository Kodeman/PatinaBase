import type { Product } from './product';
import type { Collection, MediaAsset } from './catalog';

export interface CatalogProductsMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface CatalogProductsResponse {
  products: Product[];
  meta: CatalogProductsMeta;
}

export type CatalogProductsApiResponse =
  | Product[]
  | {
      data?:
        | {
            products?: Product[];
            results?: Product[];
            total?: number;
            page?: number;
            pageSize?: number;
          }
        | Product[];
      products?: Product[];
      results?: Product[];
      total?: number;
      page?: number;
      pageSize?: number;
      meta?: Partial<CatalogProductsMeta>;
    };

export interface CatalogSearchFacetValue {
  value: string;
  count: number;
}

export type CatalogSearchFacets = Record<string, CatalogSearchFacetValue[]>;

export interface CatalogSearchResponse {
  results: Product[];
  total: number;
  limit?: number;
  cursor?: string;
  nextCursor?: string;
  facets?: CatalogSearchFacets;
}

export type CatalogSearchApiResponse =
  | CatalogSearchResponse
  | {
      data?: {
        results?: Product[];
        total?: number;
        limit?: number;
        cursor?: string;
        nextCursor?: string;
        facets?: CatalogSearchFacets;
      };
      meta?: {
        total?: number;
        pageSize?: number;
        cursor?: string;
        nextCursor?: string;
      };
      results?: Product[];
      total?: number;
      facets?: CatalogSearchFacets;
      limit?: number;
      cursor?: string;
      nextCursor?: string;
    };

export interface CatalogFeaturedCollectionsResponse {
  collections: Collection[];
}

export type CatalogProductMedia = MediaAsset;
