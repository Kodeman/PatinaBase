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
import { useQueryClient } from '@tanstack/react-query';
import {
  useFfeInvoiceCoverage,
  useProjectFFEItems,
  useProjectFfeReadiness,
  useProjectOwnedBoards,
  useProjectPoCostLines,
  useProcurementDrafts,
  useRecordFfeInstalled,
  useStudioPurchases,
  useUnresolvedProcurementExceptions,
  type FfeItemCoverage,
  type StudioPurchaseRow,
} from '@patina/supabase';
import { exceptionsForLine, isClaimType } from './buying/exceptions';
import { openInvoiceComposer } from './accounts/invoice-overlays';
import { purchaseForLine } from './purchases/purchase-record';
import {
  purchasesBillArgs,
  ridersBillArgs,
  unbilledPurchases,
  unbilledRiders,
} from '@/lib/document/invoice-composer';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import type { FfeAssignmentScope, FFEStageKey } from '@patina/types';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  deriveLineStamp,
  isLaborLine,
  LABOR_STAMP_LABEL,
  laborPiece,
  lineStageInputFromRow,
  lineStampLabel,
  priceWord,
  type LineStamp,
  type TradeLineProgress,
} from '@/lib/document/stamp-derivation';
import {
  buildInstrumentIndex,
  buildTradeScopeIndex,
  deriveLineAuthorization,
  deriveOrderReadiness,
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
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import {
  DEFAULT_CURRENCY,
  formatCurrencyTotal,
  formatMoney,
  isMixed,
  rowCurrency,
  sumByCurrency,
} from '@/lib/currency-totals';
import { Stamp, type StampTone } from './stamp';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';
import { LineUnfold } from './line-unfold';
import { ChangeOrderSheet } from './line-unfold/change-order';
import { makerLandingPending } from './line-unfold/the-buy-cell';
import { recordPaymentOpener } from './line-unfold/record-payment';
import { canSend } from './line-unfold/next-act';
import {
  openRecordAChange,
  RECORD_A_CHANGE_ON_PIECE_EVENT,
  type RecordAChangeOnPieceDetail,
} from './overlays/record-a-change-sheet';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  ACT_LANDING_EVENTS,
  NAMED_ACTS,
  needActLabel,
  ownAct,
  type FfeActLanding,
  type FfeActLandingDetail,
  type OwnActFacts,
} from '@/lib/document/act-names';
import { isUnansweredPo } from '@/lib/document/po-silences';
import { StrataMark } from './strata-mark';
import { StrataMiniRule } from './strata-mini-rule';
import { WorkBlock } from './work-block';
import {
  useSectionGates,
  useSectionLoggedMinutes,
  useSectionTasks,
} from '@/hooks/use-section-work';
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
import { ConceptRenderUpload } from './rooms/concept-render-upload';
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
import { MakerReading, ReadingLens } from './buying/maker-reading';
import { NextActReading } from './buying/next-act-reading';
import { InstallManifest } from './buying/install-manifest';
import { AskMakerSheet, InstallReadingLine } from './overlays/ask-maker-sheet';
import { CareClosedLine } from './quiet-sections';
import type { BuyingReading } from '@/lib/document/buying-readings';
import {
  STATE_WORDS,
  isPieceHere,
  pieceInstallState,
  type PieceInstallState,
} from '@/lib/document/install-state';
import {
  LIVE_MAKER_ASK_STATUSES,
  isMakerNoteKind,
  lineMaker,
} from '@/lib/document/install-reading';
import { useRegionUnfoldRequest } from '@/hooks/use-region-unfold';
import {
  FOCUS_FFE_LINE_EVENT,
  LAND_RECORD_PAYMENT_EVENT,
  focusFfeLinePending,
  recordPaymentPending,
  type FocusFfeLineRequest,
  type RecordPaymentLanding,
} from '@/lib/document/registry';
import { useLensDensityStore } from '@/hooks/use-lens-density';
import {
  piecesQuietStatus,
  quietStateSentence,
} from '@/lib/document/lens-quiet-status';

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
    // US-21 D1 (Q3): not machine stages, so not in STAGE_CONFIG. They keep
    // the pre-order outline of the word they replace.
    case 'placeholder':
    case 'specced':
    case 'ready':
    case 'released':
      return { label, color: STAGE_CONFIG.specified.color };
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

/** The Life Review's stamp contract (Lane 1, `stamp.tsx`), as amended by S5.
 *  A fill is a RULED recipe, not a default: four states carry one, and a kind
 *  with no ruled fill keeps the outline rather than borrowing another state's
 *  pigment. Money committed and goods arrived are two different answers to
 *  "where is this piece", so they do not share a plate — the earlier collapse
 *  showed delivered and installed lines wearing ORDERED's clay.
 *
 *  `null` means outline: specified, quoted, approved, partial (delivered but
 *  inspected short — an open question, not an arrival) and every trade-* kind,
 *  whose journey is judged work rather than logistics. */
function ffeStampTone(kind: LineStamp['kind']): StampTone | null {
  switch (kind) {
    case 'ordered':
    case 'production':
    case 'shipped':
      return 'ordered';
    case 'received':
    case 'delivered':
    case 'installed':
      return 'delivered';
    case 'decision_due':
      return 'decision';
    case 'damaged':
      return 'damaged';
    default:
      return null;
  }
}

/** The hover wash takes the same three-way split, in the wash's own
 *  vocabulary (FINAL.md §1/§2: golden for decision due, terracotta for
 *  damaged/claim, clay everywhere else — including no state at all). */
function ffeWashTone(kind: LineStamp['kind']): RowWashTone {
  if (kind === 'decision_due') return 'golden';
  if (kind === 'damaged') return 'terracotta';
  return 'clay';
}

/** A non-empty product image URL off the already-joined `product.images`
 *  (`useProjectFFEItems`'s `.select()` joins `product:products!product_id(id,
 *  name, images, brand)` — no hook change needed, see build/00-seams-b). */
function ffeThumbSrc(item: FFERow): string | null {
  const src = item.product?.images?.[0];
  return typeof src === 'string' && src.length > 0 ? src : null;
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

/** D5 / R35 — the order a change order can be raised against: any PO but a
 *  cancelled one. A line without one has no change order to open. */
function livePurchaseOrder(item: FFERow) {
  const po = item.purchase_order ?? null;
  return po && po.status !== 'cancelled' ? po : null;
}

/** What `ownAct` reads where the head supplies only its own count. */
const OWN_ACT_NO_FACTS: OwnActFacts = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
};

/** D5 (US-19): the Pieces head's `Record a change` ledger key. */
const PIECES_RECORD_A_CHANGE_KEY = 'record-a-change-pieces-head';

/** F13 / R12: on Install the procurement status (`status`) is a fact in this
 *  line, not a second stamp beside the row's state word. */
function vendorLine(
  item: FFERow,
  stamp: LineStamp,
  showRoom = false,
  status: string | null = null,
): string {
  const parts: string[] = [];
  // R42: the one maker selector the ask sheet and its route print too.
  const maker = lineMaker(item);
  if (maker) parts.push(maker);
  if (showRoom && item.room?.name) parts.push(item.room.name);
  if (status) parts.push(status);
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

/** D5 (US-19): the unfolded line's first act. It only opens the router, naming
 *  this line, so the router skips its question and goes to the line's own
 *  destination. It sits beside LineUnfold, so it declares its own region. */
function RecordChangeLineAct({ itemId }: { itemId: string }) {
  return (
    <DocumentAction
      actionKey="record-a-change-line"
      surfaceKey="project"
      regionKey="ffe-line-record-change"
      variant="secondary"
      className="mt-1"
      onClick={() => openRecordAChange({ origin: 'line', itemId })}
    >
      {NAMED_ACTS.recordChange}
    </DocumentAction>
  );
}

/** Reads a flag (`ask-the-paper`, `one-voice`) in its own leaf: the flag
 *  hook's loading settle is a state change, and in the schedule's body it
 *  would re-render every line. Here only a changed value reaches the schedule. */
function FlagProbe({
  flag,
  onValue,
}: {
  flag: 'ask-the-paper' | 'one-voice';
  onValue: (on: boolean) => void;
}) {
  const on = useFeatureFlag(flag).value === true;
  useEffect(() => onValue(on), [on, onValue]);
  return null;
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
  selectLabel,
  onIncludeInRelease,
  canEditSelection,
  showArtifactPlate,
  purchase,
  installState,
  recordChange = false,
  damageStamp = false,
}: LineRow & {
  /** FR2 508-3 (`one-voice`): on Install, a damaged row's one stamp is
   *  DAMAGED and the state word yields. */
  damageStamp?: boolean;
  /** D5 (US-19): the unfolded line leads with `Record a change`. */
  recordChange?: boolean;
  /** C-25: the purchase record the line was bought on, if any. */
  purchase?: StudioPurchaseRow | null;
  /** 0a-2 (D6): Install's per-row state word, from `pieceInstallState`. */
  installState?: PieceInstallState;
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
  /** The tick's accessible name — what ticking this line will do. */
  selectLabel: string;
  onIncludeInRelease: () => void;
  canEditSelection: boolean;
  showArtifactPlate: boolean;
}) {
  const sp = stampProps(stamp);
  // FR2 508-3 (`one-voice`): damage is the row's exception, so on a damaged
  // Install row DAMAGED is the one stamp and the state word yields.
  const damageIsTheStamp = Boolean(damageStamp && installState && stamp.kind === 'damaged');
  // F13 / R12: on Install the state word is the row's only stamp.
  const line = vendorLine(
    item,
    stamp,
    showRoom,
    installState && stamp.kind !== 'trade_pending' && !damageIsTheStamp ? sp.label : null,
  );
  const billing = coverageNote(item, coverage);
  // US-21 fix-now #5: a rough line reads `Not priced`, never `$0`, and an
  // allowance with no figure of its own prints its ceiling, the figure it
  // signs at (signableCents), rather than `$0`.
  const allowanceCents =
    item.item_type === 'allowance' && !(item.line_total_cents > 0)
      ? signableCents(item)
      : null;
  const price =
    priceWord(item) ??
    (allowanceCents != null
      ? formatMoney(allowanceCents, rowCurrency(item))
      : item.line_total_cents != null
        ? formatMoney(item.line_total_cents, rowCurrency(item))
        : '—');
  const thumbSrc = ffeThumbSrc(item);
  const washTone = ffeWashTone(stamp.kind);
  const tone = ffeStampTone(stamp.kind);
  const rowWash = useRowWash();

  const body = (
    <>
      <div className="flex items-center gap-3.5">
        {installState &&
          (damageIsTheStamp ? (
            <span
              data-install-state={installState}
              data-install-stamp="damaged"
              className="w-[68px] shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: sp.ink }}
            >
              {sp.label}
            </span>
          ) : (
            <span
              data-install-state={installState}
              className="w-[68px] shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
            >
              {STATE_WORDS[installState]}
            </span>
          ))}
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-[3px] border border-[var(--doc-ink-border)] object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="h-12 w-12 shrink-0 rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-rail-stock)]"
            style={{
              backgroundImage:
                'linear-gradient(to top right, transparent calc(50% - 0.5px), var(--doc-ink-border) calc(50% - 0.5px), var(--doc-ink-border) calc(50% + 0.5px), transparent calc(50% + 0.5px))',
            }}
          />
        )}
        <div>
          <p className="row-wash-score text-[12.5px] font-medium leading-snug text-[var(--color-charcoal)]">
            {item.name}
            {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
          </p>
          {line && (
            <p className="mt-px text-[11px] text-[var(--text-muted)]">{line}</p>
          )}
          {/* R76: the coverage stamp — the 00187 bridge's per-line truth. */}
          {billing && (
            <p
              className="mt-px font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ color: billing.color }}
            >
              {billing.text}
            </p>
          )}
          {/* R38: the quiet, honest footprint of a piece the Engine placed. */}
          {item.added_via === 'engine' && (
            <p className="mt-px font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] opacity-70">
              — matched by eye
            </p>
          )}
        </div>
      </div>
      {/* Ineligibility is a reason, not a refusal — lowercase mono, exactly
          where the logistics stamp sits. */}
      {selecting && !eligible.eligible ? (
        <span className="whitespace-nowrap font-mono text-[11px] lowercase tracking-[0.04em] text-[var(--text-muted)]">
          {eligible.reason}
        </span>
      ) : installState ? (
        // The status moved into the detail line; the empty cell keeps the
        // grid's stamp track so the price stays in its column.
        <span aria-hidden />
      ) : stamp.kind === 'trade_pending' ? null : isLaborLine(item) ? (
        // US-21 D1: LABOR beside the stage word, never instead of it; one
        // cell, so the price keeps its column.
        <span className="inline-flex items-center gap-1.5">
          <Stamp label={LABOR_STAMP_LABEL} color={STAGE_CONFIG.specified.color} />
          <Stamp
            label={sp.label}
            color={sp.color}
            ink={sp.ink}
            {...(tone ? ({ variant: 'filled', tone } as const) : {})}
          />
        </span>
      ) : (
        <Stamp
          label={sp.label}
          color={sp.color}
          ink={sp.ink}
          {...(tone ? ({ variant: 'filled', tone } as const) : {})}
        />
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
  } ${item.id === highlightId ? 'bg-[rgba(196,165,123,0.08)]' : ''}`;

  return (
    <li
      id={`ffe-selection-${item.id}`}
      className="has-wash scroll-mt-24 border-b border-[var(--color-pearl)]"
      onPointerMove={rowWash.onPointerMove}
      onPointerEnter={rowWash.onPointerEnter}
    >
      <RowWash tone={washTone} />
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
            aria-label={selectLabel}
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
      {unfolded && !selecting && (
        <>
          {recordChange && <RecordChangeLineAct itemId={String(item.id)} />}
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
            showArtifactPlate={showArtifactPlate}
            purchase={purchase}
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
  heldRoomId,
  toggleRoom,
  oneVoice = false,
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
  heldRoomId: string | null;
  toggleRoom: (roomId: string) => void;
  /** US-19 FR3 F3-20 — counts, never `N of M`. */
  oneVoice?: boolean;
}) {
  // SQ-207 — each figure is one currency's sum, or the mixed-currency note.
  const lineTotals = (subset: LineRow[]) =>
    formatCurrencyTotal(
      sumByCurrency(
        subset.map((r) => r.item as FFERow),
        (item) => item.line_total_cents ?? 0,
      ),
    );
  const committed = lineTotals(rows.filter((r) => COMMITTED.has(r.stamp.kind)));
  const underway = rows.filter((r) => UNDERWAY.has(r.stamp.kind)).length;
  const state = deriveRoomState(rows.map((r) => roomStateRowFromStamp(r.stamp)));

  const released = lineTotals(rows.filter((r) => r.auth.track !== 'none'));
  const notYet = lineTotals(rows.filter((r) => r.auth.track === 'none'));

  // R33 F5 — one schedule, one vocabulary: rooms speak the section's word.
  // "Placed" retires until it can truthfully mean installed.
  // FR3 F3-20 / 515-6 (`one-voice`): a count of what is beneath, never `N of
  // M`; `committed $X of $Y` is a money figure and stays.
  const meta = selecting
    ? oneVoice
      ? `${selectedCount} ticked`
      : `${selectedCount} of ${eligibleCount}`
    : [
        budgetCents > 0
          ? `committed ${committed} of ${fmtUsd(budgetCents)}`
          : null,
        rows.length > 0
          ? oneVoice
            ? `${underway} underway`
            : `${underway} of ${rows.length} underway`
          : 'no lines yet',
        showAuthorization && rows.length > 0
          ? `${released} released · ${notYet} not yet`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  // R25+lens — outside bulk-selection, the heading itself is the room's
  // press target: pressing it takes the room in hand (the ticket's chip
  // carries the identical contract). "Throughout" and unassigned lines carry
  // no roomId, so there is no room to hold — they stay a plain heading.
  const held = roomId != null && roomId === heldRoomId;
  const pressable = !selecting && roomId != null;
  const headingChildren = (
    <>
      {selecting ? (
        <TriStateTick
          state={roomState}
          label={`Include every eligible line in ${name}`}
          onChange={onRoomToggle}
        />
      ) : (
        <StrataMark size="sm" state={state} />
      )}
      <h3
        className={`font-heading text-[13.5px] font-medium italic text-[var(--color-charcoal)] ${
          held ? 'font-semibold' : ''
        }`}
      >
        {name}
      </h3>
      <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {meta}
      </span>
    </>
  );

  return (
    <div
      id={roomId ? `doc-room-${roomId}` : undefined}
      className="mt-[12px] scroll-mt-16"
    >
      {pressable ? (
        <button
          type="button"
          data-room-chip={roomId}
          aria-pressed={held}
          onClick={() => toggleRoom(roomId as string)}
          className="flex min-h-11 w-full items-baseline gap-2.5 pb-1 text-left underline-offset-4 hover:underline hover:decoration-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          {headingChildren}
        </button>
      ) : (
        <div className="flex min-h-11 items-baseline gap-2.5 pb-1">
          {headingChildren}
        </div>
      )}
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
        className="w-24 bg-transparent text-right font-mono text-[11px] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"
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

/**
 * C-04 (D1-09): install day, several pieces at once. The bar mounts only
 * while choosing, so the mutation lives with the act that needs it. The day
 * is today; a different day is the line unfold's act.
 */
function InstallSelectionBar({
  projectId,
  itemIds,
  onDone,
  onPutBack,
}: {
  projectId: string;
  itemIds: string[];
  onDone: () => void;
  onPutBack: () => void;
}) {
  const qc = useQueryClient();
  const record = useRecordFfeInstalled({ errorSurface: 'inline' });
  const [failed, setFailed] = useState(false);
  const count = itemIds.length;

  const run = () => {
    if (record.isPending || count === 0) return;
    setFailed(false);
    record
      .mutateAsync({ projectId, itemIds, installedOn: todayYmd() })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['document-state'] });
        onDone();
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-3 border-t border-[var(--color-pearl)] pt-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {count === 0
          ? 'None ticked'
          : `${count} ${count === 1 ? 'piece' : 'pieces'} ticked`}
      </span>
      {count > 0 && (
        <DocumentAction
          actionKey="mark-ffe-lines-installed"
          surfaceKey="project"
          regionKey="ffe-install-bar"
          variant="secondary"
          loading={record.isPending}
          loadingLabel="Saving…"
          onClick={run}
        >
          Mark {count} installed
        </DocumentAction>
      )}
      <DocumentAction
        actionKey="put-back-ffe-install-selection"
        surfaceKey="project"
        regionKey="ffe-install-bar"
        variant="tertiary"
        disabled={record.isPending}
        onClick={onPutBack}
      >
        Put back
      </DocumentAction>
      {failed && (
        <p role="alert" className="w-full text-[11px] text-[var(--color-terracotta-ink)]">
          Couldn&rsquo;t save
        </p>
      )}
    </div>
  );
}

interface FFESectionProps {
  projectId: string;
  projectName?: string;
  mode: 'project' | 'install';
  /** Line hovered in the margin (§13 Slice 3 anchored highlight). */
  highlightId?: string | null;
  /** A document deep link may ask for one Piece to arrive unfolded. */
  requestedLineId?: string | null;
  /** Fired once the requested Piece has been unfolded, so the page can drop
   *  the request rather than let it re-assert on every refetch. */
  onRequestedLineConsumed?: () => void;
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
  /** US-19 FR3 F3-10 — the project's status (`on_hold` holds the head's
   *  leader to the own act). Undefined keeps today's head. */
  projectStatus?: string | null;
}

// ── A need's act lands on its line (US-19 F3-2, P-2) ─────────────────────────

/** The line an act lands on, in the schedule's own order. */
export function ffeActLine<
  T extends {
    removed_at?: string | null;
    product_id?: string | null;
    item_claims?: readonly { state: string }[] | null;
    purchase_order?: {
      sent_at?: string | null;
      acknowledged_at?: string | null;
      status?: string | null;
    } | null;
  },
>(items: readonly T[], act: Exclude<FfeActLanding, 'open' | 'release'>): T | null {
  const live = items.filter((item) => item.removed_at == null);
  if (act === 'claim') {
    return (
      live.find((item) =>
        (item.item_claims ?? []).some(
          (claim) => claim.state === 'drafted' || claim.state === 'vendor_notified',
        ),
      ) ?? null
    );
  }
  // A line with no piece behind it is the one nobody has specified.
  if (act === 'spec') return live.find((item) => !item.product_id) ?? null;
  // R18: a drafted PO never sent is the one Send is offered on.
  if (act === 'send') return live.find((item) => canSend(item.purchase_order ?? null)) ?? null;
  // The rule the Desk's `po_unacknowledged` counts by (00590), shared with
  // the per-PO silences (F9-1) — the oldest first.
  const unanswered = live.filter((item) => isUnansweredPo(item.purchase_order));
  return (
    [...unanswered].sort((a, b) =>
      String(a.purchase_order?.sent_at).localeCompare(String(b.purchase_order?.sent_at)),
    )[0] ?? null
  );
}

/** The control each landing focuses: a line's, inside its unfold, or (for
 *  `release`) the Pieces head's own entry or, lifted, the lift's (F6-2). */
const FFE_ACT_CONTROL = {
  claim:
    '[data-action-key="notify-vendor-of-ffe-claim"], [data-action-key="open-resolve-ffe-claim"]',
  send: '[data-action-key="send-ffe-line-to-vendor"]',
  spec: '[data-action-key="edit-ffe-line-spec-details"]',
  release: '[data-action-key="release-for-authorization"]',
} as const;

/**
 * Land focus on a control once it is on the page (L-10). The region and the
 * line mount a frame or two after the press, so it waits up to a second.
 */
function landOnControl(find: () => HTMLElement | null | undefined): void {
  let waited = 0;
  const land = () => {
    const control = find();
    if (!control) {
      if (waited++ < 60) requestAnimationFrame(land);
      return;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    control.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    control.focus({ preventScroll: true });
  };
  requestAnimationFrame(() => requestAnimationFrame(land));
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
  requestedLineId = null,
  onRequestedLineConsumed = () => {},
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
  projectStatus = null,
  instruments,
}: FFESectionProps & { instruments: InstrumentLike[] }) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  // US-19 FR4 Fix 6 (520-2): the line `Follow up with the maker` opened the
  // maker composer on.
  const [followUpLineId, setFollowUpLineId] = useState<string | null>(null);
  // D5 (US-19): the Record a change router's `On a piece` destination — the
  // `Choose the piece` prompt, and the line whose change order it opened.
  const [askThePaper, setAskThePaper] = useState(false);
  // US-19 D1 (`one-voice`) — the head's act names and the region's printed
  // name come from the one table.
  const [oneVoice, setOneVoice] = useState(false);
  // FR2 508-1/508-2 (`one-voice`): the heads print `Record a change` on every
  // spread whatever ask-the-paper says, so the router's `On a piece` lands too.
  const recordChangeAtHead = askThePaper || oneVoice;
  // FR4 Fix 10 (`one-voice`): the Install region has one leader, the reading
  // line's act. The title row's bill act prints tertiary and the empty
  // states' `Add the first task` and `+ File` print secondary beside it.
  const installOneLeader = oneVoice && mode === 'install' && sectionKey !== 'care';
  // FR7 F7-7 (538 Q5, `one-voice`): the line's maker notes, the read the ask
  // sheet makes, so `Follow up with the maker` lands on a note already held.
  const makerNotesQuery = useProcurementDrafts(
    oneVoice ? projectId : null,
    LIVE_MAKER_ASK_STATUSES,
  );
  const [choosingPiece, setChoosingPiece] = useState(false);
  const [changeOrderLineId, setChangeOrderLineId] = useState<string | null>(null);
  const choosePieceRef = useRef<HTMLParagraphElement | null>(null);
  const ffeBodyRef = useRef<HTMLDivElement | null>(null);
  const [addLineRoom, setAddLineRoom] = useState<{
    id: string | null;
    name: string;
    scope: FfeAssignmentScope;
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
  // C-25: the project's purchase records — each bought line's unfold fact and
  // the "Bill N unbilled purchases" door.
  const { data: purchases } = useStudioPurchases(projectId ? { projectId } : null);
  // C-31: the project's PO riders, for the "Bill N unbilled riders" door.
  const { data: riders } = useProjectPoCostLines(projectId || null);
  // T4 · G6 — open damage/claim exceptions, so a shipped-but-damaged line
  // reads "Claim open" in the next-act grouping rather than its PO status.
  const { data: procurementExceptions } = useUnresolvedProcurementExceptions(projectId);
  const authority = useProjectBillingAuthority(projectId);
  const { data: tradeScopes, isPending: tradeScopesPending } = useTradeScopes(
    projectId,
    mode === 'project',
  );
  // D-B49 — the work block's three reads live HERE, at the region root, which
  // is mounted at every density. Called from inside the block (which mounts
  // only in the full body) they fired on the lens's own promotion: all three
  // carry the default `staleTime: 0`, so a fresh observer refetches on mount
  // even against a warm cache, and a promotion that fetches is what
  // `lens-contrast.spec.ts:183` forbids. The block reads them as props.
  const sectionTasksQuery = useSectionTasks(sectionKey ? projectId : null);
  const sectionGatesQuery = useSectionGates(sectionKey ? projectId : null);
  const sectionTasks = sectionTasksQuery.data;
  const sectionGates = sectionGatesQuery.data;
  const { data: sectionLoggedMinutes } = useSectionLoggedMinutes(
    sectionKey ? projectId : null,
    sectionKey ?? 'project',
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
  // C-04: choosing what is installed — its own ticks, never mixed with a
  // release's. A release begun from the head takes the table back.
  const [installing, setInstalling] = useState(false);
  const [installPicks, setInstallPicks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const installSelecting = installing && !selecting;
  // C-15 / C-33: the project's lines read by room (R25), by maker or by next
  // act. Ticks belong to the room reading, so a selection in hand holds it there.
  const [reading, setReading] = useState<BuyingReading>('room');
  const readingLockedReason = selecting
    ? 'finish the release first'
    : installSelecting
      ? 'finish choosing what’s installed first'
      : null;
  const shownReading: BuyingReading =
    mode === 'project' && readingLockedReason === null ? reading : 'room';
  const byMaker = shownReading === 'maker';
  const byNextAct = shownReading === 'next';
  const endInstalling = () => {
    setInstalling(false);
    setInstallPicks(new Set());
  };

  const rows: LineRow[] = (items ?? []).map((wireItem) => {
    const item = {
      ...wireItem,
      authoritative_readiness: readinessBySelection.get(String(wireItem.id)) ?? null,
      open_claim: exceptionsForLine(
        procurementExceptions ?? [],
        wireItem.id,
        wireItem.purchase_order_id,
      ).some((e) => isClaimType(e.type)),
    };
    const auth = deriveLineAuthorization(item, instrumentIndex);
    const tradeHold = deriveTradeLineHold(item, tradeIndex);
    return {
      item,
      stamp: deriveLineStamp(
        { ...item, stage: lineStageInputFromRow(item, laborPiece(item, items)) },
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
  // record_project_ffe_installed moves delivered lines only (00691).
  const deliveredCount = rows.filter(
    (r) => r.item.status === 'delivered',
  ).length;
  const installPickIds = rows
    .filter(
      (r) => r.item.status === 'delivered' && installPicks.has(r.item.id),
    )
    .map((r) => String(r.item.id));
  const installEligibility = (item: FFERow): LineEligibility =>
    item.status === 'delivered'
      ? { eligible: true }
      : {
          eligible: false,
          reason: item.status === 'installed' ? 'installed' : 'not yet delivered',
        };
  const toggleInstallPick = (id: string) =>
    setInstallPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  // US-21 fix-now #5: the column defaults to 0 (00066), so a line that prints
  // `Not priced` is not priced, and there is nothing on it to bill.
  const billableUninvoiced = (items ?? []).filter((it) => {
    if (it.unit_price_cents === null || it.unit_price_cents === undefined)
      return false;
    if (priceWord(it) === 'Not priced') return false;
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
          currency: rowCurrency(row.item),
        }))
    : [];
  // Counted the way publish_budget_checkpoint counts, so the drift read on
  // the release sheet compares like with like. The checkpoint is USD-only
  // (00661), so a schedule carrying any other currency has no drift read.
  const scheduled = sumByCurrency(
    rows.map((row) => row.item as FFERow),
    (item) => scheduledContributionCents(item),
  );
  const currentScheduledCents =
    !isMixed(scheduled) && scheduled.currency === DEFAULT_CURRENCY ? scheduled.cents : null;

  // 0a-2 (D6): Install's head prints no count — each row prints its state
  // word from `pieceInstallState` instead, and the reading sentence that
  // fills this line is slice 1's, read through the same selector.
  const meta =
    mode === 'install'
      ? ''
      : total > 0
        ? oneVoice
          ? `${underway} underway`
          : `${underway} of ${total} underway`
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
      choosingPiece
        ? recordChangeOnLine(String(row.item.id))
        : setOpenLineId(openLineId === row.item.id ? null : row.item.id),
    // R33 / R35: on every spread, and first only where a change order exists.
    recordChange: askThePaper && livePurchaseOrder(row.item) !== null,
    onAddNote,
    showRoom: !groupByRoom,
    coverage: coverage?.[row.item.id],
    purchase: purchaseForLine(purchases, String(row.item.id)),
    showAuthorization,
    isCommercialOrigin,
    ...(installSelecting
      ? {
          selecting: true,
          eligible: installEligibility(row.item),
          selected: installPicks.has(row.item.id),
          onSelectToggle: () => toggleInstallPick(row.item.id),
          selectLabel: `Mark ${row.item.name} installed`,
        }
      : {
          selecting: Boolean(selecting),
          selected: Boolean(ceremony?.isSelected(row.item.id)),
          onSelectToggle: () => ceremony?.toggleLine(row.item.id),
          selectLabel: `Include ${row.item.name} in this release`,
        }),
    onIncludeInRelease: () => {
      setOpenLineId(null);
      ceremony?.begin([row.item.id]);
    },
    canEditSelection: mode === 'project',
    showArtifactPlate: mode === 'project',
    installState: mode === 'install' ? pieceInstallState(row.item) : undefined,
    damageStamp: oneVoice,
  });

  // The maker and next-act readings open the same unfold the room reading does.
  const toggleReadingLine = (lineId: string) =>
    choosingPiece
      ? recordChangeOnLine(String(lineId))
      : setOpenLineId(openLineId === lineId ? null : lineId);
  const renderReadingUnfold = (row: LineRow) => {
    const props = lineProps(row);
    return (
      <>
      {props.recordChange && <RecordChangeLineAct itemId={String(row.item.id)} />}
      <LineUnfold
        item={row.item}
        projectId={projectId}
        projectName={projectName}
        onAddNote={onAddNote}
        onFold={props.onToggle}
        auth={row.auth}
        isCommercialOrigin={isCommercialOrigin}
        onIncludeInRelease={props.onIncludeInRelease}
        canEditSelection={props.canEditSelection}
        showArtifactPlate={props.showArtifactPlate}
        purchase={props.purchase}
      />
      </>
    );
  };

  const roomHeadingProps = (group: LineRow[]) => {
    const ids = eligibleIds(group);
    return {
      showAuthorization,
      selecting: Boolean(selecting),
      roomState: ceremony?.roomState(ids) ?? ('none' as RoomTriState),
      onRoomToggle: (next: boolean) => ceremony?.setRoom(ids, next),
      eligibleCount: ids.length,
      selectedCount: ids.filter((id) => ceremony?.isSelected(id)).length,
      heldRoomId,
      toggleRoom,
      oneVoice,
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
  // FR6 F6-5 (D12): `Choose the piece` heads the list that holds the first
  // line row. The maker and next-act readings print their lines in a table of
  // their own, so there (and with no line) it stands just above the reading.
  const firstRoomWithLines = roomGroups.find((group) => group.rows.length > 0);
  const chooseListKey: string | null = !choosingPiece || byMaker || byNextAct
    ? null
    : !groupByRoom
      ? rows.length > 0 ? 'movement' : null
      : firstRoomWithLines
        ? `room:${firstRoomWithLines.room.id}`
        : throughout.length > 0
          ? 'throughout'
          : unassigned.length > 0
            ? 'unassigned'
            : null;

  const composition = releaseSummary(releaseLines);

  // The region head's fold (project mode only — install and the release
  // ceremony never fold). The default only settles once the schedule itself
  // has settled (not loading, not error); until then the latch holds
  // whatever is current rather than guessing.
  const ffeItemsSettled = !isLoading && !isError;
  const ffeDefaultFolded =
    mode === 'project' && ffeItemsSettled ? total === 0 : null;
  // R127 L-4 — the lens's reading of this stop. `null` while it has nothing to
  // say, which is what leaves the region quiet until she is nearly here.
  const ffePositionDensity = useLensDensityStore('ffe');
  const ffeFold = useRegionFold({
    docId: projectId,
    region: 'ffe',
    defaultFolded: ffeDefaultFolded,
    // Install/care and the release ceremony print heads that are not a
    // `RegionHead`, so they have no quiet form to stand in; forcing them open
    // keeps `data-density` honest about what the root actually prints, and
    // matches the fold they already refuse (`ffeFolded` below).
    forceOpen: mode !== 'project' || selecting,
    positionDensity: ffePositionDensity,
  });
  const ffeSetFolded = ffeFold.setFolded;
  // A link's request is honoured once. `items` changes on every refetch, so an
  // unguarded effect would re-open the line under a reader who had folded it.
  const honouredRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'project' || !requestedLineId) return;
    if (honouredRequestRef.current === requestedLineId) return;
    const requestedLineExists = (items ?? []).some(
      (item) => String(item.id) === requestedLineId,
    );
    if (!requestedLineExists) return;
    honouredRequestRef.current = requestedLineId;
    setOpenLineId(requestedLineId);
    ffeSetFolded(false);
    onRequestedLineConsumed();
  }, [ffeSetFolded, items, mode, onRequestedLineConsumed, requestedLineId]);
  // US-21 fix-now #8 — the spec book's way back (`#line-<id>`) lands on its
  // line once the schedule has settled: Pieces and the line unfold, and the
  // row (`ffe-selection-<id>`) comes into view. The hash is read, never
  // cleared; the arrival gate reads it too, and a hash means no arrival plays.
  // Honoured once per hash, for the same reason as the request above.
  const honouredHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'project' || !ffeItemsSettled) return;
    const hashLineId = /^#line-(.+)$/.exec(window.location.hash)?.[1];
    if (!hashLineId || honouredHashRef.current === hashLineId) return;
    if (!(items ?? []).some((item) => String(item.id) === hashLineId)) return;
    honouredHashRef.current = hashLineId;
    setOpenLineId(hashLineId);
    ffeSetFolded(false);
    // The unfold above is a state change, so a folded or quiet region mounts
    // the row on a later paint: wait for it, up to a second, as the ⌘K
    // landing below does.
    let waited = 0;
    const land = () => {
      const row = document.getElementById(`ffe-selection-${hashLineId}`);
      if (!row) {
        if (waited++ < 60) requestAnimationFrame(land);
        return;
      }
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    requestAnimationFrame(() => requestAnimationFrame(land));
  }, [ffeItemsSettled, ffeSetFolded, items, mode]);
  const openFfeRegion = useCallback(() => {
    if (mode !== 'project') return;
    ffeSetFolded(false);
  }, [mode, ffeSetFolded]);
  useRegionUnfoldRequest('ffe', openFfeRegion);
  // D5 (US-19): a line's Record a change destination. On a live PO it is the
  // line's change order (the Order cell's own sheet) at project, install and
  // care alike (R33); without one, the line unfolds with today's controls.
  const recordChangeOnLine = useCallback(
    (itemId: string) => {
      const item = (items ?? []).find((candidate) => String(candidate.id) === itemId);
      if (!item) return;
      setChoosingPiece(false);
      openFfeRegion();
      setOpenLineId(item.id);
      if (livePurchaseOrder(item)) setChangeOrderLineId(String(item.id));
    },
    [items, openFfeRegion],
  );
  // R34: the control that started choosing — the router hands focus back to
  // it before it dispatches here — is where Put back and Esc return.
  const chooseOpenerRef = useRef<HTMLElement | null>(null);
  const putBackChoosing = useCallback(() => {
    setChoosingPiece(false);
    const opener = chooseOpenerRef.current;
    chooseOpenerRef.current = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!recordChangeAtHead) return;
    const onPiece = (event: Event) => {
      const itemId = (event as CustomEvent<RecordAChangeOnPieceDetail | undefined>)
        .detail?.itemId;
      if (itemId) {
        recordChangeOnLine(itemId);
        return;
      }
      const active = document.activeElement;
      chooseOpenerRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      // No line is left open while she chooses, so a line's own Fold is
      // never mistaken for a choice.
      setOpenLineId(null);
      openFfeRegion();
      setChoosingPiece(true);
    };
    window.addEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, onPiece);
    return () => window.removeEventListener(RECORD_A_CHANGE_ON_PIECE_EVENT, onPiece);
  }, [recordChangeAtHead, openFfeRegion, recordChangeOnLine]);
  // R34: while she chooses, Esc puts the choosing back and never reaches the
  // shell's Put down (page.tsx listens on the document, bubbling). Captured on
  // the document so it holds wherever focus is in the paper; a sheet opened
  // over the paper keeps its own Esc.
  useEffect(() => {
    if (!choosingPiece) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      event.stopPropagation();
      putBackChoosing();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [choosingPiece, putBackChoosing]);
  // The prompt takes focus a frame after the router's own sheet hands focus
  // back to its opener, so the prompt is where she lands. FR6 F6-5 (D12): the
  // first line comes into view with the prompt standing just above it.
  useEffect(() => {
    if (!choosingPiece) return;
    const frame = window.requestAnimationFrame(() => {
      const prompt = choosePieceRef.current;
      const firstLine =
        ffeBodyRef.current?.querySelector<HTMLElement>('[id^="ffe-selection-"]') ?? prompt;
      firstLine?.scrollIntoView?.({ block: 'center' });
      prompt?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [choosingPiece]);
  // US-19 D4 — ⌘K lands on a line in place. `?ffeItemId=` is read on mount
  // only, so a paper already open hears this event instead: unfold Pieces and
  // the line, bring its Order cell into view, and put focus on the PO control
  // itself (R28). R37's `Add the maker` lands on the line's Maker field the
  // same way. The cell mounts with the unfolded line, so the landing waits
  // for it. A request made before this listener existed (F1: Pieces not yet
  // mounted) waits in `focusFfeLinePending` and is landed here on mount.
  useEffect(() => {
    // FR8 F8-2 — a request names its line by id, or by PO: the PO's first
    // line in the schedule's order.
    const resolveLineId = (
      request: Partial<FocusFfeLineRequest> | null | undefined,
    ): string | undefined => {
      const byPo = request?.purchaseOrderId
        ? (items ?? []).find((item) => String(item.purchase_order_id) === request.purchaseOrderId)
            ?.id
        : undefined;
      const id = request?.itemId ?? byPo;
      return id == null ? undefined : String(id);
    };
    const landOnLine = (request: Partial<FocusFfeLineRequest> | undefined): boolean => {
      const itemId = resolveLineId(request);
      if (!itemId || !(items ?? []).some((item) => String(item.id) === itemId)) return false;
      if (resolveLineId(focusFfeLinePending.request) === itemId) focusFfeLinePending.request = null;
      // 511-R1: the buy cell offers its maker field to this landing in any mode.
      if (request?.cell === 'maker') makerLandingPending.itemId = itemId;
      setOpenLineId(itemId);
      if (mode === 'project') ffeSetFolded(false);
      let waited = 0;
      const cellSelector =
        request?.cell === 'order' || request?.cell === 'order-draft'
          ? '[data-testid="line-po-cell"]'
          : request?.cell === 'maker'
            ? '[data-testid="line-buy-cell"] [aria-label="Maker"]'
            : request?.cell === 'draft'
              ? '[data-testid="line-held-maker-note"]'
              : null;
      const land = () => {
        const line = document.getElementById(`ffe-selection-${itemId}`);
        const cell = cellSelector ? line?.querySelector<HTMLElement>(cellSelector) : null;
        // FR5 F5-2: the held note lands on its DraftReview's first control,
        // as the ask sheet's `Open the held draft` does (L-10).
        const control =
          request?.cell === 'order'
            ? (cell?.querySelector<HTMLElement>('[data-po-control]') ?? null)
            : request?.cell === 'draft'
              ? (cell?.querySelector<HTMLElement>('input, textarea, button') ?? null)
              : request?.cell === 'order-draft'
                ? // FR8 F8-2: the PO's held reply, on the Order cell's DraftReview.
                  (cell?.querySelector<HTMLElement>(
                    '[data-testid="draft-review"] input, [data-testid="draft-review"] textarea, [data-testid="draft-review"] button',
                  ) ?? null)
                : null;
        // Up to a second: the region and the line mount before the cell does.
        const needsControl =
          request?.cell === 'order' || request?.cell === 'draft' || request?.cell === 'order-draft';
        if (!(needsControl ? control : cell) && waited++ < 60) {
          requestAnimationFrame(land);
          return;
        }
        const target = control ?? cell ?? line;
        if (!target) return;
        if (!target.hasAttribute('tabindex') && !control) target.setAttribute('tabindex', '-1');
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        (cell ?? target).scrollIntoView?.({
          block: 'center',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
        target.focus({ preventScroll: true });
      };
      requestAnimationFrame(() => requestAnimationFrame(land));
      return true;
    };
    const onFocusLine = (event: Event) => {
      // FR8 F8-2: a cancelable request learns it was taken, so a PO with no
      // line on the paper can fall to the guide's destination.
      if (landOnLine((event as CustomEvent<Partial<FocusFfeLineRequest> | undefined>).detail)) {
        event.preventDefault();
      }
    };
    window.addEventListener(FOCUS_FFE_LINE_EVENT, onFocusLine);
    landOnLine(focusFfeLinePending.request ?? undefined);
    return () => window.removeEventListener(FOCUS_FFE_LINE_EVENT, onFocusLine);
  }, [items, mode, ffeSetFolded]);
  // US-19 F2-3 — `Record the payment` lands on the PO's line. Pieces and the
  // line unfold here; the line's money out opens its record form and takes
  // focus itself (record-payment.tsx), and clears the pending request.
  useEffect(() => {
    const unfoldFor = (request: RecordPaymentLanding | null | undefined) => {
      const poId = request?.purchaseOrderId;
      const item = poId
        ? (items ?? []).find((line) => line.purchase_order?.id === poId)
        : undefined;
      if (!item) return;
      setOpenLineId(String(item.id));
      if (mode === 'project') ffeSetFolded(false);
    };
    const onLand = (event: Event) => {
      // F3-1 — the press's own control (the band act, the dock centre), so
      // Esc in the record form can hand focus back to it.
      const focused = document.activeElement;
      recordPaymentOpener.element =
        focused instanceof HTMLElement && focused !== document.body ? focused : null;
      unfoldFor((event as CustomEvent<RecordPaymentLanding | undefined>).detail);
    };
    window.addEventListener(LAND_RECORD_PAYMENT_EVENT, onLand);
    unfoldFor(recordPaymentPending.request);
    return () => window.removeEventListener(LAND_RECORD_PAYMENT_EVENT, onLand);
  }, [items, mode, ffeSetFolded]);
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
  const ffeLineCount = `${total} ${total === 1 ? 'line' : 'lines'}`;
  const ffeCounts = `${ffeGroupCount} ${ffeGroupWord} · ${ffeLineCount}`;
  const ffeAwaiting =
    ffeAwaitingCount > 0
      ? `${ffeAwaitingCount} awaiting authorization`
      : null;
  // C20 — the head's identity line carries the trade word the studio word
  // leaves out, then the counts. Line one never elides (RegionHead).
  // US-19 D1 (`one-voice`) — `FF&E schedule` retires as a printed name; the
  // region is Pieces, which the head's name already prints.
  const ffeTradeWord = oneVoice ? '' : 'the FF&E schedule, ';
  const ffeStatus = byMaker
    ? `${ffeTradeWord}by maker · ${ffeLineCount}`
    : byNextAct
      ? `${ffeTradeWord}by next act · ${ffeLineCount}`
      : `${ffeTradeWord}by room · ${ffeCounts}`;
  const ffeSeamSummary =
    total === 0
      ? `${ffeGroupCount} ${ffeGroupWord} · no lines yet`
      : ffeAwaiting
        ? `${ffeCounts} · ${ffeAwaiting}`
        : ffeCounts;

  // US-21 D1: a placeholder is a line the paper stamps PLACEHOLDER — no
  // product and no maker. A custom line with a maker (row 8) and a Trade Scope
  // presence line (row 3) are not. The head counts and names them through the
  // act table (`N placeholders`, `Fill the N placeholders`).
  const placeholderLineIds = rows
    .filter((r) => r.stamp.kind === 'placeholder' && r.item.removed_at == null)
    .map((r) => String(r.item.id));
  const uninvoicedLineIds = billableUninvoiced.map((it) => String(it.id));
  const ffeLeader = electFfeLeader({
    releaseLift: releaseInHead,
    needs,
    unspecifiedLineIds: placeholderLineIds,
    uninvoicedLineIds,
  });

  // US-21 fix-now #3: the head adds to the job (the Add-to-project sheet);
  // each room's own act stays `Add a line`.
  const ffeAddToProjectEntry: RegionLedgerEntry = {
    key: 'open-add-to-project',
    label: 'Add to the job',
    onClick: () => openAddToProject('section'),
  };
  // 0a-8 / D3 Gated — held, not natively disabled: the act stays in tab order
  // and its reason prints beneath the ledger. Per-row reasons remain reachable
  // via each row's own unfold.
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
    reason: 'No lines are currently eligible for release.',
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
  // US-19 F3-2 / FR4 (P-2) — every Pieces act lands with focus on Pieces' own
  // control: the claim, the send and the spec on their line, `Follow up with
  // the maker` in the maker composer, `Open the pieces` on the first line.
  // True (the press taken) only when Pieces carries the act; otherwise the
  // press keeps its old landing. FR9 F9-1 — a detail naming its line (a
  // per-PO silence's) lands on that line, not the one the act's rule picks.
  const landFfeAct = (detail: FfeActLandingDetail): boolean => {
    const act = typeof detail === 'string' ? detail : detail.act;
    const namedLineId = typeof detail === 'string' ? undefined : detail.itemId;
    const openRegion = () => {
      if (mode === 'project') ffeSetFolded(false);
    };
    if (act === 'open') {
      // 523-1 — the first line's unfold control, or the heading with none.
      const hasLine = (items ?? []).some((item) => item.removed_at == null);
      openRegion();
      landOnControl(() =>
        hasLine
          ? document
              .getElementById(ffeBodyId)
              ?.querySelector<HTMLElement>('[id^="ffe-selection-"] button[aria-expanded]')
          : document.getElementById(ffeHeadingId),
      );
      return true;
    }
    if (act === 'release') {
      // FR5 F5-1 (530-7) — the head's own entry, held form included: its
      // reason prints beneath and the press is hers. Never clicked.
      if (releaseInHead) {
        openRegion();
        landOnControl(() =>
          document
            .getElementById(ffeHeadingId)
            ?.closest('[data-index-region="ffe"]')
            ?.querySelector<HTMLElement>(FFE_ACT_CONTROL.release),
        );
        return true;
      }
      // FR6 F6-2 — a head printing none has lifted the release to the Delivery
      // table's head (`ReleaseLift`, outside Pieces): the press lands on the
      // lift's entry, never clicked. With no lift on the page it stays untaken.
      const liftEntry = () =>
        document.querySelector<HTMLElement>(`[data-release-lift] ${FFE_ACT_CONTROL.release}`);
      if (!liftEntry()) return false;
      landOnControl(liftEntry);
      return true;
    }
    const line = !items
      ? null
      : namedLineId !== undefined
        ? (items.find((item) => String(item.id) === namedLineId) ?? null)
        : ffeActLine(items, act);
    if (act === 'follow-up') {
      // 520-2 — the maker composer, never the order ledger or the PO button.
      if (!line) return false;
      const itemId = String(line.id);
      // FR7 F7-7 — a note of either kind already held (or sending) on the
      // line: land on its DraftReview (F5-2's `draft` cell), not a composer
      // the route would refuse. The route's 409 stays the last guard.
      const heldNote = (makerNotesQuery.data ?? []).some(
        (draft) =>
          isMakerNoteKind(draft.kind) &&
          draft.status !== 'sent' &&
          String(draft.ffe_item_id) === itemId,
      );
      if (heldNote) {
        const request = { itemId, cell: 'draft' as const };
        focusFfeLinePending.request = request;
        window.dispatchEvent(new CustomEvent(FOCUS_FFE_LINE_EVENT, { detail: request }));
        return true;
      }
      setFollowUpLineId(itemId);
      return true;
    }
    if (!line && act === 'send') {
      // Walk D3 — a drafted PO no line carries (the need counts the project's
      // POs): the Orders ledger lands on its row's own send act.
      if (!needs.some((need) => need.kind === 'po_unsent' && !need.releaseHeld)) return false;
      void Promise.all([import('./orders-ledger'), import('./command-bar')]).then(
        ([ledger, { openLedger }]) => {
          ledger.ordersSendLanding.pending = true;
          openLedger('orders', { page: 'ledger', projectId });
        },
      );
      return true;
    }
    if (!line) {
      // 520-4 — a claim at PO grain stands on no line: Receiving lands on the
      // claim card's own act. The flag is the Receiving page's to spend.
      if (act !== 'claim' || !needs.some((need) => need.kind === 'damage_claim')) return false;
      void Promise.all([import('./orders-book-receiving'), import('./command-bar')]).then(
        ([receiving, { openLedger }]) => {
          receiving.receivingClaimLanding.pending = true;
          openLedger('orders', { page: 'receiving', projectId });
        },
      );
      return true;
    }
    const itemId = String(line.id);
    setOpenLineId(itemId);
    openRegion();
    landOnControl(() => {
      const row = document.getElementById(`ffe-selection-${itemId}`);
      const control = row?.querySelector<HTMLElement>(FFE_ACT_CONTROL[act]);
      if (control || act !== 'spec') return control;
      // The maker and next-act readings print no spec door on the unfolded
      // line; there its own unfold control is the landing.
      return row?.querySelector<HTMLElement>('button[aria-expanded="true"]');
    });
    return true;
  };
  const landFfeActRef = useRef(landFfeAct);
  useEffect(() => {
    landFfeActRef.current = landFfeAct;
  });
  useEffect(() => {
    const onLand = (event: Event) => {
      if (landFfeActRef.current((event as CustomEvent<FfeActLandingDetail>).detail)) {
        event.preventDefault();
      }
    };
    window.addEventListener(ACT_LANDING_EVENTS.ffeAct, onLand);
    return () => window.removeEventListener(ACT_LANDING_EVENTS.ffeAct, onLand);
  }, []);
  const followUpLine =
    followUpLineId !== null
      ? ((items ?? []).find((item) => String(item.id) === followUpLineId) ?? null)
      : null;
  const ffeClaimEntry: RegionLedgerEntry = {
    key: 'file-ffe-claim',
    label: 'File the claim',
    onClick: () => {
      if (oneVoice && landFfeAct('claim')) return;
      openOrdersLedger('receiving');
    },
  };
  const ffePoEntry: RegionLedgerEntry = {
    key: 'chase-ffe-po',
    // US-19 D1 — never "Chase …"; an unanswered PO's act has one name.
    label: oneVoice ? needActLabel('po_unacknowledged') : 'Chase the PO',
    onClick: () => {
      if (oneVoice && landFfeAct('follow-up')) return;
      openOrdersLedger('ledger');
    },
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
  // C-25: purchases recorded on a card or on the spot, owed a client line.
  // The composer reads them; each bills at cost on its own line (R-PB7).
  const unbilled = unbilledPurchases(purchases);
  const openPurchasesBill = () =>
    openInvoiceComposer(purchasesBillArgs(projectId, unbilled));
  const purchasesBillLabel = `Bill ${unbilled.length} unbilled ${
    unbilled.length === 1 ? 'purchase' : 'purchases'
  }`;
  const ffeBillPurchasesEntry: RegionLedgerEntry | null =
    unbilled.length > 0
      ? {
          key: 'bill-project-purchases',
          label: purchasesBillLabel,
          variant: 'secondary',
          trailing: '→',
          onClick: openPurchasesBill,
        }
      : null;
  // C-31: PO riders owed a client line, beside the purchases door.
  const unbilledRiderRows = unbilledRiders(riders);
  const openRidersBill = () =>
    openInvoiceComposer(ridersBillArgs(projectId, unbilledRiderRows));
  const ridersBillLabel = `Bill ${unbilledRiderRows.length} unbilled ${
    unbilledRiderRows.length === 1 ? 'rider' : 'riders'
  }`;
  const ffeBillRidersEntry: RegionLedgerEntry | null =
    unbilledRiderRows.length > 0
      ? {
          key: 'bill-project-riders',
          label: ridersBillLabel,
          variant: 'secondary',
          trailing: '→',
          onClick: openRidersBill,
        }
      : null;
  const ffeSpecBookEntry: RegionLedgerEntry = {
    key: 'open-spec-book',
    // F48's sibling: one spec-book door, naming its scope when it has one.
    // FR2 499-10 — the name is the own-act table's, never a hand template.
    label:
      placeholderLineIds.length > 0
        ? ownAct('project', {
            ...OWN_ACT_NO_FACTS,
            unspecifiedCount: placeholderLineIds.length,
          })!.label
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
  const ffeLedgerByKind: RegionLedgerEntry[] = [
    ffeEntryByKind[ffeLeader.kind] ?? ffeAddToProjectEntry,
    ...FFE_LEDGER_ORDER.filter((kind) => kind !== ffeLeader.kind)
      .map((kind) => ffeEntryByKind[kind])
      .filter((entry): entry is RegionLedgerEntry => entry !== null),
  ];
  // The purchases and riders doors never lead; they stand beside "Bill N
  // uninvoiced", or last when there is no uninvoiced line.
  const billAt = ffeLedgerByKind.findIndex((entry) => entry.key === 'bill-project-ffe');
  const atCostDoors = [ffeBillPurchasesEntry, ffeBillRidersEntry].filter(
    (entry): entry is RegionLedgerEntry => entry !== null,
  );
  const ffeLedgerDoors: RegionLedgerEntry[] =
    atCostDoors.length > 0
      ? billAt >= 0
        ? [
            ...ffeLedgerByKind.slice(0, billAt + 1),
            ...atCostDoors,
            ...ffeLedgerByKind.slice(billAt + 1),
          ]
        : [...ffeLedgerByKind, ...atCostDoors]
      : ffeLedgerByKind;
  // US-19 FR3 F3-10 (`one-voice`) — a held job moves nothing, so its Pieces
  // head leads with the own act `Open the pieces`, never an exception or a
  // Bill door; those stand plain behind it.
  const ffeHeld = oneVoice && mode === 'project' && projectStatus === 'on_hold';
  const ffeLeaderDoors: RegionLedgerEntry[] = ffeHeld
    ? [
        {
          key: 'open-the-pieces',
          label: ownAct('project', OWN_ACT_NO_FACTS)!.label,
          // 523-1 — lands on the first line's unfold control, in view.
          onClick: () => landFfeAct('open'),
        },
        ...ffeLedgerDoors,
      ]
    : ffeLedgerDoors;
  // D5 (US-19): Record a change is the head's second act, after the leader.
  const ffeLedger: RegionLedgerEntry[] = recordChangeAtHead
    ? [
        ...ffeLeaderDoors.slice(0, 1),
        {
          key: PIECES_RECORD_A_CHANGE_KEY,
          label: NAMED_ACTS.recordChange,
          onClick: () => openRecordAChange({ origin: 'pieces-head' }),
        },
        ...ffeLeaderDoors.slice(1),
      ]
    : ffeLeaderDoors;
  const changeOrderLine = changeOrderLineId
    ? (rows.find((row) => String(row.item.id) === changeOrderLineId) ?? null)
    : null;
  const ffeExceptions = [
    ...ffeLeader.exceptions.map((exception) => exception.text),
    ...(ffeAwaiting ? [ffeAwaiting] : []),
  ];

  // R127 OD-12/OD-13 + W4-R1 — the quiet form is the HEAD and nothing else:
  // its own status line, the one inked leader, one sr-only sentence.
  const ffeQuiet = ffeFold.density === 'quiet';
  const ffeDamagedCount = needs.filter(
    (need) => need.kind === 'damage_claim',
  ).length;
  const ffeQuietStatus = piecesQuietStatus({
    total,
    rooms: roomGroups.length,
    damaged: ffeDamagedCount,
  });
  // R34: `Choose the piece · Put back · Esc` — the way out stands on the
  // prompt's own line. F6-5 places it with the lines (`chooseListKey`).
  const choosePiecePrompt = choosingPiece ? (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
      <p
        ref={choosePieceRef}
        tabIndex={-1}
        role="status"
        data-testid="ffe-choose-the-piece"
        className="font-heading text-[15px] italic text-[var(--color-charcoal)]"
      >
        Choose the piece
      </p>
      <span aria-hidden className="text-[var(--text-muted)]">
        ·
      </span>
      <DocumentAction
        actionKey="put-back-choose-the-piece"
        surfaceKey="project"
        regionKey="ffe-choose-the-piece"
        variant="secondary"
        onClick={putBackChoosing}
      >
        Put back · Esc
      </DocumentAction>
    </div>
  ) : null;
  const choosePieceItem = (listKey: string) =>
    chooseListKey === listKey ? <li>{choosePiecePrompt}</li> : null;

  return (
    <section
      id="project-ffe"
      // The index's root for this region on EVERY spread that prints it. The
      // install and care spreads pass mode="install", so gating it on
      // `groupByRoom` left their index row pointing at nothing.
      data-index-region="ffe"
      data-density={ffeFold.density}
      style={
        {
          '--doc-quiet-reserve':
            ffeExceptions.length > 0
              ? 'var(--doc-quiet-reserve-exc)'
              : 'var(--doc-quiet-reserve-min)',
        } as CSSProperties
      }
      className="mt-[var(--doc-region-gap)] scroll-mt-16"
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
            {isLoading && (
              <SectionLoadingLine variant="inline" label="Reading the schedule" />
            )}
            {!selecting && meta && (
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
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
                  className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:text-[var(--color-charcoal)]"
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
                    narrow). F15 / R32: plain — the install reading's act is
                    this head's one leader. */}
                {billableUninvoiced.length > 0 && (
                  <DocumentAction
                    actionKey="bill-project-ffe"
                    surfaceKey="project"
                    regionKey="ffe-head"
                    variant={installOneLeader ? 'tertiary' : 'secondary'}
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
                {unbilled.length > 0 && (
                  <DocumentAction
                    actionKey="bill-project-purchases"
                    surfaceKey="project"
                    regionKey="ffe-head"
                    variant="secondary"
                    onClick={openPurchasesBill}
                  >
                    {purchasesBillLabel}
                  </DocumentAction>
                )}
                {unbilledRiderRows.length > 0 && (
                  <DocumentAction
                    actionKey="bill-project-riders"
                    surfaceKey="project"
                    regionKey="ffe-head"
                    variant="secondary"
                    onClick={openRidersBill}
                  >
                    {ridersBillLabel}
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
          <RegionRule className="mt-0" weight="strong" />
          {ffeFold.folded ? (
            <FoldSeam
              headingId={ffeHeadingId}
              bodyId={ffeBodyId}
              name="Pieces"
              summary={ffeSeamSummary}
              cause={ffeFold.cause}
              onUnfold={() => ffeFold.setFolded(false)}
              surfaceKey="project"
              regionKey="ffe"
            />
          ) : (
            <div className="mb-1.5">
              <RegionHead
                headingId={ffeHeadingId}
                name="Pieces"
                // W4-R1 governs WHICH line prints (the quiet form is the
                // head's own status line); D-B39/W5-R3 governs HOW the
                // readiness pulse rides it — inline, inside the same <p>, so
                // its exit moves no box. Both hold at either density.
                status={
                  <>
                    {ffeQuiet ? ffeQuietStatus : ffeStatus}
                    {!readinessQuery.isError && readinessQuery.isLoading && (
                      <SectionLoadingLine variant="inline" label="Checking readiness" />
                    )}
                    {isLoading && (
                      <SectionLoadingLine variant="inline" label="Reading the schedule" />
                    )}
                  </>
                }
                exceptions={ffeExceptions}
                surfaceKey="project"
                regionKey="ffe"
                // F2-18 (`one-voice`): at quiet the named act prints beside
                // the leader, as it does on the install and care heads.
                actions={
                  ffeQuiet && oneVoice
                    ? ffeLedger.filter(
                        (entry, i) => i === 0 || entry.key === PIECES_RECORD_A_CHANGE_KEY,
                      )
                    : ffeLedger
                }
                actsAtQuiet={ffeQuiet && !oneVoice ? 'leader' : 'all'}
                bodyId={ffeBodyId}
                onFold={() => ffeFold.setFolded(true)}
              />
            </div>
          )}
        </>
      )}

      {/* D6 (slice 1, `ask-the-paper`): the Install head's own status line —
          the install reading and its act. Flag off, it renders nothing.
          R33: Record a change is the head's second act, after the reading's
          act, plain beside that leader (R32); on Care it stands alone. */}
      {mode === 'install' && !selecting && (
        <div className="flex flex-wrap items-baseline gap-x-3">
          {sectionKey !== 'care' && (
            <InstallReadingLine projectId={projectId} items={items} />
          )}
          {recordChangeAtHead && (
            <DocumentAction
              actionKey="record-a-change-install-head"
              surfaceKey="project"
              regionKey="install-head-record-change"
              variant="secondary"
              className="mb-2"
              onClick={() => openRecordAChange({ origin: 'pieces-head' })}
            >
              {NAMED_ACTS.recordChange}
            </DocumentAction>
          )}
        </div>
      )}
      {/* R11 — the Care head's own status line: `The book closed …`. */}
      {mode === 'install' && sectionKey === 'care' && !selecting && (
        <CareClosedLine projectId={projectId} />
      )}

      {!ffeFolded && ffeQuiet && (
        <div id={ffeBodyId}>
          <p className="sr-only">
            {quietStateSentence(ffeQuietStatus, 'Pieces')}
          </p>
        </div>
      )}

      {!ffeFolded && !ffeQuiet && (
      <div id={ffeBodyId} ref={ffeBodyRef}>
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
          tasks={sectionTasks}
          gates={sectionGates}
          loggedMinutes={sectionLoggedMinutes}
          workLoading={
            sectionTasksQuery.isLoading || sectionGatesQuery.isLoading
          }
          workError={sectionTasksQuery.isError || sectionGatesQuery.isError}
          onRetryWork={() => {
            void Promise.all([
              sectionTasksQuery.refetch(),
              sectionGatesQuery.refetch(),
            ]);
          }}
          sectionLabel={sectionLabel}
          // R40: where the reading says `Everything is here.`, its act `Open
          // the punch list` lands on this block, so the block wears that name.
          // FR2 508-4 (`one-voice`): `Punch list · {N} open`, never a ratio.
          {...(askThePaper &&
          mode === 'install' &&
          sectionKey !== 'care' &&
          (items ?? []).length > 0 &&
          (items ?? []).every(isPieceHere)
            ? oneVoice
              ? { heading: 'Punch list', tally: 'open' as const }
              : { heading: 'The punch list' }
            : // FR3 F3-20 / 515-6 (`one-voice`): `The work · {N} open`.
              oneVoice
              ? { tally: 'open' as const }
              : {})}
          clientUserId={clientUserId}
          clientName={clientName}
          emptyActVariant={installOneLeader ? 'secondary' : 'primary'}
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
          fileActVariant={installOneLeader ? 'secondary' : 'primary'}
        />
      )}

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
            // FR2 499-7 (`one-voice`): `FF&E schedule` retires as a printed
            // name; the act beneath keeps its label verbatim.
            title={oneVoice ? 'No pieces yet.' : 'Build the FF&E schedule'}
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

      {/* C-04: install day — offered only once a delivered line exists. */}
      {!selecting && !installing && deliveredCount > 0 && (
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[11.5px] text-[var(--text-muted)]">
            {deliveredCount} delivered, not yet installed
          </span>
          <DocumentAction
            actionKey="choose-ffe-lines-installed"
            surfaceKey="project"
            regionKey="ffe-install-select"
            variant="tertiary"
            onClick={() => {
              setOpenLineId(null);
              setInstalling(true);
            }}
          >
            Choose what&rsquo;s installed
          </DocumentAction>
        </div>
      )}
      {installSelecting && (
        <p className="mb-2 text-[11.5px] text-[var(--text-muted)]">
          Tick the pieces that are in place.
        </p>
      )}

      {groupByRoom && total > 0 && (
        <ReadingLens
          reading={shownReading}
          onChange={(next) => {
            setOpenLineId(null);
            setReading(next);
          }}
          lockedReason={readingLockedReason}
        />
      )}

      {chooseListKey === null && choosePiecePrompt}
      {byMaker ? (
        <MakerReading
          projectId={projectId}
          rows={rows}
          wordFor={(row) => stampProps(row.stamp).label}
          openLineId={openLineId}
          onToggleLine={toggleReadingLine}
          renderUnfold={renderReadingUnfold}
        />
      ) : byNextAct ? (
        <NextActReading
          rows={rows}
          reasonsFor={(row) =>
            deriveOrderReadiness(row.item, {
              isCommercialOrigin,
              lineAuth: row.auth,
            }).reasons
          }
          wordFor={(row) => stampProps(row.stamp).label}
          openLineId={openLineId}
          onToggleLine={toggleReadingLine}
          renderUnfold={renderReadingUnfold}
        />
      ) : groupByRoom ? (
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
                  setAddLineRoom({ id: room.id, name: room.name, scope: 'room' })
                }
                {...roomHeadingProps(roomRows)}
              />
              {!selecting && (
                <ConceptRenderUpload
                  projectId={projectId}
                  roomId={room.id}
                  roomName={room.name}
                />
              )}
              <ul>
                {choosePieceItem(`room:${room.id}`)}
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
                  setAddLineRoom({ id: null, name: 'Throughout', scope: 'throughout' })
                }
                {...roomHeadingProps(throughout)}
              />
              <ul>
                {choosePieceItem('throughout')}
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
                  setAddLineRoom({ id: null, name: 'Not in a room yet', scope: 'unassigned' })
                }
                {...roomHeadingProps(unassigned)}
              />
              <ul>
                {choosePieceItem('unassigned')}
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
            {choosePieceItem('movement')}
            {rows.map((row) => (
              <FFELine key={row.item.id} {...lineProps(row)} />
            ))}
          </ul>
        </>
      )}
      {installSelecting && (
        <InstallSelectionBar
          projectId={projectId}
          itemIds={installPickIds}
          onDone={endInstalling}
          onPutBack={endInstalling}
        />
      )}
      {/* C-34 (D1-09): where, when and by whom each delivered piece goes in. */}
      {mode === 'install' && sectionKey !== 'care' && !selecting && !installSelecting && (
        <InstallManifest
          projectId={projectId}
          lines={rows.map((row) => ({
            id: String(row.item.id),
            name: row.item.name,
            status: row.item.status ?? null,
            roomName: row.item.room?.name ?? null,
            installedOn: row.item.installed_on ?? null,
          }))}
        />
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

      <FlagProbe flag="ask-the-paper" onValue={setAskThePaper} />
      <FlagProbe flag="one-voice" onValue={setOneVoice} />
      {changeOrderLine?.item.purchase_order && (
        <ChangeOrderSheet
          open
          onClose={() => setChangeOrderLineId(null)}
          item={changeOrderLine.item}
          po={changeOrderLine.item.purchase_order}
          projectId={projectId}
          auth={changeOrderLine.auth}
          vendorName={changeOrderLine.item.vendor_name ?? 'the maker'}
          poLabel={changeOrderLine.item.purchase_order.po_number ?? 'this order'}
        />
      )}

      {/* FR4 Fix 6 (520-2) — `Follow up with the maker`'s composer: a held
          draft for review, never a send. */}
      {followUpLine && (
        <AskMakerSheet
          open
          followUp
          onClose={() => setFollowUpLineId(null)}
          projectId={projectId}
          piece={followUpLine}
          held={null}
        />
      )}

      {addLineRoom && (
        <AddLineSheet
          open
          projectId={projectId}
          roomId={addLineRoom.id}
          roomName={addLineRoom.name}
          assignmentScope={addLineRoom.scope}
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
