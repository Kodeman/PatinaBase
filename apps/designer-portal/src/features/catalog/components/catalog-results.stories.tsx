'use client';

import type { Meta, StoryObj } from '@storybook/react';

import { CatalogResults } from './catalog-results';
import type { CatalogDisplayProduct } from '../types';

const sampleProduct: CatalogDisplayProduct = {
  id: 'prod-1',
  slug: 'prod-1',
  name: 'Statement Sofa',
  brand: 'Patina',
  shortDescription: 'A modern sofa with clean lines.',
  category: 'sofa',
  manufacturerId: 'mfg-1',
  price: 159900,
  currency: 'USD',
  materials: ['Fabric', 'Wood'],
  colors: ['Ivory'],
  styleTags: ['modern', 'minimal'],
  status: 'published',
  has3D: true,
  arSupported: true,
  customizable: true,
  images: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  imageUrl: 'https://via.placeholder.com/400',
  tags: ['modern', 'living room'],
};

const meta: Meta<typeof CatalogResults> = {
  title: 'Features/Catalog/CatalogResults',
  component: CatalogResults,
  args: {
    products: [sampleProduct, { ...sampleProduct, id: 'prod-2', name: 'Accent Chair' }],
    viewMode: 'grid',
    isLoading: false,
    isError: false,
    totalProducts: 2,
    totalPages: 1,
    page: 1,
    resultsRange: { start: 1, end: 2 },
    searchQuery: '',
    filters: {},
    onViewProduct: () => {},
    onPageChange: () => {},
    onClearFilters: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof CatalogResults>;

export const Grid: Story = {};

export const List: Story = {
  args: {
    viewMode: 'list',
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const EmptyState: Story = {
  args: {
    products: [],
    totalProducts: 0,
    totalPages: 0,
    resultsRange: { start: 0, end: 0 },
    filters: { brand: 'Patina' },
    searchQuery: 'accent table',
  },
};
