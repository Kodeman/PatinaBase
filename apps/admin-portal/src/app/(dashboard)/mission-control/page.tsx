'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader, LoadingStrata } from '@/components/portal';
import { ApprovalInbox } from '@/components/mission-control/approval-inbox';
import { LeahReviewDeck } from '@/components/mission-control/leah-review-deck';
import { MissionControlTabs } from '@/components/mission-control/mission-control-tabs';
import { VitalsStrip } from '@/components/mission-control/vitals-strip';

// WP-1.1 · Approval Inbox — Mission Control's primary screen.
// Exception-first: only awaiting_review tasks surface by default. ?assignee=leah
// swaps in the swipe-sized brand-score deck (mobile-first, one card per viewport).

function MissionControlContent() {
  const searchParams = useSearchParams();
  const leahMode = searchParams.get('assignee') === 'leah';

  if (leahMode) {
    // The Leah deck is chrome-free and full-viewport; no page header/tabs.
    return <LeahReviewDeck />;
  }

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Mission"
        accent="Control"
        description="Clear agent work here. Only tasks awaiting review surface — approve, reject with a note, or edit then approve."
      />
      <VitalsStrip />
      <MissionControlTabs />
      <ApprovalInbox />
    </div>
  );
}

export default function MissionControlPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <MissionControlContent />
    </Suspense>
  );
}
