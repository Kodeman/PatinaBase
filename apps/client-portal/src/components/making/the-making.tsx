'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { invoiceBalanceCents } from '@patina/shared';
import { useProjectInvoices } from '@patina/supabase';
import type { Invoice, ProjectApprovalReview, Proposal } from '@patina/supabase';

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from '@/components/commercial/journey-stepper';
import { useAuth } from '@/hooks/use-auth';
import {
  useAcceptTradeScope,
  useClientCommercialDocument,
  useClientSelections,
} from '@/hooks/use-commercial-client';
import { useHydrated } from '@/hooks/use-hydrated';
import { partitionProposals, useClientProposals } from '@/hooks/use-proposals-client';
import { makingEvents, type MakingGateKind } from '@/lib/analytics/events';
import {
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
  projectApprovalAttentionLabel,
} from '@/lib/client-attention';
import {
  commercialSummaryFromProposal,
  type ClientSelection,
  type CommercialDocumentKind,
} from '@/lib/commercial-documents';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

import { MakingMasthead } from './making-masthead';
import {
  MakingSpine,
  SpineRow,
  openChapterOf,
  parseSpineDate,
  splitSpinePhases,
  startOfWeek,
  useSpineInk,
  type SpineReceiptEntry,
} from './making-spine';
import { ScoredAction } from './scored-action';
import { SpineGate } from './spine-gate';
import { SpineToll } from './spine-toll';
import { TrackingRow } from './tracking-row';
import {
  countInWords,
  monthAndYear,
  moneyInWords,
  todayInWords,
  type StandingSentenceInput,
} from './standing-sentence';

/* ── THE MAKING ──────────────────────────────────────────────────────────────
   Direction B, assembled: one letterhead, one spine, and the whole engagement
   drawn on it in time order. The parts are built next door and are all
   presentational; this file is the wiring — which hook feeds which region,
   what order they are read in, and what the surface says when the data is
   thin.

   TOP TO BOTTOM: the masthead (letterhead + the standing sentence), then the
   spine — settled receipts for what has closed, the marker at today, the open
   chapter, the sketched future, the horizon foot.

   THE OPEN CHAPTER is read in the order the ruling asks for: what is owed
   first (gates — papers to sign, then finished work to accept), then money
   (tolls), then what is merely in motion (tracking rows). One job, no list:
   the client's eye lands on the thing that is actually waiting on her.

   GRACE UNDER THIN DATA is the load-bearing requirement. Every region here is
   allowed to be absent, and absence is silence — never an empty-state card,
   never a zero. With no gates the spine simply runs unbroken; with nothing in
   the open chapter at all the spine runs from the marker straight into the
   future. The surface renders for any real project.

   FAIL-CLOSED AT THE ORIGIN. `get_client_project_selections` reports whether
   the project runs on the commercial rail. Until it answers, the open chapter
   holds a quiet skeleton rather than a guess; if it answers `legacy` or
   errors, the selection-derived regions (tracking rows, acceptance gates) stay
   out. The masthead, the spine, the papers, and the ledger are independent of
   that answer and still render — this is the mirror of
   `project-view-wrapper.tsx`'s origin discipline for a surface that has no
   legacy tree of its own to fall back to. ──────────────────────────────────*/

/** The portal's existing kind vocabulary, verbatim (awaiting-signature-cards). */
const KIND_LABEL: Partial<Record<CommercialDocumentKind, string>> = {
  design_services: 'Design services agreement',
  furnishings_authorization: 'Furnishings authorization',
  service_addendum: 'Design services addendum',
  trade_scope: 'Trade scope',
};

/** Telemetry kinds are the document kinds, plus the act that has no document. */
const GATE_KIND: Partial<Record<CommercialDocumentKind, MakingGateKind>> = {
  design_services: 'design_services',
  furnishings_authorization: 'furnishings_authorization',
  service_addendum: 'service_addendum',
  trade_scope: 'trade_scope',
};

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
});

/** The index of the last stop: a piece that is placed has finished its journey. */
const INSTALLED_STOP = GOODS_JOURNEY_STAGES.length - 1;

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

/**
 * A target date, softened to the week it lands in — "the week of October 12".
 * The studio promises weeks, not days, so the sentence promises weeks too.
 */
function weekInWords(date: string | null | undefined): string | null {
  const target = parseSpineDate(date);
  return target ? `the week of ${LONG_MONTH_DAY.format(startOfWeek(target))}` : null;
}

// ─── the open chapter's rows ─────────────────────────────────────────────────

/**
 * One entry in the open chapter, sitting on the spine's own grid so the line
 * runs through it. The ink comes from the spine's context rather than a prop —
 * the open chapter is written in the open phase's colour by definition.
 *
 * `breaksLine` caps the rule at both ends of the row, which is how a gate gets
 * its gap: the row draws no line of its own and the gate's own square stop and
 * lighter resumption become the only marks on it.
 */
function OpenRow({
  when,
  breaksLine = false,
  testId,
  children,
}: {
  when?: ReactNode;
  breaksLine?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const ink = useSpineInk();
  return (
    <SpineRow
      testId={testId}
      color={ink.color}
      weight="heavy"
      dim
      capTop={breaksLine}
      capBottom={breaksLine}
      when={when}
    >
      {children}
    </SpineRow>
  );
}

/**
 * A gate, dropped onto the line. The 10px pull-left puts the block's left edge
 * on the spine's centre, which is where the gate's caps are drawn from — so
 * the stop and the resumption land on the rule instead of beside it.
 */
function GateRow({ children }: { children: ReactNode }) {
  return (
    <OpenRow breaksLine testId="making-gate-row">
      <div className="-ml-[10px]">{children}</div>
    </OpenRow>
  );
}

/** One quiet mono line on the spine — the surface's whole vocabulary for "no". */
function QuietLine({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <OpenRow testId={testId}>
      <p className="m-0 py-[13px] pl-2 font-mono text-[10px] uppercase leading-[1.4] tracking-[0.1em] text-[var(--color-quiet-ink)]">
        {children}
      </p>
    </OpenRow>
  );
}

/**
 * The open chapter while its three queries are still in flight. Strata bars —
 * the mark's own 60/48/36 proportions — held on the line. Never a gate, never
 * a figure: a client must not watch an ask appear and then vanish.
 */
function OpenChapterSkeleton() {
  return (
    <OpenRow testId="making-open-chapter-pending">
      <div aria-hidden="true" className="space-y-2 py-5 pl-2">
        <div className="h-2 w-[60%] animate-pulse rounded-[1px] bg-[var(--color-pearl)]" />
        <div className="h-2 w-[48%] animate-pulse rounded-[1px] bg-[var(--color-pearl)] opacity-70" />
        <div className="h-2 w-[36%] animate-pulse rounded-[1px] bg-[var(--color-pearl)] opacity-45" />
      </div>
      <span className="sr-only">Opening this chapter of your project.</span>
    </OpenRow>
  );
}

// ─── gates: papers awaiting a signature ──────────────────────────────────────

/**
 * A commercial document sent and unsigned. The list row carries the total; the
 * deposit and the piece count live one RPC deeper, so the bundle is read here —
 * bounded to the (few) papers actually outstanding on this project, never a
 * list-wide fetch.
 */
function SignatureGate({
  proposal,
  projectId,
}: {
  proposal: Proposal;
  projectId: string;
}) {
  const commercial = commercialSummaryFromProposal(proposal);
  const bundle = useClientCommercialDocument(proposal.id);
  // The gate's caps ARE the spine, broken. They have to be drawn in whatever
  // ink the line is carrying here, or the stop and the resumption read as a
  // foreign gold element sitting beside a terracotta line instead of as the
  // line stopping.
  const ink = useSpineInk();

  // A trade scope carries no deposit percent; its deposit is simply the first
  // draw in its schedule. Same read as the awaiting-signature cards, so the two
  // surfaces cannot disagree about what is due on signature.
  const depositCents =
    bundle.data?.furnishings?.depositRequiredCents ??
    bundle.data?.tradeScope?.draws[0]?.amountCents ??
    null;

  // The only caption the data can honestly support: an authorization knows how
  // many pieces it orders. Everything else stays silent rather than inventing
  // a consequence.
  const pieceCount = bundle.data?.furnishings?.items.length ?? 0;
  const caption =
    pieceCount > 0
      ? `${capitalize(countInWords(pieceCount))} ${
          pieceCount === 1 ? 'piece orders' : 'pieces order'
        } the moment you sign.`
      : null;

  return (
    <GateRow>
      <SpineGate
        variant="signature"
        title={proposal.title}
        kindLabel={KIND_LABEL[commercial.kind] ?? null}
        totalCents={
          typeof proposal.total_amount === 'number' ? proposal.total_amount : null
        }
        depositCents={depositCents}
        caption={caption}
        accent={ink.color}
        href={`/proposals/${proposal.id}/sign`}
        onFollow={() =>
          makingEvents.gateFollowed({
            projectId,
            proposalId: proposal.id,
            kind: GATE_KIND[commercial.kind] ?? 'design_services',
          })
        }
      />
    </GateRow>
  );
}

function ProjectApprovalGate({ approval }: { approval: ProjectApprovalReview }) {
  const ink = useSpineInk();
  const due = parseSpineDate(approval.dueAt);
  const act = approval.lifecycleStatus === 'draft' ? 'Review exact edition' : 'Respond';

  return (
    <GateRow>
      <section
        aria-labelledby={`approval-gate-${approval.decisionId}`}
        className="relative my-1 min-w-0 border-y border-[var(--border-default)] bg-[var(--bg-warm)] px-5 py-5 sm:px-6"
        data-testid="making-project-approval-gate"
      >
        <span
          aria-hidden
          className="absolute -left-[13px] -top-[3px] h-[5px] w-[26px]"
          style={{ backgroundColor: ink.color }}
        />
        <span
          aria-hidden
          className="absolute -bottom-[2px] -left-[9px] h-[3px] w-[22px]"
          style={{ backgroundColor: `color-mix(in srgb, ${ink.color} 50%, transparent)` }}
        />
        <p className="type-meta-small">
          A gate · {approval.lifecycleStatus === 'draft' ? 'your review is required' : 'your response is required'}
        </p>
        <h3 id={`approval-gate-${approval.decisionId}`} className="type-item-name mt-1.5 break-words">
          {approval.question}
        </h3>
        <p className="type-body-small mt-2 break-words text-[var(--text-muted)]">
          {approval.artifactTitle} · Edition {approval.artifactVersion}
          {due ? ` · Due ${LONG_MONTH_DAY.format(due)}` : ''}
        </p>
        <div className="mt-4">
          <ScoredAction
            actionKey="gate_project_approval"
            regionKey="gate"
            variant="primary"
            href={`/decisions/${approval.decisionId}`}
          >
            {act}
          </ScoredAction>
        </div>
      </section>
    </GateRow>
  );
}

interface DeferredApprovalWork {
  approval: ProjectApprovalReview;
  phaseLabel: string;
}

function DeferredProjectApprovals({
  heading,
  description,
  items,
  testId,
}: {
  heading: string;
  description: string;
  items: DeferredApprovalWork[];
  testId: string;
}) {
  if (items.length === 0) return null;
  const headingId = `${testId}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className="mt-8 min-w-0 border-t border-[var(--border-subtle)] pt-5"
      data-testid={testId}
    >
      <h2 id={headingId} className="type-meta">
        {heading}
      </h2>
      <p className="type-body-small mt-1 text-[var(--text-muted)]">
        {description}
      </p>
      <ul aria-label={heading} className="mt-3 min-w-0 list-none p-0">
        {items.map(({ approval, phaseLabel }) => {
          const due = parseSpineDate(approval.dueAt);
          const action = projectApprovalAttentionLabel(approval);
          const clientActionable = isClientActionableProjectApproval(approval);
          return (
            <li
              key={approval.decisionId}
              className="min-w-0 border-b border-[var(--border-subtle)] py-4"
            >
              <p className="type-meta-small break-words text-[var(--text-muted)]">
                {phaseLabel} · {action}
              </p>
              <h3 className="type-item-name mt-1 min-w-0">
                <Link
                  href={`/decisions/${approval.decisionId}`}
                  className="inline-flex min-h-11 min-w-0 items-center break-words no-underline hover:underline focus-visible:focus-ring"
                >
                  {approval.question}
                </Link>
              </h3>
              <p className="type-body-small mt-1 break-words text-[var(--text-muted)]">
                {approval.artifactTitle} · Edition {approval.artifactVersion}
                {due && clientActionable ? ` · Due ${LONG_MONTH_DAY.format(due)}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── gates: finished work awaiting acceptance ────────────────────────────────

/**
 * A trade scope the sub has called substantially complete.
 *
 * There is no acceptance route anywhere in the portal — acceptance has always
 * been an inline form on the project page, posting to
 * `/api/trade-scopes/[id]/accept`. Under this flag the project page IS this
 * surface, so linking away would be a circle. The gate hosts the act instead:
 * the line stops, the client types her name in the gap, and the line resumes.
 */
function AcceptanceGate({
  selection,
  proposalId,
  projectId,
}: {
  selection: ClientSelection;
  proposalId: string;
  projectId: string;
}) {
  const bundle = useClientCommercialDocument(proposalId);
  const accept = useAcceptTradeScope(proposalId, projectId);
  const ink = useSpineInk();
  const [signedName, setSignedName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const draws = bundle.data?.tradeScope?.draws ?? [];
  const gatedDraw = draws.find((draw) => draw.gatesOnAcceptance) ?? null;
  const paidDraws = draws.filter(
    (draw) => draw.amountCents > 0 && draw.invoicePaidCents >= draw.amountCents,
  ).length;

  // The deck's caption, composed only from draws that exist: "Draws one
  // through three are paid. The draw of $1,440 releases on your acceptance."
  const caption =
    [
      paidDraws > 0
        ? `${capitalize(countInWords(paidDraws))} ${
            paidDraws === 1 ? 'draw is' : 'draws are'
          } paid.`
        : null,
      gatedDraw && gatedDraw.amountCents > 0
        ? `The draw of ${moneyInWords(gatedDraw.amountCents)} releases on your acceptance.`
        : null,
    ]
      .filter((clause): clause is string => clause !== null)
      .join(' ') || null;

  async function onAccept() {
    const name = signedName.trim();
    if (name.length < 2) {
      setError('Type your full name to accept the finished work.');
      return;
    }
    setError(null);
    makingEvents.gateFollowed({
      projectId,
      proposalId,
      kind: 'trade_acceptance',
    });
    try {
      await accept.mutateAsync(name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to accept this work right now.',
      );
    }
  }

  return (
    <GateRow>
      <SpineGate
        variant="acceptance"
        title={selection.name}
        kindLabel={KIND_LABEL.trade_scope ?? null}
        totalCents={selection.clientLineTotalCents || null}
        caption={caption}
        accent={ink.color}
        act={
          <div>
            <label
              className="type-meta-small block text-[var(--text-muted)]"
              htmlFor={`accept-name-${proposalId}`}
            >
              Type your full name
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <input
                id={`accept-name-${proposalId}`}
                type="text"
                value={signedName}
                onChange={(event) => setSignedName(event.target.value)}
                autoComplete="name"
                data-testid="accept-trade-scope-name"
                className="type-body-small min-w-[12rem] rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
              />
              <ScoredAction
                actionKey="gate_accept"
                regionKey="gate"
                variant="primary"
                loading={accept.isPending}
                loadingLabel="Accepting"
                onClick={onAccept}
              >
                Accept the finished work
              </ScoredAction>
            </div>
            {/* A rejected signature is a genuine error, so it takes the error
                ink — NOT terracotta, which on this surface is the Installation
                phase, and which against the gate's warm sheet reads at about
                2:1. The money-is-never-red rule governs balances, overages and
                lateness (SpineToll keeps those neutral); it does not ask a
                validation message to whisper. Sentence register, not a mono
                label: this is the one line explaining why nothing happened. */}
            {error && (
              <p role="alert" className="type-body-small mt-2 text-[var(--color-error)]">
                {error}
              </p>
            )}
          </div>
        }
      />
    </GateRow>
  );
}

// ─── the surface ─────────────────────────────────────────────────────────────

export interface TheMakingProps {
  /** The project this pane is made of. Same value as `project.id`. */
  projectId: string;
  /** Server-fetched overview: name, location, currentPhase, projectedCompletionDate, counts. */
  project: ClientProjectOverview;
  /** Server-fetched phases. `tags` includes 'Concurrent workstream' for thread-lane phases. */
  milestones: MilestoneDetail[];
  projectApprovals?: ProjectApprovalReview[];
  projectApprovalsLoading?: boolean;
  projectApprovalsError?: boolean;
}

export function TheMaking({
  projectId,
  project,
  milestones,
  projectApprovals = [],
  projectApprovalsLoading = false,
  projectApprovalsError = false,
}: TheMakingProps) {
  // ── every hook, before any branch ──────────────────────────────────────────
  const hydrated = useHydrated();
  const { user } = useAuth();
  const proposalsQuery = useClientProposals();
  const selectionsQuery = useClientSelections(projectId);
  const invoicesQuery = useProjectInvoices(projectId);

  // ── the chapters ───────────────────────────────────────────────────────────
  // Resolved ONCE, here, and read by both the masthead and the spine. The
  // masthead's phase vital used to normalize `project.currentPhase` — which is
  // `project_phases.name || phase_key`, i.e. usually the studio's free text —
  // and printed "Discovery" for every project whose phases carry real names.
  // The open phase ROW carries a phase_key, so it is the source of truth.
  const phases = useMemo(() => splitSpinePhases(milestones), [milestones]);
  const openChapter = openChapterOf(phases, project.currentPhase);
  const nextPhase = phases.future[0] ?? null;

  const today = useMemo(
    () => (hydrated ? new Date() : undefined),
    // A new Date on every hydrated render would re-key the whole spine; one
    // per mount is what the surface actually means by "today".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrated],
  );

  // ── the papers ─────────────────────────────────────────────────────────────
  const { pending, accepted } = partitionProposals(proposalsQuery.data);

  // Filter on the SUMMARY's projectId, never the raw column: a furnishings
  // authorization is minted from the schedule and keeps proposals.project_id
  // NULL, so the raw column would hide the one gate that matters most.
  const signatureGates = pending.filter((proposal) => {
    const commercial = commercialSummaryFromProposal(proposal);
    return commercial.projectId === projectId && commercial.kind !== 'legacy';
  });

  const instrumentReceipts: SpineReceiptEntry[] = accepted.flatMap((proposal) => {
    const commercial = commercialSummaryFromProposal(proposal);
    if (commercial.projectId !== projectId || commercial.kind === 'legacy') return [];
    const kindLabel = KIND_LABEL[commercial.kind] ?? 'Document';
    return [
      {
        id: `instrument:${proposal.id}`,
        date: commercial.executedAt ?? undefined,
        lead: `${kindLabel} ${commercial.state === 'executed' ? 'executed' : 'signed'}`,
        detail: proposal.title,
      },
    ];
  });

  // ── the goods ──────────────────────────────────────────────────────────────
  // Origin discipline: only a confirmed commercial origin renders the
  // selection-derived regions. Pending is silence-with-a-skeleton; error and
  // legacy are silence.
  const originPending = selectionsQuery.isPending;
  const isCommercial =
    !originPending &&
    !selectionsQuery.isError &&
    selectionsQuery.data?.origin === 'commercial';
  const selections = isCommercial ? (selectionsQuery.data?.selections ?? []) : [];

  const goods = selections.filter((selection) => selection.kind === 'furnishings');
  const inMotion = goods
    .filter((selection) => journeyStageIndexForStatus(selection.status) < INSTALLED_STOP)
    // Furthest along first — what is nearly here reads before what has not
    // left the studio. Name breaks the tie so the order is stable.
    .sort(
      (a, b) =>
        journeyStageIndexForStatus(b.status) - journeyStageIndexForStatus(a.status) ||
        a.name.localeCompare(b.name),
    );
  const installed = goods.filter(
    (selection) => journeyStageIndexForStatus(selection.status) === INSTALLED_STOP,
  );

  const acceptanceGates = selections.flatMap((selection) => {
    const proposalId = selection.instrument?.proposalId ?? null;
    const journey = selection.tradeJourney ?? 'none';
    // Detection verbatim from TradeSelectionCard — one definition of "ready to
    // accept" across both surfaces.
    if (selection.kind !== 'trade' || journey !== 'substantially_complete' || !proposalId) {
      return [];
    }
    return [{ selection, proposalId }];
  });
  const actionableProjectApprovals = projectApprovals.filter(
    isClientActionableProjectApproval,
  );
  const awaitingStudioIssueApprovals = projectApprovals
    .filter(isProjectApprovalAwaitingStudioIssue)
    .map((approval) => ({
      approval,
      phaseLabel:
        phases.current?.id === approval.phaseId
          ? phases.current.label
          : phases.future.find((phase) => phase.id === approval.phaseId)?.label ??
            phases.settled.find((phase) => phase.id === approval.phaseId)?.label ??
            'Phase not available',
    }));
  const currentPhaseId = phases.current?.id ?? null;
  const approvalGates = currentPhaseId
    ? actionableProjectApprovals.filter(
        (approval) => approval.phaseId === currentPhaseId,
      )
    : [];
  const laterApprovals = actionableProjectApprovals.flatMap((approval) => {
    const phase = phases.future.find((candidate) => candidate.id === approval.phaseId);
    return phase ? [{ approval, phaseLabel: phase.label }] : [];
  });
  const otherApprovals = actionableProjectApprovals
    .filter(
      (approval) =>
        approval.phaseId !== currentPhaseId &&
        !phases.future.some((phase) => phase.id === approval.phaseId),
    )
    .map((approval) => ({
      approval,
      phaseLabel:
        phases.settled.find((phase) => phase.id === approval.phaseId)?.label ??
        'Phase not available',
    }));

  // ── the ledger ─────────────────────────────────────────────────────────────
  const openInvoices = (invoicesQuery.data ?? [])
    .filter((invoice) => invoice.status === 'sent' || invoice.status === 'partially_paid')
    .sort(sortByDueDate);
  const openBalanceCents = openInvoices.reduce(
    (sum, invoice) => sum + invoiceBalanceCents(invoice),
    0,
  );

  // ── the sentence ───────────────────────────────────────────────────────────
  // Papers and acceptances are counted apart: one is a document waiting for a
  // name, the other is finished work waiting to be accepted, and the sentence
  // says so in different words. Telemetry and the sub-line still want the sum.
  const gateCount = approvalGates.length + signatureGates.length + acceptanceGates.length;
  const namesAtStop = (stop: number) =>
    goods
      .filter((selection) => journeyStageIndexForStatus(selection.status) === stop)
      .map((selection) => selection.name);

  const openChapterLoading =
    projectApprovalsLoading ||
    proposalsQuery.isPending ||
    selectionsQuery.isPending ||
    invoicesQuery.isPending;

  const standing: StandingSentenceInput | null =
    hydrated && today && !openChapterLoading
      ? {
          todayLabel: todayInWords(today),
          signatureCount: signatureGates.length,
          acceptanceCount: acceptanceGates.length,
          inProduction: namesAtStop(2),
          shipped: namesAtStop(3),
          delivered: namesAtStop(4),
          openBalanceCents,
          // The next phase's CLIENT label, off the spine's own split — never
          // `project.nextMilestone.title`, which is `project_phases.name` and
          // would have the ruled sentence read "Construction Administration
          // comes next, the week of October 12."
          nextMilestone: nextPhase
            ? {
                title: nextPhase.label,
                whenLabel: weekInWords(
                  nextPhase.targetDate ?? project.nextMilestone?.targetDate,
                ),
              }
            : null,
        }
      : null;

  // ── telemetry ──────────────────────────────────────────────────────────────
  // `client_project_view` is fired by ProjectSurfaceSwitch, which is the one
  // component both surfaces pass through — firing it here as well double-
  // counted every flagged open, because the switch renders today's tree (and
  // its emitter) for at least one commit while the flag resolves.
  const surfaceReported = useRef(false);
  useEffect(() => {
    if (surfaceReported.current || openChapterLoading) return;
    surfaceReported.current = true;
    makingEvents.surfaceViewed({
      projectId,
      gateCount,
      tollCount: openInvoices.length,
      trackingCount: inMotion.length,
    });
  }, [gateCount, inMotion.length, openChapterLoading, openInvoices.length, projectId]);

  // ── the open chapter, in reading order ─────────────────────────────────────
  const entries: ReactNode[] = [];

  if (openChapterLoading) {
    entries.push(<OpenChapterSkeleton key="pending" />);
  } else {
    // 1 · gates — artifact decisions first, then papers and finished work
    for (const approval of approvalGates) {
      entries.push(
        <ProjectApprovalGate key={`approval:${approval.decisionId}`} approval={approval} />,
      );
    }
    for (const proposal of signatureGates) {
      entries.push(
        <SignatureGate key={`sign:${proposal.id}`} proposal={proposal} projectId={projectId} />,
      );
    }
    for (const { selection, proposalId } of acceptanceGates) {
      entries.push(
        <AcceptanceGate
          key={`accept:${selection.id}`}
          selection={selection}
          proposalId={proposalId}
          projectId={projectId}
        />,
      );
    }
    if (proposalsQuery.isError) {
      entries.push(
        <QuietLine key="papers-dark" testId="making-papers-unavailable">
          Your papers could not be read just now
        </QuietLine>,
      );
    }
    if (projectApprovalsError) {
      entries.push(
        <QuietLine key="approvals-dark" testId="making-approvals-unavailable">
          Project approvals could not be read just now
        </QuietLine>,
      );
    }

    // 2 · tolls — open balances, soonest due first
    for (const invoice of openInvoices) {
      entries.push(
        <TollEntry
          key={`toll:${invoice.id}`}
          invoice={invoice}
          projectId={projectId}
          today={today}
        />,
      );
    }
    if (invoicesQuery.isError) {
      entries.push(
        <QuietLine key="ledger-dark" testId="making-ledger-unavailable">
          The ledger could not be opened just now
        </QuietLine>,
      );
    }

    // 3 · tracking rows — pieces in motion, then what is already placed
    if (isCommercial) {
      if (inMotion.length > 0) {
        entries.push(
          <OpenRow key="pieces-head" testId="making-pieces-head">
            <p className="m-0 pb-1 pt-4 pl-2 font-mono text-[10px] uppercase leading-[1.4] tracking-[0.14em] text-[var(--text-primary)]">
              <span className="font-semibold">Pieces in motion</span>
              <span className="ml-2 font-normal normal-case tracking-[0.06em] text-[var(--color-quiet-ink)]">
                {GOODS_JOURNEY_STAGES.join(' · ')}
              </span>
            </p>
          </OpenRow>,
        );
        for (const selection of inMotion) {
          entries.push(
            <OpenRow key={`piece:${selection.id}`}>
              <div className="pl-2">
                <TrackingRow
                  name={selection.name}
                  imageUrl={selection.imageUrl}
                  priceCents={selection.clientLineTotalCents || null}
                  status={selection.status}
                />
              </div>
            </OpenRow>,
          );
        }
      }
      // No branch for `goods.length === 0`. Absence is silence: a project with
      // no furnishings — a design-services-only engagement, a job that has not
      // reached the schedule yet — has nothing to say here, and saying "no
      // pieces are in motion yet" in mono caps is exactly the system-label
      // register the D-voice steal exists to displace. The standing sentence
      // already covers a client with nothing waiting on her.

      if (installed.length > 0) {
        entries.push(
          <QuietLine key="installed" testId="making-pieces-settled">
            {`${countInWords(installed.length)} ${
              installed.length === 1 ? 'piece is' : 'pieces are'
            } installed and placed`}
          </QuietLine>,
        );
      }
    }
  }

  return (
    <div className="min-w-0" data-testid="the-making">
      <MakingMasthead
        projectName={project.name}
        location={project.location}
        phaseLabel={openChapter.label ?? null}
        monthLabel={today ? monthAndYear(today) : null}
        // The addressee, and only when the session actually names them. The
        // studio's name is not on ClientProjectOverview and v1 does not buy a
        // fetch for it, so the letterhead runs the half it can stand behind.
        preparedFor={user?.name ?? null}
        standing={standing}
      />

      <MakingSpine
        className="mt-9"
        milestones={milestones}
        currentPhase={project.currentPhase}
        instrumentReceipts={instrumentReceipts}
        today={today}
        horizonDate={project.projectedCompletionDate}
      >
        {/* A fragment is always truthy, so an empty open chapter must be
            `undefined` — that is what lets the spine run unbroken instead of
            opening a region with nothing in it. */}
        {entries.length > 0 ? entries : undefined}
      </MakingSpine>

      <DeferredProjectApprovals
        heading="Later approvals"
        description="Linked to a later project phase, not today’s open chapter."
        items={laterApprovals}
        testId="making-later-approvals"
      />
      <DeferredProjectApprovals
        heading="Other project approvals"
        description="Not linked to today’s open chapter or a scheduled future phase."
        items={otherApprovals}
        testId="making-other-approvals"
      />
      <DeferredProjectApprovals
        heading="Awaiting studio issue"
        description="Your review is complete. The studio is preparing the approval for issue."
        items={awaitingStudioIssueApprovals}
        testId="making-awaiting-studio-issue"
      />
    </div>
  );
}

/** Soonest due first; an invoice with no due date waits at the back. */
function sortByDueDate(a: Invoice, b: Invoice): number {
  const left = parseSpineDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = parseSpineDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

/**
 * A toll on the line. The date column carries the day it comes due, so the
 * spine reads in time order even where the money is.
 */
function TollEntry({
  invoice,
  projectId,
  today,
}: {
  invoice: Invoice;
  projectId: string;
  today?: Date;
}) {
  const due = parseSpineDate(invoice.due_date);
  return (
    <OpenRow
      testId="making-toll-row"
      when={
        due ? (
          <>
            <span className="block">Due</span>
            <b className="block font-medium text-[var(--text-primary)]">
              {LONG_MONTH_DAY.format(due)}
            </b>
          </>
        ) : null
      }
    >
      <div className="pl-2">
        <SpineToll
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number}
          totalCents={invoice.total_cents}
          paidCents={invoice.amount_paid_cents ?? 0}
          dueDate={invoice.due_date}
          today={today}
          onFollow={() =>
            makingEvents.tollFollowed({
              projectId,
              invoiceId: invoice.id,
              balanceCents: invoiceBalanceCents(invoice),
            })
          }
        />
      </div>
    </OpenRow>
  );
}
