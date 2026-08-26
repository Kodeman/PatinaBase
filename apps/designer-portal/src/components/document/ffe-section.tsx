'use client';

/**
 * Project / Install section (spec §6, §13 Slice 2): the FF&E table as
 * typographic lines with R2 stamps. Built from the ffe/* kit's canon —
 * useProjectFFEItems (unified query key) + STAGE_CONFIG (R2 label/color
 * source).
 *
 * R25 (Dissolve Track 1.3): rooms are how a real schedule is written —
 * room headings as Playfair-italic sub-heads (name + live allocation +
 * placed count), Strata mini-rules as dividers, lines beneath keeping every
 * existing behavior; unassigned lines fall under "Throughout · unassigned";
 * "+ Room" adds inline. Assignment happens from the line unfold (drag lands
 * as polish later — DECISIONS I25).
 *
 * R23/R24: the section head carries The Work block and the folio strip.
 *
 * R76: the schedule can BILL — the section head carries a quiet "Bill →" act
 * opening the R74b invoice composer with every uninvoiced priced line
 * pre-ticked (the Document descendant of ?ffeItemIds=), and each line wears
 * its 00187 coverage truth (invoiced · N° / paid / unpriced) as a quiet
 * mono note under the maker line. (The per-line Bill act rides the line
 * unfold — Track 11-M's surface — wired post-merge.)
 *
 * The Authorized Schedule (Act III): the schedule gains a SECOND STAMP —
 * where a piece is in the world stays on the left, whether the client has
 * agreed to buy it reads on the right. The head act turns the same table into
 * a selection surface: ticks on lines and rooms, reasons (never refusals) on
 * the lines that cannot go, and a composition bar underneath that counts what
 * is held. Nothing is created until the review sheet commits.
 */

import Link from 'next/link';
import {
  useFfeInvoiceCoverage,
  useProjectFFEItems,
  useProjectFfeReadiness,
  useProjectOwnedBoards,
  type FfeItemCoverage,
} from '@patina/supabase';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { MobileMarginChips } from './mobile/mobile-margin-chips';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import type { FFEStageKey } from '@patina/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveLineStamp,
  lineStampLabel,
  type LineStamp,
  type TradeLineProgress,
} from '@/lib/document/stamp-derivation';
import {
  buildInstrumentIndex,
  buildTradeScopeIndex,
  deriveLineAuthorization,
  deriveTradeLineHold,
  eligibility,
  releaseSummary,
  scheduledContributionCents,
  signableCents,
  type InstrumentLike,
  type LineAuthorization,
  type LineEligibility,
  type ReleaseLine,
  type RoomTriState,
  type TradeLineHold,
} from '@/lib/document/authorization-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { Stamp } from './stamp';
import { LineUnfold } from './line-unfold';
import { StrataMark } from './strata-mark';
import { StrataMiniRule } from './strata-mini-rule';
import { WorkBlock } from './work-block';
import { FolioStrip } from './folio-strip';
import {
  useAddDocumentRoom,
  useDocumentRooms,
} from '@/hooks/use-document-rooms';
import {
  useProjectBillingAuthority,
  useProjectInstruments,
  useTradeScopes,
} from '@/hooks/use-commercial-documents';
import { AuthorizationStamp } from './schedule/authorization-stamp';
import { GuidedEmptyState } from './guided-empty-state';
import { AddLineSheet } from './schedule/add-line-sheet';
import { AddToProjectSheet, openAddToProject } from './schedule/add-to-project-sheet';
import { CompositionBar } from './schedule/composition-bar';
import { ReviewReleaseSheet } from './schedule/review-release-sheet';
import {
  ReleaseCeremonyProvider,
  useReleaseCeremony,
} from './schedule/release-ceremony-context';
import type { NeedLine, SectionKey } from '@/lib/document/desk-derivation';
import {
  electFfeLeader,
  type FfeLeaderKind,
} from '@/lib/document/ffe-leader';
import { DocumentAction } from './document-action';
import { SectionLoadingLine } from './section-loading-line';
import { RegionHead, type RegionLedgerEntry } from './region/region-head';
import { RegionRule } from './region/region-rule';
import { FoldSeam, focusRegionHeading } from './region/fold-seam';
import { useRegionFold } from './region/use-region-fold';
import {
  liftByRoom,
  roomState as deriveRoomState,
  roomStateRowFromStamp,
} from '@/lib/document/room-state';
import { useRoomLens } from './room-lens-context';
import { useRegionUnfoldRequest } from '@/hooks/use-region-unfold';

/** Warm borders need darker text ink on paper (prototype stamp treatment). */
const STAGE_INK: Partial<Record<FFEStageKey, string>> = {
  approved: 'var(--color-clay-ink)',
  production: 'var(--color-golden-hour-ink)',
  shipped: 'var(--color-golden-hour-ink)',
  delivered: 'var(--color-sage-ink)',
  installed: 'var(--color-sage-ink)',
};

/** The authority states that can still put work in front of a client. */
const RELEASING_AUTHORITY = new Set([
  'active',
  'retainer_pending',
  'exhausted',
]);

function stampProps(stamp: LineStamp): {
  label: string;
  color: string;
  ink?: string;
} {
  // F58: the word is never chosen here — stamp-derivation is the one source,
  // so this surface and the spec-book leaf cannot name a line differently.
  const label = lineStampLabel(stamp.kind);
  switch (stamp.kind) {
    // Act IV — trade work is judged, not delivered. Aged oak while it is only
    // committed, golden hour while hands are on it, clay when it waits on the
    // client's judgement, sage when they have given it.
    case 'trade_engaged':
      return { label, color: 'var(--color-aged-oak)', ink: '#8B7355' };
    case 'trade_in_progress':
      return { label, color: 'var(--color-golden-hour)', ink: 'var(--color-golden-hour-ink)' };
    case 'trade_substantially_complete':
      return { label, color: 'var(--color-clay)', ink: 'var(--color-clay-ink)' };
    case 'trade_accepted':
      return { label, color: 'var(--color-sage)', ink: 'var(--color-sage-ink)' };
    // Never actually rendered — the line below skips <Stamp> entirely for
    // this kind, so a line whose real progress is not yet known stays quiet
    // rather than guessing. Kept exhaustive/safe rather than falling into
    // STAGE_CONFIG (keyed by FFEStageKey, not LineStampKind — it has no
    // 'trade_pending' entry and would throw).
    case 'trade_pending':
      return { label, color: 'var(--color-aged-oak)' };
    case 'decision_due':
      return {
        label: stamp.dueDate ? `${label} · ${fmtDay(stamp.dueDate)}` : label,
        color: 'var(--color-terracotta)',
        ink: 'var(--color-terracotta-ink)',
      };
    // Arrived, awaiting inspection — its own word, not STAGE_CONFIG's
    // dropdown word, which would print RECEIVED over an unopened pallet.
    case 'delivered':
      return { label, color: 'var(--color-sage)', ink: 'var(--color-sage-ink)' };
    case 'received':
      return { label, color: 'var(--color-sage)', ink: 'var(--color-sage-ink)' };
    case 'partial':
      // R18: the W5-T2 short receipt, surfaced — golden hour like the
      // inspection outcome it derives from.
      return { label, color: 'var(--color-golden-hour)', ink: 'var(--color-golden-hour-ink)' };
    case 'damaged':
      // Item-grain truth only (00196): an open claim attributed to THIS line.
      return {
        label,
        color: 'var(--color-terracotta)',
        ink: 'var(--color-terracotta-ink)',
      };
    default: {
      const cfg = STAGE_CONFIG[stamp.kind];
      return { label, color: cfg.color, ink: STAGE_INK[stamp.kind] };
    }
  }
}

const UNDERWAY = new Set([
  'ordered',
  'production',
  'shipped',
  'delivered',
  'received',
  'partial',
  'installed',
  // A trade presence line only exists because the client signed and the studio
  // engaged, so every trade stamp is committed work by construction.
  'trade_engaged',
  'trade_in_progress',
  'trade_substantially_complete',
  'trade_accepted',
  'trade_pending',
]);
const COMMITTED = UNDERWAY;

type FFERow = any; // row from useProjectFFEItems (untyped hook, view-shaped)

function vendorLine(item: FFERow, stamp: LineStamp, showRoom = false): string {
  const parts: string[] = [];
  const maker = item.vendor_name ?? item.product?.brand;
  if (maker) parts.push(maker);
  if (showRoom && item.room?.name) parts.push(item.room.name);
  if (stamp.kind === 'delivered') parts.push('awaiting inspection');
  else if (
    item.eta &&
    (stamp.kind === 'ordered' ||
      stamp.kind === 'production' ||
      stamp.kind === 'shipped')
  )
    parts.push(`arrives ~${fmtDay(item.eta)}`);
  return parts.join(' · ');
}

interface LineRow {
  item: FFERow;
  stamp: LineStamp;
  auth: LineAuthorization;
  eligible: LineEligibility;
  tradeHold: TradeLineHold;
}

/**
 * The authorization column for a trade presence line. A trade scope is its own
 * instrument, so it wears its own mark (TS1) rather than borrowing the
 * furnishings A-numbers — and it is always authorized, because the line only
 * exists once the client has signed for the work.
 */
function TradeAuthorizationStamp({ hold }: { hold: TradeLineHold }) {
  if (!hold.onTradeScope) return null;
  return (
    <span data-authorization-track="trade" className="inline-block">
      <Stamp
        label={hold.number ? `On trade scope · TS${hold.number}` : 'On trade scope'}
        color="var(--color-sage)"
        ink="var(--color-sage-ink)"
      />
    </span>
  );
}

/** R76 — the line's billing truth (00187), a quiet mono note: SAGE paid,
 *  dusty-blue invoiced, muted unpriced. Never a second loud stamp. */
function coverageNote(
  item: FFERow,
  coverage: FfeItemCoverage | undefined,
): { text: string; color: string } | null {
  if (coverage && coverage.coverage === 'paid')
    return { text: 'paid', color: 'var(--color-sage-ink)' };
  if (coverage && coverage.coverage === 'invoiced')
    return {
      text: coverage.invoiceNumber
        ? `invoiced · ${coverage.invoiceNumber}`
        : 'invoiced',
      color: '#7E8FA6',
    };
  if (item.unit_price_cents === null || item.unit_price_cents === undefined)
    return { text: 'unpriced', color: 'var(--text-muted)' };
  return null;
}

/** A tick that can hold three answers — none, some, all of a room. */
function TriStateTick({
  state,
  label,
  onChange,
}: {
  state: RoomTriState;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === 'all'}
      onChange={(event) => onChange(event.target.checked)}
      className="h-3.5 w-3.5 shrink-0 accent-[var(--color-clay)]"
    />
  );
}

function FFELine({
  item,
  stamp,
  auth,
  eligible,
  tradeHold,
  projectId,
  projectName,
  highlightId,
  unfolded,
  onToggle,
  onAddNote,
  showRoom = false,
  coverage,
  showAuthorization,
  isCommercialOrigin,
  selecting,
  selected,
  onSelectToggle,
  onIncludeInRelease,
  canEditSelection,
}: LineRow & {
  projectId: string;
  projectName: string;
  highlightId: string | null;
  unfolded: boolean;
  onToggle: () => void;
  onAddNote: (lineId: string) => void;
  showRoom?: boolean;
  coverage?: FfeItemCoverage;
  showAuthorization: boolean;
  isCommercialOrigin: boolean;
  selecting: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onIncludeInRelease: () => void;
  canEditSelection: boolean;
}) {
  const sp = stampProps(stamp);
  const line = vendorLine(item, stamp, showRoom);
  const billing = coverageNote(item, coverage);
  const price =
    item.line_total_cents != null ? fmtUsd(item.line_total_cents) : '—';

  const body = (
    <>
      <div>
        <p className="text-[12.5px] font-medium leading-snug text-[var(--color-charcoal)]">
          {item.name}
          {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
        </p>
        {line && (
          <p className="mt-px text-[10.5px] text-[var(--text-muted)]">{line}</p>
        )}
        {/* R76: the coverage stamp — the 00187 bridge's per-line truth. */}
        {billing && (
          <p
            className="mt-px font-mono text-[8px] uppercase tracking-[0.08em]"
            style={{ color: billing.color }}
          >
            {billing.text}
          </p>
        )}
        {/* R38: the quiet, honest footprint of a piece the Engine placed. */}
        {item.added_via === 'engine' && (
          <p className="mt-px font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] opacity-70">
            via the Engine
          </p>
        )}
      </div>
      {/* Ineligibility is a reason, not a refusal — lowercase mono, exactly
          where the logistics stamp sits. */}
      {selecting && !eligible.eligible ? (
        <span className="whitespace-nowrap font-mono text-[9px] lowercase tracking-[0.04em] text-[var(--text-muted)]">
          {eligible.reason}
        </span>
      ) : stamp.kind === 'trade_pending' ? null : (
        <Stamp label={sp.label} color={sp.color} ink={sp.ink} />
      )}
      {showAuthorization &&
        (tradeHold.onTradeScope ? (
          <TradeAuthorizationStamp hold={tradeHold} />
        ) : (
          <AuthorizationStamp auth={auth} />
        ))}
      <span className="whitespace-nowrap text-right font-heading text-[13px] font-medium text-[var(--color-charcoal)]">
        {price}
      </span>
    </>
  );

  const gridClass = `grid w-full items-center gap-3 px-2 py-2.5 text-left transition-colors duration-150 ${
    selecting
      ? showAuthorization
        ? 'grid-cols-[auto_1fr_auto_auto_auto]'
        : 'grid-cols-[auto_1fr_auto_auto]'
      : showAuthorization
        ? 'grid-cols-[1fr_auto_auto_auto]'
        : 'grid-cols-[1fr_auto_auto]'
  } ${
    item.id === highlightId
      ? 'bg-[rgba(196,165,123,0.08)]'
      : stamp.kind === 'decision_due'
        ? 'bg-[rgba(232,197,71,0.05)]'
        : 'hover:bg-[rgba(196,165,123,0.04)]'
  }`;

  return (
    <li id={`ffe-selection-${item.id}`} className="scroll-mt-24 border-b border-[var(--color-pearl)]">
      {selecting ? (
        // The whole row is the tick while the schedule is a selection surface.
        <label
          className={`${gridClass} ${
            eligible.eligible ? 'cursor-pointer' : 'cursor-default opacity-70'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            disabled={!eligible.eligible}
            onChange={onSelectToggle}
            aria-label={`Include ${item.name} in this release`}
            className="h-3.5 w-3.5 shrink-0 accent-[var(--color-clay)]"
          />
          {body}
        </label>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={unfolded}
          className={gridClass}
        >
          {body}
        </button>
      )}
      {/* D13: this line's margin items as chips beneath it (mobile). */}
      <MobileMarginChips
        projectId={projectId}
        proposalId={null}
        anchorKind="line"
        anchorId={item.id}
      />
      {unfolded && !selecting && (
        <>
          <LineUnfold
            item={item}
            projectId={projectId}
            projectName={projectName}
            onAddNote={onAddNote}
            onFold={onToggle}
            auth={auth}
            isCommercialOrigin={isCommercialOrigin}
            onIncludeInRelease={onIncludeInRelease}
            canEditSelection={canEditSelection}
          />
          {/* SP-19/F57 — Sku/Finish/Material/Colour/Exact Location are only
              editable in the spec-book route; this in-flow act is the
              unfolded line's own door to that route, scoped to this line. No
              attribute becomes editable here.

              It sits beside LineUnfold rather than inside its
              `ffe-line-actions` group (line-unfold.tsx belongs to no A2 lane),
              so it declares its own region key: one region key must never
              span two disjoint subtrees, or DocumentActionGroup's
              one-primary-per-region check silently stops seeing a member. */}
          <DocumentAction
            actionKey="edit-ffe-line-spec-details"
            surfaceKey="project"
            regionKey="ffe-line-spec-details"
            variant="tertiary"
            href={`/doc/${projectId}/spec-book?ffeItemId=${encodeURIComponent(item.id)}`}
            className="-mt-1 mb-2"
          >
            Edit spec details →
          </DocumentAction>
        </>
      )}
    </li>
  );
}

/** R25 room heading: Playfair-italic name + allocation/progress, over a
 *  Strata mini-rule. The mark's state is the room's truth: all installed =
 *  settled, lines underway = active, empty = future. */
function RoomHeading({
  name,
  roomId,
  budgetCents,
  rows,
  showAuthorization,
  selecting,
  roomState,
  onRoomToggle,
  eligibleCount,
  selectedCount,
  onAddLine,
}: {
  name: string;
  roomId?: string;
  budgetCents: number;
  rows: LineRow[];
  showAuthorization: boolean;
  selecting: boolean;
  roomState: RoomTriState;
  onRoomToggle: (next: boolean) => void;
  eligibleCount: number;
  selectedCount: number;
  onAddLine?: () => void;
}) {
  const committed = rows
    .filter((r) => COMMITTED.has(r.stamp.kind))
    .reduce((s, r) => s + (r.item.line_total_cents ?? 0), 0);
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const state = deriveRoomState(rows.map((r) => roomStateRowFromStamp(r.stamp)));

  const releasedCents = rows
    .filter((r) => r.auth.track !== 'none')
    .reduce((s, r) => s + (r.item.line_total_cents ?? 0), 0);
  const notYetCents = rows
    .filter((r) => r.auth.track === 'none')
    .reduce((s, r) => s + (r.item.line_total_cents ?? 0), 0);

  // R33 F5 — one schedule, one vocabulary: rooms speak the section's word.
  // "Placed" retires until it can truthfully mean installed.
  const meta = selecting
    ? `${selectedCount} of ${eligibleCount}`
    : [
        budgetCents > 0
          ? `committed ${fmtUsd(committed)} of ${fmtUsd(budgetCents)}`
          : null,
        rows.length > 0
          ? `${underway} of ${rows.length} underway`
          : 'no lines yet',
        showAuthorization && rows.length > 0
          ? `${fmtUsd(releasedCents)} released · ${fmtUsd(notYetCents)} not yet`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <div
      id={roomId ? `doc-room-${roomId}` : undefined}
      className="mt-4 scroll-mt-16"
    >
      <div className="flex items-baseline gap-2.5 pb-1">
        {selecting ? (
          <TriStateTick
            state={roomState}
            label={`Include every eligible line in ${name}`}
            onChange={onRoomToggle}
          />
        ) : (
          <StrataMark size="sm" state={state} />
        )}
        <h3 className="font-heading text-[13.5px] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h3>
        <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {meta}
        </span>
      </div>
      {/* The Strata mini-rule divides the room from its lines (HTML §3). */}
      <StrataMiniRule className="mb-0.5 ml-[3px]" />
      {onAddLine && !selecting && (
        <DocumentAction
          actionKey="open-add-schedule-line"
          surfaceKey="project"
          regionKey="room-lines"
          variant="tertiary"
          onClick={onAddLine}
        >
          Add a line
        </DocumentAction>
      )}
    </div>
  );
}

function AddRoomInline({ projectId }: { projectId: string }) {
  const addRoom = useAddDocumentRoom(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');

  if (!open) {
    // SP4 (I137): the room list's own constructive verb, printed in flow at its
    // foot. RegionHead's one-inked-leader contract polices the region HEAD, so
    // this line is not a second leader and is not demoted into the ledger.
    return (
      <DocumentAction
        actionKey="open-add-project-room"
        surfaceKey="project"
        regionKey="room-list"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="mt-3"
      >
        Add a room
      </DocumentAction>
    );
  }

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cents = budget
      ? Math.round(parseFloat(budget.replace(/[^0-9.]/g, '')) * 100)
      : null;
    addRoom.mutate({
      name: trimmed,
      budgetCents: cents && cents > 0 ? cents : 0,
    });
    setName('');
    setBudget('');
    setOpen(false);
  };

  return (
    <div
      className="mt-3 flex items-center gap-2 border-b border-dashed border-[var(--color-pearl)] pb-1.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
        if (e.key === 'Enter') save();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Room name"
        className="min-w-0 flex-1 bg-transparent font-heading text-[13px] italic text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="allocation $"
        aria-label="Budget allocation (dollars)"
        className="w-24 bg-transparent text-right font-mono text-[9.5px] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <DocumentAction
        actionKey="add-project-room"
        surfaceKey="project"
        regionKey="room-capture"
        variant="secondary"
        onClick={save}
        disabled={!name.trim()}
      >
        Add
      </DocumentAction>
    </div>
  );
}

interface FFESectionProps {
  projectId: string;
  projectName?: string;
  mode: 'project' | 'install';
  /** Line hovered in the margin (§13 Slice 3 anchored highlight). */
  highlightId?: string | null;
  /** Slice 4 (R14): open the margin note composer pre-anchored to a line. */
  onAddNote?: (lineId: string) => void;
  /** R23/R24: which document section this table embodies — mounts The Work
   *  block + the section folio strip under the head when present. */
  sectionKey?: SectionKey | null;
  clientUserId?: string | null;
  clientName?: string;
  /** R24: files dropped anywhere on the section, caught by the folio. */
  folioDrop?: File[] | null;
  onFolioDropConsumed?: () => void;
  sectionDragOver?: boolean;
  /** W4b — the Worktable's Delivery table head carries the release leader, so
   *  this head demotes to its next verb rather than inking a second one. The
   *  ceremony is unmoved: selection, composition bar and review sheet stay
   *  here, because releasing is still the schedule's own act. */
  releaseLeaderElsewhere?: boolean;
  /** F34 — the document's ranked operational needs, so the head's leader can
   *  be the sharpest exception standing on the spread rather than a fixed
   *  verb. The page reads them once (`rankOperationalNeeds`) and hands them
   *  down; the section derives no need of its own. */
  needs?: readonly NeedLine[];
  /** W4b — whether the section has a release to offer, for a head that stands
   *  outside it. Reported, never asked for: `canRelease` and per-line
   *  eligibility are derived here and nowhere else. Pass a stable callback. */
  onReleaseOffered?: (offered: boolean) => void;
}

/**
 * The schedule, wrapped in its own ceremony. The provider is section-local by
 * design: releasing is the schedule's act, not the document's.
 */
export function FFESection(props: FFESectionProps) {
  const { data: instruments } = useProjectInstruments(props.projectId) as {
    data: InstrumentLike[] | undefined;
  };
  return (
    <ReleaseCeremonyProvider instruments={instruments ?? []}>
      <FFESectionBody {...props} instruments={instruments ?? []} />
    </ReleaseCeremonyProvider>
  );
}

function FFESectionBody({
  projectId,
  projectName = '',
  mode,
  highlightId = null,
  onAddNote = () => {},
  sectionKey = null,
  clientUserId = null,
  clientName = '',
  folioDrop = null,
  onFolioDropConsumed = () => {},
  sectionDragOver = false,
  releaseLeaderElsewhere = false,
  needs = [],
  onReleaseOffered,
  instruments,
}: FFESectionProps & { instruments: InstrumentLike[] }) {
  const { heldRoomId } = useRoomLens();
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [addLineRoom, setAddLineRoom] = useState<{
    id: string | null;
    name: string;
  } | null>(null);
  // withLifecycle: the line unfold draws R7's trail, which needs the PO's
  // delivered_date and payment rows. Opt-in so no other portal pays for it.
  const { data: items, isLoading, isError, refetch } = useProjectFFEItems(
    projectId,
    undefined,
    { withLifecycle: true },
  ) as {
    data: FFERow[] | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
  };
  const selectionIds = useMemo(
    () => (items ?? []).map((item) => String(item.id)),
    [items],
  );
  const readinessQuery = useProjectFfeReadiness(selectionIds);
  const readinessBySelection = useMemo(
    () => new Map((readinessQuery.data ?? []).map((row) => [row.selectionId, row])),
    [readinessQuery.data],
  );
  const { data: rooms } = useDocumentRooms(
    mode === 'project' ? projectId : null,
  );
  const { data: projectBoards = [] } = useProjectOwnedBoards(
    mode === 'project' ? projectId : null,
  );
  // R76 — per-line billing truth (00187 bridge). Invalidated by every invoice
  // mutation that moves money, so the stamps stay honest without a poll.
  const { data: coverage } = useFfeInvoiceCoverage(projectId);
  const authority = useProjectBillingAuthority(projectId);
  const { data: tradeScopes, isPending: tradeScopesPending } = useTradeScopes(
    projectId,
    mode === 'project',
  );
  // Whether a trade line's REAL progress is actually known right now.
  // `isPending` (not `isLoading`) also covers install mode, where the query
  // is disabled outright — a disabled query in TanStack v5 sits at
  // isPending:true / isLoading:false forever, so isLoading alone would miss
  // it and every trade line in install mode would keep reading a guessed
  // "Engaged" for good.
  const tradeProgressKnown = mode === 'project' && !tradeScopesPending;
  const ceremony = useReleaseCeremony();

  const instrumentIndex = useMemo(
    () => buildInstrumentIndex(instruments),
    [instruments],
  );
  // Act IV: a presence line names the trade scope it belongs to; the scope
  // carries the number the stamp says and the progress the logistics stamp
  // reads. One index, resolved once per render.
  const tradeIndex = useMemo(
    () => buildTradeScopeIndex(tradeScopes ?? []),
    [tradeScopes],
  );

  // A commercial job is one with an executed agreement behind it. Only there
  // does authorization gate a purchase order.
  const isCommercialOrigin = Boolean(authority.data);
  const showAuthorization =
    mode === 'project' && (isCommercialOrigin || instruments.length > 0);
  const canRelease =
    mode === 'project' &&
    Boolean(authority.data) &&
    RELEASING_AUTHORITY.has(String(authority.data?.state ?? ''));
  const selecting = ceremony?.phase === 'selecting';

  const rows: LineRow[] = (items ?? []).map((wireItem) => {
    const item = {
      ...wireItem,
      authoritative_readiness: readinessBySelection.get(String(wireItem.id)) ?? null,
    };
    const auth = deriveLineAuthorization(item, instrumentIndex);
    const tradeHold = deriveTradeLineHold(item, tradeIndex);
    return {
      item,
      stamp: deriveLineStamp(
        item,
        tradeHold.onTradeScope
          ? tradeProgressKnown
            ? (tradeHold.progressState as TradeLineProgress)
            : null
          : null,
      ),
      auth,
      eligible: eligibility(item, auth, tradeHold),
      tradeHold,
    };
  });
  const total = rows.length;
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const installed = rows.filter((r) => r.stamp.kind === 'installed').length;
  // The head act's own gate: canRelease is section-level (an executed
  // agreement stands behind the project), but that says nothing about
  // whether any INDIVIDUAL line can currently join a release. Aggregating
  // the same per-row eligibility() call every row already carries — no new
  // derivation.
  const anyEligible = rows.some((row) => row.eligible.eligible);
  // What a head outside this section may offer: an authority to release
  // against, a line that can actually go, and no ceremony already under way —
  // pressing a leader mid-selection would throw away the ticks in hand.
  const releaseOffered =
    canRelease && anyEligible && (ceremony?.phase ?? 'idle') === 'idle';
  useEffect(() => {
    onReleaseOffered?.(releaseOffered);
  }, [onReleaseOffered, releaseOffered]);
  // The head's leader is the release only while no other head has taken it —
  // and a head that is not printing it has not taken it. In the window where
  // an authority stands behind the project but no line can currently go, the
  // lift outside does not render (it is gated on `releaseOffered`), so the
  // entry stays here in the disabled form it has always worn, carrying its
  // "No lines are currently eligible" reason. Deleting it outright left the
  // verb — and the only account of why it cannot be pressed — nowhere.
  const releaseInHead =
    canRelease && (!releaseLeaderElsewhere || !releaseOffered);

  // R76 — what the section-level Bill act would carry: priced lines not yet
  // on a live invoice (the composer re-partitions; this is the offer).
  const billableUninvoiced = (items ?? []).filter((it) => {
    if (it.unit_price_cents === null || it.unit_price_cents === undefined)
      return false;
    const cov = coverage?.[it.id];
    return !cov || cov.coverage === 'uninvoiced';
  });

  const releaseLines: ReleaseLine[] = ceremony
    ? rows
        .filter((row) => ceremony.isSelected(row.item.id))
        .map((row) => ({
          id: row.item.id,
          name: row.item.name,
          roomId: row.item.project_room_id ?? null,
          roomName: row.item.room?.name ?? 'Throughout',
          quantity: row.item.quantity ?? 1,
          // The same predicate that decided eligibility (signableCents):
          // an allowance signs at its ceiling (budget_max_cents), not its
          // line total — so the figure a designer reviews here is the
          // figure that gets released and signed, never a lower one.
          clientLineTotalCents:
            signableCents(row.item) ?? row.item.line_total_cents ?? 0,
        }))
    : [];
  // Counted the way publish_budget_checkpoint counts, so the drift read on
  // the release sheet compares like with like.
  const currentScheduledCents = rows.reduce(
    (sum, row) => sum + scheduledContributionCents(row.item),
    0,
  );

  const meta =
    mode === 'install'
      ? total > 0
        ? `${installed} of ${total} installed`
        : ''
      : total > 0
        ? `${underway} of ${total} underway`
        : '';

  const sectionLabel = sectionKey
    ? sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)
    : mode === 'install'
      ? 'Install'
      : 'Project';

  const eligibleIds = (group: LineRow[]) =>
    group.filter((row) => row.eligible.eligible).map((row) => row.item.id);

  const lineProps = (row: LineRow) => ({
    ...row,
    projectId,
    projectName,
    // C-AF-03 — the margin's hover wins; otherwise the head's elected leader
    // points at the line it acts on.
    highlightId: highlightId ?? ffeLeader.highlightLineId,
    unfolded: openLineId === row.item.id,
    onToggle: () =>
      setOpenLineId(openLineId === row.item.id ? null : row.item.id),
    onAddNote,
    showRoom: !groupByRoom,
    coverage: coverage?.[row.item.id],
    showAuthorization,
    isCommercialOrigin,
    selecting: Boolean(selecting),
    selected: Boolean(ceremony?.isSelected(row.item.id)),
    onSelectToggle: () => ceremony?.toggleLine(row.item.id),
    onIncludeInRelease: () => {
      setOpenLineId(null);
      ceremony?.begin([row.item.id]);
    },
    canEditSelection: mode === 'project',
  });

  const roomHeadingProps = (group: LineRow[]) => {
    const ids = eligibleIds(group);
    return {
      showAuthorization,
      selecting: Boolean(selecting),
      roomState: ceremony?.roomState(ids) ?? ('none' as RoomTriState),
      onRoomToggle: (next: boolean) => ceremony?.setRoom(ids, next),
      eligibleCount: ids.length,
      selectedCount: ids.filter((id) => ceremony?.isSelected(id)).length,
    };
  };

  // R25 grouping (project mode): rooms in sort order, then Throughout.
  const groupByRoom = mode === 'project';
  const roomGroups = groupByRoom
    ? liftByRoom(
        (rooms ?? []).map((room) => ({
          room,
          rows: rows.filter((r) => r.item.project_room_id === room.id),
        })),
        heldRoomId,
        (group) => group.room.id,
      )
    : [];
  const throughout = groupByRoom
    ? rows.filter(
        (r) =>
          r.item.assignment_scope !== 'unassigned' &&
          (!r.item.project_room_id ||
            !(rooms ?? []).some((rm) => rm.id === r.item.project_room_id)),
      )
    : rows;
  const unassigned = groupByRoom
    ? rows.filter((r) => r.item.assignment_scope === 'unassigned')
    : [];

  const composition = releaseSummary(releaseLines);

  // The region head's fold (project mode only — install and the release
  // ceremony never fold). The default only settles once the schedule itself
  // has settled (not loading, not error); until then the latch holds
  // whatever is current rather than guessing.
  const ffeItemsSettled = !isLoading && !isError;
  const ffeDefaultFolded =
    mode === 'project' && ffeItemsSettled ? total === 0 : null;
  const ffeFold = useRegionFold({
    docId: projectId,
    region: 'ffe',
    defaultFolded: ffeDefaultFolded,
  });
  const ffeSetFolded = ffeFold.setFolded;
  const openFfeRegion = useCallback(() => {
    if (mode !== 'project') return;
    ffeSetFolded(false);
  }, [mode, ffeSetFolded]);
  useRegionUnfoldRequest('ffe', openFfeRegion);
  const ffeHeadingId = `ffe-region-heading-${projectId}`;
  const ffeMovementId = `ffe-movement-${projectId}`;
  const ffeBodyId = `ffe-region-body-${projectId}`;
  const ffeFolded = mode === 'project' && !selecting && ffeFold.folded;
  const wasFfeFolded = useRef(ffeFold.folded);
  useEffect(() => {
    if (wasFfeFolded.current && !ffeFold.folded) {
      focusRegionHeading(ffeHeadingId);
    }
    wasFfeFolded.current = ffeFold.folded;
  }, [ffeFold.folded, ffeHeadingId]);

  // The head counts what the body actually prints: the room groups PLUS the
  // Throughout and unassigned groups. Counting rooms alone told a project whose
  // every line is Throughout that it had "0 rooms · 12 lines" — a head arguing
  // with the section beneath it.
  const ffeGroupCount =
    roomGroups.length +
    (throughout.length > 0 ? 1 : 0) +
    (unassigned.length > 0 ? 1 : 0);
  const ffeGroupWord = ffeGroupCount === 1 ? 'group' : 'groups';
  const ffeAwaitingCount = rows.filter(
    (row) => row.auth.track === 'awaiting',
  ).length;
  const ffeCounts = `${ffeGroupCount} ${ffeGroupWord} · ${total} lines`;
  const ffeAwaiting =
    ffeAwaitingCount > 0
      ? `${ffeAwaitingCount} awaiting authorization`
      : null;
  // C20 — the head's identity line carries the trade word the studio word
  // leaves out, then the counts. Line one never elides (RegionHead).
  const ffeStatus = `the FF&E schedule, by room · ${ffeCounts}`;
  const ffeSeamSummary =
    total === 0
      ? `${ffeGroupCount} ${ffeGroupWord} · no lines yet`
      : ffeAwaiting
        ? `${ffeCounts} · ${ffeAwaiting}`
        : ffeCounts;

  // A line with no piece behind it is a line nobody has specified — the same
  // set the Add-to-project sheet already offers as placeholders.
  const unspecifiedLineIds = (items ?? [])
    .filter((it) => !it.product_id && it.removed_at == null)
    .map((it) => String(it.id));
  const uninvoicedLineIds = billableUninvoiced.map((it) => String(it.id));
  const ffeLeader = electFfeLeader({
    releaseLift: releaseInHead,
    needs,
    unspecifiedLineIds,
    uninvoicedLineIds,
  });

  const ffeAddToProjectEntry: RegionLedgerEntry = {
    key: 'open-add-to-project',
    label: 'Add a line',
    onClick: () => openAddToProject('section'),
  };
  const ffeReleaseEntry: RegionLedgerEntry = {
    key: 'release-for-authorization',
    label: 'Release for authorization',
    onClick: () => ceremony?.begin(),
    disabled:
      !isLoading &&
      !isError &&
      total > 0 &&
      !anyEligible &&
      !readinessQuery.isLoading &&
      !readinessQuery.isError,
  };
  // The one opener, reached at press time rather than at import time: a static
  // `./command-bar` import drags @patina/help-system's @portabletext ESM into
  // every suite that renders this section, which the jest transform cannot
  // load. A1 fixed the destinations: a claim carrying no line id lands on
  // receiving, an unanswered PO on the orders ledger.
  const openOrdersLedger = (page: 'receiving' | 'ledger') => {
    void import('./command-bar').then(({ openLedger }) =>
      openLedger('orders', { page, projectId }),
    );
  };
  const ffeClaimEntry: RegionLedgerEntry = {
    key: 'file-ffe-claim',
    label: 'File the claim',
    onClick: () => openOrdersLedger('receiving'),
  };
  const ffePoEntry: RegionLedgerEntry = {
    key: 'chase-ffe-po',
    label: 'Chase the PO',
    onClick: () => openOrdersLedger('ledger'),
  };
  const ffeBillEntry: RegionLedgerEntry | null =
    billableUninvoiced.length > 0
      ? {
          key: 'bill-project-ffe',
          // F08 — every invoice door but the Money region's names its scope.
          label: `Bill ${billableUninvoiced.length} uninvoiced ${
            billableUninvoiced.length === 1 ? 'line' : 'lines'
          }`,
          variant: 'secondary',
          trailing: '→',
          onClick: () =>
            openInvoiceComposer({
              projectId,
              initialFfeItemIds: billableUninvoiced.map(
                (it) => it.id as string,
              ),
            }),
        }
      : null;
  const ffeSpecBookEntry: RegionLedgerEntry = {
    key: 'open-spec-book',
    // F48's sibling: one spec-book door, naming its scope when it has one.
    label:
      unspecifiedLineIds.length > 0
        ? `Spec the ${unspecifiedLineIds.length} unspecified`
        : 'Spec book',
    href: `/doc/${projectId}/spec-book`,
    variant: 'tertiary',
    trailing: '→',
  };

  const ffeEntryByKind: Record<FfeLeaderKind, RegionLedgerEntry | null> = {
    release: releaseInHead ? ffeReleaseEntry : null,
    claim: ffeLeader.exceptions.some((e) => e.kind === 'claim')
      ? ffeClaimEntry
      : null,
    po: ffeLeader.exceptions.some((e) => e.kind === 'po') ? ffePoEntry : null,
    spec: ffeSpecBookEntry,
    bill: ffeBillEntry,
    'add-line': ffeAddToProjectEntry,
  };
  // The ledger's ORDER is its hierarchy, and index 0 is the elected leader.
  const FFE_LEDGER_ORDER: readonly FfeLeaderKind[] = [
    'release',
    'claim',
    'po',
    'add-line',
    'bill',
    'spec',
  ];
  const ffeLedger: RegionLedgerEntry[] = [
    ffeEntryByKind[ffeLeader.kind] ?? ffeAddToProjectEntry,
    ...FFE_LEDGER_ORDER.filter((kind) => kind !== ffeLeader.kind)
      .map((kind) => ffeEntryByKind[kind])
      .filter((entry): entry is RegionLedgerEntry => entry !== null),
  ];
  const ffeExceptions = [
    ...ffeLeader.exceptions.map((exception) => exception.text),
    ...(ffeAwaiting ? [ffeAwaiting] : []),
  ];

  return (
    <section
      id="project-ffe"
      // The index's root for this region on EVERY spread that prints it. The
      // install and care spreads pass mode="install", so gating it on
      // `groupByRoom` left their index row pointing at nothing.
      data-index-region="ffe"
      className="scroll-mt-16"
    >
      {mode === 'install' || selecting ? (
        <div className="mb-1.5 mt-5 flex items-baseline justify-between gap-3">
          {/* This branch and the RegionHead below are mutually exclusive, so
              the region's heading id is carried by exactly one of them. */}
          <h2
            id={ffeHeadingId}
            tabIndex={-1}
            className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]"
          >
            {selecting
              ? 'Choose what to release'
              : mode === 'install'
                ? sectionKey === 'care'
                  ? 'Care'
                  : 'Install'
                : 'Pieces'}
          </h2>
          <span className="flex items-baseline gap-3">
            {!selecting && meta && (
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {meta}
              </span>
            )}
            {selecting ? (
              <DocumentAction
                actionKey="put-back-release-ceremony"
                surfaceKey="project"
                regionKey="ffe-head"
                variant="tertiary"
                onClick={() => ceremony?.putBack()}
              >
                Put back · Esc
              </DocumentAction>
            ) : (
              <>
                <Link
                  href={`/doc/${projectId}/spec-book`}
                  className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:text-[var(--color-charcoal)]"
                >
                  Spec book →
                </Link>
                {/* Add to project and Release for authorization are project-
                    mode acts, and project mode (not selecting) now renders
                    RegionHead below instead of this block — so both are
                    unreachable here and, per the I91 hierarchy contract
                    (adopting region-head forbids a hand-spelled `primary` in
                    this file), no longer hand-spelled here at all. */}
                {/* R76 — bill the schedule: the composer opens FF&E-prefilled
                    with every uninvoiced priced line ticked (untick there to
                    narrow). */}
                {billableUninvoiced.length > 0 && (
                  <DocumentAction
                    actionKey="bill-project-ffe"
                    surfaceKey="project"
                    regionKey="ffe-head"
                    variant={canRelease ? 'secondary' : 'primary'}
                    onClick={() =>
                      openInvoiceComposer({
                        projectId,
                        initialFfeItemIds: billableUninvoiced.map(
                          (it) => it.id as string,
                        ),
                      })
                    }
                  >
                    Bill {billableUninvoiced.length} uninvoiced
                  </DocumentAction>
                )}
                {/* Release for authorization is a project-mode act (canRelease
                    itself requires mode === 'project'); this branch only ever
                    reaches install mode, where it is unreachable — RegionHead
                    below carries it for project mode instead. */}
              </>
            )}
          </span>
        </div>
      ) : (
        <>
          <RegionRule className="mt-5" />
          {ffeFold.folded ? (
            <FoldSeam
              headingId={ffeHeadingId}
              bodyId={ffeBodyId}
              name="Pieces"
              summary={ffeSeamSummary}
              onUnfold={() => ffeFold.setFolded(false)}
              surfaceKey="project"
              regionKey="ffe"
            />
          ) : (
            <div className="mb-1.5">
              <RegionHead
                headingId={ffeHeadingId}
                name="Pieces"
                status={ffeStatus}
                exceptions={ffeExceptions}
                surfaceKey="project"
                regionKey="ffe"
                actions={ffeLedger}
                bodyId={ffeBodyId}
                onFold={() => ffeFold.setFolded(true)}
              />
            </div>
          )}
        </>
      )}

      {!ffeFolded && (
      <div id={ffeBodyId}>
      {/* The release gate reads authoritative readiness and stays closed
          without it — so a pending or failed read has to say so, or the act
          would simply be missing with no reason given. */}
      {mode === 'project' && readinessQuery.isError && (
        <div className="mb-2">
          <p role="alert" className="text-[11.5px] text-[var(--color-terracotta-ink)]">
            Release readiness could not be read, so no line can be released yet.
          </p>
          <DocumentAction
            actionKey="retry-ffe-readiness"
            surfaceKey="project"
            regionKey="ffe-readiness-error"
            variant="secondary"
            onClick={() => void readinessQuery.refetch()}
          >
            Try again
          </DocumentAction>
        </div>
      )}

      {mode === 'project' && !readinessQuery.isError && readinessQuery.isLoading && (
        <SectionLoadingLine label="Checking readiness" className="mb-2" />
      )}

      {/* The head button stays visible (never vanishes on the designer) but
          disables itself when canRelease holds and yet no individual line
          is currently eligible — say so here instead of a silent no-op.
          Per-row reasons remain reachable via each row's own unfold. */}
      {mode === 'project' &&
        canRelease &&
        !isLoading &&
        !isError &&
        total > 0 &&
        !anyEligible &&
        !readinessQuery.isLoading &&
        !readinessQuery.isError && (
          <p className="mb-2 text-[11.5px] text-[var(--text-muted)]">
            No lines are currently eligible for release.
          </p>
        )}

      {selecting && (
        <p className="mb-2 text-[11.5px] text-[var(--text-muted)]">
          Tick the lines the client is being asked to authorize. Prices lock
          when you release.
        </p>
      )}

      {/* R23: the quiet work block under the section head. */}
      {sectionKey && !selecting && (
        <WorkBlock
          projectId={projectId}
          sectionKey={sectionKey}
          sectionLabel={sectionLabel}
          clientUserId={clientUserId}
          clientName={clientName}
        />
      )}

      {/* R24: the section's folio strip — drops on the section land here. */}
      {sectionKey && !selecting && (
        <FolioStrip
          projectId={projectId}
          anchor={{ kind: 'section', sectionKey }}
          droppedFiles={folioDrop}
          onDropConsumed={onFolioDropConsumed}
          sectionDragOver={sectionDragOver}
        />
      )}

      {isLoading && <SectionLoadingLine label="Reading the schedule" className="py-3" />}

      {!isLoading && isError && (
        <div className="border-t border-[var(--color-pearl)] py-3">
          <p role="alert" className="text-[11.5px] text-[var(--color-terracotta-ink)]">
            The FF&amp;E schedule could not be read.
          </p>
          <DocumentAction
            actionKey="retry-ffe-schedule"
            surfaceKey="project"
            regionKey="ffe-query-error"
            variant="secondary"
            onClick={() => void refetch()}
          >
            Try again
          </DocumentAction>
        </div>
      )}

      {!isLoading && !isError && total === 0 && (
        mode === 'project' ? (
          <GuidedEmptyState
            title="Build the FF&E schedule"
            description="Add the pieces and allowances the studio will specify, price, authorize, procure, and install."
            inputs={['Room', 'Piece or allowance', 'Budget']}
            action={{ key: 'start-ffe-schedule', label: 'Open the spec book', href: `/doc/${projectId}/spec-book` }}
          />
        ) : (
          <p className="border-t border-[var(--color-pearl)] py-3 text-[11.5px] text-[var(--text-muted)]">
            {sectionKey === 'care'
              ? 'No FF&E lines remain open for care.'
              : 'No FF&E lines are scheduled for installation.'}
          </p>
        )
      )}

      {groupByRoom ? (
        <>
          {roomGroups.map(({ room, rows: roomRows }) => (
            <div
              key={room.id}
              className={room.id === heldRoomId ? 'doc-room-lifted' : undefined}
            >
              <RoomHeading
                name={room.name}
                roomId={room.id}
                budgetCents={room.budget_cents}
                rows={roomRows}
                onAddLine={() =>
                  setAddLineRoom({ id: room.id, name: room.name })
                }
                {...roomHeadingProps(roomRows)}
              />
              <ul>
                {roomRows.map((row) => (
                  <FFELine key={row.item.id} {...lineProps(row)} />
                ))}
              </ul>
            </div>
          ))}
          {throughout.length > 0 && (
            <div>
              <RoomHeading
                name="Throughout"
                budgetCents={0}
                rows={throughout}
                onAddLine={() =>
                  setAddLineRoom({ id: null, name: 'Throughout' })
                }
                {...roomHeadingProps(throughout)}
              />
              <ul>
                {throughout.map((row) => (
                  <FFELine key={row.item.id} {...lineProps(row)} />
                ))}
              </ul>
            </div>
          )}
          {unassigned.length > 0 && (
            <div>
              <RoomHeading
                name="Not in a room yet"
                budgetCents={0}
                rows={unassigned}
                onAddLine={() =>
                  setAddLineRoom({ id: null, name: 'Not in a room yet' })
                }
                {...roomHeadingProps(unassigned)}
              />
              <ul>
                {unassigned.map((row) => (
                  <FFELine key={row.item.id} {...lineProps(row)} />
                ))}
              </ul>
            </div>
          )}
          {!selecting && <AddRoomInline projectId={projectId} />}
        </>
      ) : (
        <>
          {/* The movement column — the lines as they arrive. The install
              stage's act lands here rather than on the section's first inch. */}
          <ul id={ffeMovementId} tabIndex={-1} className="scroll-mt-16">
            {rows.map((row) => (
              <FFELine key={row.item.id} {...lineProps(row)} />
            ))}
          </ul>
        </>
      )}
      </div>
      )}

      {/* The bar counts what is held, under the schedule, while choosing. */}
      {ceremony && selecting && composition.lineCount > 0 && (
        <CompositionBar
          projectId={projectId}
          lines={releaseLines}
          onReview={ceremony.review}
          onPutBack={ceremony.putBack}
        />
      )}

      {ceremony && ceremony.phase === 'reviewing' && (
        <ReviewReleaseSheet
          open
          projectId={projectId}
          projectName={projectName}
          clientName={clientName}
          instrumentNumber={ceremony.provisionalNumber}
          lines={releaseLines}
          currentScheduledCents={currentScheduledCents}
          onClose={ceremony.backToSelecting}
          onReleased={ceremony.putBack}
        />
      )}

      {addLineRoom && (
        <AddLineSheet
          open
          projectId={projectId}
          roomId={addLineRoom.id}
          roomName={addLineRoom.name}
          onClose={() => setAddLineRoom(null)}
        />
      )}
      {mode === 'project' && (
        <AddToProjectSheet
          projectId={projectId}
          projectName={projectName}
          rooms={(rooms ?? []).map((room) => ({ id: room.id, name: room.name }))}
          boards={projectBoards}
          placeholders={(items ?? [])
            .filter((item) => !item.product_id && item.removed_at == null)
            .map((item) => ({ id: item.id, name: item.name }))}
        />
      )}
    </section>
  );
}
