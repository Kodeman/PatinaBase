import type {
  WorkingBudgetCheckpoint,
  WorkingBudgetLine,
  WorkingBudgetVersion,
} from "@patina/types";

const cents = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const nullableText = (value: unknown) => {
  const valueText = text(value);
  return valueText || null;
};

export interface WorkingBudgetCheckpointView extends WorkingBudgetCheckpoint {
  checkpointCode: string;
  snapshotFingerprint: string;
}

/**
 * A working-budget line, plus two read-only derived figures the Derived
 * Budget Grid renders alongside the editable Target: `scheduledCents` (the
 * live FF&E schedule's current total for this room × category) and
 * `authorizedCents` (the portion of that already covered by an executed
 * furnishings authorization). Both are server-stamped by
 * `get_project_working_budget` / `derive_working_budget_draft` — see the
 * "Scheduled/Authorized source" note on `mapWorkingBudget` below for why
 * this reads stamped values rather than a client-side live recompute.
 */
export interface WorkingBudgetLineView extends WorkingBudgetLine {
  scheduledCents: number;
  authorizedCents: number;
}

export interface WorkingBudgetVersionView
  extends Omit<WorkingBudgetVersion, 'lines'> {
  lines: WorkingBudgetLineView[];
}

export interface WorkingBudgetView {
  version: WorkingBudgetVersionView | null;
  checkpoint: WorkingBudgetCheckpointView | null;
  note: string | null;
  isPurchaseAuthority: false;
}

/**
 * Bounds-check for a single Target-cell edit (DerivedBudgetGrid /
 * useSetBudgetTargets). The old multi-line room+category+low/high validator
 * (dedupe, range ordering, add/remove rows) is retired with manual line
 * entry — rows are schedule-derived now (useDeriveWorkingBudget), and Target
 * is the only editable figure.
 */
export function isValidBudgetTargetCents(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function mapWorkingBudget(value: unknown): WorkingBudgetView {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    return {
      version: null,
      checkpoint: null,
      note: null,
      isPurchaseAuthority: false,
    };
  }
  const raw = row as Record<string, any>;
  const rawVersion = raw.version;
  if (!rawVersion?.id) {
    return {
      version: null,
      checkpoint: null,
      note: null,
      isPurchaseAuthority: false,
    };
  }

  const versionId = String(rawVersion.id);
  const rawLines = Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(rawVersion.lines)
      ? rawVersion.lines
      : [];
  // Scheduled/Authorized source: these are read from the RPC row when
  // present (server-stamped at derive/publish time), defaulting to 0
  // otherwise. A live client-side recompute was considered — but
  // useProjectFinancials' byRoom/byCategory rollups aggregate ONE dimension
  // at a time, not the room × category pairing a budget line needs, so
  // matching it live would mean re-deriving the same grouped query the
  // server already runs for derive_working_budget_draft. Reading the
  // server's stamped figure keeps that grouping in one place; the grid
  // pairs it with a static "as of the last sync" caption rather than a
  // per-line timestamp diff.
  const lines: WorkingBudgetLineView[] = rawLines.map(
    (line: Record<string, any>, index: number) => ({
      id: String(line.id),
      versionId,
      roomId: nullableText(
        line.projectRoomId ?? line.roomId ?? line.project_room_id,
      ),
      roomName: text(line.roomName ?? line.room_name),
      category: text(line.category),
      lowCents: cents(line.lowCents ?? line.low_cents),
      targetCents: cents(line.targetCents ?? line.target_cents),
      highCents: cents(line.highCents ?? line.high_cents),
      scheduledCents: cents(line.scheduledCents ?? line.scheduled_cents),
      authorizedCents: cents(line.authorizedCents ?? line.authorized_cents),
      notes: null,
      sortOrder: Number(line.sortOrder ?? line.sort_order ?? index),
    }),
  );
  const rawCheckpoint = raw.checkpoint;
  const rawCheckpointState = rawCheckpoint?.status ?? rawCheckpoint?.state;
  // project_budget_checkpoints.status (00412) is exactly 'open' | 'acknowledged'
  // | 'overridden' — 'open' is the unacknowledged default the moment a
  // checkpoint publishes, and it is NOT the same thing as "published" (that
  // word never appears as a real status value here; a version's own state
  // uses 'published' for a different concept entirely). Collapsing 'open'
  // into anything else lets the release gate reason about a status the
  // server will still refuse.
  const checkpointState: WorkingBudgetCheckpointView["state"] =
    rawCheckpointState === "acknowledged"
      ? "acknowledged"
      : rawCheckpointState === "overridden"
        ? "overridden"
        : "open";
  const publishedAt = text(rawVersion.publishedAt ?? rawVersion.published_at);

  return {
    version: {
      id: versionId,
      projectId: String(rawVersion.projectId ?? rawVersion.project_id),
      version: Number(rawVersion.version ?? 1),
      state:
        rawVersion.status === "published" || rawVersion.state === "published"
          ? "published"
          : "draft",
      currency: text(rawVersion.currency) || "USD",
      lowTotalCents: cents(
        rawVersion.lowTotalCents ?? rawVersion.low_total_cents,
      ),
      targetTotalCents: cents(
        rawVersion.targetTotalCents ?? rawVersion.target_total_cents,
      ),
      highTotalCents: cents(
        rawVersion.highTotalCents ?? rawVersion.high_total_cents,
      ),
      lines,
      createdAt: text(rawVersion.createdAt ?? rawVersion.created_at),
      publishedAt: publishedAt || null,
    },
    checkpoint: rawCheckpoint?.id
      ? {
          id: String(rawCheckpoint.id),
          projectId: String(rawVersion.projectId ?? rawVersion.project_id),
          versionId,
          state: checkpointState,
          checkpointCode:
            text(
              rawCheckpoint.checkpointCode ?? rawCheckpoint.checkpoint_code,
            ) || `B-${String(rawVersion.version ?? 1).padStart(3, "0")}`,
          snapshotFingerprint: text(
            rawCheckpoint.snapshotFingerprint ??
              rawCheckpoint.snapshot_fingerprint,
          ),
          publishedAt: text(
            rawCheckpoint.publishedAt ?? rawCheckpoint.published_at,
          ),
          acknowledgedAt: nullableText(
            rawCheckpoint.acknowledgedAt ?? rawCheckpoint.acknowledged_at,
          ),
          acknowledgedBy: nullableText(
            rawCheckpoint.acknowledgedBy ?? rawCheckpoint.acknowledged_by,
          ),
          overrideAt: nullableText(
            rawCheckpoint.overriddenAt ?? rawCheckpoint.overrideAt,
          ),
          overrideBy: nullableText(
            rawCheckpoint.overrideBy ?? rawCheckpoint.override_by,
          ),
          overrideReason: nullableText(
            rawCheckpoint.overrideReason ?? rawCheckpoint.override_reason,
          ),
        }
      : null,
    note: nullableText(rawVersion.note),
    // This is intentionally constant. A working budget never grants purchase
    // authority, regardless of a malformed or over-broad RPC response.
    isPurchaseAuthority: false,
  };
}

export interface ProjectInstrumentItemView {
  id: string;
  /** The project_ffe_items row this line was released from — null until the
   *  schedule-origin RPC (create_furnishings_authorization_from_schedule)
   *  lands and starts carrying it. */
  sourceFfeItemId: string | null;
  projectRoomId: string | null;
  roomName: string;
  name: string;
  quantity: number;
  clientUnitPriceCents: number;
  clientLineTotalCents: number;
  itemType: string;
  sortOrder: number;
}

/**
 * A furnishings authorization's state, as it actually cycles for this
 * document kind: the client's single signature moves it straight from
 * `sent` to `executed` (there is no separate studio-countersign step, unlike
 * a design services agreement) — so unlike the broader `CommercialState`,
 * there is no `client_signed` here. `expired` is likewise folded into
 * `draft` by {@link instrumentState} below, since an authorization that
 * expired unsent never had client-facing standing to preserve.
 */
export type ProjectInstrumentState =
  | "draft"
  | "sent"
  | "executed"
  | "declined"
  | "superseded";

export interface ProjectInstrumentView {
  documentId: string;
  proposalId: string;
  /** 1-based display ordinal ("Authorization № N") — the RPC already orders
   *  by bound_at, so this is that creation order, not a stored column. */
  number: number;
  name: string;
  kind: "furnishings_authorization";
  state: ProjectInstrumentState;
  totalAmountCents: number;
  depositPercent: number;
  depositRequiredCents: number;
  depositInvoiceId: string | null;
  /** True once the deposit invoice's paid total meets the required amount.
   *  Vacuously false (not true) when no deposit is due — there is nothing to
   *  confirm as paid. */
  depositPaid: boolean;
  checkpointId: string | null;
  /** Every project_room_id this instrument's items touch, deduped — derived
   *  from the items themselves, not a separate RPC field. */
  coveredRoomIds: string[];
  executedAt: string | null;
  sentAt: string | null;
  proposalSendDispatchId: string | null;
  /** Set once a void names this instrument's replacement — looked up by
   *  proposal id against the same response's number assignment, so it only
   *  resolves when both documents are present in the one list call. */
  supersededByNumber: number | null;
  itemCount: number;
  items: ProjectInstrumentItemView[];
}

export type DepositPosture =
  | "draft"
  | "awaiting_signature"
  | "ready_to_execute"
  | "preparing_invoice"
  | "invoice_ready";

export function furnishingsDepositPosture(
  instrument: Pick<ProjectInstrumentView, "state" | "depositInvoiceId">,
): DepositPosture {
  if (instrument.depositInvoiceId) return "invoice_ready";
  if (instrument.state === "executed") return "preparing_invoice";
  if (instrument.state === "sent") return "awaiting_signature";
  return "draft";
}

export interface InstrumentStatusView {
  label: string;
  tone: "quiet" | "clay" | "golden" | "sage" | "terracotta";
}

/**
 * The Authorizations Ledger's State column copy. `superseded` reads as
 * "Void · superseded" because voiding is the only path there is to that
 * state for a furnishings authorization (there is no revise-and-resend
 * chain the way proposals have) — see VoidAct.
 */
export function instrumentStatusView(
  state: ProjectInstrumentState,
): InstrumentStatusView {
  switch (state) {
    case "draft":
      return { label: "Draft", tone: "quiet" };
    case "sent":
      return { label: "Sent", tone: "clay" };
    case "executed":
      return { label: "Executed", tone: "sage" };
    case "declined":
      return { label: "Declined", tone: "terracotta" };
    case "superseded":
      return { label: "Void · superseded", tone: "quiet" };
  }
}

function instrumentState(value: unknown): ProjectInstrumentState {
  switch (value) {
    case "sent":
    case "executed":
    case "declined":
    case "superseded":
      return value;
    default:
      return "draft";
  }
}

/**
 * Maps the frozen allowlist RPC (list_furnishings_authorizations). Trade
 * cost, markup, and vendor values are deliberately never copied, even if a
 * future or malformed payload includes them.
 */
export function mapProjectInstruments(value: unknown): ProjectInstrumentView[] {
  const rows = Array.isArray(value) ? value : [];

  // 00422's list_furnishings_authorizations stamps `number` itself — a
  // row_number() over EVERY furnishing instrument on the project (voided
  // ones included), keyed the same (bound_at, id) way the RPC orders its
  // own output, so a client and the studio always agree on "that's № 2".
  // This local fallback only covers a malformed/older payload that omits
  // it — recomputed over the RPC's own row order, which is the closest
  // approximation available without the server's full-history view.
  const numberByProposalId = new Map<string, number>();
  rows.forEach((row: Record<string, any>, index: number) => {
    const proposalId = String(row.proposalId ?? row.proposal_id ?? "");
    if (proposalId) numberByProposalId.set(proposalId, index + 1);
  });

  return rows.map((row: Record<string, any>, index: number) => {
    const documentId = String(row.documentId ?? row.document_id ?? "");
    const proposalId = String(row.proposalId ?? row.proposal_id ?? "");
    const totalAmountCents = cents(
      row.totalAmountCents ?? row.total_amount_cents,
    );
    const depositPercent = Math.min(
      100,
      cents(row.depositPercent ?? row.deposit_percent),
    );
    const authoritativeDepositRequired =
      row.depositRequiredCents ?? row.deposit_required_cents;
    const depositRequiredCents =
      authoritativeDepositRequired === null ||
      authoritativeDepositRequired === undefined
        ? Math.round((totalAmountCents * depositPercent) / 100)
        : cents(authoritativeDepositRequired);
    const depositPaidCents = cents(
      row.depositPaidCents ?? row.deposit_paid_cents,
    );
    const items = Array.isArray(row.items) ? row.items : [];
    const mappedItems: ProjectInstrumentItemView[] = items.map(
      (item: Record<string, any>, itemIndex: number) => ({
        id: String(item.id),
        sourceFfeItemId: nullableText(
          item.sourceFfeItemId ??
            item.source_ffe_item_id ??
            item.sourceProposalItemId ??
            item.source_proposal_item_id,
        ),
        projectRoomId: nullableText(
          item.projectRoomId ?? item.project_room_id,
        ),
        roomName: text(item.roomName ?? item.room_name),
        name: text(item.name) || "Furnishing",
        quantity: Math.max(0, Number(item.quantity ?? 0)),
        clientUnitPriceCents: cents(
          item.clientUnitPriceCents ?? item.client_unit_price_cents,
        ),
        clientLineTotalCents: cents(
          item.clientLineTotalCents ?? item.client_line_total_cents,
        ),
        itemType: text(item.itemType ?? item.item_type),
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? itemIndex),
      }),
    );
    // Authoritative when the RPC provides it: `coveredRoomIds` is the budget
    // checkpoint's own rooms (what the whole snapshot covered at
    // authorization time), which is NOT the same set as "rooms this
    // instrument's own line items touch" — the items-derived set is only a
    // fallback for a payload that predates 00422.
    const itemRoomIds = Array.from(
      new Set(
        mappedItems
          .map((item) => item.projectRoomId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const rawCoveredRoomIds = row.coveredRoomIds ?? row.covered_room_ids;
    const coveredRoomIds = Array.isArray(rawCoveredRoomIds)
      ? Array.from(
          new Set(
            rawCoveredRoomIds
              .map((id: unknown) => (typeof id === "string" ? id : null))
              .filter((id: string | null): id is string => Boolean(id)),
          ),
        )
      : itemRoomIds;

    const providedNumber = Number(row.number);
    const number =
      Number.isFinite(providedNumber) && providedNumber > 0
        ? providedNumber
        : (numberByProposalId.get(proposalId) ?? index + 1);

    const providedDepositPaid = row.depositPaid;
    const depositPaid =
      typeof providedDepositPaid === "boolean"
        ? providedDepositPaid
        : depositRequiredCents > 0 && depositPaidCents >= depositRequiredCents;

    const providedSupersededByNumber = row.supersededByNumber ?? row.superseded_by_number;
    const supersededByNumber =
      typeof providedSupersededByNumber === "number"
        ? providedSupersededByNumber
        : null;

    return {
      documentId,
      proposalId,
      number,
      name: text(row.waveName ?? row.wave_name ?? row.name) ||
        "Furnishings authorization",
      kind: "furnishings_authorization",
      state: instrumentState(row.commercialState ?? row.commercial_state),
      totalAmountCents,
      depositPercent,
      depositRequiredCents,
      depositInvoiceId: nullableText(
        row.depositInvoiceId ?? row.deposit_invoice_id,
      ),
      depositPaid,
      checkpointId: nullableText(
        row.checkpointId ?? row.budgetCheckpointId ?? row.budget_checkpoint_id,
      ),
      coveredRoomIds,
      executedAt: nullableText(row.executedAt ?? row.executed_at),
      sentAt: nullableText(row.sentAt ?? row.sent_at),
      proposalSendDispatchId: nullableText(
        row.proposalSendDispatchId ?? row.proposal_send_dispatch_id,
      ),
      supersededByNumber,
      itemCount: Number(row.itemCount ?? row.item_count ?? mappedItems.length),
      items: mappedItems,
    };
  });
}

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : null;

/* ── Trade scopes (the Authorized Schedule deck, Act IV) ─────────────────────
 *
 * Trade work is not a furnishing with a person attached. Drapery fabrication,
 * millwork install, tile setting — these are scopes of WORK: bid, engaged,
 * performed, inspected, accepted. They carry their own instrument, their own
 * ordinal ("Trade scope № 1"), and a journey that ends in acceptance rather
 * than installation.
 *
 * Everything below is a pure adapter or a pure gate. Bids never cross into a
 * view a client can reach — the ledger reads them, the client's bundle never
 * carries them, and no mapper here copies a trade cost onto a client figure.
 * ───────────────────────────────────────────────────────────────────────── */

/** The forward-ratchet on trade_scope_terms.progress_state. */
export type TradeProgressState =
  | "none"
  | "engaged"
  | "in_progress"
  | "substantially_complete"
  | "accepted";

/** A trade scope cycles the same send/sign machine a furnishings
 *  authorization does — one client signature moves sent → executed. */
export type TradeScopeState = ProjectInstrumentState;

export type TradeBidStatus = "quoted" | "selected" | "withdrawn";
/** Where the number came from: typed in by the studio (Phase 1), or landed
 *  from a party's own response to a sent request (Phase 2, ruling R3). */
export type TradeBidSource = "recorded" | "party_response";

export interface TradeScopeDrawView {
  id: string;
  label: string;
  /** Display-only on the client's paper; `amountCents` is canonical. */
  percentage: number | null;
  amountCents: number;
  sortOrder: number;
  /** The final draw — it cannot be issued until the client accepts. */
  gatesOnAcceptance: boolean;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoicePaidCents: number;
}

export interface TradeScopeView {
  documentId: string;
  proposalId: string;
  /** 1-based ordinal among the project's trade scopes, in bound_at order —
   *  "Trade scope № 1", stamped "TS1" on the schedule. */
  number: number;
  title: string;
  state: TradeScopeState;
  progressState: TradeProgressState;
  /** The party snapshot, display name only. Never an email or a phone. */
  partyDisplayName: string | null;
  clientPriceCents: number;
  currency: string;
  depositInvoiceId: string | null;
  depositPaid: boolean;
  draws: TradeScopeDrawView[];
  drawCount: number;
  drawsIssued: number;
  drawsPaid: number;
  /** Every room the scope's sections name — the rooms its presence lines
   *  land in when the scope is engaged. */
  sectionRoomIds: string[];
  /**
   * How many scope-of-work sections this trade scope actually has — the
   * ledger's "Lines" figure for a trade row. NOT the same number as
   * `sectionRoomIds.length`: two sections can share a room (or a section can
   * name no room at all and fall out of sectionRoomIds entirely), so reading
   * the deduped room count as "lines" understates a multi-section scope and
   * can even read as fewer lines than the scope actually has.
   */
  sectionCount: number;
}

const TRADE_PROGRESS_RANK: Record<TradeProgressState, number> = {
  none: 0,
  engaged: 1,
  in_progress: 2,
  substantially_complete: 3,
  accepted: 4,
};

export function tradeProgressRank(state: TradeProgressState): number {
  return TRADE_PROGRESS_RANK[state] ?? 0;
}

/**
 * The journey band's words. `none` reads as "Authorized" because a scope only
 * reaches a client-visible journey once it is signed — before engagement the
 * signature is the only thing that has happened.
 */
export function tradeProgressLabel(state: TradeProgressState): string {
  switch (state) {
    case "engaged":
      return "Engaged";
    case "in_progress":
      return "In progress";
    case "substantially_complete":
      return "Substantially complete";
    case "accepted":
      return "Accepted";
    default:
      return "Authorized";
  }
}

/** The ledger's State column copy for a trade scope. */
export function tradeScopeStatusView(
  state: TradeScopeState,
): InstrumentStatusView {
  switch (state) {
    case "draft":
      return { label: "Draft", tone: "quiet" };
    case "sent":
      return { label: "Awaiting signature", tone: "clay" };
    case "executed":
      return { label: "Authorized", tone: "sage" };
    case "declined":
      return { label: "Declined", tone: "terracotta" };
    case "superseded":
      return { label: "Void · superseded", tone: "quiet" };
  }
}

function tradeProgress(value: unknown): TradeProgressState {
  switch (value) {
    case "engaged":
    case "in_progress":
    case "substantially_complete":
    case "accepted":
      return value;
    default:
      return "none";
  }
}

const boolish = (value: unknown): boolean => value === true;

function mapTradeDraw(row: Record<string, any>, index: number): TradeScopeDrawView {
  const rawPercentage = row.percentage ?? row.percent;
  const percentage = Number(rawPercentage);
  return {
    id: String(row.id ?? ""),
    label: text(row.label) || `Draw ${index + 1}`,
    percentage:
      rawPercentage === null || rawPercentage === undefined || !Number.isFinite(percentage)
        ? null
        : percentage,
    amountCents: cents(row.amountCents ?? row.amount_cents),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? index),
    gatesOnAcceptance: boolish(
      row.gatesOnAcceptance ?? row.gates_on_acceptance,
    ),
    invoiceId: nullableText(row.invoiceId ?? row.invoice_id),
    invoiceStatus: nullableText(row.invoiceStatus ?? row.invoice_status),
    invoicePaidCents: cents(row.invoicePaidCents ?? row.invoice_paid_cents),
  };
}

/** A draw is live-billed unless it has no invoice, or its invoice was voided. */
export function drawIsLiveBilled(draw: TradeScopeDrawView): boolean {
  return Boolean(draw.invoiceId) && draw.invoiceStatus !== "void";
}

/**
 * Mirrors the DB's own ordering gate exactly (issue_trade_draw_invoice /
 * list_trade_scopes, 00423: `i.status = 'paid' AND i.amount_paid_cents >=
 * i.total_cents`) — AND, not OR. Status alone (a 'paid' invoice that has not
 * actually settled) or amount alone (money landed on an invoice still
 * 'sent') must both read as unpaid, or the UI can offer a "next draw" act
 * the server refuses.
 */
export function drawIsPaid(draw: TradeScopeDrawView): boolean {
  if (!drawIsLiveBilled(draw)) return false;
  return (
    draw.invoiceStatus === "paid" &&
    draw.amountCents > 0 &&
    draw.invoicePaidCents >= draw.amountCents
  );
}

/**
 * Maps `list_trade_scopes` — the studio companion read beside
 * `list_furnishings_authorizations`. Bids are never part of this payload and
 * are never copied here even if a malformed response carries them.
 */
export function mapTradeScopes(value: unknown): TradeScopeView[] {
  const rows = Array.isArray(value) ? value : [];

  return rows.map((row: Record<string, any>, index: number) => {
    const rawDraws = Array.isArray(row.draws) ? row.draws : [];
    const draws = rawDraws
      .map((draw: Record<string, any>, drawIndex: number) =>
        mapTradeDraw(draw ?? {}, drawIndex),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const rawRoomIds = row.sectionRoomIds ?? row.section_room_ids;
    const sectionRoomIds = Array.isArray(rawRoomIds)
      ? Array.from(
          new Set(
            rawRoomIds.filter((id: unknown): id is string => typeof id === "string"),
          ),
        )
      : [];

    const providedNumber = Number(row.number);
    const number =
      Number.isFinite(providedNumber) && providedNumber > 0
        ? providedNumber
        : index + 1;

    // list_trade_scopes (00423) sends the real section count directly; fall
    // back to the deduped room count only when a caller's payload omits it
    // (e.g. an older cached response), which understates a multi-section
    // scope but is still better than a hard crash.
    const providedSectionCount = Number(row.sectionCount ?? row.section_count);
    const sectionCount =
      Number.isFinite(providedSectionCount) && providedSectionCount >= 0
        ? providedSectionCount
        : sectionRoomIds.length;

    const depositPaidProvided = row.depositPaid ?? row.deposit_paid;

    return {
      documentId: String(row.documentId ?? row.document_id ?? ""),
      proposalId: String(row.proposalId ?? row.proposal_id ?? ""),
      number,
      title: text(row.title) || "Trade scope",
      state: instrumentState(row.state ?? row.commercialState ?? row.commercial_state),
      progressState: tradeProgress(row.progressState ?? row.progress_state),
      partyDisplayName: nullableText(
        row.partyDisplayName ?? row.party_display_name,
      ),
      clientPriceCents: cents(row.clientPriceCents ?? row.client_price_cents),
      currency: text(row.currency) || "USD",
      depositInvoiceId: nullableText(
        row.depositInvoiceId ?? row.deposit_invoice_id,
      ),
      depositPaid:
        typeof depositPaidProvided === "boolean"
          ? depositPaidProvided
          : draws.some((draw) => draw.sortOrder === 0 && drawIsPaid(draw)),
      draws,
      drawCount: Number(row.drawCount ?? row.draw_count ?? draws.length),
      drawsIssued: draws.filter(drawIsLiveBilled).length,
      drawsPaid: draws.filter(drawIsPaid).length,
      sectionRoomIds,
      sectionCount,
    };
  });
}

/* ── The studio drawer: terms, sections, bids, draws ─────────────────────── */

export interface TradeScopeSectionView {
  id: string;
  projectRoomId: string | null;
  roomName: string;
  prose: string;
  allocationCents: number | null;
  sortOrder: number;
}

export interface TradeScopeBidView {
  id: string;
  partyId: string | null;
  partyDisplayName: string;
  amountCents: number;
  status: TradeBidStatus;
  source: TradeBidSource;
  note: string | null;
  notedAt: string | null;
  respondedAt: string | null;
}

export interface TradeScopeTermsView {
  proposalId: string;
  partyId: string | null;
  partyDisplayName: string | null;
  partyCompanyName: string | null;
  partyTrade: string | null;
  clientPriceCents: number;
  currency: string;
  terms: string;
  progressState: TradeProgressState;
  engagedAt: string | null;
  substantialCompletionAt: string | null;
  acceptedAt: string | null;
  acceptedSignedName: string | null;
}

export interface TradeScopeWorkspaceView {
  terms: TradeScopeTermsView | null;
  sections: TradeScopeSectionView[];
  bids: TradeScopeBidView[];
  draws: TradeScopeDrawView[];
}

function bidStatus(value: unknown): TradeBidStatus {
  return value === "selected" || value === "withdrawn"
    ? value
    : "quoted";
}

function bidSource(value: unknown): TradeBidSource {
  return value === "party_response" ? "party_response" : "recorded";
}

/**
 * The studio-side workspace behind one trade scope. Read straight off the four
 * tables (studio RLS), because the client bundle deliberately omits the bid
 * ledger and the list RPC deliberately omits the prose.
 */
export function mapTradeScopeWorkspace(payload: {
  proposalId: string;
  terms?: unknown;
  sections?: unknown;
  bids?: unknown;
  draws?: unknown;
}): TradeScopeWorkspaceView {
  const termsRow =
    payload.terms && typeof payload.terms === "object"
      ? (payload.terms as Record<string, any>)
      : null;

  const sections = (Array.isArray(payload.sections) ? payload.sections : [])
    .map((row: Record<string, any>, index: number) => ({
      id: String(row.id ?? ""),
      projectRoomId: nullableText(row.project_room_id ?? row.projectRoomId),
      roomName: text(row.room_name ?? row.roomName),
      prose: text(row.prose),
      allocationCents:
        row.allocation_cents === null || row.allocation_cents === undefined
          ? null
          : cents(row.allocation_cents),
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? index),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const bids = (Array.isArray(payload.bids) ? payload.bids : [])
    .map((row: Record<string, any>) => ({
      id: String(row.id ?? ""),
      partyId: nullableText(row.party_id ?? row.partyId),
      partyDisplayName:
        text(row.party_display_name ?? row.partyDisplayName) || "Unnamed",
      amountCents: cents(row.amount_cents ?? row.amountCents),
      status: bidStatus(row.status),
      source: bidSource(row.source),
      note: nullableText(row.note),
      notedAt: nullableText(row.noted_at ?? row.notedAt),
      respondedAt: nullableText(row.responded_at ?? row.respondedAt),
    }))
    .sort((a, b) => a.amountCents - b.amountCents);

  const draws = (Array.isArray(payload.draws) ? payload.draws : [])
    .map((row: Record<string, any>, index: number) => mapTradeDraw(row ?? {}, index))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    terms: termsRow
      ? {
          proposalId: String(
            termsRow.proposal_id ?? termsRow.proposalId ?? payload.proposalId,
          ),
          partyId: nullableText(termsRow.party_id ?? termsRow.partyId),
          partyDisplayName: nullableText(
            termsRow.party_display_name ?? termsRow.partyDisplayName,
          ),
          partyCompanyName: nullableText(
            termsRow.party_company_name ??
              termsRow.party_company ??
              termsRow.partyCompanyName,
          ),
          partyTrade: nullableText(termsRow.party_trade ?? termsRow.partyTrade),
          clientPriceCents: cents(
            termsRow.client_price_cents ?? termsRow.clientPriceCents,
          ),
          currency: text(termsRow.currency) || "USD",
          terms: text(termsRow.terms),
          progressState: tradeProgress(
            termsRow.progress_state ?? termsRow.progressState,
          ),
          engagedAt: nullableText(termsRow.engaged_at ?? termsRow.engagedAt),
          substantialCompletionAt: nullableText(
            termsRow.substantial_completion_at ??
              termsRow.substantialCompletionAt,
          ),
          acceptedAt: nullableText(termsRow.accepted_at ?? termsRow.acceptedAt),
          acceptedSignedName: nullableText(
            termsRow.accepted_signed_name ?? termsRow.acceptedSignedName,
          ),
        }
      : null,
    sections,
    bids,
    draws,
  };
}

/* ── The acts, and the reasons they are not available yet ────────────────── */

export type TradeGate = { allowed: true } | { allowed: false; reason: string };

/**
 * "Engage {party}" — the studio's second act, after the client's signature.
 * Two events, two dates: the client authorizes, the studio then engages.
 */
export function tradeEngageGate(scope: TradeScopeView): TradeGate {
  if (scope.state !== "executed") {
    return {
      allowed: false,
      reason:
        scope.state === "draft"
          ? "the scope has not been released yet"
          : scope.state === "sent"
            ? "awaiting the client's signature"
            : "this scope is no longer live",
    };
  }
  if (scope.progressState !== "none") {
    return { allowed: false, reason: "already engaged" };
  }
  if (!scope.depositInvoiceId) {
    return { allowed: false, reason: "the deposit invoice is still being raised" };
  }
  if (!scope.depositPaid) {
    return { allowed: false, reason: "the deposit is not paid yet" };
  }
  return { allowed: true };
}

/**
 * "Issue draw" — mirrors what `issue_trade_draw_invoice` enforces: the scope
 * is executed, this draw is not already live-billed, every earlier draw is
 * issued AND paid in full, and a draw that gates on acceptance waits for the
 * client's acceptance.
 */
export function tradeDrawGate(
  scope: TradeScopeView,
  draw: TradeScopeDrawView,
): TradeGate {
  if (scope.state !== "executed") {
    return { allowed: false, reason: "the scope is not authorized yet" };
  }
  if (drawIsLiveBilled(draw)) {
    return { allowed: false, reason: "already invoiced" };
  }
  const earlier = scope.draws.filter((other) => other.sortOrder < draw.sortOrder);
  const unpaid = earlier.find((other) => !drawIsPaid(other));
  if (unpaid) {
    return {
      allowed: false,
      reason: drawIsLiveBilled(unpaid)
        ? `${unpaid.label} is not paid yet`
        : `${unpaid.label} has not been issued yet`,
    };
  }
  if (draw.gatesOnAcceptance && scope.progressState !== "accepted") {
    return { allowed: false, reason: "the client has not accepted the work yet" };
  }
  return { allowed: true };
}

/** "Mark in progress" / "Record substantial completion" — forward only. */
export function tradeProgressGate(
  scope: TradeScopeView,
  next: Exclude<TradeProgressState, "none" | "accepted">,
): TradeGate {
  if (scope.state !== "executed") {
    return { allowed: false, reason: "the scope is not authorized yet" };
  }
  if (scope.progressState === "none") {
    return { allowed: false, reason: "engage the trade first" };
  }
  if (tradeProgressRank(scope.progressState) >= tradeProgressRank(next)) {
    return { allowed: false, reason: "already recorded" };
  }
  return { allowed: true };
}

/* ── The draw schedule, as the editor holds it ───────────────────────────── */

export interface TradeDrawDraft {
  id?: string;
  label: string;
  /** What the studio typed. Display-only on the client's paper. */
  percentage: number | null;
  gatesOnAcceptance: boolean;
}

/**
 * Percentages are what the studio types; cents are what the client owes. The
 * last draw takes the remainder so the schedule sums to the client price to
 * the penny — which is exactly what `send_commercial_document`'s trade arm
 * checks before it will let the scope go out.
 */
export function computeDrawAmounts(
  clientPriceCents: number,
  drafts: readonly TradeDrawDraft[],
): number[] {
  const price = cents(clientPriceCents);
  if (drafts.length === 0) return [];
  const amounts = drafts.map((draft) =>
    Math.round((price * (draft.percentage ?? 0)) / 100),
  );
  const head = amounts.slice(0, -1).reduce((sum, value) => sum + value, 0);
  amounts[amounts.length - 1] = price - head;
  return amounts;
}

/**
 * The structural rule behind the two pinned rows: the deposit (first) never
 * gates on acceptance, and exactly one draw does — the last one — because
 * that is what `issue_trade_draw_invoice` enforces when the money is
 * actually billed. Rather than trust a stored `gatesOnAcceptance` per row
 * (which a hydrated schedule — an older save, a direct-table edit, a bug —
 * could carry in violation of that rule with no visible sign in the editor),
 * this DERIVES the flag from position every time the schedule is loaded or
 * reordered, so the invariant cannot silently drift out of true. Returns a
 * new array; a no-op re-pin (nothing was wrong) is still safe to apply.
 */
export function pinDrawScheduleGates(
  drafts: readonly TradeDrawDraft[],
): TradeDrawDraft[] {
  if (drafts.length === 0) return [];
  return drafts.map((draft, index) => ({
    ...draft,
    gatesOnAcceptance: index === drafts.length - 1,
  }));
}

/** True when every draw's gatesOnAcceptance already matches pinDrawScheduleGates' derivation. */
export function drawScheduleGatesArePinned(
  drafts: readonly TradeDrawDraft[],
): boolean {
  return drafts.every(
    (draft, index) => draft.gatesOnAcceptance === (index === drafts.length - 1),
  );
}

/**
 * The same rules the DB holds, said in the studio's language before the send
 * is attempted: at least a deposit and a separate final draw, percentages
 * summing to 100, every draw carrying money, and exactly one
 * acceptance-gated draw sitting last.
 *
 * The two-draw floor mirrors send_commercial_document's trade arm — a
 * single draw is trivially "the last draw" and "the only gated draw" at
 * once, so a lone acceptance-gated draw used to pass every other check here
 * (and the DB's, before its own floor tightened) while actually billing the
 * full price at signature instead of on acceptance.
 */
export function validateDrawSchedule(
  clientPriceCents: number,
  drafts: readonly TradeDrawDraft[],
): string | null {
  if (drafts.length < 2) {
    return "A schedule needs at least a deposit and a separate final draw.";
  }
  if (drafts.some((draft) => !draft.label.trim())) {
    return "Every draw needs a name.";
  }
  const percentTotal = drafts.reduce(
    (sum, draft) => sum + (draft.percentage ?? 0),
    0,
  );
  if (Math.round(percentTotal * 100) !== 10_000) {
    return `The draws come to ${Math.round(percentTotal * 100) / 100}% — they must come to 100%.`;
  }
  const amounts = computeDrawAmounts(clientPriceCents, drafts);
  if (amounts.some((amount) => amount <= 0)) {
    return "Every draw must carry an amount.";
  }
  const gated = drafts.filter((draft) => draft.gatesOnAcceptance);
  if (gated.length !== 1) {
    return "Exactly one draw falls due on acceptance.";
  }
  if (!drafts[drafts.length - 1].gatesOnAcceptance) {
    return "The draw that falls due on acceptance must be the last one.";
  }
  return null;
}

export interface TradeScopeDraftInput {
  partyId: string | null;
  clientPriceCents: number;
  sections: readonly { roomName: string; prose: string; allocationCents: number | null }[];
  draws: readonly TradeDrawDraft[];
}

/**
 * Everything `send_commercial_document`'s trade arm requires, checked before
 * the release is attempted so the designer reads a sentence rather than a
 * constraint violation.
 */
export function validateTradeScopeDraft(
  input: TradeScopeDraftInput,
): string | null {
  if (!input.partyId) return "Choose who does this work.";
  if (cents(input.clientPriceCents) <= 0) {
    return "Name the price the client is being asked to authorize.";
  }
  const written = input.sections.filter((section) => section.prose.trim());
  if (written.length === 0) {
    return "Write the work — at least one room.";
  }
  const allocated = written.filter(
    (section) => section.allocationCents !== null && section.allocationCents > 0,
  );
  if (allocated.length > 0) {
    const total = allocated.reduce(
      (sum, section) => sum + cents(section.allocationCents),
      0,
    );
    if (total !== cents(input.clientPriceCents)) {
      return "The room allocations must come to the client price, or be left blank.";
    }
  }
  return validateDrawSchedule(input.clientPriceCents, input.draws);
}

/* ── The journey band ────────────────────────────────────────────────────── */

export type TradeJourneyStepState = "done" | "now" | "ahead";

export interface TradeJourneyStep {
  key:
    | "authorized"
    | "engaged"
    | "in_progress"
    | "substantially_complete"
    | "accepted"
    | "final_payment";
  label: string;
  state: TradeJourneyStepState;
}

/**
 * The six steps a signed scope walks (deck slide 17). "Now" is the furthest
 * step reached, not the next one owed — the band reports where the work IS,
 * and the acts beneath it say what would move it.
 *
 * Final payment is the only step that is not a progress state: it lands when
 * the acceptance-gated draw is paid, which is the last thing that happens to a
 * trade scope on this project.
 */
export function tradeJourneySteps(scope: TradeScopeView): TradeJourneyStep[] {
  const authorized = scope.state === "executed";
  const rank = authorized ? tradeProgressRank(scope.progressState) : -1;
  const finalDraw = scope.draws.find((draw) => draw.gatesOnAcceptance);
  const finalPaid = Boolean(finalDraw && drawIsPaid(finalDraw));

  // The progress ranks line up one-for-one with the first five steps
  // (none → Authorized, engaged → Engaged, …), and final payment is the
  // sixth, reached only when the acceptance-gated draw is paid.
  const reached = finalPaid ? 5 : authorized ? rank : 0;

  const labels: { key: TradeJourneyStep["key"]; label: string }[] = [
    { key: "authorized", label: "Authorized" },
    { key: "engaged", label: "Engaged" },
    { key: "in_progress", label: "In progress" },
    { key: "substantially_complete", label: "Substantially complete" },
    { key: "accepted", label: "Accepted" },
    { key: "final_payment", label: "Final payment" },
  ];

  return labels.map((step, index) => ({
    ...step,
    state:
      !authorized
        ? "ahead"
        : index < reached
          ? "done"
          : index === reached
            ? "now"
            : "ahead",
  }));
}

/* ── The merged ledger ───────────────────────────────────────────────────── */

export type CommerceLedgerRow =
  | {
      key: string;
      kind: "furnishings";
      mark: string;
      label: string;
      number: number;
      instrument: ProjectInstrumentView;
    }
  | {
      key: string;
      kind: "trade";
      mark: string;
      label: string;
      number: number;
      scope: TradeScopeView;
    };

/**
 * One ledger, two instruments. Furnishings authorizations keep their A-marks
 * and trade scopes carry TS-marks, each numbered in its own sequence — the
 * two never share an ordinal, because a studio saying "№ 3" always means one
 * kind of paper or the other.
 */
export function mergeCommerceLedgerRows(
  instruments: readonly ProjectInstrumentView[] | null | undefined,
  scopes: readonly TradeScopeView[] | null | undefined,
): CommerceLedgerRow[] {
  const furnishings: CommerceLedgerRow[] = (instruments ?? []).map(
    (instrument) => ({
      key: `furnishings:${instrument.documentId || instrument.proposalId}`,
      kind: "furnishings" as const,
      mark: `A${instrument.number}`,
      label: `Authorization № ${instrument.number} · ${instrument.name}`,
      number: instrument.number,
      instrument,
    }),
  );
  const trade: CommerceLedgerRow[] = (scopes ?? []).map((scope) => ({
    key: `trade:${scope.documentId || scope.proposalId}`,
    kind: "trade" as const,
    mark: `TS${scope.number}`,
    label: `Trade scope № ${scope.number} · ${scope.title}`,
    number: scope.number,
    scope,
  }));

  return [
    ...furnishings.sort((a, b) => a.number - b.number),
    ...trade.sort((a, b) => a.number - b.number),
  ];
}
