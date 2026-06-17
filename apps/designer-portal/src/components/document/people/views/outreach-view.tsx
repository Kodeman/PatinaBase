'use client';

/**
 * Outreach (R53 / Track D) — marketing at relationship scale.
 *
 * Three `.subnav` sub-tabs over the same directory: Campaigns (list + stats +
 * compose/send), Templates (the email library + author/delete), and Audiences
 * (segments that DRAW FROM the directory by role/status/history/trust, with a
 * live preview count). Backed by `use-campaigns` / `use-comms-dashboard` /
 * `use-templates` / `use-audience-segments` + `usePeopleDirectory` for the
 * audience preview. Typography-first, zero shadows (D4), D1 strict focus
 * (sub-tabs underline, not nav chrome).
 *
 * Keeps the frozen export name + PeopleViewProps signature (people-room imports
 * `OutreachView`).
 */

import { useState } from 'react';
import { ViewHeader } from '../view-shell';
import type { PeopleViewProps } from '../types';
import { SubNav } from '../outreach/outreach-bits';
import { CampaignsTab } from '../outreach/campaigns-tab';
import { TemplatesTab } from '../outreach/templates-tab';
import { AudiencesTab } from '../outreach/audiences-tab';

type OutreachTab = 'campaigns' | 'templates' | 'audiences';

const TABS: ReadonlyArray<readonly [OutreachTab, string]> = [
  ['campaigns', 'Campaigns'],
  ['templates', 'Templates'],
  ['audiences', 'Audiences'],
];

export function OutreachView({ notify }: PeopleViewProps) {
  const [tab, setTab] = useState<OutreachTab>('campaigns');

  return (
    <>
      <ViewHeader
        title="Outreach"
        sub="Marketing at relationship scale — campaigns, templates, and audiences, all drawn from the same directory."
      />

      <SubNav tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'campaigns' && <CampaignsTab notify={notify} />}
      {tab === 'templates' && <TemplatesTab notify={notify} />}
      {tab === 'audiences' && <AudiencesTab notify={notify} />}
    </>
  );
}
