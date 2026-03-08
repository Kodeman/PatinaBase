'use client';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CatalogFilters } from '@/components/catalog/catalog-filters';

import { CatalogSearchBar } from './catalog-search-bar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const baseFilters: CatalogFilters = {
  brand: 'Patina',
  tags: ['modern', 'statement'],
};

const meta: Meta<typeof CatalogSearchBar> = {
  title: 'Features/Catalog/CatalogSearchBar',
  component: CatalogSearchBar,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-5xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    searchQuery: '',
    viewMode: 'grid',
    filters: baseFilters,
    activeFilterCount: 3,
    onSearchChange: () => {},
    onSearchSubmit: () => {},
    onOpenFilters: () => {},
    onChangeView: () => {},
    onLoadPreset: () => {},
    onClearFilters: () => {},
    onClearFilterKey: () => {},
    onClearPriceFilter: () => {},
    onRemoveTag: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof CatalogSearchBar>;

export const Default: Story = {};
