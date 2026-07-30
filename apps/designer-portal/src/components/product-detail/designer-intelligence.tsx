'use client';

import { useRouter } from 'next/navigation';
import { DesignerIntelligence as SharedDesignerIntelligence } from '@patina/catalog-ui';

/**
 * Designer-portal wrapper for the shared DesignerIntelligence zone.
 * Supplies the teach-flow navigation callback.
 */
export function DesignerIntelligence() {
  const router = useRouter();
  return (
    <SharedDesignerIntelligence
      onTeach={(productId) => router.push(`/library/${productId}`)}
    />
  );
}
