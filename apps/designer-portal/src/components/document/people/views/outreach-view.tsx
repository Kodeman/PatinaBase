'use client';

/**
 * Outreach (R53 / Track D) — marketing ops: campaigns, the email template
 * library, and audience segments (which draw from the unified directory) over
 * `use-campaigns` / `use-templates` / `use-audience-segments`. Wave-0 stub.
 */

import { ViewHeader, ViewPlaceholder } from '../view-shell';
import type { PeopleViewProps } from '../types';

export function OutreachView(_props: PeopleViewProps) {
  return (
    <>
      <ViewHeader
        title="Outreach"
        sub="Marketing at relationship scale — campaigns, templates, and audiences, all drawn from the same directory."
      />
      <ViewPlaceholder track="Track D — outreach (campaigns / templates / audiences)" />
    </>
  );
}
