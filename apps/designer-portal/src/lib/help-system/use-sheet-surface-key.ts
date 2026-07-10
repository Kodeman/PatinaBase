'use client';

/**
 * useSheetSurfaceKey (help-desk Wave 0) — a ledger sheet declares its help
 * surface key for as long as it's open.
 *
 * The four Ledgers (Orders / Accounts / Hours / The Post) open as DocSheet
 * overlays that never change the pathname, so the pathname-derived fallback
 * (documentPathnameToSurfaceKey) can't see them. The sheet host calls this
 * hook with the currently-open sheet key:
 *
 *   • a ledger key ('orders' | 'accounts' | 'hours' | 'the-post') → the
 *     matching DOCUMENT_SURFACE_KEYS ledger key is set;
 *   • anything else (null = closed, or a non-ledger sheet like 'feedback') →
 *     the key is restored to the pathname-derived surface underneath.
 *
 * Close and unmount both restore, so the panel always lands back on the
 * surface the sheet slid over (R96: a sheet slides off without disturbing
 * what's beneath it).
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSetSurfaceKey } from '@patina/help-system';
import { DOCUMENT_SURFACE_KEYS } from './document-surface-keys';
import { documentPathnameToSurfaceKey } from './document-pathname-to-surface-key';

/** Registry `key` → help surface key, for the four sheet-weight Ledgers. */
const SHEET_SURFACE_KEYS: Record<string, string> = {
  orders:     DOCUMENT_SURFACE_KEYS.orders,
  accounts:   DOCUMENT_SURFACE_KEYS.accounts,
  hours:      DOCUMENT_SURFACE_KEYS.hours,
  'the-post': DOCUMENT_SURFACE_KEYS.thePost,
};

export function useSheetSurfaceKey(sheetKey: string | null): void {
  const setSurfaceKey = useSetSurfaceKey();
  const pathname = usePathname();

  useEffect(() => {
    const mapped = sheetKey ? SHEET_SURFACE_KEYS[sheetKey] : undefined;
    if (!mapped) {
      // Closed (null) or a non-ledger sheet — the surface underneath owns the key.
      setSurfaceKey(documentPathnameToSurfaceKey(pathname ?? '/'));
      return undefined;
    }
    setSurfaceKey(mapped);
    return () => {
      // Sheet closed / host unmounted — restore the surface underneath.
      setSurfaceKey(documentPathnameToSurfaceKey(pathname ?? '/'));
    };
  }, [sheetKey, pathname, setSurfaceKey]);
}
