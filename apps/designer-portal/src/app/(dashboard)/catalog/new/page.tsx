'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@patina/design-system';

const ProductCreationWizard = dynamic(
  () => import('@/components/products/product-creation-wizard').then(mod => mod.ProductCreationWizard),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    ),
  }
);

export default function NewProductPage() {
  return <ProductCreationWizard />;
}
