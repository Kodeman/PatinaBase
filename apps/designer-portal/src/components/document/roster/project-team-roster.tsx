'use client';

import { useMemo, useState } from 'react';
import { useProjectRoster, useProjectV2, type ProjectRosterRow } from '@patina/supabase';
import type { PartyKind } from '@patina/types';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { projectRosterProjection } from '@/lib/document/roster-derivation';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { RolodexPicker } from './rolodex-picker';
import { RosterGroups } from './roster-groups';
import { GuidedEmptyState } from '../guided-empty-state';

const BUILD_TEAM_KINDS: PartyKind[] = [
  'gc',
  'sub',
  'installer',
  'receiver',
  'vendor',
  'architect',
  'photographer',
  'stager',
  'other',
];

export function ProjectTeamRoster({
  projectId,
  clientName,
  clientProfileId,
  onOpenProfile,
}: {
  projectId: string;
  clientName?: string | null;
  clientProfileId?: string | null;
  onOpenProfile?: (row: ProjectRosterRow) => void;
}) {
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const rosterQuery = useProjectRoster(projectId);
  const projectQuery = useProjectV2(projectId);
  const { data: rows, isLoading: rosterLoading } = rosterQuery;
  const { data: project, isLoading: projectLoading } = projectQuery;
  const [pickerMode, setPickerMode] = useState<null | 'picker' | 'add'>(null);
  const [added, setAdded] = useState<string | null>(null);

  const resolvedClientName = clientName ?? project?.client?.full_name ?? null;
  const resolvedClientProfileId = clientProfileId ?? project?.client?.id ?? null;
  const projection = useMemo(
    () =>
      projectRosterProjection(rows ?? [], {
        name: resolvedClientName,
        profileId: resolvedClientProfileId,
        projectId,
      }),
    [rows, resolvedClientName, resolvedClientProfileId, projectId],
  );
  const isLoading = rosterLoading || (clientName === undefined && projectLoading);
  const isError = rosterQuery.isError || (clientName === undefined && projectQuery.isError);

  if (!callSheetOn) return null;

  return (
    <section aria-label="Project team roster" data-project-team-roster>
      <p className="mb-1.5 text-[11px] italic text-[var(--text-muted)]">
        The same project roster shown on the call sheet. A GC is optional; add the
        trades working directly when there is no GC.
      </p>
      {!isLoading && !isError && projection.rows.length === 0 && (
        <GuidedEmptyState
          title="Build the project team"
          description="Add the GC or trades who need project context and will appear on the call sheet."
          inputs={['GC or trade', 'Role', 'Contact details']}
          action={{
            key: 'add-project-gc-or-trade',
            label: 'Add GC or trade',
            onClick: () => setPickerMode('picker'),
          }}
          secondary={{
            key: 'add-new-project-trade',
            label: 'New trade contact',
            onClick: () => setPickerMode('add'),
          }}
        />
      )}
      {!isLoading && !isError && projection.rows.length > 0 && (
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="project-team-roster"
          aria-label="Project roster actions"
        >
          <DocumentAction actionKey="add-project-gc-or-trade" variant="primary" onClick={() => setPickerMode('picker')}>
            Add GC or trade
          </DocumentAction>
          <DocumentAction actionKey="add-new-project-trade" variant="secondary" onClick={() => setPickerMode('add')}>
            New trade contact
          </DocumentAction>
        </DocumentActionGroup>
      )}

      {added && (
        <p role="status" className="mt-2 text-[10px] text-[var(--color-sage)]">
          {added} added to the project roster.
        </p>
      )}
      {isLoading && (
        <p className="py-4 text-[11px] text-[var(--text-muted)]">Reading the roster…</p>
      )}
      {!isLoading && isError && (
        <div className="border-y border-[var(--color-pearl)] py-3">
          <p role="alert" className="text-[11.5px] text-[var(--color-terracotta)]">
            The project roster could not be read.
          </p>
          <DocumentAction
            actionKey="retry-project-roster"
            variant="secondary"
            onClick={() => void Promise.all([rosterQuery.refetch(), projectQuery.refetch()])}
          >
            Try again
          </DocumentAction>
        </div>
      )}
      {!isLoading && !isError && projection.rows.length > 0 && (
        <div className="mt-4">
          <RosterGroups groups={projection.groups} onOpenProfile={onOpenProfile} />
        </div>
      )}

      <RolodexPicker
        open={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        projectId={projectId}
        scopeKinds={BUILD_TEAM_KINDS}
        startInAdd={pickerMode === 'add'}
        onAdded={setAdded}
      />
    </section>
  );
}
