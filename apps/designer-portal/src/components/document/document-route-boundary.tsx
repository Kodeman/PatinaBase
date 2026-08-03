'use client';

import { usePathname } from 'next/navigation';

/**
 * Mood-board rooms keep their canonical /(document)/board route while shedding
 * every Desk-global sibling. Rendering only `bare` also keeps those hidden
 * overlays out of the focus tree, which CSS alone cannot guarantee.
 */
export function DocumentRouteBoundary({
  bare,
  children,
}: {
  bare: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith('/board/')) return bare;
  return children;
}
