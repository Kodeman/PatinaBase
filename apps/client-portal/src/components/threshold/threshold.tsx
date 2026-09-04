'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  useMarkProjectRead,
  usePreviousReadingMark,
  useProjectInvoices,
  useProjectNotes,
  useProjectNotesRealtime,
  useProjectParties,
  useProjectRooms,
  useProjectTeamMembers,
  useStudioIdentity,
} from '@patina/supabase';
import type { ProjectApprovalReview, ProjectNote } from '@patina/supabase';
import { getFieldTradeLabel } from '@patina/types';

import { openChapterOf, splitSpinePhases } from '@/components/making/making-spine';
import { ScoredAction } from '@/components/making/scored-action';
import { monthAndYear } from '@/components/making/standing-sentence';
import { useAuth } from '@/hooks/use-auth';
import { useClientPlan, useClientSelections } from '@/hooks/use-commercial-client';
import { useHydrated } from '@/hooks/use-hydrated';
import { partitionProposals, useClientProposals } from '@/hooks/use-proposals-client';
import { isClientActionableProjectApproval } from '@/lib/client-attention';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';
import {
  deriveThreshold,
  parseSourceDate,
  type ThresholdApproval,
  type ThresholdMark,
  type ThresholdNote,
  type ThresholdReceipt,
  type ThresholdRoom,
} from '@/lib/threshold/derive';
import { planKeyGeometry } from '@/lib/threshold/plan-key';
import { keySentence, previouslyLine, thresholdStanding } from '@/lib/threshold/standing';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

import { KIND_LABEL } from './consent-copy';
import { DoorGate, type DoorProposal } from './door-gate';
import { Doorplate } from './doorplate';
import { Doorstep } from './doorstep';
import { GroundFloor } from './ground-floor';
import { HouseLedger } from './house-ledger';
import { Letterbox } from './letterbox';
import { Mat, type MatPaper, type MatPerson } from './mat';
import { PlanKey } from './plan-key';
import { Previously } from './previously';
import { RoomBand } from './room-band';
import { SinceYesterday } from './since-yesterday';
import { StoryPole } from './story-pole';
import { TheNote, type NoteEnclosure } from './the-note';
import { TheRoad } from './the-road';
import { WallGate } from './wall-gate';

/* ── THE THRESHOLD ──────────────────────────────────────────────────────────
   The Making's wiring discipline, applied to the house: every part below is
   presentational and built next door; this file decides which hook feeds
   which region, in what order they are read, and what the surface says when
   the data is thin.

   ABSENCE IS SILENCE, verbatim from the-making.tsx. A region with nothing to
   say renders nothing — never an empty-state card, never a zero, never an
   error string. A client must not watch an ask appear and then vanish, so the
   doorstep's sentence is null until the queries have all answered.

   THE GROUND FLOOR IS A SETTLED FACT. `deriveThreshold` reports `pending`
   while the rooms are still coming and `groundFloor` only once they have come
   back empty. While pending the page shows the doorstep and holds the house's
   place; it never draws the ground floor and then swaps to the house.
   ───────────────────────────────────────────────────────────────────────── */

/** `deriveThreshold` takes a Date it does not read; this is the pre-hydration one. */
const EPOCH = new Date(0);

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

/** The house's brass. Every leaf reads it as `var(--threshold-accent, #8A5F19)`. */
const ACCENT_STYLE = { '--threshold-accent': '#8A5F19' } as CSSProperties;

/** Team roles, in the house's own voice rather than the internal vocabulary. */
const ROLE_WORD: Record<string, string> = {
  lead_designer: 'lead designer',
  support_designer: 'support designer',
  bookkeeper: 'bookkeeper',
  previous_lead: 'previous lead',
  vendor: 'vendor',
};

/** On-the-job kinds, matching the client portal's existing plain-English set. */
const PARTY_WORD: Record<string, string> = {
  gc: 'general contractor',
  sub: 'subcontractor',
  installer: 'installer',
  receiver: 'receiving',
  architect: 'architect',
  photographer: 'photographer',
  stager: 'stager',
  vendor: 'vendor',
};

function words(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function toThresholdRoom(row: unknown, targets: Map<string, number>): ThresholdRoom | null {
  const record = row as Record<string, unknown> | null;
  if (!record || typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  const area = record.floor_area_sqft;
  const name = record.name;
  return {
    id: record.id,
    name,
    sortOrder: typeof record.sort_order === 'number' ? record.sort_order : 0,
    floorAreaSqft: typeof area === 'number' ? area : null,
    targetCents: targets.get(name.trim().toLowerCase()) ?? null,
  };
}

function toThresholdNote(note: ProjectNote): ThresholdNote {
  return {
    id: note.id,
    body: note.body,
    state: note.state,
    sentAt: note.sentAt,
    answeredAt: note.answeredAt,
    retiredAt: note.retiredAt,
    enclosures: note.enclosures ?? [],
  };
}

/**
 * A phase approval, standing on the doorstep because it carries no room.
 *
 * The Making's `ProjectApprovalGate` cannot be reused: it draws itself onto
 * the spine through `useSpineInk`, and there is no spine here. The words, the
 * act and the destination are its own, so the two surfaces cannot disagree
 * about what the client is being asked.
 */
function DoorstepApproval({ approval }: { approval: ProjectApprovalReview }) {
  const due = parseSourceDate(approval.dueAt);
  const act = approval.lifecycleStatus === 'draft' ? 'Review exact edition' : 'Respond';

  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval"
      data-never-dim=""
      data-testid="doorstep-approval"
      aria-labelledby={`approval-gate-${approval.decisionId}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {approval.lifecycleStatus === 'draft'
          ? 'A gate · your review is required'
          : 'A gate · your response is required'}
      </p>
      <h2
        id={`approval-gate-${approval.decisionId}`}
        className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        {approval.question}
      </h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
        {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
        {due ? ` · Due ${LONG_MONTH_DAY.format(due)}` : ''}
      </p>
      <div className="mt-4">
        <ScoredAction
          actionKey="gate_project_approval"
          regionKey="doorstep"
          surfaceKey="the_threshold"
          variant="primary"
          href={`/decisions/${approval.decisionId}`}
        >
          {act}
        </ScoredAction>
      </div>
    </section>
  );
}

export interface ThresholdProps {
  /** The project this house is. Same value as `project.id`. */
  projectId: string;
  /** Server-fetched overview: name, location, currentPhase, counts. */
  project: ClientProjectOverview;
  /** Server-fetched phases, in the studio's own order. */
  milestones: MilestoneDetail[];
  projectApprovals?: ProjectApprovalReview[];
  projectApprovalsLoading?: boolean;
  projectApprovalsError?: boolean;
}

export function Threshold({
  projectId,
  project,
  milestones,
  projectApprovals = [],
  projectApprovalsLoading = false,
}: ThresholdProps) {
  // ── every hook, before any branch ──────────────────────────────────────────
  const hydrated = useHydrated();
  const { user, signOut } = useAuth();
  const proposalsQuery = useClientProposals();
  const selectionsQuery = useClientSelections(projectId);
  const invoicesQuery = useProjectInvoices(projectId);
  const roomsQuery = useProjectRooms(projectId);
  const planQuery = useClientPlan(projectId);
  const notesQuery = useProjectNotes(projectId);
  const identityQuery = useStudioIdentity({ projectId });
  const teamQuery = useProjectTeamMembers(projectId);
  const partiesQuery = useProjectParties(projectId);
  useProjectNotesRealtime(projectId);
  const markRead = useMarkProjectRead();
  const previousMark = usePreviousReadingMark(projectId);

  const [sinceActive, setSinceActive] = useState(false);

  const today = useMemo(
    () => (hydrated ? new Date() : undefined),
    // One `new Date()` per mount is what the surface means by "today"; a fresh
    // one every render would re-key the whole house.
    [hydrated],
  );

  // ── the reading mark ───────────────────────────────────────────────────────
  // Fired ONCE per project, after hydration. `mark_project_read` returns the
  // PREVIOUS read_at and then advances the mark, so the only chance to learn
  // what "since" means is the first call — a second would return this visit.
  const markedProject = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !projectId) return;
    if (markedProject.current === projectId) return;
    markedProject.current = projectId;
    markRead.mutate({ projectId });
  }, [hydrated, markRead, projectId]);

  // undefined = the mark has not resolved this session; null = no previous
  // mark, so this is a first visit and nothing can have changed since.
  const previousReadAt = typeof previousMark.data === 'string' ? previousMark.data : null;
  const showSince = typeof previousMark.data === 'string';

  // ── the papers ─────────────────────────────────────────────────────────────
  const { pending: pendingProposals, accepted } = partitionProposals(proposalsQuery.data);

  // Filter on the SUMMARY's projectId, never the raw column: a furnishings
  // authorization is minted from the schedule and keeps proposals.project_id
  // NULL, so the raw column would hide the one paper that matters most.
  const signatureGates: DoorProposal[] = pendingProposals.flatMap((proposal) => {
    const commercial = commercialSummaryFromProposal(proposal);
    if (commercial.projectId !== projectId || commercial.kind === 'legacy') return [];
    return [
      {
        id: proposal.id,
        title: proposal.title,
        totalAmountCents:
          typeof proposal.total_amount === 'number' ? proposal.total_amount : 0,
        sentAt: commercial.sentAt,
        updatedAt: proposal.updated_at ?? null,
        kind: commercial.kind,
      },
    ];
  });
  const paperById = new Map(signatureGates.map((paper) => [paper.id, paper]));

  const instrumentReceipts: ThresholdReceipt[] = accepted.flatMap((proposal) => {
    const commercial = commercialSummaryFromProposal(proposal);
    if (commercial.projectId !== projectId || commercial.kind === 'legacy') return [];
    const kindLabel = KIND_LABEL[commercial.kind] ?? 'Document';
    return [
      {
        id: `instrument:${proposal.id}`,
        label: `${kindLabel} · ${proposal.title}`,
        date: commercial.executedAt ?? null,
      },
    ];
  });

  // ── the rooms ──────────────────────────────────────────────────────────────
  // A room's target is the client plan's own figure, summed across the lines
  // filed under that room's name — the same number /budget reads, so the two
  // pages cannot disagree about what was planned.
  const planTargets = new Map<string, number>();
  for (const line of planQuery.data?.lines ?? []) {
    const key = line.roomName.trim().toLowerCase();
    planTargets.set(key, (planTargets.get(key) ?? 0) + line.targetCents);
  }
  const roomsSettled = !roomsQuery.isPending;
  const rooms: ThresholdRoom[] | null = roomsSettled
    ? ((roomsQuery.data ?? []) as unknown[]).flatMap((row) => {
        const room = toThresholdRoom(row, planTargets);
        return room ? [room] : [];
      })
    : null;

  // ── the asks that carry no room ────────────────────────────────────────────
  const doorstepApprovals = projectApprovals.filter(isClientActionableProjectApproval);
  const approvals: ThresholdApproval[] = doorstepApprovals.map((approval) => ({
    id: approval.decisionId,
    title: approval.question,
    phaseId: approval.phaseId,
  }));

  // ── the model ──────────────────────────────────────────────────────────────
  const model = deriveThreshold({
    rooms,
    selections: selectionsQuery.data,
    proposals: { signatureGates, instrumentReceipts },
    invoices: invoicesQuery.data ?? [],
    approvals,
    notes: (notesQuery.data ?? []).map(toThresholdNote),
    previousReadAt,
    today: today ?? EPOCH,
    liveAuthorizedTotalCents: planQuery.data?.liveAuthorizedTotalCents ?? null,
  });

  const selections =
    selectionsQuery.data?.origin === 'commercial' ? selectionsQuery.data.selections : [];
  const selectionById = new Map(selections.map((selection) => [selection.id, selection]));

  const phases = useMemo(() => splitSpinePhases(milestones), [milestones]);
  const openChapter = openChapterOf(phases, project.currentPhase);
  const studioName = words(identityQuery.data?.name);

  const loading =
    projectApprovalsLoading ||
    proposalsQuery.isPending ||
    selectionsQuery.isPending ||
    invoicesQuery.isPending ||
    notesQuery.isPending ||
    roomsQuery.isPending;

  // ── the doorstep's sentence ────────────────────────────────────────────────
  const standing =
    hydrated && !loading
      ? thresholdStanding({
          doors: model.marks.filter((mark) => mark.kind === 'door').length,
          walls: model.marks.filter((mark) => mark.kind === 'wall').length,
          balanceCents: model.ledger.owedCents ?? 0,
          nothingOwed: model.marks.length === 0 && model.doorstepAsks.length === 0,
        })
      : null;

  const firstReceipt = model.previously.find((entry) => entry.date !== null) ?? null;
  const previously =
    hydrated && !loading && firstReceipt?.date
      ? previouslyLine({ label: firstReceipt.label, date: firstReceipt.date })
      : null;

  // ── the marks, sorted onto their rooms ─────────────────────────────────────
  // `first` is decided ACROSS the page, not per band, so `#door` and `#wall`
  // are unique ids: the collapsed /proposals route lands on exactly one door.
  const doorMarks = model.marks.filter((mark) => mark.kind === 'door');
  const wallMarks = model.marks.filter((mark) => mark.kind === 'wall');
  const firstDoorId = doorMarks[0]?.id ?? null;
  const firstWallId = wallMarks[0]?.id ?? null;

  /** The gate's own element id, which is `door`/`wall` only for the first one. */
  const gateAnchor = (mark: ThresholdMark): string => {
    const first = mark.kind === 'door' ? firstDoorId : firstWallId;
    return mark.id === first ? mark.kind : `${mark.kind}-${mark.id.replace(/:/g, '-')}`;
  };

  const renderDoor = (mark: ThresholdMark): ReactNode => {
    const paper = mark.proposalId ? paperById.get(mark.proposalId) : undefined;
    if (!paper) return null;
    return (
      <DoorGate
        key={mark.id}
        mark={mark}
        proposal={paper}
        // The standing note is rendered by `TheNote`, once. Both components
        // take the same NoteModel and neither dedupes, so pinning it here as
        // well would print the same paragraph twice.
        note={null}
        projectId={projectId}
        first={mark.id === firstDoorId}
        studioName={studioName}
      />
    );
  };

  const renderWall = (mark: ThresholdMark): ReactNode => {
    const selection = selectionById.get(mark.id.replace(/^wall:/, ''));
    if (!selection) return null;
    return (
      <WallGate
        key={mark.id}
        mark={mark}
        selection={selection}
        projectId={projectId}
        first={mark.id === firstWallId}
      />
    );
  };

  const doorstepGates: ReactNode[] = [
    ...doorMarks.filter((mark) => mark.roomId === null).map(renderDoor),
    ...wallMarks.filter((mark) => mark.roomId === null).map(renderWall),
  ];

  // ── the note's enclosures ──────────────────────────────────────────────────
  const enclosures: NoteEnclosure[] = (model.note?.enclosures ?? []).flatMap(
    (enclosure): NoteEnclosure[] => {
      if (enclosure.kind === 'invoice') {
        const invoice = (invoicesQuery.data ?? []).find((row) => row.id === enclosure.id);
        return invoice
          ? [
              {
                ...enclosure,
                label: invoice.invoice_number ?? 'The invoice',
                anchor: 'letterbox',
              },
            ]
          : [];
      }
      const mark = model.marks.find((candidate) => candidate.proposalId === enclosure.id);
      if (!mark) return [];
      return [{ ...enclosure, label: mark.label, anchor: gateAnchor(mark) }];
    },
  );

  // ── the mat ────────────────────────────────────────────────────────────────
  const people: MatPerson[] = [
    ...(studioName
      ? [{ name: studioName, role: 'the studio', where: words(project.location) ?? '' }]
      : []),
    ...(teamQuery.data ?? [])
      .filter((member) => member.role !== 'client')
      .map((member) => ({
        name: member.user?.full_name ?? 'Team member',
        role: ROLE_WORD[member.role] ?? member.role,
        where: studioName ?? '',
      })),
    // RLS already returns only show_to_client rows to a client session; the
    // explicit filter keeps a designer previewing the portal honest.
    ...(partiesQuery.data ?? [])
      .filter((party) => party.show_to_client === true)
      .map((party) => ({
        name: party.display_name ?? party.company_name ?? 'On the job',
        role: party.trade
          ? getFieldTradeLabel(party.trade)
          : PARTY_WORD[party.party_kind] ?? party.party_kind,
        where: party.company_name ?? '',
      })),
  ];

  const papers: MatPaper[] = [
    ...(model.bands.length > 0 ? [{ label: 'The drawing set', href: '#key' }] : []),
    ...doorMarks.flatMap((mark) =>
      paperById.has(mark.proposalId ?? '')
        ? [{ label: mark.label, href: `#${gateAnchor(mark)}` }]
        : [],
    ),
    ...model.previously
      .filter((entry) => entry.kind === 'instrument')
      .map((entry) => ({ label: entry.label, href: '#previously' })),
    ...(model.letterbox
      ? [{ label: model.letterbox.number ?? 'The invoice', href: '#letterbox' }]
      : []),
  ];

  const mat = (
    <Mat people={people} papers={papers} accountHref="/account" onSignOut={() => void signOut()} />
  );

  const ledger = <HouseLedger ledger={model.ledger} />;
  const letterbox = <Letterbox invoice={model.letterbox} today={today} />;
  const road = model.road.length > 0 ? <TheRoad pieces={model.road} /> : null;
  const note = (
    <TheNote
      note={model.note}
      earlier={model.previously}
      enclosures={enclosures}
      authorName={studioName}
      today={today}
    />
  );
  const previouslySection = <Previously entries={model.previously} />;

  const doorstep = (
    <Doorstep
      sentence={standing}
      previously={previously}
      changedCount={model.changed.size}
      showSince={showSince}
      sinceActive={sinceActive}
      onToggleSince={() => setSinceActive((was) => !was)}
    >
      {ledger}
      {model.groundFloor ? null : letterbox}
    </Doorstep>
  );

  const asks = (
    <>
      {doorstepGates}
      {doorstepApprovals.map((approval) => (
        <DoorstepApproval key={approval.decisionId} approval={approval} />
      ))}
    </>
  );

  // ── the page ───────────────────────────────────────────────────────────────
  const doorplate = (
    <Doorplate
      studioName={studioName}
      location={project.location}
      projectName={project.name}
      phaseLabel={openChapter.label ?? null}
      monthLabel={today ? monthAndYear(today) : null}
      preparedFor={user?.name ?? null}
    />
  );

  let body: ReactNode;

  if (model.pending) {
    // The rooms have not come back, so the house's shape is unknown. Show the
    // doorstep and HOLD the house's place — never the ground floor, which
    // would then have to be swapped for the house a moment later.
    body = (
      <>
        {doorstep}
        <div aria-hidden="true" data-testid="threshold-hold" className="min-h-[60vh]" />
      </>
    );
  } else if (model.groundFloor) {
    body = (
      <GroundFloor
        doorstep={doorstep}
        note={note}
        enclosures={asks}
        bench={road}
        toll={letterbox}
        previously={previouslySection}
        ahead={phases.future}
        mat={mat}
      />
    );
  } else {
    const sections = [
      { id: 'doorstep', label: 'You stand at the doorstep' },
      { id: 'key', label: 'The whole house' },
      ...model.bands.map((band) => ({ id: band.anchor, label: band.name })),
      ...(road ? [{ id: 'road', label: 'The road' }] : []),
      ...(model.note ? [{ id: 'note', label: 'The note' }] : []),
      ...(model.previously.length > 0 ? [{ id: 'previously', label: 'Previously' }] : []),
      { id: 'mat', label: 'The mat' },
    ];

    body = (
      <>
        <div className="grid items-start gap-[clamp(20px,3vw,44px)] [grid-template-columns:minmax(0,1fr)_minmax(0,190px)] max-[960px]:[grid-template-columns:minmax(0,1fr)]">
          <div className="min-w-0">
            {doorstep}
            {asks}
            <PlanKey
              geometry={planKeyGeometry(rooms ?? [], model.marks)}
              marks={model.marks}
              keySentence={keySentence(model.drawnMarkCount)}
            />
          </div>
          <StoryPole phases={phases} sections={sections} />
        </div>

        {model.bands.map((band) => (
          <RoomBand key={band.roomId} band={band} projectId={projectId}>
            {band.marks.map((mark) =>
              mark.kind === 'door' ? renderDoor(mark) : renderWall(mark),
            )}
          </RoomBand>
        ))}

        {road}
        {note}
        {previouslySection}
        {mat}
      </>
    );
  }

  return (
    <div className="min-w-0" data-testid="the-threshold" style={ACCENT_STYLE}>
      {doorplate}
      <SinceYesterday active={sinceActive} changed={model.changed}>
        {body}
      </SinceYesterday>
    </div>
  );
}
