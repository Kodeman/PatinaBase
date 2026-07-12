'use client';

import { useState } from 'react';
import { PageHeader, FilterTabs, type FilterTab } from '@/components/portal';
import { MissionControlTabs } from '@/components/mission-control/mission-control-tabs';
import { DesignersBoard } from '@/components/mission-control/pipelines/designers-board';
import { MakersBoard } from '@/components/mission-control/pipelines/makers-board';

// WP-2.2 · Pipeline boards — two kanbans (Designer Recruiting, Maker
// Onboarding), one board visible at a time via the Designers|Makers toggle.
// Small-N design per the brief: every card is a named person/company with
// owner, age-in-stage, next action -- no aggregate-percentage widgets.

type BoardView = 'designers' | 'makers';

const BOARD_TABS: FilterTab<BoardView>[] = [
  { value: 'designers', label: 'Designers' },
  { value: 'makers', label: 'Makers' },
];

export default function PipelinesPage() {
  const [view, setView] = useState<BoardView>('designers');

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Pipeline"
        accent="Boards"
        description="Designer recruiting and maker onboarding, one board at a time. Drag a card between stages, or use its (⋯) menu on touch."
      />
      <MissionControlTabs />
      <FilterTabs items={BOARD_TABS} value={view} onChange={setView} className="mt-1" />

      <div className="mt-6">
        {view === 'designers' ? <DesignersBoard /> : <MakersBoard />}
      </div>
    </div>
  );
}
