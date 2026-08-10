/**
 * Authorization derivation — the second stamp track (the Authorized Schedule
 * proposal, Act III, slides 9–12).
 *
 * Track one is logistics: where a piece is in the world (stamp-derivation.ts,
 * ruling R2). Track two is authorization: whether the client has agreed to buy
 * it, and under which numbered instrument. Absence is a state, and it is drawn
 * as absence — most of a schedule is unreleased most of the time, and that
 * must not read as a page of warnings.
 *
 * Pure and import-clean, exactly like stamp-derivation.ts: no hooks, no
 * @patina/* imports, no help-system reach (the Jest ESM trap). The inputs are
 * structural — a furnishings-authorization view and a project_ffe_items row —
 * so this module never has to move when the commerce adapter's field names do.
 *
 * The instrument numbers here are ordinals the studio and the client both say
 * out loud ("№ 3", "A3"). Numbers are never reused: voiding № 3 releases its
 * lines back to unreleased, and the instrument that replaces it is № 5.
 */

/** Commercial states an instrument can hold (the send/sign machine). */
export type InstrumentState =
  | 'draft'
  | 'sent'
  | 'executed'
  | 'declined'
  | 'superseded';

/** One line inside an instrument — the snapshot taken when it was released. */
export interface InstrumentItemLike {
  /** The schedule line this snapshot points back at. */
  sourceFfeItemId?: string | null;
  /** The price the client signed for, in cents. */
  clientLineTotalCents?: number | null;
}

/** A furnishings authorization, as the schedule needs to read it. */
export interface InstrumentLike {
  /** The ordinal the studio and client say out loud — № 3. */
  number?: number | null;
  state: InstrumentState | string;
  /** True once the deposit invoice is paid — the gate purchase orders wait on. */
  depositPaid?: boolean | null;
  items?: InstrumentItemLike[] | null;
}

/** A schedule line, as this module needs to read it (project_ffe_items row). */
export interface ScheduleLineInput {
  id: string;
  item_type?: string | null;
  quantity?: number | null;
  unit_price_cents?: number | null;
  line_total_cents?: number | null;
  budget_max_cents?: number | null;
  status?: string | null;
  blocked?: boolean | null;
  removed_at?: string | null;
  design_disposition?: string | null;
  authoritative_readiness?: {
    ready: boolean;
    missingFields: string[];
  } | null;
  /** Set on a trade scope's presence lines — the trade instrument that owns
   *  this line. Such a line is already bought, on other paper. */
  trade_scope_document_id?: string | null;
}

/** A trade scope, as the schedule needs to read it. */
export interface TradeScopeLike {
  documentId: string;
  number?: number | null;
  progressState?: string | null;
}

/** pcd document id → the trade scope holding it. */
export type TradeScopeIndex = Map<string, { number: number; progressState: string }>;

export type TradeLineHold =
  | { onTradeScope: false }
  | { onTradeScope: true; number: number; progressState: string };

export function buildTradeScopeIndex(
  scopes: readonly TradeScopeLike[] | null | undefined,
): TradeScopeIndex {
  const index: TradeScopeIndex = new Map();
  for (const scope of scopes ?? []) {
    if (!scope?.documentId) continue;
    index.set(scope.documentId, {
      number: Math.max(0, Math.round(num(scope.number) ?? 0)),
      progressState: String(scope.progressState ?? 'none'),
    });
  }
  return index;
}

/**
 * Whether this line is a trade scope's presence line, and whose. A line whose
 * scope is not in the index is still a trade line — it just cannot say which
 * number, which is why the ineligibility copy below reads without one.
 */
export function deriveTradeLineHold(
  item: ScheduleLineInput,
  index: TradeScopeIndex,
): TradeLineHold {
  const documentId = item.trade_scope_document_id;
  if (!documentId) return { onTradeScope: false };
  const held = index.get(documentId);
  return {
    onTradeScope: true,
    number: held?.number ?? 0,
    progressState: held?.progressState ?? 'none',
  };
}

export type LineAuthorization =
  | { track: 'none' }
  | { track: 'draft'; number: number }
  | { track: 'awaiting'; number: number }
  | {
      track: 'authorized';
      number: number;
      /** What the client signed for, in cents. */
      signedLineTotalCents: number;
      /** The deposit on that instrument has cleared. */
      depositClear: boolean;
      /** Current price minus signed price; null when they agree. */
      deltaCents: number | null;
    };

/** ffeItemId → the strongest authorization holding that line. */
export type InstrumentIndex = Map<string, LineAuthorization>;

export type LineEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

export type PoGate =
  | { orderable: true; sentence: string | null }
  | { orderable: false; sentence: string | null };

export type RoomTriState = 'none' | 'some' | 'all';

/** The logistics stages at which a line can still take a purchase order —
 *  the predicate the line unfold has always used, kept in one place. */
const ORDERABLE_STAGES = new Set(['specified', 'quoted', 'approved']);

/** Absence is absence: null, undefined and '' are NOT zero. */
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const centsOf = (value: unknown): number => {
  const parsed = num(value);
  return parsed === null ? 0 : Math.round(parsed);
};

/**
 * DECLINED and SUPERSEDED instruments hold nothing: a voided authorization
 * releases every line it pointed at back to unreleased (the ledger keeps the
 * record; the schedule does not).
 */
function trackFor(
  state: InstrumentState | string,
): 'draft' | 'awaiting' | 'authorized' | null {
  switch (state) {
    case 'executed':
      return 'authorized';
    case 'sent':
    case 'client_signed':
      return 'awaiting';
    case 'draft':
      return 'draft';
    default:
      return null;
  }
}

const RANK: Record<LineAuthorization['track'], number> = {
  none: 0,
  draft: 1,
  awaiting: 2,
  authorized: 3,
};

/**
 * The line's current price, in cents — the schedule's own number, not the
 * signed one. Null when the line carries no price at all.
 */
export function currentLineCents(item: ScheduleLineInput): number | null {
  const total = num(item.line_total_cents);
  if (total !== null) return Math.round(total);
  const unit = num(item.unit_price_cents);
  if (unit === null) return null;
  const quantity = num(item.quantity) ?? 1;
  return Math.round(unit * quantity);
}

/**
 * What a client could actually sign for on this line, in cents. An allowance
 * signs at its CEILING (budget_max_cents), never its line total — the two
 * can differ (an allowance's line_total_cents can reflect spend-to-date, a
 * stale edit, or simply how it was seeded), and the ceiling is the figure
 * the client is actually being asked to authorize spending up to. A fixed
 * line has no ceiling concept, so it signs at its own line total.
 */
export function signableCents(item: ScheduleLineInput): number | null {
  if (item.item_type === 'allowance') {
    const ceiling = num(item.budget_max_cents);
    if (ceiling !== null && ceiling > 0) return Math.round(ceiling);
    const total = currentLineCents(item);
    return total !== null && total > 0 ? total : null;
  }
  const total = currentLineCents(item);
  return total !== null && total > 0 ? total : null;
}

/**
 * Fold every instrument down to one authorization per schedule line. When a
 * line appears in more than one live instrument the strongest wins
 * (authorized › awaiting › draft), and among equals the later number.
 *
 * `deltaCents` is left null here — this index knows the signed price but not
 * the schedule's current one. {@link deriveLineAuthorization} fills it in.
 */
export function buildInstrumentIndex(
  instruments: readonly InstrumentLike[] | null | undefined,
): InstrumentIndex {
  const index: InstrumentIndex = new Map();

  for (const instrument of instruments ?? []) {
    if (!instrument) continue;
    const track = trackFor(instrument.state);
    if (!track) continue;
    const number = Math.max(0, Math.round(num(instrument.number) ?? 0));

    for (const item of instrument.items ?? []) {
      const lineId = item?.sourceFfeItemId;
      if (!lineId) continue;

      const candidate: LineAuthorization =
        track === 'authorized'
          ? {
              track,
              number,
              signedLineTotalCents: centsOf(item.clientLineTotalCents),
              depositClear: instrument.depositPaid === true,
              deltaCents: null,
            }
          : { track, number };

      const held = index.get(lineId);
      if (!held) {
        index.set(lineId, candidate);
        continue;
      }
      const heldRank = RANK[held.track];
      const candidateRank = RANK[candidate.track];
      if (
        candidateRank > heldRank ||
        (candidateRank === heldRank && number > numberOf(held))
      ) {
        index.set(lineId, candidate);
      }
    }
  }

  return index;
}

function numberOf(auth: LineAuthorization): number {
  return auth.track === 'none' ? 0 : auth.number;
}

/**
 * The line's authorization, with the drift stated. The signed price stands;
 * a movement since signature is recorded, never silently applied.
 */
export function deriveLineAuthorization(
  item: ScheduleLineInput,
  index: InstrumentIndex,
): LineAuthorization {
  const held = index.get(item.id);
  if (!held) return { track: 'none' };
  if (held.track !== 'authorized') return held;

  const current = currentLineCents(item);
  const deltaCents =
    current === null || current === held.signedLineTotalCents
      ? null
      : current - held.signedLineTotalCents;
  return { ...held, deltaCents };
}

/**
 * Whether a line can join the next release — and, when it cannot, the plainest
 * version of why. Ineligibility is a reason, not a refusal: the line stays
 * visible and says what would change it.
 */
export function eligibility(
  item: ScheduleLineInput,
  lineAuth: LineAuthorization,
  /** The trade scope holding this line, when one does. */
  tradeHold: TradeLineHold = { onTradeScope: false },
): LineEligibility {
  if (item.removed_at) return { eligible: false, reason: 'archived selection' };
  if (item.design_disposition && item.design_disposition !== 'selected') {
    return { eligible: false, reason: 'select this design direction first' };
  }
  if (item.blocked) return { eligible: false, reason: 'release blocked' };
  if ('authoritative_readiness' in item && item.authoritative_readiness?.ready !== true) {
    return { eligible: false, reason: 'specification not ready' };
  }
  // Trade work is bought on its own instrument. A presence line is the
  // schedule's record of work already authorized — it can never join a
  // furnishings release, and the reason says which paper holds it.
  if (tradeHold.onTradeScope) {
    return {
      eligible: false,
      reason: tradeHold.number
        ? `on trade scope · № ${tradeHold.number}`
        : 'on trade scope',
    };
  }
  if (lineAuth.track === 'authorized' || lineAuth.track === 'draft') {
    return { eligible: false, reason: `in authorization № ${lineAuth.number}` };
  }
  if (lineAuth.track === 'awaiting') {
    return {
      eligible: false,
      reason: `awaiting signature · № ${lineAuth.number}`,
    };
  }
  if (signableCents(item) === null) {
    return {
      eligible: false,
      reason:
        item.item_type === 'tbd'
          ? 'price to be determined'
          : 'no price — resolve to release',
    };
  }
  return { eligible: true };
}

/**
 * The purchase-order gate — the whole of what authorization buys a studio on
 * a commercial job. On a project with no agreement behind it the schedule
 * keeps its old logistics-only predicate and says nothing new.
 */
export function poGate(
  item: ScheduleLineInput,
  lineAuth: LineAuthorization,
  isCommercialOrigin: boolean,
  tradeHold: TradeLineHold = { onTradeScope: false },
): PoGate {
  // The DB refuses outright ("trade scope lines are not purchase-orderable"),
  // so the schedule must not offer the act. Work is engaged, not ordered.
  if (tradeHold.onTradeScope || item.trade_scope_document_id) {
    return {
      orderable: false,
      sentence: 'Trade work is engaged on its scope, not purchase-ordered',
    };
  }

  const stageAllows =
    ORDERABLE_STAGES.has(String(item.status ?? '')) && !item.blocked;

  if (!isCommercialOrigin) {
    return stageAllows
      ? { orderable: true, sentence: null }
      : { orderable: false, sentence: null };
  }

  if (lineAuth.track !== 'authorized') {
    return {
      orderable: false,
      sentence: 'Not yet authorized — no purchase order',
    };
  }

  const mark = `A${lineAuth.number}`;
  if (!lineAuth.depositClear) {
    return {
      orderable: false,
      sentence: `Authorized — the purchase order opens when the deposit clears (${mark})`,
    };
  }
  if (item.blocked) {
    return {
      orderable: false,
      sentence: 'A decision is open on this line — no purchase order yet',
    };
  }
  if (!ORDERABLE_STAGES.has(String(item.status ?? ''))) {
    return { orderable: false, sentence: 'Already on a purchase order' };
  }
  return { orderable: true, sentence: `PO available — deposit clear (${mark})` };
}

/**
 * The number the next instrument will carry. Every instrument counts, voided
 * ones included — a number is spent the moment it is minted.
 */
export function nextInstrumentNumber(
  instruments: readonly InstrumentLike[] | null | undefined,
): number {
  let highest = 0;
  for (const instrument of instruments ?? []) {
    const value = num(instrument?.number);
    if (value !== null && value > highest) highest = Math.round(value);
  }
  return highest + 1;
}

/**
 * A room header's tick: none, some, or all of its eligible lines. Callers pass
 * only the eligible ids — an untickable line never counts against a room.
 */
export function roomTriState(
  selection: ReadonlySet<string>,
  roomLineIds: readonly string[],
): RoomTriState {
  if (roomLineIds.length === 0) return 'none';
  let ticked = 0;
  for (const id of roomLineIds) if (selection.has(id)) ticked += 1;
  if (ticked === 0) return 'none';
  return ticked === roomLineIds.length ? 'all' : 'some';
}

/**
 * What this line contributes to the schedule figure a budget checkpoint
 * stamps. Mirrors `publish_budget_checkpoint` (00422) exactly — fixed lines at
 * their line total, allowances at their ceiling, anything else at nothing — so
 * the drift read compares like with like.
 */
export function scheduledContributionCents(item: ScheduleLineInput): number {
  if (item.item_type === 'allowance') {
    return centsOf(num(item.budget_max_cents) ?? 0);
  }
  if (item.item_type && item.item_type !== 'fixed') return 0;
  return centsOf(currentLineCents(item) ?? 0);
}

/** One ticked line, as the composition bar and the review sheet read it. */
export interface ReleaseLine {
  id: string;
  name: string;
  roomId: string | null;
  roomName: string;
  quantity: number;
  clientLineTotalCents: number;
}

/** The running composition: what is ticked, stated as arithmetic. */
export function releaseSummary(lines: readonly ReleaseLine[]): {
  lineCount: number;
  roomCount: number;
  totalCents: number;
} {
  const rooms = new Set<string>();
  let totalCents = 0;
  for (const line of lines) {
    rooms.add(line.roomId ?? '__throughout__');
    totalCents += centsOf(line.clientLineTotalCents);
  }
  return { lineCount: lines.length, roomCount: rooms.size, totalCents };
}

/** The deposit share the signed agreement carries, or null until it resolves. */
export function furnishingsDepositPercent(authority: unknown): number | null {
  const value = (
    authority as { furnishingsDepositPercent?: unknown } | null | undefined
  )?.furnishingsDepositPercent;
  const parsed = num(value);
  if (parsed === null) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/** The deposit due on a total, in cents. */
export function depositCents(totalCents: number, percent: number): number {
  return Math.round((centsOf(totalCents) * percent) / 100);
}

/**
 * Does the last published checkpoint cover every room in this release? The
 * client should not be asked to sign for a room they have never seen a plan
 * for. Lines with no room ("Throughout") are covered by definition.
 */
export function checkpointCoverage(input: {
  checkpointRoomIds: readonly (string | null | undefined)[];
  releasedRoomIds: readonly (string | null | undefined)[];
}): { covered: boolean; uncoveredRoomIds: string[] } {
  const known = new Set(
    input.checkpointRoomIds.filter((id): id is string => Boolean(id)),
  );
  const uncovered: string[] = [];
  for (const roomId of input.releasedRoomIds) {
    if (!roomId) continue;
    if (known.has(roomId)) continue;
    if (!uncovered.includes(roomId)) uncovered.push(roomId);
  }
  return { covered: uncovered.length === 0, uncoveredRoomIds: uncovered };
}

/**
 * How far the schedule has moved since the checkpoint stamped it. Advisory
 * only — the designer may release against a stale checkpoint, on the record,
 * with their eyes open (deck slide 11; the threshold itself is ruling R6).
 */
export function scheduleDrift(input: {
  stampedCents: number | null;
  currentCents: number | null;
  thresholdPercent?: number;
}): { drifted: boolean; deltaCents: number; percent: number } {
  const stamped = input.stampedCents;
  const current = input.currentCents;
  if (stamped === null || current === null || stamped <= 0) {
    return { drifted: false, deltaCents: 0, percent: 0 };
  }
  const deltaCents = current - stamped;
  const percent = (Math.abs(deltaCents) / stamped) * 100;
  return {
    drifted: percent > (input.thresholdPercent ?? 5),
    deltaCents,
    percent,
  };
}
