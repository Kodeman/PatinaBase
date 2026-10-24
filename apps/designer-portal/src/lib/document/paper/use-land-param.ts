'use client';

import { useEffect } from 'react';
import type { Landing } from '@/lib/arrival/types';
import { consumeLanding, parseUnfoldSearch } from './unfold-url';

/** Spend the instruction only after the selected frame has committed. An
 * unfolded sheet owns its own landing and reader-intent latch. */
export function useLandParam(
  ready: boolean,
  land: (landing: Landing) => void,
  unfoldedSheetMounted = false,
): void {
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('land')) return;
    const consumed = consumeLanding(url.search);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${consumed.search}${url.hash}`,
    );
    const sheetOwnsLanding = () => unfoldedSheetMounted && parseUnfoldSearch(url.searchParams, { canSeeMoney: true });
    if (consumed.landing && !sheetOwnsLanding()) land(consumed.landing);
  }, [ready, land, unfoldedSheetMounted]);
}
