'use client';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CatalogFilters } from '@/components/catalog/catalog-filters';

import { CatalogModals } from './catalog-modals';
import type { CatalogDisplayProduct } from '../types';

const sampleProduct: CatalogDisplayProduct = {
  id: 'prod-1',
  slug: 'prod-1',
  name: 'Showroom Sofa',
  brand: 'Patina',
  shortDescription: 'A showroom-ready sofa.',
  category: 'sofa',
  manufacturerId: 'mfg-1',
  price: 189900,
  currency: 'USD',
  materials: ['Fabric'],
  colors: ['Ivory'],
  styleTags: ['modern'],
  status: 'published',
  has3D: true,
  arSupported: true,
  customizable: false,
  images: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  imageUrl: 'https://via.placeholder.com/400',
  tags: ['showroom'],
};

const createQueryClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  client.setQueryData(['categories', 'list', undefined], []);
  client.setQueryData(['vendors', 'list', undefined], []);

  return client;
};

const meta: Meta<typeof CatalogModals> = {
  title: 'Features/Catalog/CatalogModals',
  component: CatalogModals,
  decorators: [
    (Story) => (
      <QueryClientProvider client={createQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    filters: {} as CatalogFilters,
    isFilterOpen: false,
    onFilterOpenChange: () => {},
    onFiltersChange: () => {},
    onClearFilters: () => {},
    selectedProduct: null as CatalogDisplayProduct | null,
    isDetailModalOpen: false,
    onDetailModalOpenChange: () => {},
    onViewProduct: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof CatalogModals>;

export const Closed: Story = {};

export const WithProductSelected: Story = {
  args: {
    selectedProduct: sampleProduct,
  },
};
