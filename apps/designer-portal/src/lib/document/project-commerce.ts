import type {
  CommercialState,
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

const commercialState = (value: unknown): CommercialState => {
  switch (value) {
    case "sent":
    case "client_signed":
    case "executed":
    case "declined":
    case "expired":
    case "superseded":
      return value;
    default:
      return "draft";
  }
};

export interface WorkingBudgetCheckpointView extends WorkingBudgetCheckpoint {
  checkpointCode: string;
  snapshotFingerprint: string;
}

export interface WorkingBudgetView {
  version: WorkingBudgetVersion | null;
  checkpoint: WorkingBudgetCheckpointView | null;
  note: string | null;
  isPurchaseAuthority: false;
}

export interface WorkingBudgetLineDraft {
  id: string;
  roomId: string | null;
  roomName: string;
  category: string;
  lowCents: number;
  targetCents: number;
  highCents: number;
  sortOrder: number;
}

export interface BudgetValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateWorkingBudgetLines(
  lines: WorkingBudgetLineDraft[],
): BudgetValidationResult {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();

  if (lines.length === 0) {
    errors._form = "Add at least one room and category before saving.";
  }

  lines.forEach((line) => {
    const key = `${line.roomName.trim().toLocaleLowerCase()}::${line.category
      .trim()
      .toLocaleLowerCase()}`;
    if (!line.roomName.trim() || !line.category.trim()) {
      errors[line.id] = "Room and category are required.";
    } else if (seen.has(key)) {
      errors[line.id] = "Each room and category pair must be unique.";
    } else if (
      !Number.isFinite(line.lowCents) ||
      !Number.isFinite(line.targetCents) ||
      !Number.isFinite(line.highCents) ||
      line.lowCents < 0 ||
      line.targetCents < 0 ||
      line.highCents < 0
    ) {
      errors[line.id] = "Budget amounts must be zero or greater.";
    } else if (
      line.lowCents > line.targetCents ||
      line.targetCents > line.highCents
    ) {
      errors[line.id] = "Enter the range in low, target, high order.";
    }
    seen.add(key);
  });

  return { valid: Object.keys(errors).length === 0, errors };
}

export function workingBudgetTotals(lines: WorkingBudgetLineDraft[]) {
  return lines.reduce(
    (total, line) => ({
      lowCents: total.lowCents + cents(line.lowCents),
      targetCents: total.targetCents + cents(line.targetCents),
      highCents: total.highCents + cents(line.highCents),
    }),
    { lowCents: 0, targetCents: 0, highCents: 0 },
  );
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
  const lines: WorkingBudgetLine[] = rawLines.map(
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
      notes: null,
      sortOrder: Number(line.sortOrder ?? line.sort_order ?? index),
    }),
  );
  const rawCheckpoint = raw.checkpoint;
  const rawCheckpointState = rawCheckpoint?.status ?? rawCheckpoint?.state;
  const checkpointState =
    rawCheckpointState === "acknowledged"
      ? "acknowledged"
      : rawCheckpointState === "overridden"
        ? "overridden"
        : "published";
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

export interface FurnishingsWaveItemView {
  id: string;
  name: string;
  roomName: string;
  category: string;
  itemType: string;
  quantity: number;
  clientUnitPriceCents: number;
  clientLineTotalCents: number;
  sortOrder: number;
}

export interface FurnishingsWaveView {
  documentId: string;
  proposalId: string;
  waveName: string;
  state: CommercialState;
  status: string;
  totalAmountCents: number;
  depositPercent: number;
  depositRequiredCents: number;
  depositInvoiceId: string | null;
  executedAt: string | null;
  sentAt: string | null;
  proposalSendDispatchId: string | null;
  checkpointId: string | null;
  itemCount: number;
  items: FurnishingsWaveItemView[];
}

export type DepositPosture =
  | "draft"
  | "awaiting_signature"
  | "ready_to_execute"
  | "preparing_invoice"
  | "invoice_ready";

export function furnishingsDepositPosture(
  wave: Pick<FurnishingsWaveView, "state" | "depositInvoiceId">,
): DepositPosture {
  if (wave.depositInvoiceId) return "invoice_ready";
  if (wave.state === "executed") return "preparing_invoice";
  if (wave.state === "client_signed") return "ready_to_execute";
  if (wave.state === "sent") return "awaiting_signature";
  return "draft";
}

/**
 * Maps the frozen allowlist RPC. Trade cost, markup, and vendor values are
 * deliberately never copied, even if a future or malformed payload includes
 * them.
 */
export function mapFurnishingsWaves(value: unknown): FurnishingsWaveView[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row: Record<string, any>) => {
    const documentId = String(row.documentId ?? row.document_id ?? "");
    const totalAmountCents = cents(
      row.totalAmountCents ?? row.total_amount_cents,
    );
    const depositPercent = Math.min(
      100,
      cents(row.depositPercent ?? row.deposit_percent),
    );
    const authoritativeDepositRequired =
      row.depositRequiredCents ?? row.deposit_required_cents;
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      documentId,
      proposalId: String(row.proposalId ?? row.proposal_id ?? ""),
      waveName: text(row.waveName ?? row.wave_name) || "Furnishings wave",
      state: commercialState(row.commercialState ?? row.commercial_state),
      status: text(row.status),
      totalAmountCents,
      depositPercent,
      depositRequiredCents:
        authoritativeDepositRequired === null ||
        authoritativeDepositRequired === undefined
          ? Math.round((totalAmountCents * depositPercent) / 100)
          : cents(authoritativeDepositRequired),
      depositInvoiceId: nullableText(
        row.depositInvoiceId ?? row.deposit_invoice_id,
      ),
      executedAt: nullableText(row.executedAt ?? row.executed_at),
      sentAt: nullableText(row.sentAt ?? row.sent_at),
      proposalSendDispatchId: nullableText(
        row.proposalSendDispatchId ?? row.proposal_send_dispatch_id,
      ),
      checkpointId: nullableText(
        row.budgetCheckpointId ?? row.budget_checkpoint_id,
      ),
      itemCount: Number(row.itemCount ?? row.item_count ?? items.length),
      items: items.map((item: Record<string, any>, index: number) => ({
        id: String(item.id),
        name: text(item.name) || "Furnishing",
        roomName: text(item.roomName ?? item.room_name),
        category: text(item.category),
        itemType: text(item.itemType ?? item.item_type),
        quantity: Math.max(0, Number(item.quantity ?? 0)),
        clientUnitPriceCents: cents(
          item.clientUnitPriceCents ?? item.client_unit_price_cents,
        ),
        clientLineTotalCents: cents(
          item.clientLineTotalCents ?? item.client_line_total_cents,
        ),
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? index),
      })),
    };
  });
}
