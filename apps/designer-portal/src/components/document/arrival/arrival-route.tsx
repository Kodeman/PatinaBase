'use client';

/**
 * US-14 arrival — the per-route run, keyed on the pathname so every route commit gets a fresh
 * ArrivalRun. The engine is imported here, not in (document)/layout.tsx: the layout is a server
 * component and cannot hand a client component an object of functions.
 */
import { usePathname } from 'next/navigation';
import { engine } from '@/lib/arrival/engine';
import { ArrivalRun } from './arrival-run';

export function ArrivalRoute(): React.ReactElement {
  const pathname = usePathname();
  return <ArrivalRun key={pathname} engine={engine} pathname={pathname} />;
}
