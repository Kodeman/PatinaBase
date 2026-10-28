import { useEffect } from 'react';

/** SQ-2338 F1 — fired on the document whenever a page's round-8 root comes or
 *  goes, so an already-open DocSheet layer re-reads the page it lays over. */
export const PAGE_ROUND8_SCOPE_CHANGE = 'patina:page-round8-scope-change';

/** A page's round-8 root (frame, desk, room) announces its arrival and its
 *  departure. Passive effects run after the commit, so a listener sees the
 *  DOM the announcement describes. */
export function useAnnouncePageRound8Scope(active = true) {
  useEffect(() => {
    if (!active) return;
    const announce = () => {
      document.dispatchEvent(new Event(PAGE_ROUND8_SCOPE_CHANGE));
    };
    announce();
    return announce;
  }, [active]);
}
