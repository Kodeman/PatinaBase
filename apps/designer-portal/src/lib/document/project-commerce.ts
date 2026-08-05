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
