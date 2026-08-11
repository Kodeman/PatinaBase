'use client';

/**
 * Studio Pulse — the Desk's folded secondary register.
 *
 * Open requests, work already moving, reconnects, and Field still retain their
 * real hooks, flags, actions, deep links, and error behavior. This component
 * only reads their already-owned populations once, states the known workload
 * in one line, and discloses the original actionable surfaces on request.
 */

import { useId, useState, type ReactNode } from 'react';
import type { DeskFolder, MotionChip } from '@/lib/document/desk-derivation';
import { studioPulseGateSentence } from '@/lib/document/workflow-gate';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import {
  DocumentAction,
  DocumentActionGroup,
} from '@/components/document/document-action';
import {
  OpenRequestsStrip,
  useOpenRequestsDeskPopulation,
} from '@/components/document/open-requests-strip';
import { InMotionChip } from '@/components/document/in-motion-chip';
import {
  DeskReconnect,
  useDeskReconnectPopulation,
} from '@/components/document/desk-reconnect';
import {
  FieldDesk,
  useFieldDeskPopulation,
} from '@/components/document/field/field-desk';

export interface StudioPulseCounts {
  openRequests: number;
  inMotion: number;
  reconnects: number;
  field: number;
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function studioPulsePreview(counts: StudioPulseCounts): string {
  const phrases: string[] = [];

  if (counts.openRequests > 0) {
    phrases.push(counted(counts.openRequests, 'open request', 'open requests'));
  }
  if (counts.inMotion > 0) {
    phrases.push(`${counts.inMotion} moving`);
  }
  if (counts.reconnects > 0) {
    phrases.push(`${counts.reconnects} reconnecting`);
  }
  if (counts.field > 0) {
    phrases.push(counted(counts.field, 'field need', 'field needs'));
  } else {
    phrases.push('Field quiet');
  }

  if (
    counts.openRequests === 0 &&
    counts.inMotion === 0 &&
    counts.reconnects === 0 &&
    counts.field === 0
  ) {
    return 'No secondary work needs attention · Field quiet';
  }

  return phrases.join(' · ');
}

export function StudioPulseDisclosure({
  counts,
  isReady,
  hasError,
  gateSentence,
  children,
}: {
  counts: StudioPulseCounts;
  isReady: boolean;
  hasError: boolean;
  /** Ruling VI — the one aggregate sentence. */
  gateSentence?: string | null;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const panelId = useId();
  const knownCount =
    counts.openRequests + counts.inMotion + counts.reconnects + counts.field;
  const countLabel = !isReady
    ? 'Reading count'
    : hasError
      ? `${knownCount} known ${knownCount === 1 ? 'item' : 'items'}`
      : `${knownCount} studio ${knownCount === 1 ? 'item' : 'items'}`;
  const preview = !isReady
    ? 'Reading studio activity…'
    : `${studioPulsePreview(counts)}${hasError ? ' · Some activity unavailable' : ''}`;

  return (
    <section
      aria-labelledby="studio-pulse"
      className="mt-14 border-y border-[var(--border-subtle)] py-5"
    >
      <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-end min-[720px]:justify-between">
        <div className="min-w-0">
          <SectionEyebrow>
            <span id="studio-pulse">Studio pulse</span>
          </SectionEyebrow>
          <p
            role="status"
            aria-live="polite"
            className="doc-type-body text-[var(--text-muted)]"
          >
            {preview}
          </p>
          {/* Ruling VI: exactly one aggregate sentence — the shape of the week
              in a line, so a designer can read it and stop. */}
          {isReady && gateSentence && (
            <p
              data-testid="studio-pulse-gate-sentence"
              className="doc-type-body mt-1 text-[var(--text-muted)]"
            >
              {gateSentence}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1">
          <span
            data-testid="studio-pulse-count"
            className="doc-type-meta uppercase tracking-[0.08em]"
          >
            {countLabel}
          </span>
          <DocumentActionGroup
            surfaceKey="desk"
            regionKey="studio-pulse"
            aria-label="Studio pulse display"
          >
            <DocumentAction
              actionKey={expanded ? 'fold-studio-pulse' : 'open-studio-pulse'}
              variant="tertiary"
              disabled={!isReady}
              aria-expanded={expanded}
              aria-controls={panelId}
              trailing={expanded ? '↑' : '↓'}
              onClick={() => {
                if (!expanded) setHasOpened(true);
                setExpanded((value) => !value);
              }}
            >
              {expanded ? 'Fold pulse' : 'Open pulse'}
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      </div>

      <div
        id={panelId}
        role="region"
        aria-label="Studio pulse details"
        hidden={!expanded}
        className="mt-6 space-y-12 border-t border-dashed border-[var(--border-default)] pt-10"
      >
        {hasOpened ? children : null}
      </div>
    </section>
  );
}

export function StudioPulse({
  chips,
  folders = [],
  engagementsResolved,
}: {
  chips: readonly MotionChip[];
  folders?: readonly DeskFolder[];
  engagementsResolved: boolean;
}) {
  const openRequests = useOpenRequestsDeskPopulation();
  const reconnects = useDeskReconnectPopulation();
  const field = useFieldDeskPopulation();
  const isReady =
    engagementsResolved &&
    !openRequests.isLoading &&
    !reconnects.isLoading &&
    !field.isLoading;
  const hasError = openRequests.isError || reconnects.isError || field.isError;
  const counts: StudioPulseCounts = {
    openRequests: openRequests.requests.length,
    inMotion: chips.length,
    reconnects: reconnects.reconnects.length,
    field: field.cards.length + field.lines.length,
  };

  const gateSentence = studioPulseGateSentence({
    folderCount: folders.length,
    overdueCount: folders.filter((folder) => folder.overdue?.isOverdue).length,
    inProductionCount: [...folders, ...chips].reduce(
      (total, entry) => total + (entry.row.in_flight_count ?? 0),
      0,
    ),
  });

  return (
    <StudioPulseDisclosure
      counts={counts}
      isReady={isReady}
      hasError={hasError}
      gateSentence={gateSentence}
    >
      {hasError && (
        <p
          role="alert"
          className="doc-type-body max-w-[58ch] border-l border-[var(--color-terracotta)] pl-4 text-[var(--text-muted)]"
        >
          Part of the studio pulse could not be read. The work shown below is
          the activity still available.
        </p>
      )}

      <OpenRequestsStrip population={openRequests} withinPulse />

      {chips.length > 0 && (
        <section aria-labelledby="in-motion">
          <SectionEyebrow count={chips.length}>
            <span id="in-motion">In motion</span>
          </SectionEyebrow>
          <ul className="space-y-1">
            {chips.map((chip) => (
              <InMotionChip key={chip.row.engagement_id} chip={chip} />
            ))}
          </ul>
        </section>
      )}

      <DeskReconnect population={reconnects} withinPulse />
      <FieldDesk population={field} withinPulse />
    </StudioPulseDisclosure>
  );
}
