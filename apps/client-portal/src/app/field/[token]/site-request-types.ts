export const SITE_REQUEST_TOKEN_PATTERN = /^sr_[A-Za-z0-9_-]{43}$/;

export type SiteRequestKitCode = "K-01" | "K-02";
export type SiteRequestQueueState =
  | "queued"
  | "uploading"
  | "awaiting-receipt"
  | "delivered"
  | "failed"
  | "terminal";

export interface SiteRequestBootstrapDTO {
  access: { id: string; expires_at: string };
  request: {
    id: string;
    project_id: string;
    status: string;
    due_at: string;
    due_context: string | null;
    site_name: string;
    designer_name: string;
    studio_name: string | null;
  };
  assignee: { id: string; display_name: string; trade: string | null };
  items: SiteRequestItem[];
}

export interface SiteRequestItem {
  id: string;
  current_version_id: string;
  sort_order: number;
  status: string;
  redo_note: string | null;
  version: {
    id: string;
    version_number: number;
    kit_code: SiteRequestKitCode;
    title: string;
    guidance: string | null;
    room_id: string | null;
    room_name: string | null;
    configuration: Record<string, unknown>;
  };
  deliveries: Array<Record<string, unknown>>;
}

export interface SiteRequestQueueAsset {
  localId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  checksumSha256: string;
  mediaId?: string;
  storageEtag?: string;
  uploadCompleted?: boolean;
  receiptAcknowledged?: boolean;
}

export interface SiteRequestQueuedDelivery {
  id: string;
  requestId: string;
  itemId: string;
  itemVersionId: string;
  kitCode: SiteRequestKitCode;
  state: SiteRequestQueueState;
  capturedAt: string;
  capturedByName?: string;
  payload: Record<string, unknown>;
  dimensions: Array<{
    label: string;
    value_mm: number;
    proofAssetLocalId?: string;
  }>;
  assets: SiteRequestQueueAsset[];
  retryCount: number;
  nextRetryAt?: string;
  lastError?: string;
  terminalReason?: "access-ended" | "capture-invalid" | "request-changed";
  deliveredAt?: string;
}

export interface MeasureDefinition {
  id: string;
  label: string;
  guidance?: string;
}

export interface PhotoShotDefinition {
  id: string;
  label: string;
  guidance?: string;
  referenceUrl?: string;
}

export function isLikelySiteRequestToken(
  token: string | null | undefined,
): boolean {
  return typeof token === "string" && SITE_REQUEST_TOKEN_PATTERN.test(token);
}

export function imperialToMillimetres(
  feet: number,
  inches: number,
  sixteenths: number,
): number {
  if (
    ![feet, inches, sixteenths].every(Number.isFinite) ||
    feet < 0 ||
    inches < 0 ||
    inches >= 12 ||
    !Number.isInteger(sixteenths) ||
    sixteenths < 0 ||
    sixteenths > 15
  ) {
    throw new Error("invalid_imperial_measurement");
  }
  return Math.round((feet * 12 + inches + sixteenths / 16) * 25.4);
}

export function metricToMillimetres(value: number, unit: "mm" | "cm"): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("invalid_metric_measurement");
  return Math.round(unit === "cm" ? value * 10 : value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function measureDefinitions(item: SiteRequestItem): MeasureDefinition[] {
  const candidates = item.version.configuration.dimensions ??
    item.version.configuration.dim_labels;
  if (!Array.isArray(candidates)) return [{ id: "A", label: "A" }];
  return candidates.slice(0, 20).map((candidate, index) => {
    if (typeof candidate === "string")
      return {
        id: candidate || String(index + 1),
        label: candidate || `Measure ${index + 1}`,
      };
    const row = asRecord(candidate) ?? {};
    const id =
      typeof row.id === "string"
        ? row.id
        : typeof row.label === "string"
          ? row.label
          : String(index + 1);
    return {
      id,
      label: typeof row.label === "string" ? row.label : `Measure ${index + 1}`,
      guidance: typeof row.guidance === "string" ? row.guidance : undefined,
    };
  });
}

export function photoShotDefinitions(
  item: SiteRequestItem,
): PhotoShotDefinition[] {
  const candidates = item.version.configuration.shots ??
    item.version.configuration.shot_list;
  if (!Array.isArray(candidates)) return [{ id: "1", label: "Site photo" }];
  return candidates.slice(0, 30).map((candidate, index) => {
    if (typeof candidate === "string")
      return { id: String(index + 1), label: candidate };
    const row = asRecord(candidate) ?? {};
    return {
      id: typeof row.id === "string" ? row.id : String(index + 1),
      label: typeof row.label === "string" ? row.label : `Shot ${index + 1}`,
      guidance: typeof row.guidance === "string" ? row.guidance : undefined,
      referenceUrl:
        typeof row.reference_url === "string" ? row.reference_url : undefined,
    };
  });
}

export function dueLabel(dueAt: string, context: string | null): string {
  const date = new Date(dueAt);
  const formatted = Number.isNaN(date.getTime())
    ? "Due date unavailable"
    : `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return context?.trim() ? `${formatted} · ${context.trim()}` : formatted;
}
