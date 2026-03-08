/**
 * Product Edit Page
 *
 * Server component that handles dynamic route parameters in Next.js 15+
 * Delegates to client component for interactivity.
 *
 * @module app/admin/catalog/[productId]/page
 */

import { Suspense } from 'react';
import { ProductEditSkeleton, ProductEditPageClient } from './product-edit-client';

interface ProductEditPageProps {
  params: Promise<{
    productId: string;
  }>;
}

export default async function ProductEditPage({ params }: ProductEditPageProps) {
  const { productId } = await params;

  return (
    <Suspense fallback={<ProductEditSkeleton />}>
      <ProductEditPageClient productId={productId} />
    </Suspense>
  );
}
