'use client';

import { useEffect } from 'react';
import {
  UNFOLD_REGION_EVENT,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

/**
 * Answer the running index's request to open this region. The index jumps to
 * readable content, never to a seam — so an indexed region listens for its own
 * key and unfolds itself before the scroll lands.
 */
export function useRegionUnfoldRequest(
  key: DocumentIndexKey,
  onUnfold: () => void,
): void {
  useEffect(() => {
    const onRequest = (e: Event) => {
      const region = (e as CustomEvent<{ region?: string }>).detail?.region;
      if (region === key) onUnfold();
    };
    window.addEventListener(UNFOLD_REGION_EVENT, onRequest);
    return () => window.removeEventListener(UNFOLD_REGION_EVENT, onRequest);
  }, [key, onUnfold]);
}
