'use client';

import { useState } from 'react';
import type { ProjectRosterRow } from '@patina/supabase';
import type { GroupedRoster, RosterGroup } from '@/lib/document/roster-derivation';
import { SectionEyebrow } from '../section-eyebrow';
import { RosterRow } from './roster-row';

const GROUP_LABEL: Record<RosterGroup, string> = {
  studioSide: 'Studio side',
  clientSide: 'Client side',
  buildSupply: 'Build & supply',
};

export function RosterGroups({
  groups,
  onOpenProfile,
}: {
  groups: GroupedRoster;
  onOpenProfile?: (row: ProjectRosterRow) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div data-project-roster-groups>
      {(['studioSide', 'clientSide', 'buildSupply'] as RosterGroup[]).map((group) => {
        const rows = groups[group];
        if (rows.length === 0) return null;
        return (
          <section
            key={group}
            data-roster-group={group}
            className="mt-6 first:mt-0"
          >
            <SectionEyebrow count={rows.length}>{GROUP_LABEL[group]}</SectionEyebrow>
            <ul className="border-t border-[var(--color-pearl)]">
              {rows.map((row) => (
                <RosterRow
                  key={row.roster_id ?? `${row.source}-${row.display_name}`}
                  row={row}
                  group={group}
                  expanded={expandedId === row.roster_id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === row.roster_id ? null : row.roster_id,
                    )
                  }
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
