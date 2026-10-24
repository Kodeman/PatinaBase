'use client';

/**
 * The round-8 studio (WP-01.8, studio.html of Room Proof 08): the Desk's own
 * reads, set as a masthead, a commission spread, the jobs register and the
 * next conversation. Loaded only through the Desk page's React.lazy import
 * once the renderer latch says round 8, so the legacy Desk never downloads it
 * or its stylesheet. It owns no data: every row arrives from the Desk page's
 * one set of hooks, the same slots the legacy body prints.
 */

import '../paper/round8.css';

import { useMemo } from 'react';
import { DeskTodaySkeleton } from '@/components/loading';
import { DocumentAction, DocumentActionGroup } from '@/components/document/document-action';
import { EmptyState } from '@/components/document/empty-state';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import type { DeskFrameSlots } from '@/components/document/frame/frame-slots';
import type { DeskRoster as DeskRosterRead } from '@/lib/document/desk-roster-derivation';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';
import type { DeskHolder } from '@/lib/document/desk-scope';
import { rememberPaperOrigin } from '@/lib/document/paper/paper-origin';
import { useCommissionPlates, type CommissionJob } from '@/hooks/use-commission-plates';
import { StudioMasthead } from './studio-masthead';
import { AttentionList, deriveAttentionItems, type AttentionItem } from './attention-list';
import { CommissionSpread, type FeaturedJob } from './commission-spread';
import { JobsRegister, type RegisterRow } from './jobs-register';
import { NextConversation } from './next-conversation';

export interface Round8DeskProps extends DeskFrameSlots {
  studioName: string | null;
  viewerName: string | null;
  roster: DeskRosterRead;
  live: readonly DocumentStateRow[];
  /** Holds the Desk's place (F6) with the control she pressed as its anchor. */
  holdPlace: (anchorId: string | null) => void;
}

/** With no holders named, every inquiry reads as hers. */
const NO_HOLDER = (): DeskHolder => ({ userId: null, name: null, mine: true, lead: false });

const jobIdOf = (row: Pick<DocumentStateRow, 'project_id' | 'engagement_id'>) =>
  row.project_id ?? row.engagement_id;

export function Round8Desk(props: Round8DeskProps) {
  const {
    sheet,
    cards,
    scope,
    onScope,
    oneVoice,
    dateLabel,
    holderOf,
    deskLine,
    loading,
    deskEmpty,
    arrivalHeld,
    arrivalRoot,
    arrivalReady,
    deskRead,
    deskRoot,
    notePress,
    firstName,
    greetingWord,
    isError,
    refetch,
    recorded,
    captureOpen,
    setCaptureOpen,
    openProjectOpen,
    setOpenProjectOpen,
    setRecorded,
    studioName,
    viewerName,
    roster,
    live,
    holdPlace,
  } = props;

  const kindOf = useMemo(
    () => new Map(live.map((row) => [row.engagement_id, row.engagement_kind])),
    [live],
  );
  const rowOf = useMemo(() => new Map(live.map((row) => [jobIdOf(row), row])), [live]);
  const plateJobs = useMemo<CommissionJob[]>(
    () => live.map((row) => ({ jobId: jobIdOf(row), projectId: row.project_id, proposalId: row.proposal_id })),
    [live],
  );
  const { plates } = useCommissionPlates(plateJobs);

  const lines = useMemo(
    () =>
      roster.groups.flatMap((group) =>
        group.lines.map((line) => ({ line, stageLabel: group.label, jobId: line.projectId ?? line.engagementId })),
      ),
    [roster],
  );
  const registerRows = useMemo<RegisterRow[]>(
    () => lines.filter(({ line }) => kindOf.get(line.engagementId) !== 'lead'),
    [lines, kindOf],
  );
  const inquiries = useMemo(
    () => lines.filter(({ line }) => kindOf.get(line.engagementId) === 'lead').map(({ line }) => line),
    [lines, kindOf],
  );
  const attention = useMemo(
    () => deriveAttentionItems(sheet, cards, oneVoice === true),
    [sheet, cards, oneVoice],
  );

  // The spread's job: the one the day's first line opens, else the register's first.
  const featured = useMemo<FeaturedJob | null>(() => {
    const first = attention.map((item) => item.docId).find((id) => rowOf.has(id));
    const entry = (first && registerRows.find((row) => row.jobId === first)) || registerRows[0];
    if (!entry) return null;
    return {
      jobId: entry.jobId,
      name: entry.line.name,
      personLine: entry.line.personLine,
      stage: entry.stageLabel,
      href: entry.line.jobHref,
      itemCount: rowOf.get(entry.jobId)?.item_count ?? 0,
    };
  }, [attention, registerRows, rowOf]);

  // Leaving for a job: hold the Desk's place (F6), then remember the studio as
  // the job's way back (C1 §2), with the pressed control as the focus hint.
  const leave = (anchorId: string, docId: string) => {
    holdPlace(anchorId);
    rememberPaperOrigin(docId, {
      path: window.location.pathname,
      search: window.location.search,
      anchorId,
      focusId: anchorId,
    });
  };
  const leaveFromAttention = (item: AttentionItem) => leave(item.anchorId, item.docId);

  // The Desk page alone restores scroll and focus, yielding to reader intent.
  const body = (loading || arrivalHeld) ? (
    <DeskTodaySkeleton dateLabel={dateLabel} />
  ) : (
    <>
      {deskEmpty && sheet.unchecked.length === 0 ? (
      <div data-tour-anchor="desk-needs-your-hand">
        <EmptyState eyebrow={dateLabel ? `${dateLabel} · Today` : 'Today'}>
          No project files yet. Record an inquiry or create a project file to begin.
        </EmptyState>
      </div>
      ) : (
        <CommissionSpread
          job={featured}
          plate={featured ? plates.get(featured.jobId) : undefined}
          onLeave={leave}
          attention={
            <AttentionList
              items={attention}
              unchecked={sheet.unchecked}
              scope={scope}
              onScope={onScope}
              onLeave={leaveFromAttention}
            />
          }
        />
        )}
      <JobsRegister
        rows={registerRows}
        plates={plates}
        notChecked={roster.notChecked}
        onLeave={leave}
        onCreateProject={() => setOpenProjectOpen(true)}
      />
      <NextConversation
        inquiries={inquiries}
        holderOf={holderOf ?? NO_HOLDER}
        recorded={recorded}
        onRecord={() => setCaptureOpen(true)}
        onLeave={leave}
      />
    </>
  );

  return (
    <main
      data-paper-renderer="round8"
      data-studio="round8"
      data-arrival={arrivalRoot ? 'desk' : undefined}
      data-arrival-ready={arrivalReady ? '' : undefined}
      ref={deskRoot}
      onClickCapture={notePress}
      className="min-h-screen w-full bg-[var(--paper)] pb-28 text-[var(--ink)]"
    >
      <StudioMasthead studioName={studioName} viewerName={viewerName} dateLabel={dateLabel ?? ''} />
      <div className="mx-auto w-full max-w-[var(--r8-studio-measure)] px-[4%] pt-8 max-[599px]:px-4 min-[1440px]:pt-12">
        <h1 data-tour-anchor="desk-greeting" className="r8-d1 pb-6">
          {firstName ? (
            <>
              {greetingWord}, <span className="italic text-[var(--ink-faint)]">{firstName}</span>
            </>
          ) : (
            <>{greetingWord}.</>
          )}
        </h1>
        {isError ? (
          // I64 — one coherent error surface, as on the legacy Desk.
          <div role="alert" data-testid="desk-error-state" className="mt-8 max-w-[440px]">
            <p className="t-authorship text-[var(--ink-faint)]">Your studio overview couldn't load.</p>
            <p className="t-body-sm mt-2">Try again or reload this page.</p>
            <DocumentActionGroup surfaceKey="desk" regionKey="desk-error" className="mt-4" aria-label="Desk recovery">
              <DocumentAction actionKey="try-again" variant="primary" onClick={() => void refetch()}>
                Try again
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        ) : (
          <div data-arrival-held={deskRead && arrivalHeld ? 'desk' : undefined}>
            {deskLine}
            {body}
          </div>
        )}
      </div>

      {/* The Desk's two front doors, as overlays: the studio never unmounts (D1). */}
      <CaptureLeadSheet open={captureOpen} onClose={() => setCaptureOpen(false)} onCreated={setRecorded} />
      <OpenProjectSheet open={openProjectOpen} onClose={() => setOpenProjectOpen(false)} />
    </main>
  );
}

export default Round8Desk;
