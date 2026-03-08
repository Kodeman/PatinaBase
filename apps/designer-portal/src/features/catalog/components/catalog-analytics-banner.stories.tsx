'use client';

import type { Meta, StoryObj } from '@storybook/react';
import type { Collection } from '@patina/types';

import { CatalogAnalyticsBanner } from './catalog-analytics-banner';

const sampleCollections: Collection[] = [
  {
    id: 'col-1',
    name: 'Modern Living',
    slug: 'modern-living',
    type: 'manual',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    description: 'Curated modern living room pieces.',
  },
  {
    id: 'col-2',
    name: 'Art Deco Revival',
    slug: 'art-deco-revival',
    type: 'manual',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    description: 'Statement pieces inspired by art deco.',
  },
  {
    id: 'col-3',
    name: 'Coastal Retreat',
    slug: 'coastal-retreat',
    type: 'manual',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    description: 'Bright and airy coastal selections.',
  },
];

const meta: Meta<typeof CatalogAnalyticsBanner> = {
  title: 'Features/Catalog/CatalogAnalyticsBanner',
  component: CatalogAnalyticsBanner,
  args: {
    collections: sampleCollections,
  },
};

export default meta;

type Story = StoryObj<typeof CatalogAnalyticsBanner>;

export const Default: Story = {};
