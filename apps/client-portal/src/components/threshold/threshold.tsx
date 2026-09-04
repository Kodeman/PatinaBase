'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';

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
import {
  clientCommercialDocumentQueryOptions,
  useClientPlan,
  useClientSelections,
} from '@/hooks/use-commercial-client';
import { useHydrated } from '@/hooks/use-hydrated';
import {
  useMarkLettersRead,
  useMarkNoticesRead,
  useProjectCorrespondence,
} from '@/hooks/use-project-correspondence';
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
import { Letters, MuteLetters, WriteBack } from './correspondence';
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

/**
 * A room's target: the published plan's own figure where it has one, and the
 * room's `budget_cents` where it does not.
 *
 * The plan wins because it is what the client was shown and what /budget
 * reads. The column is the fallback rather than the source: a project with no
 * published budget version still has rooms carrying figures, and a house that
 * said nothing about what was planned there would be quieter than the truth.
 *
 * The match is by NAME because a plan line carries a room name and no room id.
 * A room renamed since the budget was published therefore falls to its own
 * column, which is the safe direction to fall.
 */
function roomTargetCents(
  row: Record<string, unknown>,
  name: string,
  planTargets: Map<string, number>,
): number | null {
  const planned = planTargets.get(name.trim().toLowerCase());
  if (typeof planned === 'number') return planned;
  const budget = row.budget_cents;
  return typeof budget === 'number' && Number.isFinite(budget) && budget > 0 ? budget : null;
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
    targetCents: roomTargetCents(record, name, targets),
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
  /**
   * Taken and deliberately unread, for parity with `TheMaking`'s signature.
   * The Making prints "Project approvals could not be read just now"; the
   * house has no register for that sentence — a region that cannot be read is
   * simply absent. Absence is silence.
   */
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
  const preparedFor = words(user?.name);
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
  const correspondence = useProjectCorrespondence(projectId);
  const markNoticesRead = useMarkNoticesRead();
  const markLettersRead = useMarkLettersRead();
  // Destructured: `mutate` is stable, the mutation OBJECT is not, and an
  // effect depending on the object would re-run every render for the ref-guard
  // below to swallow.
  const { mutate: markProjectRead } = useMarkProjectRead();
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
    markProjectRead({ projectId });
  }, [hydrated, markProjectRead, projectId]);

  // The post is the reading mark's business too — /messages marked its thread
  // read on view and /inbox offered one control for the notices — but it can
  // only be marked once the post has ARRIVED, so it rides its own settle
  // rather than the mount. The notices marked are this house's alone: 'all'
  // would empty counts on surfaces this page never showed.
  const markedPost = useRef<string | null>(null);
  const { threadId: postThreadId, unreadNoticeIds, isPending: postPending } = correspondence;
  useEffect(() => {
    if (!hydrated || !projectId || postPending) return;
    if (markedPost.current === projectId) return;
    markedPost.current = projectId;
    if (postThreadId) markLettersRead(postThreadId);
    markNoticesRead(unreadNoticeIds);
  }, [
    hydrated,
    markLettersRead,
    markNoticesRead,
    postPending,
    postThreadId,
    projectId,
    unreadNoticeIds,
  ]);

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

  const selections =
    selectionsQuery.data?.origin === 'commercial' ? selectionsQuery.data.selections : [];
  const selectionById = new Map(selections.map((selection) => [selection.id, selection]));

  // ── what is held behind the finished work ──────────────────────────────────
  // The detection is `deriveThreshold`'s wall-mark predicate, run here because
  // the ledger figure is an INPUT to the model: the draw a client's acceptance
  // would release lives one RPC deeper than the selection row. One read per
  // INSTRUMENT (two trade lines under one scope share a bundle), through the
  // same query options `useClientCommercialDocument` uses — so the wall gate
  // and the ledger read one cache entry and cannot disagree.
  const tradeInstrumentIds = Array.from(
    new Set(
      selections.flatMap((selection) =>
        selection.kind === 'trade' &&
        selection.tradeJourney === 'substantially_complete' &&
        selection.instrument?.proposalId
          ? [selection.instrument.proposalId]
          : [],
      ),
    ),
  ).sort();

  const heldBundles = useQueries({
    queries: tradeInstrumentIds.map((proposalId) =>
      clientCommercialDocumentQueryOptions(proposalId),
    ),
  });

  const heldDrawCentsByProposalId: Record<string, number> = {};
  tradeInstrumentIds.forEach((proposalId, index) => {
    const draws = heldBundles[index]?.data?.tradeScope?.draws ?? [];
    const gated = draws.find((draw) => draw.gatesOnAcceptance) ?? null;
    if (gated && gated.amountCents > 0) heldDrawCentsByProposalId[proposalId] = gated.amountCents;
  });

  const selectionUpdatedAt: Record<string, string> = {};
  for (const selection of selections) {
    if (selection.updatedAt) selectionUpdatedAt[selection.id] = selection.updatedAt;
  }

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
    plannedTotalCents: (planQuery.data?.lines ?? []).reduce(
      (sum, line) => sum + (line.targetCents || 0),
      0,
    ),
    heldDrawCentsByProposalId,
    selectionUpdatedAt,
    messageSentAts: correspondence.sentAts,
  });

  const phases = useMemo(() => splitSpinePhases(milestones), [milestones]);
  const openChapter = openChapterOf(phases, project.currentPhase);
  const studioName = words(identityQuery.data?.name);

  // The plan and the trade bundles are in this gate for the same reason the
  // other six are: they are not decoration on a settled page, they DECIDE what
  // it says. The plan carries every room's target — so every variance line and
  // the ledger's planned figure — and the bundles carry what is held back. A
  // page that renders before them prints "about eleven hundred past its
  // target" and then rewrites it, which is the one thing this surface may
  // never do.
  const loading =
    projectApprovalsLoading ||
    proposalsQuery.isPending ||
    selectionsQuery.isPending ||
    invoicesQuery.isPending ||
    notesQuery.isPending ||
    roomsQuery.isPending ||
    planQuery.isPending ||
    correspondence.isPending ||
    heldBundles.some((bundle) => bundle.isPending);

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

  // Instruments only. `model.previously` also carries retired NOTES, whose
  // label is the note's whole body — and the doorstep's line is one mono
  // sentence ("Previously — fourteen selections agreed, 19 June."), not a
  // paragraph. A note that was taken down is history the client reads in
  // Previously, not on the doorstep.
  const firstReceipt =
    model.previously.find((entry) => entry.kind === 'instrument' && entry.date !== null) ??
    null;
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

  // A mark stands on the doorstep when no band can claim it. `deriveThreshold`
  // already nulls a roomId the drawing does not draw, so this is the same
  // partition read from the other side — and it holds even if a mark ever
  // arrives naming a room that is not in `model.bands`.
  const banded = new Set(model.bands.map((band) => band.roomId));
  const onDoorstep = (mark: ThresholdMark) => mark.roomId === null || !banded.has(mark.roomId);

  const doorstepGates: ReactNode[] = [
    ...doorMarks.filter(onDoorstep).map(renderDoor),
    ...wallMarks.filter(onDoorstep).map(renderWall),
  ];

  // ── the note's enclosures ──────────────────────────────────────────────────
  /** A trade scope's own name, off the instrument the selection was cut from. */
  const scopeNameById = new Map(
    selections.flatMap((selection) =>
      selection.kind === 'trade' && selection.instrument?.proposalId
        ? [[selection.instrument.proposalId, selection.instrument.name] as const]
        : [],
    ),
  );

  /** Papers already signed or executed on this project, by proposal id. */
  const signedById = new Map(
    accepted.flatMap((proposal) => {
      const commercial = commercialSummaryFromProposal(proposal);
      if (commercial.projectId !== projectId || commercial.kind === 'legacy') return [];
      return [[proposal.id, proposal.title] as const];
    }),
  );

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
      // A trade scope is enclosed as the SCOPE, not as one of the lines under
      // it — "Send it with the paintwork scope", never "with The paintwork".
      if (mark) {
        const label =
          enclosure.kind === 'trade_scope'
            ? scopeNameById.get(enclosure.id) ?? mark.label
            : mark.label;
        return [{ ...enclosure, label, anchor: gateAnchor(mark) }];
      }
      // The client signed it, or the sub finished with it. The paper does not
      // vanish out of the letter that enclosed it — it moves to Previously,
      // which is where she can still read it.
      const settledPaper = signedById.get(enclosure.id);
      return settledPaper ? [{ ...enclosure, label: settledPaper, anchor: 'previously' }] : [];
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
    <Mat
      people={people}
      papers={papers}
      accountHref="/account"
      onSignOut={() => void signOut()}
      correspondence={
        <MuteLetters threadId={correspondence.threadId} muted={correspondence.muted} />
      }
    />
  );

  const ledger = <HouseLedger ledger={model.ledger} />;
  const letterbox = <Letterbox invoice={model.letterbox} today={today} />;
  const road = model.road.length > 0 ? <TheRoad pieces={model.road} /> : null;
  // The reply belongs under the note. With no standing note there is no note
  // to answer under and the central act of /messages would be unreachable, so
  // it heads the record instead.
  const replyHeadsTheRecord = model.note === null && correspondence.threadId !== null;
  const writeBack = <WriteBack threadId={correspondence.threadId} today={today} />;
  const hasRecord = correspondence.letters.length > 0 || correspondence.notices.length > 0;
  const note = (
    <TheNote
      note={model.note}
      earlier={model.previously.filter((entry) => entry.kind === 'note')}
      enclosures={enclosures}
      authorName={studioName}
      today={today}
      reply={replyHeadsTheRecord ? undefined : writeBack}
    />
  );
  // Gated HERE, not inside Previously: a React element is truthy even when the
  // component renders nothing, so a slot handed down unconditionally would
  // print an empty "Previously" over a house that has none.
  const previouslySection = (
    <Previously
      entries={model.previously}
      correspondence={
        hasRecord || replyHeadsTheRecord ? (
          <Letters
            letters={correspondence.letters}
            notices={correspondence.notices}
            reply={replyHeadsTheRecord ? writeBack : undefined}
            hasEarlier={correspondence.hasEarlierLetters}
            onEarlier={correspondence.readEarlierLetters}
            earlierPending={correspondence.isReadingEarlierLetters}
          />
        ) : undefined
      }
    />
  );

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

  /**
   * The doorstep before the house can speak: the sentence's measure held open
   * and nothing else. No ledger rows, no letterbox — because an empty
   * letterbox says "Nothing in the letterbox" and an empty key says "Nothing
   * stands open on this drawing", and both would be contradicted a moment
   * later. Silence never has to take anything back.
   */
  const quietDoorstep = (
    <Doorstep
      sentence={null}
      previously={null}
      changedCount={0}
      showSince={false}
      sinceActive={false}
    />
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
      preparedFor={preparedFor}
    />
  );

  let body: ReactNode;

  // NEVER REVERSE. The house speaks only once every source it speaks FROM has
  // answered — the papers, the goods, the ledger, the rooms and the letter.
  // Until then the doorstep stands alone and holds the house's place. This is
  // the pending rule of `deriveThreshold` widened from the rooms to all five,
  // because "Nothing in the letterbox" and "Nothing stands open on this
  // drawing" are assertions, not blanks: a client who reads them and then
  // watches $9,125 and two open marks arrive has been told something untrue.
  // Absence is silence — and silence is also what an unanswered query sounds
  // like.
  if (!hydrated || loading || model.pending) {
    body = (
      <>
        {quietDoorstep}
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
      // Path B's sheet: a 170px pole rail on the LEFT, sticky, standing beside
      // the WHOLE house rather than beside its first screenful. The pole's
      // caret watches every section on the page — the bands, the road, the
      // note, Previously, the mat — so a rail that scrolls away before the
      // first room band is watching sections the reader can no longer see it
      // for. Narrow, the rail collapses to the six dots 3A draws and the grid
      // falls to one column, which puts the pole under the doorplate.
      <div className="grid items-start gap-[clamp(20px,3vw,44px)] [grid-template-columns:170px_minmax(0,1fr)] max-[860px]:gap-0 max-[860px]:[grid-template-columns:minmax(0,1fr)]">
        <div className="sticky top-[14px] self-start max-[860px]:static">
          <StoryPole phases={phases} sections={sections} />
        </div>

        <div className="min-w-0">
          {doorstep}
          {asks}
          <PlanKey
            geometry={planKeyGeometry(rooms ?? [], model.marks)}
            marks={model.marks}
            keySentence={keySentence(model.drawnMarkCount)}
          />

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
        </div>
      </div>
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
