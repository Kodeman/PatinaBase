'use client';

/**
 * US-34 N12b (PQ11) — mounted once by the (document) layout. While it is on
 * screen, no failed mutation raises the global red toast: each act shows its
 * own R83 line instead (`ActFailLine`). Renders nothing.
 */

import { useEffect } from 'react';
import { enterInlineErrorSurface } from '@/lib/react-query';

export function InlineErrorSurface(): null {
  useEffect(() => enterInlineErrorSurface(), []);
  return null;
}
