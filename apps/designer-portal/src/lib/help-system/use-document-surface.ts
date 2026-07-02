'use client';

/**
 * useDocumentSurface (R89) — a (document) surface declares its help surface key.
 * One call at the top of the surface component; the layout-mounted
 * ContextualHelpPanel then scopes to it (and ⌘K's "Help…" row opens it there).
 *
 * Sets the key on mount (and if `key` ever changes). No cleanup on unmount:
 * `SurfaceKeyProvider` re-derives the key from the pathname on navigation
 * (documentPathnameToSurfaceKey), so there's no gap between surfaces — and the
 * two never disagree because both draw from DOCUMENT_SURFACE_KEYS.
 */
import { useEffect } from 'react';
import { useSetSurfaceKey } from '@patina/help-system';
import type { DocumentSurfaceKey } from './document-surface-keys';

export function useDocumentSurface(key: DocumentSurfaceKey): void {
  const setSurfaceKey = useSetSurfaceKey();
  useEffect(() => {
    setSurfaceKey(key);
  }, [key, setSurfaceKey]);
}
