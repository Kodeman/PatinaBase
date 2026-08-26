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
import type {
  DeskFolder,
  DocumentStateRow,
  MotionChip,
  SectionKey,
} from '@/lib/document/desk-derivation';
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

/** F39/F65 — "The studio today" reads the same live rows ⌘K's `Where the
 *  work stands` group reduces over (`command-bar.tsx:620–645`), furthest
 *  along first, so the sentence and the palette never disagree. */
const STAGE_ORDER: readonly SectionKey[] = [
  'care',
  'install',
  'project',
  'proposal',
  'direction',
  'discovery',
  'brief',
];

function stagePhrase(stage: SectionKey, count: number): string {
  const n = count === 1 ? 'one' : String(count);
  switch (stage) {
    case 'proposal':
      return `${n} letter${count === 1 ? '' : 's'} out`;
    case 'project':
      return `${n} in procurement`;
    default:
      return `${n} in ${stage}`;
  }
}

export interface StageSentencePart {
  stage: SectionKey;
  count: number;
  text: string;
}

/** Reduces the Desk's LIVE rows into one entry per live stage — the same
 *  population ⌘K's `Where the work stands` group reads, never a second query.
 *
 *  Not folders + chips: those are the two DERIVED populations, a document with
 *  neither a need nor a motion is in neither, and chips are capped at
 *  MAX_MOTION_CHIPS. The sentence would state an undercount, and the palette
 *  would agree with it. */
export function studioStageSentenceParts(
  rows: readonly { active_section: SectionKey }[],
): StageSentencePart[] {
  return STAGE_ORDER.flatMap((stage) => {
    const count = rows.filter((r) => r.active_section === stage).length;
    return count === 0 ? [] : [{ stage, count, text: stagePhrase(stage, count) }];
  });
}

/** Reuses ⌘K's own open event (`command-bar.tsx`'s `openCommandBar`) so a
 *  stage phrase and the Desk header's "Find anything" open the identical
 *  palette — this one already filtered to the stage, which is what makes the
 *  phrase a doorway rather than a label. The event is dispatched directly
 *  rather than through the exported opener: importing `command-bar.tsx` here
 *  drags `@patina/help-system` (and its `@portabletext/react` ESM) into every
 *  Desk suite (patina-testing, trap 2). */
function openStageInCommandBar(stage: SectionKey) {
  window.dispatchEvent(
    new CustomEvent('document:open-command-bar', { detail: { query: stage } }),
  );
}

function capitalize(text: string): string {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

/** The one Playfair-italic sentence, each stage phrase scored as an inline
 *  doorway (C6) — an underline, never a box or a plate (D4, I107). Full
 *  `DocumentAction` is a 44px block control and does not sit inline inside a
 *  running sentence, so this is the lighter inline variant of the same
 *  "no box, just ink" grammar. */
function StageSentence({
  isReady,
  parts,
}: {
  isReady: boolean;
  parts: StageSentencePart[];
}) {
  if (!isReady) {
    return (
      <p className="font-heading text-[17px] italic text-[var(--text-muted)]">
        Reading the studio…
      </p>
    );
  }
  if (parts.length === 0) {
    return (
      <p className="font-heading text-[17px] italic text-[var(--text-muted)]">
        Nothing moving in the studio today.
      </p>
    );
  }
  return (
    <p className="font-heading text-[17px] italic text-[var(--text-primary)]">
      {parts.map((part, index) => (
        <span key={part.stage}>
          {index > 0 && ' · '}
          <button
            type="button"
            className="not-italic underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-clay-ink)] hover:decoration-solid motion-reduce:transition-none"
            onClick={() => openStageInCommandBar(part.stage)}
          >
            {index === 0 ? capitalize(part.text) : part.text}
          </button>
        </span>
      ))}
      .
    </p>
  );
}

export function StudioPulseDisclosure({
  counts,
  isReady,
  hasError,
  gateSentence,
  stageSentenceParts = [],
  children,
}: {
  counts: StudioPulseCounts;
  isReady: boolean;
  hasError: boolean;
  /** Ruling VI — the one aggregate sentence. */
  gateSentence?: string | null;
  /** F39/F65 — "The studio today"'s stage phrases, furthest along first. */
  stageSentenceParts?: StageSentencePart[];
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

  return (
    <section
      aria-labelledby="studio-pulse"
      className="mt-14 border-y border-[var(--border-subtle)] py-5"
    >
      <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-end min-[720px]:justify-between">
        <div className="min-w-0">
          <SectionEyebrow>
            <span id="studio-pulse">The studio today</span>
          </SectionEyebrow>
          <div role="status" aria-live="polite">
            <StageSentence isReady={isReady} parts={stageSentenceParts} />
          </div>
          {isReady && hasError && (
            <p className="doc-type-body mt-1 text-[var(--text-muted)]">
              Some activity unavailable.
            </p>
          )}
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
            aria-label="The studio today display"
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
        aria-label="The studio today details"
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
  live = [],
  engagementsResolved,
}: {
  chips: readonly MotionChip[];
  folders?: readonly DeskFolder[];
  /** Every live document the Desk read — the stage sentence's population. */
  live?: readonly DocumentStateRow[];
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

  // The folio count is deliberately absent: the "Needs your hand" eyebrow
  // already states it, and repeating it here reads as a second tally.
  const gateSentence = studioPulseGateSentence({
    overdueCount: folders.filter((folder) => folder.overdue?.isOverdue).length,
    onTheWayCount: [...folders, ...chips].reduce(
      (total, entry) => total + (entry.row.in_flight_count ?? 0),
      0,
    ),
  });

  // F39/F65 — "The studio today"'s sentence reads the same live rows ⌘K's
  // `Where the work stands` group counts, not a second query.
  const stageSentenceParts = studioStageSentenceParts(live);

  return (
    <StudioPulseDisclosure
      counts={counts}
      isReady={isReady}
      hasError={hasError}
      gateSentence={gateSentence}
      stageSentenceParts={stageSentenceParts}
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
