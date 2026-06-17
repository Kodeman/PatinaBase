'use client';

/**
 * Reviews (R52 / Track C) — three-state feedback collection
 * (pending/collected/queued) over `use-reviews`. Wave-0 stub.
 */

import { ViewHeader, ViewPlaceholder } from '../view-shell';
import type { PeopleViewProps } from '../types';

export function ReviewsView(_props: PeopleViewProps) {
  return (
    <>
      <ViewHeader
        title="Reviews"
        sub="Feedback collection — request, track, and celebrate the words that bring the next client."
      />
      <ViewPlaceholder track="Track C — reviews (use-reviews)" />
    </>
  );
}
