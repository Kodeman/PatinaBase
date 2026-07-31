import type {
  ProjectFfeSpec,
  SpecBookAudience,
  SpecBookWorkItem,
} from "@patina/supabase";

export type ResolvedSource =
  | "project_override"
  | "ffe_line"
  | "product_master"
  | "studio_custom"
  | "declaration";

export interface ResolvedSpecValue<T = unknown> {
  value: T | null;
  source: ResolvedSource;
  sourceUpdatedAt: string | null;
  verifiedAt: string | null;
  na: boolean;
  naReason: string | null;
}

export type SpecField =
  | "sku"
  | "finish"
  | "material"
  | "color_fabric"
  | "selected_dimensions"
  | "exact_location";

type ContractSpecField =
  | "sku"
  | "finish"
  | "material"
  | "colorFabric"
  | "dimensions"
  | "exactLocation";

const SPEC_FIELD_CONTRACT_KEYS: Record<SpecField, ContractSpecField> = {
  sku: "sku",
  finish: "finish",
  material: "material",
  color_fabric: "colorFabric",
  selected_dimensions: "dimensions",
  exact_location: "exactLocation",
};

export function specFieldContractKey(field: SpecField): ContractSpecField {
  return SPEC_FIELD_CONTRACT_KEYS[field];
}

export function buildNaDeclarationUpdate(
  field: SpecField,
  reason: string,
  declaredAt = new Date(),
): Record<string, { na: true; reason: string; declared_at: string }> {
  return {
    [specFieldContractKey(field)]: {
      na: true,
      reason: reason.trim(),
      declared_at: declaredAt.toISOString(),
    },
  };
}

export type AudiencePreviewField =
  | SpecField
  | "name"
  | "document_code"
  | "room"
  | "quantity"
  | "selected_media"
  | "client_price"
  | "trade_price"
  | "markup"
  | "client_notes"
  | "vendor_notes"
  | "install_notes"
  | "care_notes"
  | "warranty_notes";

const AUDIENCE_ALLOWLISTS: Record<
  SpecBookAudience,
  ReadonlySet<AudiencePreviewField>
> = {
  client: new Set([
    "name",
    "document_code",
    "room",
    "quantity",
    "selected_media",
    "client_price",
    "sku",
    "finish",
    "material",
    "color_fabric",
    "selected_dimensions",
    "client_notes",
    "care_notes",
    "warranty_notes",
  ]),
  vendor: new Set([
    "name",
    "document_code",
    "quantity",
    "selected_media",
    "sku",
    "finish",
    "material",
    "color_fabric",
    "selected_dimensions",
    "vendor_notes",
  ]),
  installer: new Set([
    "name",
    "document_code",
    "room",
    "quantity",
    "selected_media",
    "selected_dimensions",
    "exact_location",
    "install_notes",
  ]),
  internal: new Set([
    "name",
    "document_code",
    "room",
    "quantity",
    "selected_media",
    "client_price",
    "trade_price",
    "markup",
    "sku",
    "finish",
    "material",
    "color_fabric",
    "selected_dimensions",
    "exact_location",
    "client_notes",
    "vendor_notes",
    "install_notes",
    "care_notes",
    "warranty_notes",
  ]),
  care: new Set([
    "name",
    "document_code",
    "selected_media",
    "care_notes",
    "warranty_notes",
  ]),
};

/** Audience filtering is allow-list only; unknown fields fail closed. */
export function audienceAllows(
  audience: SpecBookAudience,
  field: string,
): field is AudiencePreviewField {
  return AUDIENCE_ALLOWLISTS[audience].has(field as AudiencePreviewField);
}

const EMPTY = new Set<unknown>([null, undefined, ""]);

function present(value: unknown): boolean {
  if (EMPTY.has(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function productValue(
  product: Record<string, unknown> | null,
  field: SpecField,
): unknown {
  if (!product) return null;
  switch (field) {
    case "material":
      return product.materials ?? product.material_tags ?? null;
    case "color_fabric":
      return product.colors ?? product.available_colors ?? null;
    case "selected_dimensions":
      return product.dimensions ?? null;
    case "exact_location":
      return null;
    default:
      return product[field] ?? null;
  }
}

function contractFieldValue<T>(
  record: Record<string, T> | null | undefined,
  field: SpecField,
): T | undefined {
  if (!record) return undefined;
  const canonical = specFieldContractKey(field);
  return canonical in record ? record[canonical] : record[field];
}

/**
 * The sole value-resolution rule shared by cards, editor, preview, and
 * preflight: project override → FF&E line → product master → studio custom.
 */
export function resolveSpecValue(
  item: SpecBookWorkItem,
  field: SpecField,
): ResolvedSpecValue {
  const declaration = contractFieldValue(item.spec?.na_declarations, field);
  if (declaration?.na === true && declaration.reason?.trim()) {
    return {
      value: null,
      source: "declaration",
      sourceUpdatedAt: declaration.declared_at ?? item.spec?.updated_at ?? null,
      verifiedAt: null,
      na: true,
      naReason: declaration.reason,
    };
  }

  const verifiedAt = contractFieldValue(
    item.spec?.source_verifications,
    field,
  ) ?? null;
  const override = item.spec?.[field];
  if (present(override)) {
    return {
      value: override,
      source: "project_override",
      sourceUpdatedAt: item.spec?.updated_at ?? null,
      verifiedAt,
      na: false,
      naReason: null,
    };
  }

  const lineValue = item[field as keyof SpecBookWorkItem];
  if (present(lineValue)) {
    return {
      value: lineValue,
      source: "ffe_line",
      sourceUpdatedAt: item.updated_at,
      verifiedAt: null,
      na: false,
      naReason: null,
    };
  }

  const masterValue = productValue(item.product, field);
  if (present(masterValue)) {
    return {
      value: masterValue,
      source: "product_master",
      sourceUpdatedAt: (item.product?.updated_at as string | null) ?? null,
      verifiedAt,
      na: false,
      naReason: null,
    };
  }

  const custom = contractFieldValue(
    item.custom_fields as Record<string, unknown> | undefined,
    field,
  );
  return {
    value: present(custom) ? custom : null,
    source: "studio_custom",
    sourceUpdatedAt: item.updated_at,
    verifiedAt: null,
    na: false,
    naReason: null,
  };
}

export function displayResolvedValue(value: ResolvedSpecValue): string {
  if (value.na) return `N/A — ${value.naReason}`;
  if (Array.isArray(value.value)) return value.value.join(", ");
  if (value.value && typeof value.value === "object") {
    return Object.entries(value.value)
      .map(([key, entry]) => `${key} ${String(entry)}`)
      .join(" · ");
  }
  return value.value == null ? "Not specified" : String(value.value);
}

export type PreflightSeverity = "blocking" | "warning";

export interface SpecBookPreflightIssue {
  code: string;
  severity: PreflightSeverity;
  message: string;
  itemId?: string;
  field?: string;
}

export interface SpecBookPreflightResult {
  blockers: SpecBookPreflightIssue[];
  warnings: SpecBookPreflightIssue[];
  ready: boolean;
}

const SELECTION_FIELDS: SpecField[] = [
  "sku",
  "finish",
  "material",
  "color_fabric",
  "selected_dimensions",
];

function imageFor(item: SpecBookWorkItem): string | null {
  const selected = item.spec?.selected_media?.[0];
  if (typeof selected === "string") return selected;
  if (
    selected &&
    typeof selected === "object" &&
    "url" in selected &&
    typeof selected.url === "string"
  ) {
    return selected.url;
  }
  if (item.image_url) return item.image_url;
  const images = item.product?.images;
  return Array.isArray(images) && typeof images[0] === "string"
    ? images[0]
    : null;
}

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

export function runSpecBookPreflight(
  items: SpecBookWorkItem[],
  audiences: SpecBookAudience[],
  now = new Date(),
): SpecBookPreflightResult {
  const issues: SpecBookPreflightIssue[] = [];
  const included = items.filter((item) => item.setting?.included !== false);
  const codes = new Map<string, string[]>();

  for (const item of included) {
    const code = item.document_code?.trim().toLocaleLowerCase();
    if (code) codes.set(code, [...(codes.get(code) ?? []), item.id]);

    if (item.project_room_id && !item.room) {
      issues.push({
        code: "invalid_room_ownership",
        severity: "blocking",
        message: `${item.name ?? "Untitled item"} points to a room outside this project.`,
        itemId: item.id,
        field: "room",
      });
    }

    if (item.item_type === "fixed") {
      const required: Array<[string, boolean]> = [
        ["name", Boolean(item.name?.trim())],
        ["code", Boolean(item.document_code?.trim())],
        ["room", Boolean(item.project_room_id && item.room)],
        ["quantity", typeof item.quantity === "number" && item.quantity > 0],
        ["image", Boolean(imageFor(item))],
        [
          "selection",
          SELECTION_FIELDS.some((field) => {
            const value = resolveSpecValue(item, field);
            return value.na || present(value.value);
          }),
        ],
      ];
      for (const [field, valid] of required) {
        if (!valid) {
          issues.push({
            code: `missing_fixed_${field}`,
            severity: "blocking",
            message: `${item.name ?? "Untitled item"} needs ${field}.`,
            itemId: item.id,
            field,
          });
        }
      }
    }

    if (
      item.item_type === "fixed" &&
      audiences.includes("vendor") &&
      !item.vendor_name
    ) {
      issues.push({
        code: "missing_vendor_fact",
        severity: "blocking",
        message: `${item.name ?? "Untitled item"} needs a vendor for the vendor edition.`,
        itemId: item.id,
        field: "vendor",
      });
    }

    if (item.item_type === "fixed" && audiences.includes("installer")) {
      const location = resolveSpecValue(item, "exact_location");
      if (!location.na && !present(location.value)) {
        issues.push({
          code: "missing_install_location",
          severity: "blocking",
          message: `${item.name ?? "Untitled item"} needs an exact location for installers.`,
          itemId: item.id,
          field: "exact_location",
        });
      }
      if (!item.spec?.install_notes?.trim()) {
        issues.push({
          code: "missing_install_note",
          severity: "blocking",
          message: `${item.name ?? "Untitled item"} needs an install note or N/A declaration.`,
          itemId: item.id,
          field: "install_notes",
        });
      }
    }

    for (const field of SELECTION_FIELDS) {
      const resolved = resolveSpecValue(item, field);
      const age = daysSince(resolved.verifiedAt, now);
      if (present(resolved.value) && (age === null || age > 90)) {
        issues.push({
          code: `stale_source_${field}`,
          severity: "warning",
          message: `${item.name ?? "Untitled item"} has an unverified or stale ${field.replace("_", " ")}.`,
          itemId: item.id,
          field,
        });
      }
    }
    if (!item.spec?.client_notes?.trim()) {
      issues.push({
        code: "optional_client_note_absent",
        severity: "warning",
        message: `${item.name ?? "Untitled item"} has no client note.`,
        itemId: item.id,
        field: "client_notes",
      });
    }
    if (
      daysSince(item.updated_at, now) !== null &&
      daysSince(item.updated_at, now)! > 90
    ) {
      issues.push({
        code: "aged_price_or_lead_time",
        severity: "warning",
        message: `${item.name ?? "Untitled item"} pricing or lead time may be aged.`,
        itemId: item.id,
      });
    }
  }

  for (const [code, itemIds] of codes) {
    if (itemIds.length < 2) continue;
    for (const itemId of itemIds) {
      issues.push({
        code: "duplicate_document_code",
        severity: "blocking",
        message: `Document code “${code.toUpperCase()}” is used more than once.`,
        itemId,
        field: "document_code",
      });
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "blocking");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { blockers, warnings, ready: blockers.length === 0 };
}

export function hasIssuedDrift(
  item: SpecBookWorkItem,
  latestIssuedAt: string | null,
): boolean {
  if (!latestIssuedAt) return false;
  const issued = new Date(latestIssuedAt).getTime();
  const itemUpdated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
  const specUpdated = item.spec?.updated_at
    ? new Date(item.spec.updated_at).getTime()
    : 0;
  return Math.max(itemUpdated, specUpdated) > issued;
}

export function editableSpecSeed(spec: ProjectFfeSpec): Record<string, string> {
  return {
    sku: spec.sku ?? "",
    finish: spec.finish ?? "",
    material: spec.material ?? "",
    color_fabric: spec.color_fabric ?? "",
    selected_dimensions: spec.selected_dimensions
      ? JSON.stringify(spec.selected_dimensions)
      : "",
    exact_location: spec.exact_location ?? "",
    client_notes: spec.client_notes ?? "",
    trade_notes: spec.trade_notes ?? "",
    install_notes: spec.install_notes ?? "",
    care_notes: spec.care_notes ?? "",
    warranty_notes: spec.warranty_notes ?? "",
  };
}
