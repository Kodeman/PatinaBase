import { renderHook, act, waitFor } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CatalogProductsResponse, CatalogSearchResponse, Collection } from '@patina/types';

import { useCatalogPresenter } from '../useCatalogPresenter';
import type { CatalogDisplayProduct } from '../../types';

jest.mock('@/hooks/use-products', () => ({
  useProducts: jest.fn(),
}));

jest.mock('@/hooks/use-search', () => ({
  useSearch: jest.fn(),
}));

jest.mock('@/hooks/use-collections', () => ({
  useFeaturedCollections: jest.fn(),
}));

jest.mock('@/lib/search-analytics', () => ({
  trackSearch: jest.fn(),
  trackSearchSelection: jest.fn(),
}));

const baseProduct: CatalogDisplayProduct = {
  id: 'prod-1',
  slug: 'prod-1',
  name: 'Curated Sofa',
  brand: 'Patina',
  shortDescription: 'A comfortable sofa',
  category: 'sofa',
  manufacturerId: 'mfg-1',
  price: 129900,
  currency: 'USD',
  materials: [],
  colors: [],
  styleTags: ['modern'],
  status: 'published',
  has3D: true,
  arSupported: false,
  customizable: false,
  images: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  imageUrl: 'https://example.com/sofa.jpg',
  tags: ['modern'],
};

const mockProductsResponse: CatalogProductsResponse = {
  products: [baseProduct],
  meta: { total: 1, page: 1, pageSize: 24 },
};

const mockSearchResponse: CatalogSearchResponse = {
  results: [baseProduct],
  total: 1,
  limit: 24,
  facets: {},
};

const useProductsMock = jest.requireMock('@/hooks/use-products').useProducts as jest.MockedFunction<
  () => UseQueryResult<CatalogProductsResponse>
>;
const useSearchMock = jest.requireMock('@/hooks/use-search').useSearch as jest.MockedFunction<
  () => UseQueryResult<CatalogSearchResponse>
>;
const useFeaturedCollectionsMock = jest.requireMock('@/hooks/use-collections').useFeaturedCollections as jest.MockedFunction<
  () => UseQueryResult<Collection[]>
>;
const { trackSearch, trackSearchSelection } = jest.requireMock('@/lib/search-analytics');

describe('useCatalogPresenter', () => {
  beforeEach(() => {
    useProductsMock.mockReturnValue({
      data: mockProductsResponse,
      isLoading: false,
      error: null,
    } as unknown as UseQueryResult<CatalogProductsResponse>);

    useSearchMock.mockReturnValue({
      data: mockSearchResponse,
      isLoading: false,
      error: null,
    } as unknown as UseQueryResult<CatalogSearchResponse>);

    useFeaturedCollectionsMock.mockReturnValue({
      data: [],
    } as unknown as UseQueryResult<Collection[]>);

    jest.clearAllMocks();
  });

  it('returns normalized catalog data with default state', () => {
    const { result } = renderHook(() => useCatalogPresenter());

    expect(result.current.state.searchQuery).toBe('');
    expect(result.current.data.totalProducts).toBe(1);
    expect(result.current.data.resultsRange).toEqual({ start: 1, end: 1 });
    expect(result.current.data.products[0].name).toBe('Curated Sofa');
  });

  it('updates filters and active filter count when filters change', () => {
    const { result } = renderHook(() => useCatalogPresenter());

    act(() => {
      result.current.actions.updateFilters({ brand: 'Patina' });
    });

    expect(result.current.state.filters.brand).toBe('Patina');
    expect(result.current.data.activeFilterCount).toBeGreaterThan(0);
  });

  it('switches to search mode and tracks analytics for qualifying queries', async () => {
    const { result } = renderHook(() => useCatalogPresenter());

    act(() => {
      result.current.actions.submitSearch('sofa');
    });

    await waitFor(() => {
      expect(trackSearch).toHaveBeenCalledWith('sofa', 1);
    });
    expect(result.current.data.isSearching).toBe(true);
  });

  it('tracks product selection when viewing a product in search mode', () => {
    const { result } = renderHook(() => useCatalogPresenter());

    act(() => {
      result.current.actions.submitSearch('sofa');
    });

    const product = result.current.data.products[0];

    act(() => {
      result.current.actions.viewProduct(product);
    });

    expect(trackSearchSelection).toHaveBeenCalledWith('sofa', product.id);
    expect(result.current.state.isDetailModalOpen).toBe(true);
    expect(result.current.modals.selectedProduct).toEqual(product);
  });
});
