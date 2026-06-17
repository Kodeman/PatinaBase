'use client';

/**
 * Portfolio (R52 / Track C) — the finished-rooms gallery over completed
 * projects (`useProjects({ status: 'completed' })`). Wave-0 stub.
 */

import { ViewHeader, ViewPlaceholder } from '../view-shell';
import type { PeopleViewProps } from '../types';

export function PortfolioView(_props: PeopleViewProps) {
  return (
    <>
      <ViewHeader
        title="Portfolio"
        sub="The finished rooms — your completed work, ready to show the next client and feed reviews."
      />
      <ViewPlaceholder track="Track C — portfolio (completed projects)" />
    </>
  );
}
